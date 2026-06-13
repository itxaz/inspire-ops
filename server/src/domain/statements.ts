// Phase 3: Agent commission statement generator.
// Pure function — takes ledger rows for an agent+period, returns statement data.
// No DB or network calls; all persistence is in the route.

import { round2 } from './commission.js';

export interface LedgerRow {
  id: string;
  policy_id: string;
  policy_number: string;
  carrier_name: string;
  premium_basis: number | null;
  expected_amount: number;
  paid_amount: number;
  agent_advance_amount: number;
  status: string;
  is_renewal: boolean;
  expected_date: string | null;
}

export interface StatementLine {
  ledgerId: string;
  policyNumber: string;
  carrierName: string;
  premiumAmount: number | null;
  commissionPaid: number;
  commissionOutstanding: number;
  agentAdvance: number;
  isRenewal: boolean;
  status: string;
}

export interface StatementTotals {
  totalPremium: number;
  totalCommissionPaid: number;
  totalCommissionOutstanding: number;
  totalAgentAdvance: number;
  totalCommissionExpected: number;
}

export interface GeneratedStatement {
  lines: StatementLine[];
  totals: StatementTotals;
}

export function generateStatement(rows: LedgerRow[]): GeneratedStatement {
  const lines: StatementLine[] = rows.map((r) => ({
    ledgerId: r.id,
    policyNumber: r.policy_number,
    carrierName: r.carrier_name,
    premiumAmount: r.premium_basis != null ? Number(r.premium_basis) : null,
    commissionPaid: round2(Number(r.paid_amount)),
    commissionOutstanding: round2(Math.max(0, Number(r.expected_amount) - Number(r.paid_amount))),
    agentAdvance: round2(Number(r.agent_advance_amount)),
    isRenewal: r.is_renewal,
    status: r.status,
  }));

  const totals: StatementTotals = {
    totalPremium: round2(lines.reduce((s, l) => s + (l.premiumAmount ?? 0), 0)),
    totalCommissionPaid: round2(lines.reduce((s, l) => s + l.commissionPaid, 0)),
    totalCommissionOutstanding: round2(lines.reduce((s, l) => s + l.commissionOutstanding, 0)),
    totalAgentAdvance: round2(lines.reduce((s, l) => s + l.agentAdvance, 0)),
    totalCommissionExpected: round2(lines.reduce((s, l) => s + Number(l.commissionPaid) + Number(l.commissionOutstanding), 0)),
  };

  return { lines, totals };
}

// ---------------------------------------------------------------------------
// HTML statement renderer (print-to-PDF from browser; no Puppeteer needed).
// ---------------------------------------------------------------------------
const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export function renderStatementHtml(opts: {
  agentName: string;
  agencyName: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  statement: GeneratedStatement;
}): string {
  const { agentName, agencyName, periodStart, periodEnd, issuedAt, statement } = opts;
  const { lines, totals } = statement;

  const rows = lines
    .map(
      (l) => `
    <tr>
      <td>${l.policyNumber}</td>
      <td>${l.carrierName}</td>
      <td class="num">${l.premiumAmount != null ? money(l.premiumAmount) : '—'}</td>
      <td class="num">${money(l.agentAdvance)}</td>
      <td class="num">${money(l.commissionPaid)}</td>
      <td class="num ${l.commissionOutstanding > 0 ? 'owed' : ''}">${money(l.commissionOutstanding)}</td>
      <td class="center">${l.isRenewal ? 'Renewal' : 'New'}</td>
      <td class="center ${l.status === 'paid' ? 'paid' : l.status === 'expected' ? 'exp' : 'partial'}">${l.status.replace('_', ' ')}</td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Commission Statement — ${agentName} — ${periodStart}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; padding: 32px 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .brand { font-size: 22px; font-weight: 800; color: #4f8ef7; letter-spacing: -0.5px; }
  .meta { text-align: right; font-size: 11px; color: #666; line-height: 1.8; }
  h1 { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
  .sub { font-size: 12px; color: #555; margin-bottom: 28px; }
  .summary { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 28px; }
  .card { border: 1px solid #e8eaf2; border-radius: 8px; padding: 12px 16px; }
  .card-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
  .card-value { font-size: 18px; font-weight: 700; color: #1a1a2e; }
  .card-value.green { color: #2ecc8f; }
  .card-value.blue { color: #4f8ef7; }
  .card-value.orange { color: #f7934f; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f4f6fb; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; border-bottom: 2px solid #e8eaf2; }
  td { padding: 8px 10px; border-bottom: 1px solid #f0f0f6; font-size: 11.5px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .center { text-align: center; }
  .owed { color: #f7934f; font-weight: 600; }
  .paid { color: #2ecc8f; font-weight: 600; }
  .exp { color: #4f8ef7; }
  .partial { color: #f7c94f; font-weight: 600; }
  .footer { font-size: 10px; color: #999; margin-top: 24px; border-top: 1px solid #e8eaf2; padding-top: 12px; text-align: center; }
  @media print { body { padding: 16px 20px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="brand">Inspire CRM</div>
    <div style="font-size:10px;color:#888;margin-top:2px">${agencyName}</div>
  </div>
  <div class="meta">
    <div><strong>Commission Statement</strong></div>
    <div>Period: ${periodStart} – ${periodEnd}</div>
    <div>Issued: ${issuedAt}</div>
  </div>
</div>

<h1>${agentName}</h1>
<div class="sub">This statement shows all commission activity for the period. "Outstanding" = expected but not yet received from carrier.</div>

<div class="summary">
  <div class="card"><div class="card-label">Premiums Written</div><div class="card-value">${money(totals.totalPremium)}</div></div>
  <div class="card"><div class="card-label">Commissions Paid</div><div class="card-value green">${money(totals.totalCommissionPaid)}</div></div>
  <div class="card"><div class="card-label">Outstanding</div><div class="card-value orange">${money(totals.totalCommissionOutstanding)}</div></div>
  <div class="card"><div class="card-label">Your Advance</div><div class="card-value blue">${money(totals.totalAgentAdvance)}</div></div>
</div>

<table>
  <thead><tr>
    <th>Policy</th><th>Carrier</th><th>Premium</th><th>Your Advance</th><th>Paid</th><th>Outstanding</th><th>Type</th><th>Status</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="footer">
  This statement is generated by Inspire CRM and is for informational purposes only.
  Questions? Contact your agency administrator.
</div>
</body>
</html>`;
}
