import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateStatement, renderStatementHtml, type LedgerRow } from './statements.js';

const row = (overrides: Partial<LedgerRow> = {}): LedgerRow => ({
  id: 'led-1',
  policy_id: 'pol-1',
  policy_number: 'POL-001',
  carrier_name: 'Great West Cargo',
  premium_basis: 10000,
  expected_amount: 1500,
  paid_amount: 1500,
  agent_advance_amount: 900,
  status: 'paid',
  is_renewal: false,
  expected_date: '2025-06-01',
  ...overrides,
});

test('generateStatement totals paid vs outstanding correctly', () => {
  const rows: LedgerRow[] = [
    row({ expected_amount: 1500, paid_amount: 1500, agent_advance_amount: 900 }),
    row({ id: 'led-2', policy_number: 'POL-002', expected_amount: 750, paid_amount: 400, agent_advance_amount: 450, status: 'partially_paid' }),
  ];
  const { lines, totals } = generateStatement(rows);
  assert.equal(lines[0]!.commissionPaid, 1500);
  assert.equal(lines[0]!.commissionOutstanding, 0);
  assert.equal(lines[1]!.commissionPaid, 400);
  assert.equal(lines[1]!.commissionOutstanding, 350);
  assert.equal(totals.totalCommissionPaid, 1900);
  assert.equal(totals.totalCommissionOutstanding, 350);
  assert.equal(totals.totalAgentAdvance, 1350);
  assert.equal(totals.totalCommissionExpected, 2250);
});

test('generateStatement clamps outstanding to 0 when overpaid', () => {
  const { lines } = generateStatement([row({ expected_amount: 1000, paid_amount: 1200 })]);
  assert.equal(lines[0]!.commissionOutstanding, 0);
});

test('renderStatementHtml produces valid HTML with agent name and totals', () => {
  const stmt = generateStatement([row()]);
  const html = renderStatementHtml({
    agentName: 'Jane Agent',
    agencyName: 'Demo Transit Agency',
    periodStart: '2025-05-01',
    periodEnd: '2025-05-31',
    issuedAt: '2025-06-01',
    statement: stmt,
  });
  assert.ok(html.includes('Jane Agent'));
  assert.ok(html.includes('$1,500.00'));
  assert.ok(html.includes('$900.00'));
  assert.ok(html.startsWith('<!DOCTYPE html>'));
});
