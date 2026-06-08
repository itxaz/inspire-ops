import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { api } from '../lib/api.js';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtPct = (n) => (n == null ? '—' : `${(Number(n) * 100).toFixed(2)}%`);

const fmtDate = (s) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
};

// ---------------------------------------------------------------------------
// Shared style atoms
// ---------------------------------------------------------------------------
const BADGE = {
  expected:      { bg: '#4f8ef722', color: '#4f8ef7', text: 'Expected' },
  partially_paid:{ bg: '#f7c94f22', color: '#f7c94f', text: 'Partial' },
  paid:          { bg: '#3ecf8e22', color: '#3ecf8e', text: 'Paid' },
  overpaid:      { bg: '#fb923c22', color: '#fb923c', text: 'Overpaid' },
  written_off:   { bg: '#ffffff12', color: '#8a90a8', text: 'Written Off' },
};

const EXC_BADGE = {
  underpaid:    { bg: '#f76f6f22', color: '#f76f6f', text: 'Underpaid' },
  overpaid:     { bg: '#fb923c22', color: '#fb923c', text: 'Overpaid' },
  rate_mismatch:{ bg: '#f7c94f22', color: '#f7c94f', text: 'Rate Mismatch' },
  unmatched:    { bg: '#a78bfa22', color: '#a78bfa', text: 'Unmatched' },
  missing:      { bg: '#ffffff12', color: '#8a90a8', text: 'Missing' },
};

const pill = (scheme, label) => {
  const s = scheme || { bg: '#ffffff12', color: '#8a90a8', text: label };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.3px',
      background: s.bg, color: s.color,
    }}>{s.text ?? label}</span>
  );
};

const card = (children, extra = {}) => (
  <div style={{
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '20px 24px', ...extra,
  }}>{children}</div>
);

const StatCard = ({ label, value, sub, accent }) => (
  <div style={{
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '20px 24px', flex: 1, minWidth: 150,
  }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
  </div>
);

const TH = ({ children, right }) => (
  <th style={{
    padding: '10px 16px', textAlign: right ? 'right' : 'left',
    fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
    letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }}>{children}</th>
);

const TD = ({ children, right, mono }) => (
  <td style={{
    padding: '12px 16px', textAlign: right ? 'right' : 'left', fontSize: 13,
    color: 'var(--text)', borderBottom: '1px solid var(--border)',
    fontVariantNumeric: mono ? 'tabular-nums' : undefined, whiteSpace: 'nowrap',
  }}>{children}</td>
);

const Empty = ({ message }) => (
  <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text3)' }}>
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.4 }}>
      <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 9h6M9 13h4"/>
    </svg>
    <div style={{ fontSize: 14 }}>{message}</div>
  </div>
);

const Spinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5"
      style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  </div>
);

