import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeExpectedCommission, expectedPct, agentAdvance, type CommissionRule } from './commission.js';
import { reconcile } from './reconcile.js';

const upfront: CommissionRule = {
  basis: 'upfront_first_term',
  first_term_pct: 0.15,
  renewal_pct: 0.05,
  agency_retains_renewal: true,
};

test('upfront pays first-term rate on new business', () => {
  assert.equal(expectedPct(upfront, false), 0.15);
  assert.equal(computeExpectedCommission(upfront, 1000, false).expectedAmount, 150);
});

test('upfront with agency-retained renewals pays the agent nothing on renewal', () => {
  assert.equal(expectedPct(upfront, true), 0);
});

test('split basis uses distinct first/renewal rates', () => {
  const split: CommissionRule = { basis: 'split', first_term_pct: 0.2, renewal_pct: 0.1, agency_retains_renewal: false };
  assert.equal(computeExpectedCommission(split, 500, false).expectedAmount, 100);
  assert.equal(computeExpectedCommission(split, 500, true).expectedAmount, 50);
});

test('agent advance applies the agent split', () => {
  assert.equal(agentAdvance(150, 0.6), 90);
  assert.equal(agentAdvance(150, null), 0);
});

test('reconcile flags an underpayment', () => {
  const r = reconcile({ expectedAmount: 150, appliedPct: 0.15 }, { commissionAmount: 120, commissionPct: 0.12 });
  assert.equal(r.status, 'partially_paid');
  assert.equal(r.paidAmount, 120);
  const kinds = r.exceptions.map((e) => e.kind).sort();
  assert.deepEqual(kinds, ['rate_mismatch', 'underpaid']);
});

test('reconcile marks an exact payment as paid with no exceptions', () => {
  const r = reconcile({ expectedAmount: 150, appliedPct: 0.15 }, { commissionAmount: 150, commissionPct: 0.15 });
  assert.equal(r.status, 'paid');
  assert.equal(r.exceptions.length, 0);
});
