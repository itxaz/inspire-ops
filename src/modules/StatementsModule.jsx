import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { api } from '../lib/api.js';

const money = (v) => v == null ? '—' : Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const badge = (status) => {
  const map = { draft: ['#ffffff12', 'var(--text3)'], issued: ['#4f8ef722', '#4f8ef7'], paid: ['#3ecf8e22', '#3ecf8e'] };
  const [bg, color] = map[status] ?? map.draft;
  return <span className="badge" style={{ background: bg, color }}>{status}</span>;
};

export default function StatementsModule({ session }) {
  const { data: stmtsData, loading, refetch } = useApi('/statements');
  const { data: agentsData } = useApi('/agents');

  const [genModal, setGenModal] = useState(false);
  const [form, setForm] = useState({ agentId: '', periodStart: '', periodEnd: '', issue: false });
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(null);   // preview result before issuing
  const [viewHtml, setViewHtml] = useState(null); // HTML content for the iframe viewer
  const [err, setErr] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const isAdmin = session?.role === 'admin';
  const statements = stmtsData?.statements ?? [];
  const agents = agentsData?.agents ?? [];

  const openGen = () => { setForm({ agentId: '', periodStart: '', periodEnd: '', issue: false }); setPreview(null); setErr(''); setGenModal(true); };
  const closeGen = () => { setGenModal(false); setPreview(null); };

  const runGenerate = async (issue = false) => {
    if (!form.agentId) { setErr('Select an agent'); return; }
    if (!form.periodStart || !form.periodEnd) { setErr('Set period start and end'); return; }
    setGenerating(true); setErr('');
    try {
      const result = await api('/statements/generate', {
        method: 'POST',
        body: { agentId: form.agentId, periodStart: form.periodStart, periodEnd: form.periodEnd, issue },
      });
      if (issue) { closeGen(); refetch(); }
      else { setPreview(result); }
    } catch (e) { setErr(e.message); } finally { setGenerating(false); }
  };

  const markPaid = async (id) => {
    setUpdatingId(id);
    try { await api(`/statements/${id}`, { method: 'PATCH', body: { status: 'paid' } }); refetch(); }
    catch (e) { alert(e.message); } finally { setUpdatingId(null); }
  };

  const viewStatement = async (id) => {
    try {
      const data = await api(`/statements/${id}`);
      setViewHtml(data.html);
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="fade-in" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>Agent Commission Statements</h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
            {isAdmin ? 'Generate and issue monthly commission statements to your agents.' : 'Your commission statements — a full record of what you\'ve earned.'}
          </p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={openGen} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            + Generate Statement
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          {loading
            ? <div style={{ padding: 48, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
            : (
              <table>
                <thead><tr>
                  <th>Agent</th><th>Period</th><th>Total Premium</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Issued</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {statements.length === 0
                    ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text3)' }}>
                        No statements yet. {isAdmin ? 'Generate the first one above.' : 'Your agency hasn\'t issued any statements yet.'}
                      </td></tr>
                    : statements.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600, fontSize: 13 }}>{s.agent_name}</td>
                        <td style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{s.period_start} – {s.period_end}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{money(s.total_premium)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: '#3ecf8e' }}>{money(s.total_paid)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: Number(s.total_outstanding) > 0 ? 'var(--yellow)' : 'var(--text3)' }}>
                          {money(s.total_outstanding)}
                        </td>
                        <td>{badge(s.status)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text3)' }}>{s.issued_at ? new Date(s.issued_at).toLocaleDateString() : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => viewStatement(s.id)}>
                              View
                            </button>
                            {isAdmin && s.status === 'issued' && (
                              <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--green)' }}
                                disabled={updatingId === s.id} onClick={() => markPaid(s.id)}>
                                {updatingId === s.id ? '…' : 'Mark Paid'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {/* Generate modal */}
      {genModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeGen()}>
          <div className="modal" style={{ maxWidth: 560, width: '95%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>Generate Commission Statement</h3>
              <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={closeGen}>✕</button>
            </div>

            {!preview ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lbl}>Agent *</label>
                  <select value={form.agentId} onChange={e => setForm({ ...form, agentId: e.target.value })} autoFocus>
                    <option value="">Select agent…</option>
                    {agents.filter(a => a.status === 'active').map(a => (
                      <option key={a.id} value={a.id}>{a.display_name}{a.email ? ` (${a.email})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={lbl}>Period Start *</label>
                    <input type="date" value={form.periodStart} onChange={e => setForm({ ...form, periodStart: e.target.value })}/>
                  </div>
                  <div>
                    <label style={lbl}>Period End *</label>
                    <input type="date" value={form.periodEnd} onChange={e => setForm({ ...form, periodEnd: e.target.value })}/>
                  </div>
                </div>
                {err && <div style={errBox}>{err}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                  <button className="btn-ghost" onClick={closeGen}>Cancel</button>
                  <button className="btn-ghost" onClick={() => runGenerate(false)} disabled={generating}>
                    {generating ? 'Loading…' : 'Preview →'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  <Stat label="Commission Paid" value={money(preview.totals.totalCommissionPaid)} color="var(--green)"/>
                  <Stat label="Outstanding" value={money(preview.totals.totalCommissionOutstanding)} color="var(--yellow)"/>
                  <Stat label="Your Advance" value={money(preview.totals.totalAgentAdvance)} color="var(--accent)"/>
                </div>

                {/* Line items preview */}
                <div className="card" style={{ padding: 0, maxHeight: 300, overflowY: 'auto' }}>
                  <table>
                    <thead><tr><th>Policy</th><th>Carrier</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead>
                    <tbody>
                      {preview.lines.map((l, i) => (
                        <tr key={i}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.policyNumber}</td>
                          <td style={{ fontSize: 12, color: 'var(--text2)' }}>{l.carrierName}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: '#3ecf8e' }}>{money(l.commissionPaid)}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: l.commissionOutstanding > 0 ? 'var(--yellow)' : 'var(--text3)' }}>{money(l.commissionOutstanding)}</td>
                          <td><span className="badge" style={{ fontSize: 11, background: '#ffffff0a', color: 'var(--text2)' }}>{l.status}</span></td>
                        </tr>
                      ))}
                      {preview.lines.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>No ledger rows found for this period.</td></tr>}
                    </tbody>
                  </table>
                </div>

                {err && <div style={errBox}>{err}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn-ghost" onClick={() => setPreview(null)}>← Back</button>
                  <button className="btn-primary" onClick={() => runGenerate(true)} disabled={generating || preview.lines.length === 0}>
                    {generating ? 'Issuing…' : 'Issue Statement'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HTML statement viewer */}
      {viewHtml && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewHtml(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 16, width: '90%', maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>Commission Statement</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: 12 }}
                  onClick={() => { const w = window.open('', '_blank'); w.document.write(viewHtml); w.document.close(); }}>
                  Open / Print
                </button>
                <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setViewHtml(null)}>✕</button>
              </div>
            </div>
            <iframe
              srcDoc={viewHtml}
              style={{ flex: 1, border: 'none', background: '#fff', minHeight: 500 }}
              title="Commission Statement"
            />
          </div>
        </div>
      )}
    </div>
  );
}

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 };
const errBox = { color: 'var(--red)', fontSize: 12, background: '#f76f6f14', border: '1px solid #f76f6f44', borderRadius: 8, padding: '8px 12px' };

function Stat({ label, value, color = 'var(--text)' }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
