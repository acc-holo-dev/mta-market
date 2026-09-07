/**
 * TASK-018: Reconciliation Service
 * 
 * Financial reconciliation between internal ledger and payment providers.
 */

import { prisma } from '../prisma';
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
  const report = await prisma.reconciliationReport.create({
    data: {
      provider,
      reportType,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      internalCount: 0,
      internalTotal: 0,
      providerCount: 0,
      providerTotal: 0,
      mismatchCount: 0,
      status: 'IN_PROGRESS'
    }
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
      await prisma.reconciliationMismatch.createMany({
        data: mismatches.map(m => ({
          reportId: report.id,
          type: m.type,
          internalId: m.internalId,
          providerId: m.providerId,
          expectedAmount: m.expectedAmount,
          actualAmount: m.actualAmount,
          description: m.description
        }))
      });
      
      // Send alert if mismatches found
      await sendAlert(report.id, mismatches);
    }
    
    // 6. Update report
    await prisma.reconciliationReport.update({
      where: { id: report.id },
      data: {
        internalCount: internalTransactions.length,
        internalTotal,
        providerCount: providerTransactions.length,
        providerTotal,
        mismatchCount: mismatches.length,
        status: 'COMPLETED',
        completedAt: new Date().toISOString()
      }
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
    await prisma.reconciliationReport.update({
      where: { id: report.id },
      data: {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      }
    });
    
    throw error;
  }
}

/**
 * Fetch internal transactions for period
 */
async function fetchInternalTransactions(
  provider: string,
  reportType: string,
  periodStart: Date,
  periodEnd: Date
): Promise<InternalTransaction[]> {
  // Fetch from Payment model
  const payments = await prisma.payment.findMany({
    where: {
      provider: provider.toUpperCase() as any,
      createdAt: {
        gte: periodStart.toISOString(),
        lte: periodEnd.toISOString()
      }
    }
  });
  
  return payments.map(p => ({
    id: p.id,
    externalId: p.providerPaymentId,
    amount: p.amount,
    status: p.status,
    createdAt: p.createdAt,
    type: 'payment'
  }));
}

/**
 * Fetch provider transactions (mock implementation)
 * 
 * In production: Use YooKassa API, Stripe API, etc.
 */
async function fetchProviderTransactions(
  provider: string,
  reportType: string,
  periodStart: Date,
  periodEnd: Date
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
  const reports = await prisma.reconciliationReport.findMany();
  const mismatches = await prisma.reconciliationMismatch.findMany();
  
  const reportsWithMismatches = reports.filter(r => r.mismatchCount > 0).length;
  const unresolvedMismatches = mismatches.filter(m => !m.resolved).length;
  
  const totalAmountDiscrepancy = mismatches.reduce((sum, m) => {
    if (m.type === 'AMOUNT_MISMATCH' && m.expectedAmount && m.actualAmount) {
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
  await prisma.reconciliationMismatch.update({
    where: { id: mismatchId },
    data: {
      resolved: true,
      resolvedAt: new Date().toISOString(),
      resolvedBy,
      resolution
    }
  });
  
  console.log(`[Reconciliation] Mismatch ${mismatchId} resolved by ${resolvedBy}`);
}

/**
 * Get report with mismatches
 */
export async function getReport(reportId: string) {
  return await prisma.reconciliationReport.findUnique({
    where: { id: reportId },
    include: {
      mismatches: true
    }
  });
}

/**
 * Get all reports
 */
export async function getReports(limit: number = 50) {
  return await prisma.reconciliationReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      _count: {
        select: { mismatches: true }
      }
    }
  });
}