const ApiError = ({ error, onRetry }) => (
  <div style={{ margin: '24px', padding: '16px 20px', background: '#f76f6f18', border: '1px solid #f76f6f44', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
    <div>
      <div style={{ fontWeight: 700, color: '#f76f6f', fontSize: 13, marginBottom: 2 }}>API error</div>
      <div style={{ fontSize: 12, color: 'var(--text3)' }}>{error?.message ?? String(error)}</div>
    </div>
    {onRetry && <button onClick={onRetry} style={{ padding: '6px 14px', background: '#f76f6f22', color: '#f76f6f', border: '1px solid #f76f6f44', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Retry</button>}
  </div>
);

// ---------------------------------------------------------------------------
// Dashboard tab
// ---------------------------------------------------------------------------
const DashboardTab = () => {
  const { data, loading, error, refetch } = useApi('/dashboard/summary');

  if (loading) return <Spinner/>;
  if (error) return <ApiError error={error} onRetry={refetch}/>;

  const t = data?.totals ?? {};
  const exc = data?.openExceptions ?? [];

  const excMap = Object.fromEntries(exc.map(e => [e.kind, e.count]));
  const totalExc = exc.reduce((s, e) => s + Number(e.count), 0);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary stat cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <StatCard label="Commission Owed" value={fmt(t.total_owed)} sub="Expected − paid" accent="#f7c94f"/>
        <StatCard label="Total Expected" value={fmt(t.total_expected)} sub="From active rules"/>
        <StatCard label="Total Paid" value={fmt(t.total_paid)} sub="Matched from statements" accent="#3ecf8e"/>
        <StatCard label="Agent Advances" value={fmt(t.total_advanced)} sub="Fronted by agency"/>
        <StatCard label="Net Exposure" value={fmt(t.exposure)} sub="Advances not yet covered" accent={Number(t.exposure) > 0 ? '#f76f6f' : '#3ecf8e'}/>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Open exceptions */}
        {card(
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>Open Exceptions</div>
              {totalExc > 0 && <span style={{ background: '#f76f6f22', color: '#f76f6f', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{totalExc} open</span>}
            </div>
            {exc.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>No open exceptions — reconciliation is clean.</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {exc.map(e => {
                    const s = EXC_BADGE[e.kind] ?? { bg: '#ffffff12', color: '#8a90a8', text: e.kind };
                    return (
                      <div key={e.kind} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: s.bg, borderRadius: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.text}</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: 'var(--font-display)' }}>{e.count}</span>
                      </div>
                    );
                  })}
                </div>
            }
          </>,
          { flex: 1, minWidth: 240 }
        )}

        {/* Settlement timeline hint */}
        {card(
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Settlement Timeline</div>
            {[
              { day: 'Day 0', label: 'Policy sold', color: '#4f8ef7', desc: 'Commission expected, agent advance fronted' },
              { day: '+30 days', label: 'Agent float', color: '#f7c94f', desc: 'Agency absorbs advance while awaiting carrier' },
              { day: '+45 days', label: 'Carrier pays', color: '#3ecf8e', desc: 'Statement arrives; reconciliation runs' },
            ].map(({ day, label, color, desc }) => (
              <div key={day} style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 54, flexShrink: 0, fontSize: 11, fontWeight: 700, color, paddingTop: 2 }}>{day}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{desc}</div>
                </div>
              </div>
            ))}
          </>,
          { flex: 1, minWidth: 240 }
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Ledger tab
// ---------------------------------------------------------------------------
const LedgerTab = () => {
  const { data, loading, error, refetch } = useApi('/ledger');

  if (loading) return <Spinner/>;
  if (error) return <ApiError error={error} onRetry={refetch}/>;

  const rows = data?.ledger ?? [];

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 16px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>Commission Ledger</div>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
      </div>
      {rows.length === 0
        ? <Empty message="No ledger entries yet. Record a policy + premium to see projected commissions."/>
        : (
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <TH>Policy #</TH>
                  <TH>Status</TH>
                  <TH right>Expected</TH>
                  <TH right>Paid</TH>
                  <TH right>Owed</TH>
                  <TH right>Agent Advance</TH>
                  <TH>Expected Date</TH>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const owed = Number(r.expected_amount) - Number(r.paid_amount);
                  return (
                    <tr key={r.id} style={{ transition: 'background .1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#ffffff06'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <TD><span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{r.policy_number ?? '—'}</span></TD>
                      <TD>{pill(BADGE[r.status], r.status)}</TD>
                      <TD right mono>{fmt(r.expected_amount)}</TD>
                      <TD right mono>{fmt(r.paid_amount)}</TD>
                      <TD right mono>
                        <span style={{ color: owed > 0.01 ? '#f7c94f' : owed < -0.01 ? '#fb923c' : '#3ecf8e' }}>
                          {fmt(owed)}
                        </span>
                      </TD>
                      <TD right mono>{fmt(r.agent_advance_amount)}</TD>
                      <TD>{fmtDate(r.expected_date)}</TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Exceptions tab
// ---------------------------------------------------------------------------
const ExceptionsTab = () => {
  const { data, loading, error, refetch } = useApi('/exceptions');
  const [resolving, setResolving] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const resolve = async (id, status) => {
    setSaving(true);
    try {
      await api(`/exceptions/${id}`, { method: 'PATCH', body: { status, note } });
      setResolving(null);
      setNote('');
      refetch();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner/>;
  if (error) return <ApiError error={error} onRetry={refetch}/>;

  const rows = data?.exceptions ?? [];

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 16px' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>Reconciliation Exceptions</div>
        {rows.length > 0 && (
          <span style={{ background: '#f76f6f22', color: '#f76f6f', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
            {rows.length} open
          </span>
        )}
      </div>
      {rows.length === 0
        ? <Empty message="No open exceptions — all reconciled commissions match."/>
        : (
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <TH>Type</TH>
                  <TH right>Expected</TH>
                  <TH right>Actual</TH>
                  <TH right>Delta</TH>
                  <TH>Flagged</TH>
                  <TH>Action</TH>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}
                    onMouseEnter={e => e.currentTarget.style.background = '#ffffff06'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <TD>{pill(EXC_BADGE[r.kind], r.kind)}</TD>
                    <TD right mono>{r.kind === 'rate_mismatch' ? fmtPct(r.expected) : fmt(r.expected)}</TD>
                    <TD right mono>{r.kind === 'rate_mismatch' ? fmtPct(r.actual) : fmt(r.actual)}</TD>
                    <TD right mono>
                      <span style={{ color: Number(r.delta) < 0 ? '#f76f6f' : '#fb923c' }}>
                        {r.kind === 'rate_mismatch' ? fmtPct(r.delta) : fmt(r.delta)}
                      </span>
                    </TD>
                    <TD>{fmtDate(r.created_at)}</TD>
                    <TD>
                      <button
                        onClick={() => setResolving(r.id === resolving ? null : r.id)}
                        style={{ padding: '4px 12px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Resolve
                      </button>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {/* Inline resolve panel */}
      {resolving && (
        <div style={{ marginTop: 16, padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="Optional note…"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ flex: 1, minWidth: 200, background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 13 }}
          />
          <button onClick={() => resolve(resolving, 'resolved')} disabled={saving}
            style={{ padding: '8px 16px', background: '#3ecf8e22', color: '#3ecf8e', border: '1px solid #3ecf8e44', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Mark Resolved
          </button>
          <button onClick={() => resolve(resolving, 'accepted')} disabled={saving}
            style={{ padding: '8px 16px', background: '#f7c94f22', color: '#f7c94f', border: '1px solid #f7c94f44', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Accept
          </button>
          <button onClick={() => resolve(resolving, 'disputed')} disabled={saving}
            style={{ padding: '8px 16px', background: '#f76f6f22', color: '#f76f6f', border: '1px solid #f76f6f44', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Dispute
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'ledger',    label: 'Ledger' },
  { id: 'exceptions', label: 'Exceptions' },
];

export default function CommissionHub({ session }) {
  const [tab, setTab] = useState('dashboard');
  const isAgent = session?.apiRole === 'agent';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ padding: '24px 24px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text)' }}>
            {isAgent ? 'My Commissions' : 'Commission Hub'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
            {isAgent
              ? 'Your sales, premiums, commissions paid, and outstanding amounts'
              : 'Real-time owed vs. paid · reconciliation exceptions · agent statements'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 16px', background: 'none', border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.id ? 'var(--accent)' : 'var(--text3)',
              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              cursor: 'pointer', marginBottom: -1, transition: 'color .15s',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'dashboard'  && <DashboardTab/>}
        {tab === 'ledger'     && <LedgerTab/>}
        {tab === 'exceptions' && <ExceptionsTab/>}
      </div>
    </div>
  );
}
