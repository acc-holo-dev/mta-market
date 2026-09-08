/**
 * TASK-018: Reconciliation Service
 *
 * Financial reconciliation between internal ledger and payment providers.
 * Rewritten against the contract ORM (db.orm.public.*) — the previous version
 * targeted a classic Prisma Client API that does not exist in this project.
 */

import { db } from '../../prisma/db';
import type {
  ReconciliationInput,
  ReconciliationResult,
  Mismatch,
  InternalTransaction,
  ProviderTransaction,
  ReconciliationSummary
} from './types';

/**
 * Run reconciliation for a time period
 *
 * Compares internal financial records with provider records.
 * Never auto-corrects money - only creates alerts.
 */
export async function reconcile(input: ReconciliationInput): Promise<ReconciliationResult> {
  const { provider, reportType, periodStart, periodEnd } = input;

  console.log(`[Reconciliation] Starting ${reportType} reconciliation for ${provider}`);
  console.log(`[Reconciliation] Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

  // Create report record
  const report = await db.orm.public.ReconciliationReport.create({
    provider,
    reportType: reportType as 'PAYMENT' | 'REFUND' | 'PAYOUT',
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    internalCount: 0,
    internalTotal: 0,
    providerCount: 0,
    providerTotal: 0,
    mismatchCount: 0,
    status: 'IN_PROGRESS'
  });

  try {
    // 1. Fetch internal transactions
    const internalTransactions = await fetchInternalTransactions(
      provider,
      reportType,
      periodStart,
      periodEnd
    );

    console.log(`[Reconciliation] Found ${internalTransactions.length} internal transactions`);

    // 2. Fetch provider transactions
    const providerTransactions = await fetchProviderTransactions(
      provider,
      reportType,
      periodStart,
      periodEnd
    );

    console.log(`[Reconciliation] Found ${providerTransactions.length} provider transactions`);

    // 3. Calculate totals
    const internalTotal = internalTransactions.reduce((sum, t) => sum + t.amount, 0);
    const providerTotal = providerTransactions.reduce((sum, t) => sum + t.amount, 0);

    // 4. Compare transactions
    const mismatches = compareTransactions(internalTransactions, providerTransactions);

    console.log(`[Reconciliation] Found ${mismatches.length} mismatches`);

    // 5. Store mismatches
    if (mismatches.length > 0) {
      for (const m of mismatches) {
        await db.orm.public.ReconciliationMismatch.create({
          reportId: report.id,
          type: m.type,
          internalId: m.internalId ?? null,
          providerId: m.providerId ?? null,
          expectedAmount: m.expectedAmount ?? null,
          actualAmount: m.actualAmount ?? null,
          description: m.description
        });
      }

      // Send alert if mismatches found
      await sendAlert(report.id, mismatches);
    }

    // 6. Update report
    await db.orm.public.ReconciliationReport.where({ id: report.id }).update({
      internalCount: internalTransactions.length,
      internalTotal,
      providerCount: providerTransactions.length,
      providerTotal,
      mismatchCount: mismatches.length,
      status: 'COMPLETED',
      completedAt: new Date().toISOString()
    });

    return {
      reportId: report.id,
      internalCount: internalTransactions.length,
      internalTotal,
      providerCount: providerTransactions.length,
      providerTotal,
      mismatches,
      status: mismatches.length > 0 ? 'mismatches_found' : 'ok'
    };

  } catch (error) {
    console.error('[Reconciliation] Error:', error);

    // Update report as failed
    await db.orm.public.ReconciliationReport.where({ id: report.id }).update({
      status: 'FAILED',
      completedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });

    throw error;
  }
}

/**
 * Fetch internal transactions for period.
 * The contract ORM where() supports equality filters, so the date-range
 * filter is applied in memory (B-003 may push it into SQL later).
 */
async function fetchInternalTransactions(
  provider: string,
  _reportType: string,
  periodStart: Date,
  periodEnd: Date
): Promise<InternalTransaction[]> {
  const payments = await db.orm.public.Payment.where({
    provider: provider.toUpperCase() as 'YUKASSA' | 'STRIPE' | 'TEST'
  }).all();

  return payments
    .filter((p) => {
      const createdAt = new Date(p.createdAt);
      return createdAt >= periodStart && createdAt <= periodEnd;
    })
    .map((p) => ({
      id: p.id,
      externalId: p.providerPaymentId,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      type: 'payment' as const
    }));
}

/**
 * Fetch provider transactions (mock implementation)
 *
 * In production: Use YooKassa API, Stripe API, etc.
 */
async function fetchProviderTransactions(
  provider: string,
  _reportType: string,
  _periodStart: Date,
  _periodEnd: Date
): Promise<ProviderTransaction[]> {
  console.log(`[Reconciliation] Fetching ${provider} transactions (MOCK)`);

  // Mock implementation
  // In production: Call provider API
  // const yookassa = new YooKassaClient();
  // return await yookassa.getPayments({ from: periodStart, to: periodEnd });

  return [];
}

/**
 * Compare internal and provider transactions
 */
function compareTransactions(
  internal: InternalTransaction[],
  provider: ProviderTransaction[]
): Mismatch[] {
  const mismatches: Mismatch[] = [];

  // Create maps for quick lookup
  const internalMap = new Map(internal.map(t => [t.externalId, t]));
  const providerMap = new Map(provider.map(t => [t.id, t]));

  // Check for missing internal records
  for (const providerTx of provider) {
    const internalTx = internalMap.get(providerTx.id);

    if (!internalTx) {
      mismatches.push({
        type: 'MISSING_INTERNAL',
        providerId: providerTx.id,
        actualAmount: providerTx.amount,
        description: `Transaction ${providerTx.id} exists in provider but not in internal records`
      });
      continue;
    }

    // Check amount mismatch
    if (internalTx.amount !== providerTx.amount) {
      mismatches.push({
        type: 'AMOUNT_MISMATCH',
        internalId: internalTx.id,
        providerId: providerTx.id,
        expectedAmount: internalTx.amount,
        actualAmount: providerTx.amount,
        description: `Amount mismatch: internal ${internalTx.amount}, provider ${providerTx.amount}`
      });
    }

    // Check status mismatch
    if (internalTx.status !== providerTx.status) {
      mismatches.push({
        type: 'STATUS_MISMATCH',
        internalId: internalTx.id,
        providerId: providerTx.id,
        description: `Status mismatch: internal ${internalTx.status}, provider ${providerTx.status}`
      });
    }
  }

  // Check for missing provider records
  for (const internalTx of internal) {
    if (!providerMap.has(internalTx.externalId)) {
      mismatches.push({
        type: 'MISSING_PROVIDER',
        internalId: internalTx.id,
        expectedAmount: internalTx.amount,
        description: `Transaction ${internalTx.id} exists internally but not in provider records`
      });
    }
  }

  return mismatches;
}

/**
 * Send alert for mismatches
 */
async function sendAlert(reportId: string, mismatches: Mismatch[]): Promise<void> {
  console.log(`[Reconciliation] ALERT: ${mismatches.length} mismatches found in report ${reportId}`);

  // In production: Send email, webhook, Slack notification
  // await sendEmail({
  //   to: 'finance@mtamarket.com',
  //   subject: 'Reconciliation Alert',
  //   body: `Found ${mismatches.length} mismatches...`
  // });

  for (const mismatch of mismatches) {
    console.log(`  - ${mismatch.type}: ${mismatch.description}`);
  }
}

/**
 * Get reconciliation summary
 */
export async function getReconciliationSummary(): Promise<ReconciliationSummary> {
  const reports = await db.orm.public.ReconciliationReport.where({}).all();
  const mismatches = await db.orm.public.ReconciliationMismatch.where({}).all();

  const reportsWithMismatches = reports.filter(r => r.mismatchCount > 0).length;
  const unresolvedMismatches = mismatches.filter(m => !m.resolved).length;

  const totalAmountDiscrepancy = mismatches.reduce((sum, m) => {
    if (m.type === 'AMOUNT_MISMATCH' && m.expectedAmount !== null && m.actualAmount !== null) {
      return sum + Math.abs(m.expectedAmount - m.actualAmount);
    }
    return sum;
  }, 0);

  return {
    totalReports: reports.length,
    reportsWithMismatches,
    totalMismatches: mismatches.length,
    unresolvedMismatches,
    totalAmountDiscrepancy
  };
}

/**
 * Resolve mismatch manually
 */
export async function resolveMismatch(
  mismatchId: string,
  resolvedBy: string,
  resolution: string
): Promise<void> {
  await db.orm.public.ReconciliationMismatch.where({ id: mismatchId }).update({
    resolved: true,
    resolvedAt: new Date().toISOString(),
    resolvedBy,
    resolution
  });

  console.log(`[Reconciliation] Mismatch ${mismatchId} resolved by ${resolvedBy}`);
}

/**
 * Get report with mismatches.
 * Return type annotated loosely: the ORM row type is not nameable across
 * pnpm store paths (TS2742) when emitting declarations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getReport(reportId: string): Promise<any | null> {
  const report = await db.orm.public.ReconciliationReport.where({ id: reportId }).first();

  if (!report) {
    return null;
  }

  const mismatches = await db.orm.public.ReconciliationMismatch.where({
    reportId
  }).all();

  return { ...report, mismatches };
}

/**
 * Get all reports (latest first)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getReports(limit: number = 50): Promise<any[]> {
  return await db.orm.public.ReconciliationReport
    .where({})
    .orderBy((m) => m.createdAt.desc())
    .limit(limit)
    .all();
}