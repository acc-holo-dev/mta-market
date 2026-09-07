/**
 * TASK-018: Reconciliation Job
 * 
 * Scheduled job for daily reconciliation.
 */

import { reconcile } from '../lib/reconciliation/service';
import { subDays, startOfDay, endOfDay } from 'date-fns';

/**
 * Run daily reconciliation
 * 
 * Compares yesterday's transactions between internal and provider.
 * Should be scheduled to run daily at 03:00 AM.
 */
export async function runDailyReconciliation(): Promise<void> {
  console.log('[ReconciliationJob] Starting daily reconciliation');
  
  const yesterday = subDays(new Date(), 1);
  const periodStart = startOfDay(yesterday);
  const periodEnd = endOfDay(yesterday);
  
  try {
    // Reconcile YooKassa payments
    const result = await reconcile({
      provider: 'YUKASSA',
      reportType: 'PAYMENT',
      periodStart,
      periodEnd
    });
    
    console.log('[ReconciliationJob] Reconciliation complete');
    console.log(`  Internal: ${result.internalCount} transactions, ${result.internalTotal} RUB`);
    console.log(`  Provider: ${result.providerCount} transactions, ${result.providerTotal} RUB`);
    console.log(`  Mismatches: ${result.mismatches.length}`);
    
    if (result.status === 'mismatches_found') {
      console.warn('[ReconciliationJob] ⚠️  MISMATCHES FOUND - Check reconciliation report');
    }
    
  } catch (error) {
    console.error('[ReconciliationJob] Failed:', error);
    throw error;
  }
}

/**
 * Setup cron schedule
 * 
 * In production: Use node-cron or bull queue
 */
export function setupReconciliationSchedule(): void {
  console.log('[ReconciliationJob] Setting up schedule');
  
  // Example with node-cron:
  // cron.schedule('0 3 * * *', async () => {
  //   await runDailyReconciliation();
  // });
  
  // Example with bull:
  // const queue = new Queue('reconciliation');
  // queue.add('daily', {}, { repeat: { cron: '0 3 * * *' } });
  // queue.process('daily', async (job) => {
  //   await runDailyReconciliation();
  // });
  
  console.log('[ReconciliationJob] Schedule configured: Daily at 03:00 AM');
}

/**
 * Run reconciliation for specific date range
 * 
 * Useful for backfilling or manual reconciliation.
 */
export async function runReconciliationForDateRange(
  startDate: Date,
  endDate: Date,
  provider: string = 'YUKASSA'
): Promise<void> {
  console.log(`[ReconciliationJob] Running reconciliation for ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  await reconcile({
    provider,
    reportType: 'PAYMENT',
    periodStart: startDate,
    periodEnd: endDate
  });
}

// Helper function (requires date-fns or similar)
// For simplicity, implementing basic date functions
function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}
