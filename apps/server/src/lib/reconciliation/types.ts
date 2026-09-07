/**
 * TASK-018: Reconciliation Types
 * 
 * Type definitions for financial reconciliation.
 */

export type ReconciliationReportType = 'PAYMENT' | 'REFUND' | 'PAYOUT';
export type MismatchType = 'MISSING_INTERNAL' | 'MISSING_PROVIDER' | 'AMOUNT_MISMATCH' | 'STATUS_MISMATCH';

export interface ReconciliationInput {
  provider: string;
  reportType: ReconciliationReportType;
  periodStart: Date;
  periodEnd: Date;
}

export interface ReconciliationResult {
  reportId: string;
  internalCount: number;
  internalTotal: number;
  providerCount: number;
  providerTotal: number;
  mismatches: Mismatch[];
  status: 'ok' | 'mismatches_found';
}

export interface Mismatch {
  type: MismatchType;
  internalId?: string;
  providerId?: string;
  expectedAmount?: number;
  actualAmount?: number;
  description: string;
}

export interface InternalTransaction {
  id: string;
  externalId: string;
  amount: number;
  status: string;
  createdAt: string;
  type: 'payment' | 'refund' | 'payout';
}

export interface ProviderTransaction {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  type: 'payment' | 'refund' | 'payout';
}

export interface ReconciliationSummary {
  totalReports: number;
  reportsWithMismatches: number;
  totalMismatches: number;
  unresolvedMismatches: number;
  totalAmountDiscrepancy: number;
}

export interface AlertConfig {
  enabled: boolean;
  channels: ('email' | 'webhook' | 'slack')[];
  threshold: number; // Only alert if mismatch count >= threshold
}
