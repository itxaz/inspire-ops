import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import { api } from '../lib/api.js';

const money = (v) => v == null ? '—' : Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const pct = (v) => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`;

export default function ReservesModule() {
  const { data: resData, loading: rLoading, refetch: refetchRes } = useApi('/reserves');
  const { data: facData, loading: fLoading, refetch: refetchFac } = useApi('/factoring');
  const { data: ledgerData } = useApi('/ledger');
  const { data: agentsData } = useApi('/agents');

  const [resModal, setResModal] = useState(false);
  const [facModal, setFacModal] = useState(false);
  const [resForm, setResForm] = useState({ agentId: '', reservePct: '5' });
  const [facForm, setFacForm] = useState({ ledgerId: '', advanceAmount: '', feePct: '3', advancedOn: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const reserves = resData?.reserves ?? [];
  const advances = facData?.advances ?? [];
  const ledger = (ledgerData?.ledger ?? []).filter(l => l.status !== 'paid');
  const agents = agentsData?.agents ?? [];

  const saveReserve = async () => {
    if (!resForm.reservePct) { setErr('Enter a reserve %'); return; }
    setSaving(true); setErr('');
    try {
      await api('/reserves', { method: 'POST', body: { agentId: resForm.agentId || undefined, reservePct: Number(resForm.reservePct) / 100 } });
      setResModal(false); refetchRes();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const saveFactor = async () => {
    if (!facForm.ledgerId || !facForm.advanceAmount || !facForm.advancedOn) { setErr('Fill all required fields'); return; }
    setSaving(true); setErr('');
    try {
      await api('/factoring', { method: 'POST', body: {
        ledgerId: facForm.ledgerId,
        advanceAmount: Number(facForm.advanceAmount),
        feePct: Number(facForm.feePct) / 100,
        advancedOn: facForm.advancedOn,
      }});
      setFacModal(false); refetchFac();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const markRepaid = async (id) => {
    try {
      await api(`/factoring/${id}`, { method: 'PATCH', body: { status: 'repaid', repaidOn: new Date().toISOString().slice(0, 10) } });
      refetchFac();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="fade-in" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Premium tier banner */}
      <div style={{ background: 'linear-gradient(135deg, #4f8ef711, #a78bfa11)', border: '1px solid #4f8ef733', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="badge" style={{ background: '#a78bfa22', color: '#a78bfa', whiteSpace: 'nowrap' }}>Premium</span>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>Commission reserves and factoring are available on the Premium plan. Contact ITX to upgrade.</span>
      </div>

      {/* Reserves */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>Commission Reserves</h2>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Hold back a percentage of each commission as a cash buffer</p>
          </div>
          <button className="btn-primary" onClick={() => { setErr(''); setResModal(true); }}>+ Add Reserve</button>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            {rLoading ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
              : (
                <table>
                  <thead><tr><th>Agent</th><th>Reserve %</th><th>Balance</th><th>Last Updated</th></tr></thead>
                  <tbody>
                    {reserves.length === 0
                      ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--text3)' }}>No reserves configured.</td></tr>
                      : reserves.map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600, fontSize: 13 }}>{r.agent_name ?? <span style={{ fontStyle: 'italic', color: 'var(--text3)' }}>Agency-wide</span>}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{pct(r.reserve_pct)}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', color: '#3ecf8e' }}>{money(r.balance)}</td>
                          <td style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(r.updated_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      </div>

      {/* Factoring advances */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>Factoring Advances</h2>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>Advance cash against expected commissions (carrier float) for a small fee</p>
          </div>
          <button className="btn-primary" onClick={() => { setErr(''); setFacModal(true); }}>+ New Advance</button>
        </div>

        {/* Exposure summary */}
        {advances.filter(a => a.status === 'outstanding').length > 0 && (() => {
          const outstanding = advances.filter(a => a.status === 'outstanding');
          const totalAdvanced = outstanding.reduce((s, a) => s + Number(a.advance_amount), 0);
          const totalFees = outstanding.reduce((s, a) => s + Number(a.fee_amount), 0);
          return (
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <Stat label="Outstanding Advances" value={outstanding.length} color="var(--yellow)"/>
              <Stat label="Total Advanced" value={money(totalAdvanced)} color="var(--yellow)"/>
              <Stat label="Total Fees" value={money(totalFees)} color="var(--text2)"/>
            </div>
          );
        })()}

        <div className="card" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            {fLoading ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
              : (
                <table>
                  <thead><tr><th>Policy</th><th>Carrier</th><th>Expected</th><th>Advanced</th><th>Fee</th><th>Advanced On</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {advances.length === 0
                      ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text3)' }}>No advances yet.</td></tr>
                      : advances.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.policy_number}</td>
                          <td style={{ fontSize: 13, color: 'var(--text2)' }}>{a.carrier_name}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{money(a.expected_amount)}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--yellow)' }}>{money(a.advance_amount)}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text3)' }}>{money(a.fee_amount)}</td>
                          <td style={{ fontSize: 12, color: 'var(--text2)' }}>{a.advanced_on}</td>
                          <td>
                            <span className="badge" style={{ background: a.status === 'repaid' ? '#3ecf8e22' : '#f7c94f22', color: a.status === 'repaid' ? '#3ecf8e' : '#f7c94f' }}>
                              {a.status}
                            </span>
                          </td>
                          <td>
                            {a.status === 'outstanding' && (
                              <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--green)' }} onClick={() => markRepaid(a.id)}>
                                Mark Repaid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      </div>

      {/* Reserve modal */}
      {resModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setResModal(false)}>
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>Add Commission Reserve</h3>
              <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setResModal(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Agent <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(blank = agency-wide default)</span></label>
                <select value={resForm.agentId} onChange={e => setResForm({ ...resForm, agentId: e.target.value })}>
                  <option value="">Agency-wide</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Reserve % *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min="0" max="50" step="0.5" value={resForm.reservePct}
                    onChange={e => setResForm({ ...resForm, reservePct: e.target.value })} style={{ width: 90 }}/>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>% held back from each commission</span>
                </div>
              </div>
              {err && <div style={errBox}>{err}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button className="btn-ghost" onClick={() => setResModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveReserve} disabled={saving}>{saving ? 'Saving…' : 'Add Reserve'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Factoring modal */}
      {facModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setFacModal(false)}>
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>New Factoring Advance</h3>
              <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setFacModal(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Commission Ledger Row *</label>
                <select value={facForm.ledgerId} onChange={e => setFacForm({ ...facForm, ledgerId: e.target.value })}>
                  <option value="">Select an open ledger row…</option>
                  {ledger.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.policy_number} — expected {Number(l.expected_amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Advance Amount ($) *</label>
                <input type="number" min="0" step="0.01" value={facForm.advanceAmount}
                  onChange={e => setFacForm({ ...facForm, advanceAmount: e.target.value })} placeholder="e.g. 1200.00"/>
              </div>
              <div>
                <label style={lbl}>Fee % *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min="0" max="50" step="0.1" value={facForm.feePct}
                    onChange={e => setFacForm({ ...facForm, feePct: e.target.value })} style={{ width: 80 }}/>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>% of advance amount</span>
                </div>
              </div>
              <div>
                <label style={lbl}>Advanced On *</label>
                <input type="date" value={facForm.advancedOn} onChange={e => setFacForm({ ...facForm, advancedOn: e.target.value })}/>
              </div>
              {err && <div style={errBox}>{err}</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button className="btn-ghost" onClick={() => setFacModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveFactor} disabled={saving}>{saving ? 'Saving…' : 'Record Advance'}</button>
            </div>
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
    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', minWidth: 130 }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
