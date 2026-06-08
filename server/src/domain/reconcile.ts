import { round2 } from './commission.js';

export type ExceptionKind = 'underpaid' | 'overpaid' | 'rate_mismatch' | 'unmatched' | 'missing';

export interface ReconResult {
  status: 'paid' | 'partially_paid' | 'overpaid';
  paidAmount: number;
  exceptions: { kind: ExceptionKind; expected: number; actual: number; delta: number }[];
}

const MONEY_TOLERANCE = 0.01;
const PCT_TOLERANCE = 0.0001;

/**
 * Compare an expected ledger row against an actual carrier statement line and decide
 * the resulting ledger status plus any discrepancies to flag.
 */
export function reconcile(
  expected: { expectedAmount: number; appliedPct: number | null },
  actual: { commissionAmount: number; commissionPct: number | null },
): ReconResult {
  const paidAmount = round2(actual.commissionAmount);
  const delta = round2(paidAmount - expected.expectedAmount);
  const exceptions: ReconResult['exceptions'] = [];

  if (delta < -MONEY_TOLERANCE) {
    exceptions.push({ kind: 'underpaid', expected: expected.expectedAmount, actual: paidAmount, delta });
  } else if (delta > MONEY_TOLERANCE) {
    exceptions.push({ kind: 'overpaid', expected: expected.expectedAmount, actual: paidAmount, delta });
  }

  if (
    expected.appliedPct != null &&
    actual.commissionPct != null &&
    Math.abs(actual.commissionPct - expected.appliedPct) > PCT_TOLERANCE
  ) {
    exceptions.push({
      kind: 'rate_mismatch',
      expected: expected.appliedPct,
      actual: actual.commissionPct,
      delta: round2(actual.commissionPct - expected.appliedPct),
    });
  }

  const status: ReconResult['status'] =
    delta > MONEY_TOLERANCE ? 'overpaid' : delta < -MONEY_TOLERANCE ? 'partially_paid' : 'paid';

  return { status, paidAmount, exceptions };
}
