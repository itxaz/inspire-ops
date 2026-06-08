// Core commission math: given a carrier's payout rule and a premium, what should the
// carrier pay the agency (EXPECTED), and how much does the agency front the agent (advance)?

export interface CommissionRule {
  basis: 'upfront_first_term' | 'level_each_term' | 'renewal_only' | 'split';
  first_term_pct: number | null;
  renewal_pct: number | null;
  agency_retains_renewal: boolean;
}

export interface ExpectedCommission {
  expectedAmount: number;
  /** Effective rate applied, for transparency / later rate-mismatch checks. */
  appliedPct: number;
}

/** The percentage the carrier is expected to pay for this premium event. */
export function expectedPct(rule: CommissionRule, isRenewal: boolean): number {
  const first = rule.first_term_pct ?? 0;
  const renew = rule.renewal_pct ?? 0;
  switch (rule.basis) {
    case 'upfront_first_term':
      // Full commission on first sale; renewals only if the agency does not retain them.
      return isRenewal ? (rule.agency_retains_renewal ? 0 : renew) : first;
    case 'renewal_only':
      return isRenewal ? renew : 0;
    case 'level_each_term':
      // Same rate every term; prefer an explicit renewal rate if present.
      return isRenewal ? renew || first : first;
    case 'split':
      return isRenewal ? renew : first;
  }
}

export function computeExpectedCommission(
  rule: CommissionRule,
  premium: number,
  isRenewal: boolean,
): ExpectedCommission {
  const pct = expectedPct(rule, isRenewal);
  return { expectedAmount: round2(premium * pct), appliedPct: pct };
}

/** Amount the agency fronts to the agent against the expected commission. */
export function agentAdvance(expectedAmount: number, agentSplit: number | null): number {
  return round2(expectedAmount * (agentSplit ?? 0));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
