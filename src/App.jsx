import { useState, useEffect, useRef, useCallback } from "react";
import { login as apiLogin, logout as apiLogout, tokens, api } from "./lib/api.js";
import CommissionHub from "./modules/CommissionHub.jsx";

// ============================================================
// LEGACY CLIENT STORE (ClientsModule still uses localStorage)
// ============================================================
const getClients = () => {
  try { return JSON.parse(localStorage.getItem("opencrm_clients") || "[]"); } catch { return []; }
};
const saveClients = (clients) => localStorage.setItem("opencrm_clients", JSON.stringify(clients));

// Map API user object to the shape the rest of the UI expects.
const shapeSession = (user) => ({
  id: user.sub,
  agencyId: user.agencyId,
  apiRole: user.role,                                             // full API role string
  role: ["itx_admin", "agency_admin"].includes(user.role) ? "admin" : user.role,
  agentId: user.agentId,
  name: user.email ?? "User",
  modules: ["itx_admin", "agency_admin", "agency_staff"].includes(user.role)
    ? null  // null = all modules
    : ["commissions"],
});

// ============================================================
// LOGIN SCREEN
// ============================================================
const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = await apiLogin(email, password);
      onLogin(shapeSession({ ...user, email }));
    } catch (err) {
      if (err.status === 401) {
        setError("Invalid email or password");
      } else {
        setError("Cannot reach the API — is the server running?");
      }
      setLoading(false);
    }
  };

  return (
    <div style={{ height: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-body)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@400;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0a0c10; --surface: #111318; --surface2: #181c24; --surface3: #1e2330;
          --border: #ffffff0f; --border2: #ffffff18; --accent: #4f8ef7; --accent2: #7c6af7;
          --green: #3ecf8e; --red: #f76f6f; --yellow: #f7c94f; --text: #e8eaf2;
          --text2: #8a90a8; --text3: #545970; --font-display: 'Syne', sans-serif; --font-body: 'DM Sans', sans-serif;
        }
        body { background: var(--bg); color: var(--text); font-family: var(--font-body); }
        input { background: var(--surface3); border: 1px solid var(--border2); border-radius: 10px; color: var(--text); font-family: var(--font-body); font-size: 14px; padding: 10px 14px; outline: none; transition: border-color .2s; width: 100%; }
        input:focus { border-color: var(--accent); }
        button { cursor: pointer; font-family: var(--font-body); font-size: 14px; border: none; border-radius: 10px; transition: all .15s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Background glow */}
      <div style={{ position: "fixed", top: "30%", left: "50%", transform: "translate(-50%,-50%)", width: 600, height: 600, background: "radial-gradient(circle, #4f8ef722 0%, transparent 70%)", pointerEvents: "none" }}/>

      <div style={{ width: 400, animation: "fadeIn .4s ease" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 56, height: 56, background: "linear-gradient(135deg, #4f8ef7, #7c6af7)", borderRadius: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16, boxShadow: "0 8px 32px #4f8ef740" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, color: "var(--text)", letterSpacing: "-0.5px" }}>OpenCRM</div>
          <div style={{ color: "var(--text3)", fontSize: 13, marginTop: 4 }}>Sign in to your account</div>
        </div>

        {/* Card */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 20, padding: 32, boxShadow: "0 24px 64px #0008" }}>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@agency.com" autoFocus required/>
            </div>
            <div style={{ marginBottom: 20, position: "relative" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required style={{ paddingRight: 44 }}/>
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", padding: 4, color: "var(--text3)" }}>
                  {showPass ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                </button>
              </div>
            </div>
            {error && <div style={{ background: "#f76f6f18", border: "1px solid #f76f6f44", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f76f6f", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg, #4f8ef7, #7c6af7)", color: "#fff", fontWeight: 700, fontSize: 15, borderRadius: 12, boxShadow: "0 4px 16px #4f8ef740", opacity: loading ? 0.7 : 1 }}>
              {loading ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Signing in...
              </span> : "Sign In →"}
            </button>
          </form>
          <div style={{ marginTop: 20, padding: "14px", background: "var(--surface2)", borderRadius: 10, fontSize: 12, color: "var(--text3)" }}>
            <div style={{ fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>Demo Logins (password: <span style={{ color: "var(--accent)" }}>password123</span>)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div>Agency admin: <span style={{ color: "var(--accent)" }}>admin@demo.test</span></div>
              <div>Agent portal: <span style={{ color: "var(--accent)" }}>jane@demo.test</span></div>
              <div>ITX super-admin: <span style={{ color: "var(--accent)" }}>itx@inspirecrm.test</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// CLIENT ACCESS MANAGEMENT MODULE (admin only)
// ============================================================
const AVAILABLE_MODULES = [
  { id: "commissions", label: "Commission Hub", color: "#f7c94f" },
  { id: "dashboard", label: "Dashboard", color: "#4f8ef7" },
  { id: "crm", label: "CRM", color: "#7c6af7" },
  { id: "sales", label: "Sales", color: "#3ecf8e" },
  { id: "invoicing", label: "Invoicing", color: "#f7c94f" },
  { id: "inventory", label: "Inventory", color: "#f7934f" },
  { id: "email", label: "Email Marketing", color: "#4f8ef7" },
  { id: "documents", label: "Documents", color: "#a78bfa" },
  { id: "database", label: "Database", color: "#34d399" },
  { id: "accounting", label: "Accounting", color: "#f9a8d4" },
  { id: "project", label: "Project", color: "#60a5fa" },
  { id: "sign", label: "Sign", color: "#fbbf24" },
  { id: "knowledge", label: "Knowledge", color: "#a3e635" },
  { id: "elearning", label: "eLearning", color: "#f472b6" },
  { id: "social", label: "Social Marketing", color: "#fb923c" },
  { id: "whatsapp", label: "WhatsApp", color: "#25d366" },
];

const ClientsModule = () => {
  const [clients, setClients] = useState(getClients());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", businessName: "", email: "", username: "", password: "", modules: ["dashboard", "crm"], status: "active" });
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(null);
  const [tab, setTab] = useState("all");

  const save = () => {
    let updated;
    if (editing) {
      updated = clients.map(c => c.id === editing.id ? { ...c, ...form } : c);
    } else {
      updated = [...clients, { ...form, id: Date.now().toString(), createdAt: new Date().toISOString().split("T")[0] }];
    }
    saveClients(updated);
    setClients(updated);
    setShowModal(false);
    setEditing(null);
    setForm({ name: "", businessName: "", email: "", username: "", password: "", modules: ["dashboard", "crm"], status: "active" });
  };

  const deleteClient = (id) => {
    const updated = clients.filter(c => c.id !== id);
    saveClients(updated);
    setClients(updated);
  };

  const toggleStatus = (id) => {
    const updated = clients.map(c => c.id === id ? { ...c, status: c.status === "active" ? "suspended" : "active" } : c);
    saveClients(updated);
    setClients(updated);
  };

  const openEdit = (client) => {
    setEditing(client);
    setForm({ name: client.name, businessName: client.businessName, email: client.email, username: client.username, password: client.password, modules: client.modules, status: client.status });
    setShowModal(true);
  };

  const copyCredentials = (client) => {
    const text = `OpenCRM Login\nURL: ${window.location.href}\nUsername: ${client.username}\nPassword: ${client.password}`;
    navigator.clipboard.writeText(text).then(() => { setCopied(client.id); setTimeout(() => setCopied(null), 2000); });
  };

  const toggleModule = (moduleId) => {
    setForm(f => ({ ...f, modules: f.modules.includes(moduleId) ? f.modules.filter(m => m !== moduleId) : [...f.modules, moduleId] }));
  };

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.businessName.toLowerCase().includes(search.toLowerCase()) || c.username.toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || c.status === tab;
    return matchSearch && matchTab;
  });

  const active = clients.filter(c => c.status === "active").length;
  const suspended = clients.filter(c => c.status === "suspended").length;

  return (
    <div style={{ padding: 24, animation: "fadeIn .3s ease" }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Clients", value: clients.length, color: "#4f8ef7", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
          { label: "Active", value: active, color: "#3ecf8e", icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" },
          { label: "Suspended", value: suspended, color: "#f76f6f", icon: "M10 14l2-2m0 0 2-2m-2 2-2-2m2 2 2 2m7-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, background: `${s.color}18`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon}/></svg>
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color, fontFamily: "var(--font-display)" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "var(--text2)" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4, background: "var(--surface2)", borderRadius: 10, padding: 3 }}>
          {["all", "active", "suspended"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: tab === t ? "var(--surface3)" : "transparent", color: tab === t ? "var(--text)" : "var(--text3)", border: tab === t ? "1px solid var(--border2)" : "1px solid transparent" }}>
              {t.charAt(0).toUpperCase() + t.slice(1)} {t === "all" ? `(${clients.length})` : t === "active" ? `(${active})` : `(${suspended})`}
            </button>
          ))}
        </div>
        <div style={{ position: "relative", flex: 1 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." style={{ paddingLeft: 34 }}/>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name: "", businessName: "", email: "", username: "", password: "", modules: ["dashboard", "crm"], status: "active" }); setShowModal(true); }} style={{ padding: "9px 18px", background: "linear-gradient(135deg, #4f8ef7, #7c6af7)", color: "#fff", fontWeight: 700, fontSize: 13, borderRadius: 10, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Client
        </button>
      </div>

      {/* Client Cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text3)" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, opacity: 0.4 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <div style={{ fontSize: 15 }}>{clients.length === 0 ? "No clients yet. Add your first client!" : "No clients match your search."}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {filtered.map(client => (
            <div key={client.id} style={{ background: "var(--surface)", border: `1px solid ${client.status === "active" ? "var(--border2)" : "#f76f6f33"}`, borderRadius: 16, padding: 20, transition: "box-shadow .2s" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, background: "linear-gradient(135deg, #4f8ef7, #7c6af7)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, color: "#fff", fontSize: 16 }}>
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>{client.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text3)" }}>{client.businessName}</div>
                  </div>
                </div>
                <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: client.status === "active" ? "#3ecf8e22" : "#f76f6f22", color: client.status === "active" ? "#3ecf8e" : "#f76f6f", border: `1px solid ${client.status === "active" ? "#3ecf8e44" : "#f76f6f44"}` }}>
                  {client.status === "active" ? "● Active" : "● Suspended"}
                </span>
              </div>

              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>
                <div style={{ marginBottom: 4 }}>📧 {client.email}</div>
                <div>🔑 @{client.username} · Added {client.createdAt}</div>
              </div>

              {/* Module badges */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
                {client.modules.slice(0, 6).map(mId => {
                  const mod = AVAILABLE_MODULES.find(m => m.id === mId);
                  return mod ? <span key={mId} style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: `${mod.color}18`, color: mod.color, border: `1px solid ${mod.color}33` }}>{mod.label}</span> : null;
                })}
                {client.modules.length > 6 && <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: "var(--surface3)", color: "var(--text3)" }}>+{client.modules.length - 6} more</span>}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => copyCredentials(client)} title="Copy login credentials" style={{ flex: 1, padding: "7px", background: copied === client.id ? "#3ecf8e22" : "var(--surface2)", border: `1px solid ${copied === client.id ? "#3ecf8e44" : "var(--border2)"}`, borderRadius: 8, fontSize: 12, color: copied === client.id ? "#3ecf8e" : "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  {copied === client.id ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Login</>}
                </button>
                <button onClick={() => openEdit(client)} title="Edit" style={{ padding: "7px 12px", background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--text2)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button onClick={() => toggleStatus(client.id)} title={client.status === "active" ? "Suspend" : "Activate"} style={{ padding: "7px 12px", background: client.status === "active" ? "#f7c94f18" : "#3ecf8e18", border: `1px solid ${client.status === "active" ? "#f7c94f33" : "#3ecf8e33"}`, borderRadius: 8, color: client.status === "active" ? "#f7c94f" : "#3ecf8e" }}>
                  {client.status === "active" ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                </button>
                <button onClick={() => { if (window.confirm(`Delete ${client.name}?`)) deleteClient(client.id); }} title="Delete" style={{ padding: "7px 12px", background: "#f76f6f18", border: "1px solid #f76f6f33", borderRadius: 8, color: "#f76f6f" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s ease" }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 20, padding: 28, width: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px #000a" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18 }}>{editing ? "Edit Client" : "Add New Client"}</div>
              <button onClick={() => setShowModal(false)} style={{ background: "var(--surface2)", color: "var(--text2)", padding: "6px 10px", borderRadius: 8 }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 5, textTransform: "uppercase" }}>Full Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Smith"/>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 5, textTransform: "uppercase" }}>Business Name *</label>
                <input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} placeholder="Acme Corp"/>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 5, textTransform: "uppercase" }}>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@acme.com"/>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 5, textTransform: "uppercase" }}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: "100%", padding: "8px 12px" }}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 5, textTransform: "uppercase" }}>Username *</label>
                <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, "") }))} placeholder="johnsmith"/>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 5, textTransform: "uppercase" }}>Password *</label>
                <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Set a password"/>
              </div>
            </div>

            {/* Module selector */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase" }}>Allowed Modules ({form.modules.length} selected)</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {AVAILABLE_MODULES.map(m => (
                  <button key={m.id} onClick={() => toggleModule(m.id)} style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: form.modules.includes(m.id) ? `${m.color}22` : "var(--surface2)", color: form.modules.includes(m.id) ? m.color : "var(--text3)", border: `1px solid ${form.modules.includes(m.id) ? m.color + "55" : "var(--border)"}`, transition: "all .15s" }}>
                    {form.modules.includes(m.id) && "✓ "}{m.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => setForm(f => ({ ...f, modules: AVAILABLE_MODULES.map(m => m.id) }))} style={{ fontSize: 11, color: "var(--accent)", background: "none", padding: "2px 6px" }}>Select All</button>
                <button onClick={() => setForm(f => ({ ...f, modules: [] }))} style={{ fontSize: 11, color: "var(--text3)", background: "none", padding: "2px 6px" }}>Clear All</button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: "11px", background: "var(--surface2)", color: "var(--text2)", border: "1px solid var(--border2)", borderRadius: 10 }}>Cancel</button>
              <button onClick={save} disabled={!form.name || !form.username || !form.password} style={{ flex: 2, padding: "11px", background: "linear-gradient(135deg, #4f8ef7, #7c6af7)", color: "#fff", fontWeight: 700, borderRadius: 10, opacity: (!form.name || !form.username || !form.password) ? 0.5 : 1 }}>
                {editing ? "Save Changes" : "Create Client Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// GLOBAL STYLES
// ============================================================
const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@400;600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0a0c10;
      --surface: #111318;
      --surface2: #181c24;
      --surface3: #1e2330;
      --border: #ffffff0f;
      --border2: #ffffff18;
      --accent: #4f8ef7;
      --accent2: #7c6af7;
      --accent3: #f7934f;
      --green: #3ecf8e;
      --red: #f76f6f;
      --yellow: #f7c94f;
      --text: #e8eaf2;
      --text2: #8a90a8;
      --text3: #545970;
      --font-display: 'Syne', sans-serif;
      --font-body: 'DM Sans', sans-serif;
      --radius: 10px;
      --radius2: 16px;
      --shadow: 0 4px 24px #0008;
      --glow: 0 0 40px #4f8ef722;
    }

    body { background: var(--bg); color: var(--text); font-family: var(--font-body); overflow: hidden; }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
    @keyframes popIn { from { opacity:0; transform: scale(.92); } to { opacity:1; transform: scale(1); } }

    .fade-in { animation: fadeIn .3s ease forwards; }
    .slide-in { animation: slideIn .3s ease forwards; }
    .pop-in { animation: popIn .25s ease forwards; }

    input, textarea, select {
      background: var(--surface3);
      border: 1px solid var(--border2);
      border-radius: var(--radius);
      color: var(--text);
      font-family: var(--font-body);
      font-size: 14px;
      padding: 8px 12px;
      outline: none;
      transition: border-color .2s;
      width: 100%;
    }
    input:focus, textarea:focus, select:focus { border-color: var(--accent); }

    button {
      cursor: pointer;
      font-family: var(--font-body);
      font-size: 14px;
      border: none;
      border-radius: var(--radius);
      transition: all .15s;
    }
    button:active { transform: scale(.97); }

    .btn-primary {
      background: var(--accent);
      color: #fff;
      padding: 8px 16px;
      font-weight: 600;
    }
    .btn-primary:hover { background: #6da4ff; }

    .btn-ghost {
      background: transparent;
      color: var(--text2);
      padding: 8px 12px;
      border: 1px solid var(--border2);
    }
    .btn-ghost:hover { background: var(--surface3); color: var(--text); }

    .btn-danger {
      background: var(--red);
      color: #fff;
      padding: 8px 16px;
      font-weight: 600;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius2);
      padding: 20px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 600;
    }

    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 10px 14px; font-size: 12px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid var(--border); }
    td { padding: 12px 14px; font-size: 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--surface2); }

    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius2);
      padding: 20px 24px;
      position: relative;
      overflow: hidden;
    }
    .stat-card::before {
      content: '';
      position: absolute;
      top: -40px; right: -40px;
      width: 120px; height: 120px;
      border-radius: 50%;
      opacity: .07;
    }

    .modal-overlay {
      position: fixed; inset: 0;
      background: #000a;
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex; align-items: center; justify-content: center;
    }
    .modal {
      background: var(--surface2);
      border: 1px solid var(--border2);
      border-radius: var(--radius2);
      padding: 28px;
      width: 520px;
      max-width: 95vw;
      max-height: 90vh;
      overflow-y: auto;
      animation: popIn .2s ease;
    }

    .tag {
      display: inline-flex;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .04em;
    }
  `}</style>
);

// ============================================================
// ICONS
// ============================================================
const Icon = ({ name, size = 18, color = "currentColor" }) => {
  const icons = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    crm: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    sales: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    invoice: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    inventory: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    email: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>,
    documents: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>,
    database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
    accounting: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
    project: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    sign: <><path d="M20 19.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8.5L18 5.5"/><path d="M15 2v4h4"/><path d="M8 17l2 2 4-4"/></>,
    knowledge: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
    elearning: <><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></>,
    social: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></>,
    whatsapp: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    search: <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    chevronRight: <><polyline points="9 18 15 12 9 6"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash: <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    send: <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    globe: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    trending: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    star: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    menu: <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    zap: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1.28h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    package: <><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    list: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    upload: <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>,
    tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    activity: <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
    award: <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
    folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || <circle cx="12" cy="12" r="10"/>}
    </svg>
  );
};

// ============================================================
// DATA STORE
// ============================================================
const useStore = () => {
  const [data, setData] = useState({
    contacts: [
      { id: 1, name: "Sophia Reynolds", company: "TechVentures Inc", email: "sophia@techventures.com", phone: "+1 555-0101", stage: "Qualified", value: 45000, avatar: "SR", tags: ["Enterprise"], lastContact: "2024-01-15" },
      { id: 2, name: "Marcus Chen", company: "Innovate Labs", email: "m.chen@innovatelabs.io", phone: "+1 555-0202", stage: "Proposal", value: 120000, avatar: "MC", tags: ["Hot Lead", "SaaS"], lastContact: "2024-01-18" },
      { id: 3, name: "Isabella Torres", company: "GreenPath Solutions", email: "i.torres@greenpath.co", phone: "+1 555-0303", stage: "Negotiation", value: 78000, avatar: "IT", tags: ["Mid-Market"], lastContact: "2024-01-20" },
      { id: 4, name: "David Kim", company: "Nexus Digital", email: "david@nexusdigital.net", phone: "+1 555-0404", stage: "Won", value: 95000, avatar: "DK", tags: ["Enterprise", "Long-term"], lastContact: "2024-01-12" },
      { id: 5, name: "Emma Whitfield", company: "Pulse Analytics", email: "emma@pulseanalytics.com", phone: "+1 555-0505", stage: "New", value: 32000, avatar: "EW", tags: ["SMB"], lastContact: "2024-01-22" },
    ],
    invoices: [
      { id: "INV-2024-001", client: "TechVentures Inc", amount: 12500, status: "Paid", date: "2024-01-05", due: "2024-02-05", items: [{ desc: "Software License", qty: 5, price: 2500 }] },
      { id: "INV-2024-002", client: "Innovate Labs", amount: 45000, status: "Pending", date: "2024-01-10", due: "2024-02-10", items: [{ desc: "Consulting Services", qty: 90, price: 500 }] },
      { id: "INV-2024-003", client: "GreenPath Solutions", amount: 8750, status: "Overdue", date: "2023-12-15", due: "2024-01-15", items: [{ desc: "Platform Setup", qty: 1, price: 8750 }] },
      { id: "INV-2024-004", client: "Nexus Digital", amount: 23000, status: "Draft", date: "2024-01-20", due: "2024-02-20", items: [{ desc: "Enterprise Plan", qty: 23, price: 1000 }] },
      { id: "INV-2024-005", client: "Pulse Analytics", amount: 5600, status: "Paid", date: "2024-01-08", due: "2024-02-08", items: [{ desc: "Analytics Module", qty: 1, price: 5600 }] },
    ],
    products: [
      { id: 1, name: "Enterprise CRM Suite", sku: "CRM-ENT-001", category: "Software", price: 2499, stock: 999, status: "Active", sales: 124 },
      { id: 2, name: "Analytics Dashboard", sku: "ANL-DAS-002", category: "Software", price: 899, stock: 999, status: "Active", sales: 289 },
      { id: 3, name: "API Access Token (Annual)", sku: "API-ANN-003", category: "Service", price: 349, stock: 999, status: "Active", sales: 512 },
      { id: 4, name: "Professional Services (hr)", sku: "SVC-PRO-004", category: "Service", price: 250, stock: 500, status: "Active", sales: 87 },
      { id: 5, name: "Hardware Gateway Device", sku: "HW-GTW-005", category: "Hardware", price: 1199, stock: 42, status: "Low Stock", sales: 33 },
      { id: 6, name: "Legacy Module Pack", sku: "MOD-LEG-006", category: "Software", price: 199, stock: 0, status: "Out of Stock", sales: 8 },
    ],
    projects: [
      { id: 1, name: "CRM Platform Redesign", client: "TechVentures Inc", deadline: "2024-03-15", progress: 72, status: "On Track", team: ["SR", "MC"], priority: "High" },
      { id: 2, name: "API Integration Suite", client: "Innovate Labs", deadline: "2024-02-28", progress: 45, status: "At Risk", team: ["DK", "IT"], priority: "Critical" },
      { id: 3, name: "Mobile App Launch", client: "Pulse Analytics", deadline: "2024-04-01", progress: 20, status: "On Track", team: ["EW", "MC"], priority: "Medium" },
      { id: 4, name: "Data Migration", client: "Nexus Digital", deadline: "2024-01-31", progress: 90, status: "On Track", team: ["DK"], priority: "High" },
    ],
    emails: [
      { id: 1, subject: "Q1 Product Newsletter", status: "Sent", sent: 1240, opened: 892, clicked: 234, date: "2024-01-10", lang: "EN" },
      { id: 2, subject: "Special Offer - Enterprise Plans", status: "Sent", sent: 856, opened: 543, clicked: 198, date: "2024-01-15", lang: "EN/ES" },
      { id: 3, subject: "Webinar Invitation: AI in CRM", status: "Draft", sent: 0, opened: 0, clicked: 0, date: "2024-01-25", lang: "EN/FR/DE" },
      { id: 4, subject: "Renewal Reminder", status: "Scheduled", sent: 0, opened: 0, clicked: 0, date: "2024-02-01", lang: "EN/PT" },
    ],
    documents: [
      { id: 1, name: "Sales Proposal Template.docx", size: "245 KB", modified: "2024-01-18", type: "docx", folder: "Templates" },
      { id: 2, name: "Q4 2023 Revenue Report.pdf", size: "1.2 MB", modified: "2024-01-10", type: "pdf", folder: "Reports" },
      { id: 3, name: "Client Onboarding Checklist.xlsx", size: "88 KB", modified: "2024-01-15", type: "xlsx", folder: "Operations" },
      { id: 4, name: "Partnership Agreement Draft.pdf", size: "345 KB", modified: "2024-01-20", type: "pdf", folder: "Legal" },
      { id: 5, name: "Brand Guidelines 2024.pdf", size: "4.5 MB", modified: "2024-01-05", type: "pdf", folder: "Marketing" },
    ],
    knowledgeBase: [
      { id: 1, title: "Getting Started with the CRM", category: "Guide", views: 1240, updated: "2024-01-15" },
      { id: 2, title: "Invoice Management Best Practices", category: "Best Practice", views: 876, updated: "2024-01-10" },
      { id: 3, title: "API Documentation v2.0", category: "Technical", views: 2341, updated: "2024-01-20" },
      { id: 4, title: "Sales Pipeline Optimization", category: "Strategy", views: 654, updated: "2024-01-12" },
    ],
    whatsapp: [
      { id: 1, contact: "Sophia Reynolds", phone: "+1 555-0101", lastMessage: "Thanks for the proposal!", time: "10:32 AM", unread: 0, status: "delivered" },
      { id: 2, contact: "Marcus Chen", phone: "+1 555-0202", lastMessage: "When can we schedule a call?", time: "9:15 AM", unread: 2, status: "read" },
      { id: 3, contact: "David Kim", phone: "+1 555-0404", lastMessage: "Invoice received, will process.", time: "Yesterday", unread: 0, status: "delivered" },
    ],
    transactions: [
      { id: 1, desc: "Payment from TechVentures", amount: 12500, type: "income", date: "2024-01-15", category: "Sales" },
      { id: 2, desc: "Cloud Infrastructure Costs", amount: -3200, type: "expense", date: "2024-01-14", category: "Operations" },
      { id: 3, desc: "Payment from Pulse Analytics", amount: 5600, type: "income", date: "2024-01-08", category: "Sales" },
      { id: 4, desc: "Marketing Campaign Budget", amount: -1500, type: "expense", date: "2024-01-07", category: "Marketing" },
      { id: 5, desc: "Consulting Revenue", amount: 8000, type: "income", date: "2024-01-05", category: "Services" },
      { id: 6, desc: "Software Subscriptions", amount: -890, type: "expense", date: "2024-01-03", category: "Operations" },
    ],
    courses: [
      { id: 1, title: "CRM Mastery Program", enrolled: 234, lessons: 24, completion: 67, level: "Intermediate" },
      { id: 2, title: "Sales Process Excellence", enrolled: 189, lessons: 18, completion: 45, level: "Beginner" },
      { id: 3, title: "Advanced Analytics & Reporting", enrolled: 98, lessons: 32, completion: 23, level: "Advanced" },
    ],
    socialPosts: [
      { id: 1, platform: "LinkedIn", content: "Excited to announce our Q1 product updates!", scheduled: "2024-01-25 09:00", status: "Scheduled", reach: 0 },
      { id: 2, platform: "Twitter", content: "New features just dropped! 🚀 Check out our latest...", scheduled: "2024-01-20 14:00", status: "Published", reach: 1240 },
      { id: 3, platform: "Instagram", content: "Behind the scenes of our team building the future...", scheduled: "2024-01-18 11:00", status: "Published", reach: 3456 },
    ],
    pendingSignatures: [
      { id: 1, doc: "Enterprise License Agreement", party: "TechVentures Inc", sent: "2024-01-18", status: "Awaiting", expires: "2024-02-18" },
      { id: 2, doc: "NDA - Project Collaboration", party: "Innovate Labs", sent: "2024-01-20", status: "Signed", expires: "2025-01-20" },
      { id: 3, doc: "Service Level Agreement", party: "GreenPath Solutions", sent: "2024-01-15", status: "Awaiting", expires: "2024-02-15" },
    ],
  });

  const update = (key, fn) => setData(d => ({ ...d, [key]: fn(d[key]) }));
  return { data, update };
};

// ============================================================
// LAYOUT COMPONENTS
// ============================================================
const Sidebar = ({ active, setActive, collapsed, setCollapsed, session, onLogout, allowedModules }) => {
  const allModules = [
    { id: "commissions", label: "Commission Hub", icon: "accounting", color: "#f7c94f" },
    { id: "dashboard", label: "Dashboard", icon: "dashboard", color: "#4f8ef7" },
    { id: "crm", label: "CRM", icon: "crm", color: "#7c6af7" },
    { id: "sales", label: "Sales", icon: "sales", color: "#3ecf8e" },
    { id: "invoicing", label: "Invoicing", icon: "invoice", color: "#f7c94f" },
    { id: "inventory", label: "Inventory", icon: "inventory", color: "#f7934f" },
    { id: "email", label: "Email Marketing", icon: "email", color: "#4f8ef7" },
    { id: "documents", label: "Documents", icon: "documents", color: "#a78bfa" },
    { id: "database", label: "Database", icon: "database", color: "#34d399" },
    { id: "accounting", label: "Accounting", icon: "accounting", color: "#f9a8d4" },
    { id: "project", label: "Project", icon: "project", color: "#60a5fa" },
    { id: "sign", label: "Sign", icon: "sign", color: "#fbbf24" },
    { id: "knowledge", label: "Knowledge", icon: "knowledge", color: "#a3e635" },
    { id: "elearning", label: "eLearning", icon: "elearning", color: "#f472b6" },
    { id: "social", label: "Social Marketing", icon: "social", color: "#fb923c" },
    { id: "whatsapp", label: "WhatsApp", icon: "whatsapp", color: "#25d366" },
  ];

  // Admin gets all modules + Clients management; agents get only their allowed set.
  const modules = session?.role === "admin"
    ? [...allModules, { id: "clients", label: "Client Access", icon: "crm", color: "#f7934f" }]
    : allModules.filter(m => allowedModules?.includes(m.id));

  return (
    <div style={{
      width: collapsed ? 64 : 220,
      background: "var(--surface)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      transition: "width .25s cubic-bezier(.4,0,.2,1)",
      overflow: "hidden", flexShrink: 0, height: "100vh",
      position: "relative", zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{ padding: collapsed ? "20px 0" : "20px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, justifyContent: collapsed ? "center" : "flex-start" }}>
        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, var(--accent), var(--accent2))", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="zap" size={16} color="#fff"/>
        </div>
        {!collapsed && <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17, color: "var(--text)", whiteSpace: "nowrap" }}>OpenCRM</span>}
      </div>

      {/* Client badge */}
      {!collapsed && session?.role === "client" && (
        <div style={{ margin: "8px 12px 0", padding: "8px 10px", background: "#4f8ef712", border: "1px solid #4f8ef733", borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4f8ef7", textTransform: "uppercase", letterSpacing: "0.5px" }}>Business</div>
          <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600, marginTop: 1 }}>{session.businessName}</div>
        </div>
      )}

      {/* Nav */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
        {/* Separator before Clients for admin */}
        {session?.role === "admin" && modules.map((m, i) => (
          <div key={m.id}>
            {m.id === "clients" && <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }}/>}
            <button onClick={() => setActive(m.id)} title={collapsed ? m.label : ""} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: collapsed ? "10px 0" : "9px 14px",
              justifyContent: collapsed ? "center" : "flex-start",
              background: active === m.id ? `${m.color}18` : "transparent",
              color: active === m.id ? m.color : "var(--text2)",
              borderRadius: 0, fontWeight: active === m.id ? 600 : 400,
              fontSize: 13, whiteSpace: "nowrap",
              borderLeft: active === m.id ? `3px solid ${m.color}` : "3px solid transparent",
              transition: "all .15s",
            }}>
              <Icon name={m.icon} size={17} color={active === m.id ? m.color : "var(--text3)"}/>
              {!collapsed && <span>{m.label}</span>}
              {!collapsed && m.id === "clients" && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, background: "#f7934f22", color: "#f7934f", border: "1px solid #f7934f44", borderRadius: 6, padding: "1px 6px" }}>ADMIN</span>}
            </button>
          </div>
        ))}

        {session?.role !== "admin" && modules.map(m => (
          <button key={m.id} onClick={() => setActive(m.id)} title={collapsed ? m.label : ""} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: collapsed ? "10px 0" : "9px 14px",
            justifyContent: collapsed ? "center" : "flex-start",
            background: active === m.id ? `${m.color}18` : "transparent",
            color: active === m.id ? m.color : "var(--text2)",
            borderRadius: 0, fontWeight: active === m.id ? 600 : 400,
            fontSize: 13, whiteSpace: "nowrap",
            borderLeft: active === m.id ? `3px solid ${m.color}` : "3px solid transparent",
            transition: "all .15s",
          }}>
            <Icon name={m.icon} size={17} color={active === m.id ? m.color : "var(--text3)"}/>
            {!collapsed && <span>{m.label}</span>}
          </button>
        ))}
      </div>

      {/* User + logout */}
      {!collapsed && (
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg, #4f8ef7, #7c6af7)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: "#fff", flexShrink: 0 }}>
            {session?.name?.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session?.name}</div>
            <div style={{ fontSize: 10, color: session?.role === "admin" ? "#f7934f" : "#4f8ef7", fontWeight: 700, textTransform: "uppercase" }}>{session?.role}</div>
          </div>
          <button onClick={onLogout} title="Sign out" style={{ background: "none", color: "var(--text3)", padding: 4 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      )}

      {/* Collapse toggle */}
      <button onClick={() => setCollapsed(!collapsed)} style={{
        padding: "14px", background: "transparent", color: "var(--text3)",
        borderTop: "1px solid var(--border)", display: "flex", justifyContent: collapsed ? "center" : "flex-end",
      }}>
        <Icon name="chevronRight" size={16} color="var(--text3)"/>
      </button>
    </div>
  );
};

const Topbar = ({ module, session, onLogout }) => {
  const labels = { dashboard: "Dashboard", crm: "CRM", sales: "Sales", invoicing: "Invoicing", inventory: "Inventory", email: "Email Marketing", documents: "Documents", database: "Database", accounting: "Accounting", project: "Project", sign: "Sign", knowledge: "Knowledge Base", elearning: "eLearning", social: "Social Marketing", whatsapp: "WhatsApp Messaging", clients: "Client Access Management" };
  return (
    <div style={{ height: 56, background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 24px", gap: 16, flexShrink: 0 }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "var(--text)" }}>{labels[module] || module}</div>
      <div style={{ flex: 1 }}/>
      <div style={{ position: "relative" }}>
        <Icon name="search" size={15} color="var(--text3)"/>
        <input placeholder="Search..." style={{ paddingLeft: 32, width: 200, background: "var(--surface2)", height: 32, fontSize: 13 }}/>
        <span style={{ position: "absolute", left: 10, top: 8 }}><Icon name="search" size={14} color="var(--text3)"/></span>
      </div>
      <button className="btn-ghost" style={{ padding: "6px 10px", position: "relative" }}>
        <Icon name="bell" size={16}/>
        <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, background: "var(--red)", borderRadius: "50%", border: "2px solid var(--surface)" }}/>
      </button>
      <button className="btn-ghost" style={{ padding: "6px 10px" }}><Icon name="settings" size={16}/></button>
      <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, var(--accent), var(--accent2))", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>AD</div>
    </div>
  );
};

// ============================================================
// MINI CHART (SVG sparkline)
// ============================================================
const Sparkline = ({ data, color = "var(--accent)", height = 40, width = 120 }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points={`0,${height} ${pts} ${width},${height}`} fill={`${color}18`} stroke="none"/>
    </svg>
  );
};

// ============================================================
// MODULES
// ============================================================

// --- DASHBOARD ---
const Dashboard = ({ data }) => {
  const stats = [
    { label: "Total Revenue", value: "$284,600", change: "+12.4%", positive: true, color: "#4f8ef7", data: [40,55,45,60,50,70,65,80,72,90,85,95], icon: "trending" },
    { label: "Active Deals", value: "47", change: "+3 this week", positive: true, color: "#7c6af7", data: [20,25,22,30,28,35,32,40,38,44,42,47], icon: "briefcase" },
    { label: "Open Invoices", value: "$68,750", change: "3 overdue", positive: false, color: "#f7c94f", data: [60,65,70,58,72,68,75,62,78,70,68,75], icon: "invoice" },
    { label: "New Contacts", value: "128", change: "+24.3%", positive: true, color: "#3ecf8e", data: [50,60,55,70,65,80,75,90,85,100,95,110], icon: "users" },
  ];

  const pipeline = [
    { stage: "New", count: 12, value: "$48K", color: "#4f8ef7" },
    { stage: "Qualified", count: 8, value: "$125K", color: "#7c6af7" },
    { stage: "Proposal", count: 5, value: "$89K", color: "#f7c94f" },
    { stage: "Negotiation", count: 3, value: "$67K", color: "#f7934f" },
    { stage: "Won", count: 18, value: "$342K", color: "#3ecf8e" },
  ];

  const recentActivity = [
    { icon: "check", color: "#3ecf8e", text: "Deal closed with TechVentures Inc", time: "2 min ago" },
    { icon: "invoice", color: "#f7c94f", text: "Invoice INV-2024-003 is overdue", time: "1 hr ago" },
    { icon: "users", color: "#4f8ef7", text: "New contact: Emma Whitfield added", time: "3 hr ago" },
    { icon: "email", color: "#7c6af7", text: "Email campaign sent to 1,240 contacts", time: "5 hr ago" },
    { icon: "sign", color: "#fbbf24", text: "Signature request sent to GreenPath", time: "1 day ago" },
  ];

  return (
    <div className="fade-in" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {stats.map((s, i) => (
          <div key={i} className="stat-card" style={{ "--c": s.color }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text)" }}>{s.value}</div>
              </div>
              <div style={{ background: `${s.color}18`, padding: 10, borderRadius: 10 }}>
                <Icon name={s.icon} size={18} color={s.color}/>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <span style={{ fontSize: 12, color: s.positive ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{s.change}</span>
              <Sparkline data={s.data} color={s.color}/>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* Pipeline */}
        <div className="card">
          <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>Sales Pipeline</h3>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>46 total deals</span>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            {pipeline.map((s, i) => (
              <div key={i} style={{ flex: 1, background: "var(--surface2)", borderRadius: 10, padding: "14px", borderTop: `3px solid ${s.color}` }}>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-display)", color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{s.stage}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginTop: 4 }}>{s.value}</div>
              </div>
            ))}
          </div>
          {/* bar */}
          <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 }}>
            {pipeline.map((s, i) => (
              <div key={i} style={{ flex: s.count, background: s.color, borderRadius: 2 }}/>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Recent Activity</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {recentActivity.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${a.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={a.icon} size={13} color={a.color}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { label: "Inventory Items", value: "6 products", sub: "1 low stock, 1 out", icon: "package", color: "#f7934f" },
          { label: "Active Projects", value: "4 projects", sub: "2 on track, 1 at risk", icon: "project", color: "#60a5fa" },
          { label: "Pending Signatures", value: "2 awaiting", sub: "1 expiring soon", icon: "sign", color: "#fbbf24" },
        ].map((item, i) => (
          <div key={i} className="card" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${item.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name={item.icon} size={20} color={item.color}/>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display)" }}>{item.value}</div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- CRM ---
const CRMModule = ({ data, update }) => {
  const stages = ["New", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
  const stageColor = { New: "#4f8ef7", Qualified: "#7c6af7", Proposal: "#f7c94f", Negotiation: "#f7934f", Won: "#3ecf8e", Lost: "#f76f6f" };
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", stage: "New", value: "" });

  const addContact = () => {
    if (!form.name || !form.email) return;
    update("contacts", c => [...c, { ...form, id: Date.now(), avatar: form.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(), value: Number(form.value), tags: [], lastContact: new Date().toISOString().split("T")[0] }]);
    setModal(false); setForm({ name: "", company: "", email: "", phone: "", stage: "New", value: "" });
  };

  const deleteContact = (id) => update("contacts", c => c.filter(x => x.id !== id));

  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Contacts & Pipeline</h2>
          <p style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>{data.contacts.length} contacts tracked</p>
        </div>
        <button className="btn-primary" onClick={() => setModal(true)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="plus" size={15}/> Add Contact
        </button>
      </div>

      {/* Kanban Pipeline */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
        {stages.map(stage => {
          const contacts = data.contacts.filter(c => c.stage === stage);
          return (
            <div key={stage} style={{ minWidth: 200, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: stageColor[stage], textTransform: "uppercase", letterSpacing: ".06em" }}>{stage}</span>
                <span style={{ background: `${stageColor[stage]}20`, color: stageColor[stage], padding: "1px 7px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{contacts.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {contacts.map(c => (
                  <div key={c.id} style={{ background: "var(--surface2)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${stageColor[stage]}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: stageColor[stage] }}>{c.avatar}</div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 10, color: "var(--text3)" }}>{c.company}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>${c.value.toLocaleString()}</div>
                    <button onClick={() => deleteContact(c.id)} style={{ background: "none", color: "var(--text3)", padding: "2px 0", fontSize: 11, marginTop: 4 }}>✕ Remove</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Contact Table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>All Contacts</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Contact</th><th>Company</th><th>Stage</th><th>Value</th><th>Last Contact</th><th>Actions</th></tr></thead>
            <tbody>
              {data.contacts.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--text2)" }}>{c.avatar}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text3)" }}>{c.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: "var(--text2)", fontSize: 13 }}>{c.company}</td>
                  <td><span className="badge" style={{ background: `${stageColor[c.stage]}20`, color: stageColor[c.stage] }}>{c.stage}</span></td>
                  <td style={{ fontWeight: 600, color: "var(--green)" }}>${c.value.toLocaleString()}</td>
                  <td style={{ color: "var(--text3)", fontSize: 13 }}>{c.lastContact}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn-ghost" style={{ padding: "4px 8px" }}><Icon name="edit" size={13}/></button>
                      <button className="btn-ghost" style={{ padding: "4px 8px" }} onClick={() => deleteContact(c.id)}><Icon name="trash" size={13} color="var(--red)"/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>New Contact</h3>
              <button className="btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setModal(false)}><Icon name="x" size={16}/></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["name", "Full Name"], ["company", "Company"], ["email", "Email Address"], ["phone", "Phone"], ["value", "Deal Value ($)"]].map(([k, l]) => (
                <div key={k} style={{ gridColumn: k === "email" ? "1 / -1" : undefined }}>
                  <label style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4, display: "block", fontWeight: 600 }}>{l}</label>
                  <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} placeholder={l}/>
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4, display: "block", fontWeight: 600 }}>Stage</label>
                <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>
                  {stages.slice(0, -1).map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={addContact}>Add Contact</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- INVOICING ---
const InvoicingModule = ({ data }) => {
  const statusColor = { Paid: "#3ecf8e", Pending: "#f7c94f", Overdue: "#f76f6f", Draft: "#8a90a8" };
  const total = data.invoices.reduce((s, i) => s + i.amount, 0);
  const paid = data.invoices.filter(i => i.status === "Paid").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Invoicing</h2>
        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="plus" size={15}/> New Invoice
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {[
          { label: "Total Billed", value: `$${total.toLocaleString()}`, color: "#4f8ef7" },
          { label: "Collected", value: `$${paid.toLocaleString()}`, color: "#3ecf8e" },
          { label: "Outstanding", value: `$${(total - paid).toLocaleString()}`, color: "#f7c94f" },
          { label: "Overdue", value: "$8,750", color: "#f76f6f" },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--font-display)", color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>All Invoices</h3>
          <button className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 12 }}>
            <Icon name="filter" size={13}/> Filter
          </button>
        </div>
        <table>
          <thead><tr><th>Invoice</th><th>Client</th><th>Amount</th><th>Status</th><th>Issue Date</th><th>Due Date</th><th>Actions</th></tr></thead>
          <tbody>
            {data.invoices.map(inv => (
              <tr key={inv.id}>
                <td><span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 13 }}>{inv.id}</span></td>
                <td style={{ fontSize: 13 }}>{inv.client}</td>
                <td style={{ fontWeight: 700, fontSize: 13 }}>${inv.amount.toLocaleString()}</td>
                <td><span className="badge" style={{ background: `${statusColor[inv.status]}20`, color: statusColor[inv.status] }}>{inv.status}</span></td>
                <td style={{ color: "var(--text2)", fontSize: 12 }}>{inv.date}</td>
                <td style={{ color: inv.status === "Overdue" ? "var(--red)" : "var(--text2)", fontSize: 12, fontWeight: inv.status === "Overdue" ? 600 : 400 }}>{inv.due}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}><Icon name="eye" size={13}/></button>
                    <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}><Icon name="download" size={13}/></button>
                    <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}><Icon name="send" size={13}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- INVENTORY ---
const InventoryModule = ({ data }) => {
  const statusColor = { Active: "#3ecf8e", "Low Stock": "#f7c94f", "Out of Stock": "#f76f6f" };
  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Inventory</h2>
        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="plus" size={15}/> Add Product
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { label: "Total Products", value: data.products.length, color: "#4f8ef7", icon: "package" },
          { label: "Low Stock Items", value: data.products.filter(p => p.status === "Low Stock").length, color: "#f7c94f", icon: "alert" },
          { label: "Out of Stock", value: data.products.filter(p => p.status === "Out of Stock").length, color: "#f76f6f", icon: "x" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ background: `${s.color}18`, padding: 12, borderRadius: 10 }}><Icon name={s.icon} size={22} color={s.color}/></div>
            <div><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)", color: s.color }}>{s.value}</div><div style={{ fontSize: 12, color: "var(--text3)" }}>{s.label}</div></div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Sales</th><th>Status</th></tr></thead>
          <tbody>
            {data.products.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</td>
                <td style={{ fontSize: 12, color: "var(--text3)" }}>{p.sku}</td>
                <td><span className="tag" style={{ background: "var(--surface3)", color: "var(--text2)" }}>{p.category}</span></td>
                <td style={{ fontWeight: 700 }}>${p.price.toLocaleString()}</td>
                <td style={{ color: p.stock < 50 ? "var(--red)" : "var(--text)", fontWeight: p.stock < 50 ? 700 : 400 }}>{p.stock}</td>
                <td style={{ color: "var(--text2)" }}>{p.sales}</td>
                <td><span className="badge" style={{ background: `${statusColor[p.status]}20`, color: statusColor[p.status] }}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- SALES ---
const SalesModule = ({ data }) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const values = [32, 45, 38, 60, 52, 78, 72, 90, 84, 96, 88, 105];
  const maxVal = Math.max(...values);
  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Sales Overview</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="card">
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, marginBottom: 20, fontSize: 14 }}>Revenue by Month ($K)</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
            {values.map((v, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", height: `${(v / maxVal) * 120}px`, background: `linear-gradient(180deg, var(--accent), var(--accent2))`, borderRadius: "4px 4px 0 0", opacity: .85 }}/>
                <span style={{ fontSize: 9, color: "var(--text3)" }}>{months[i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Top Performers</h3>
          {data.contacts.filter(c => c.stage === "Won" || c.stage === "Negotiation").concat(data.contacts.slice(0, 3)).slice(0, 5).map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < 4 ? "1px solid var(--border)" : "none" }}>
              <span style={{ fontSize: 12, color: "var(--text3)", width: 16 }}>#{i + 1}</span>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{c.avatar}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{c.company}</div>
              </div>
              <span style={{ fontWeight: 700, color: "var(--green)", fontSize: 13 }}>${c.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>Recent Deals</h3>
        </div>
        <table>
          <thead><tr><th>Contact</th><th>Company</th><th>Deal Value</th><th>Stage</th><th>Tags</th></tr></thead>
          <tbody>
            {data.contacts.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</td>
                <td style={{ color: "var(--text2)", fontSize: 13 }}>{c.company}</td>
                <td style={{ fontWeight: 700, color: "var(--green)" }}>${c.value.toLocaleString()}</td>
                <td><span className="badge" style={{ background: "#4f8ef720", color: "var(--accent)", fontSize: 11 }}>{c.stage}</span></td>
                <td>{c.tags.map((t, i) => <span key={i} className="tag" style={{ background: "var(--surface3)", color: "var(--text2)", marginRight: 4 }}>{t}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- EMAIL MARKETING ---
const EmailModule = ({ data }) => {
  const langs = ["EN", "ES", "FR", "DE", "PT", "ZH", "AR", "JA"];
  const [selectedLangs, setSelectedLangs] = useState(["EN"]);
  const toggle = l => setSelectedLangs(p => p.includes(l) ? p.filter(x => x !== l) : [...p, l]);
  const statusColor = { Sent: "#3ecf8e", Draft: "#8a90a8", Scheduled: "#f7c94f" };

  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Multilingual Email Marketing</h2>
        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="plus" size={15}/> New Campaign
        </button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)", marginBottom: 12 }}>Target Languages</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {langs.map(l => (
            <button key={l} onClick={() => toggle(l)} style={{ padding: "6px 14px", borderRadius: 99, border: `1px solid ${selectedLangs.includes(l) ? "var(--accent)" : "var(--border2)"}`, background: selectedLangs.includes(l) ? "#4f8ef720" : "transparent", color: selectedLangs.includes(l) ? "var(--accent)" : "var(--text3)", fontWeight: 600, fontSize: 12 }}>
              {l}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 10 }}>Selected: {selectedLangs.join(", ")} — AI will auto-translate campaigns</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { label: "Total Sent", value: "2,096", icon: "send", color: "#4f8ef7" },
          { label: "Avg Open Rate", value: "67.2%", icon: "eye", color: "#3ecf8e" },
          { label: "Avg Click Rate", value: "20.7%", icon: "activity", color: "#f7c94f" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ background: `${s.color}18`, padding: 12, borderRadius: 10 }}><Icon name={s.icon} size={22} color={s.color}/></div>
            <div><div style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--font-display)", color: s.color }}>{s.value}</div><div style={{ fontSize: 12, color: "var(--text3)" }}>{s.label}</div></div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>Campaigns</h3>
        </div>
        <table>
          <thead><tr><th>Subject</th><th>Status</th><th>Languages</th><th>Sent</th><th>Opened</th><th>Clicked</th><th>Date</th></tr></thead>
          <tbody>
            {data.emails.map(e => (
              <tr key={e.id}>
                <td style={{ fontWeight: 600, fontSize: 13 }}>{e.subject}</td>
                <td><span className="badge" style={{ background: `${statusColor[e.status]}20`, color: statusColor[e.status] }}>{e.status}</span></td>
                <td>{e.lang.split("/").map((l, i) => <span key={i} className="tag" style={{ background: "var(--surface3)", color: "var(--text2)", marginRight: 3, fontSize: 10 }}>{l}</span>)}</td>
                <td style={{ color: "var(--text2)" }}>{e.sent.toLocaleString()}</td>
                <td style={{ color: e.sent ? "#3ecf8e" : "var(--text3)" }}>{e.sent ? `${Math.round(e.opened / e.sent * 100)}%` : "—"}</td>
                <td style={{ color: e.sent ? "#f7c94f" : "var(--text3)" }}>{e.sent ? `${Math.round(e.clicked / e.sent * 100)}%` : "—"}</td>
                <td style={{ color: "var(--text3)", fontSize: 12 }}>{e.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- DOCUMENTS ---
const DocumentsModule = ({ data }) => {
  const typeColor = { pdf: "#f76f6f", docx: "#4f8ef7", xlsx: "#3ecf8e" };
  const typeIcon = { pdf: "documents", docx: "book", xlsx: "database" };
  const folders = [...new Set(data.documents.map(d => d.folder))];

  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Documents</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}><Icon name="upload" size={14}/> Upload</button>
          <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="plus" size={15}/> New Doc</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {folders.map(f => (
          <div key={f} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <Icon name="folder" size={15} color="var(--yellow)"/>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{f}</span>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>{data.documents.filter(d => d.folder === f).length}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
        {data.documents.map(doc => (
          <div key={doc.id} className="card" style={{ cursor: "pointer", transition: "border-color .15s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ background: `${typeColor[doc.type] || "var(--accent)"}18`, padding: 10, borderRadius: 8 }}>
                <Icon name={typeIcon[doc.type] || "documents"} size={20} color={typeColor[doc.type] || "var(--accent)"}/>
              </div>
              <span className="tag" style={{ background: `${typeColor[doc.type]}20`, color: typeColor[doc.type], fontSize: 10 }}>.{doc.type}</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, lineHeight: 1.3 }}>{doc.name}</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>{doc.size} · {doc.modified}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button className="btn-ghost" style={{ flex: 1, padding: "5px", fontSize: 11 }}><Icon name="eye" size={12}/></button>
              <button className="btn-ghost" style={{ flex: 1, padding: "5px", fontSize: 11 }}><Icon name="download" size={12}/></button>
              <button className="btn-ghost" style={{ flex: 1, padding: "5px", fontSize: 11 }}><Icon name="edit" size={12}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- DATABASE ---
const DatabaseModule = () => {
  const tables = [
    { name: "contacts", rows: 128, cols: ["id", "name", "email", "company", "stage", "value"], sample: [{ id: 1, name: "Sophia Reynolds", email: "sophia@techventures.com", company: "TechVentures", stage: "Qualified", value: 45000 }] },
    { name: "invoices", rows: 47, cols: ["id", "client", "amount", "status", "date"] },
    { name: "products", rows: 96, cols: ["id", "name", "sku", "price", "stock"] },
    { name: "projects", rows: 23, cols: ["id", "name", "client", "deadline", "progress"] },
    { name: "transactions", rows: 312, cols: ["id", "desc", "amount", "type", "date"] },
  ];
  const [activeTable, setActiveTable] = useState(tables[0]);

  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", gap: 20, height: "calc(100vh - 120px)" }}>
      <div style={{ width: 220, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, flexShrink: 0, height: "fit-content" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Tables</div>
        {tables.map(t => (
          <button key={t.name} onClick={() => setActiveTable(t)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 6, background: activeTable.name === t.name ? "var(--surface3)" : "transparent", color: activeTable.name === t.name ? "var(--accent)" : "var(--text2)", fontSize: 13, fontWeight: 500 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="database" size={13}/>{t.name}</span>
            <span style={{ fontSize: 10, color: "var(--text3)" }}>{t.rows}</span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input placeholder={`SELECT * FROM ${activeTable.name} WHERE ...`} style={{ flex: 1, background: "var(--surface)", fontFamily: "monospace", fontSize: 13 }}/>
          <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}><Icon name="zap" size={13}/> Run Query</button>
        </div>
        <div className="card" style={{ padding: 0, flex: 1 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center" }}>
            <Icon name="database" size={14} color="var(--accent)"/>
            <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{activeTable.name}</span>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>{activeTable.rows} records</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr>{activeTable.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {activeTable.cols.map((c, j) => (
                      <td key={j} style={{ fontFamily: j === 0 ? "monospace" : "inherit", fontSize: 12, color: j === 0 ? "var(--accent)" : "var(--text2)" }}>
                        {c === "id" ? i + 1 : c === "amount" || c === "value" || c === "price" ? `$${(Math.random() * 10000 + 1000).toFixed(0)}` : c === "status" || c === "stage" ? ["Active", "Pending", "New"][i % 3] : c === "date" ? "2024-01-" + (i + 10) : `${c}_value_${i + 1}`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- ACCOUNTING ---
const AccountingModule = ({ data }) => {
  const income = data.transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = data.transactions.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Accounting</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { label: "Total Income", value: `$${income.toLocaleString()}`, color: "#3ecf8e", icon: "trending" },
          { label: "Total Expenses", value: `$${expenses.toLocaleString()}`, color: "#f76f6f", icon: "activity" },
          { label: "Net Profit", value: `$${(income - expenses).toLocaleString()}`, color: "#4f8ef7", icon: "accounting" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ background: `${s.color}18`, padding: 12, borderRadius: 10 }}><Icon name={s.icon} size={22} color={s.color}/></div>
            <div><div style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--font-display)", color: s.color }}>{s.value}</div><div style={{ fontSize: 12, color: "var(--text3)" }}>{s.label}</div></div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>Transaction Ledger</h3>
        </div>
        <table>
          <thead><tr><th>Description</th><th>Category</th><th>Amount</th><th>Type</th><th>Date</th></tr></thead>
          <tbody>
            {data.transactions.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500, fontSize: 13 }}>{t.desc}</td>
                <td><span className="tag" style={{ background: "var(--surface3)", color: "var(--text2)" }}>{t.category}</span></td>
                <td style={{ fontWeight: 700, color: t.type === "income" ? "var(--green)" : "var(--red)" }}>{t.type === "income" ? "+" : ""}${Math.abs(t.amount).toLocaleString()}</td>
                <td><span className="badge" style={{ background: t.type === "income" ? "#3ecf8e20" : "#f76f6f20", color: t.type === "income" ? "#3ecf8e" : "#f76f6f" }}>{t.type}</span></td>
                <td style={{ color: "var(--text3)", fontSize: 12 }}>{t.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- PROJECT ---
const ProjectModule = ({ data }) => {
  const statusColor = { "On Track": "#3ecf8e", "At Risk": "#f7c94f", "Delayed": "#f76f6f" };
  const priorityColor = { Critical: "#f76f6f", High: "#f7934f", Medium: "#f7c94f", Low: "#3ecf8e" };

  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Projects</h2>
        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="plus" size={15}/> New Project</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {data.projects.map(p => (
          <div key={p.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--font-display)" }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{p.client}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <span className="badge" style={{ background: `${priorityColor[p.priority]}20`, color: priorityColor[p.priority], fontSize: 10 }}>{p.priority}</span>
                <span className="badge" style={{ background: `${statusColor[p.status]}20`, color: statusColor[p.status], fontSize: 10 }}>{p.status}</span>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text2)" }}>Progress</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[p.status] }}>{p.progress}%</span>
              </div>
              <div style={{ height: 6, background: "var(--surface3)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${p.progress}%`, height: "100%", background: statusColor[p.status], borderRadius: 3, transition: "width .5s" }}/>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex" }}>
                {p.team.map((m, i) => (
                  <div key={i} style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--surface3)", border: "2px solid var(--surface)", marginLeft: i > 0 ? -8 : 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--text2)" }}>{m}</div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text3)" }}>
                <Icon name="calendar" size={12}/> {p.deadline}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- SIGN ---
const SignModule = ({ data }) => {
  const statusColor = { Signed: "#3ecf8e", Awaiting: "#f7c94f", Expired: "#f76f6f" };
  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Sign — Document Signatures</h2>
        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="plus" size={15}/> Request Signature</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { label: "Total Sent", value: "3", color: "#4f8ef7", icon: "send" },
          { label: "Signed", value: "1", color: "#3ecf8e", icon: "check" },
          { label: "Awaiting", value: "2", color: "#f7c94f", icon: "calendar" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ background: `${s.color}18`, padding: 12, borderRadius: 10 }}><Icon name={s.icon} size={22} color={s.color}/></div>
            <div><div style={{ fontSize: 32, fontWeight: 800, fontFamily: "var(--font-display)", color: s.color }}>{s.value}</div><div style={{ fontSize: 12, color: "var(--text3)" }}>{s.label}</div></div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Document</th><th>Party</th><th>Sent</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead>
          <tbody>
            {data.pendingSignatures.map(s => (
              <tr key={s.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="documents" size={14} color="var(--accent)"/>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.doc}</span>
                  </div>
                </td>
                <td style={{ fontSize: 13, color: "var(--text2)" }}>{s.party}</td>
                <td style={{ fontSize: 12, color: "var(--text3)" }}>{s.sent}</td>
                <td><span className="badge" style={{ background: `${statusColor[s.status]}20`, color: statusColor[s.status] }}>{s.status}</span></td>
                <td style={{ fontSize: 12, color: "var(--text3)" }}>{s.expires}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>View</button>
                    {s.status === "Awaiting" && <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }}>Remind</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- KNOWLEDGE BASE ---
const KnowledgeModule = ({ data }) => {
  const catColor = { Guide: "#4f8ef7", "Best Practice": "#3ecf8e", Technical: "#7c6af7", Strategy: "#f7c94f" };
  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Knowledge Base</h2>
        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="plus" size={15}/> New Article</button>
      </div>
      <div style={{ position: "relative" }}>
        <input placeholder="Search knowledge base..." style={{ paddingLeft: 40, height: 42, fontSize: 14 }}/>
        <span style={{ position: "absolute", left: 14, top: 13 }}><Icon name="search" size={16} color="var(--text3)"/></span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {data.knowledgeBase.map(k => (
          <div key={k.id} className="card" style={{ cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <span className="badge" style={{ background: `${catColor[k.category]}20`, color: catColor[k.category] }}>{k.category}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text3)" }}>
                <Icon name="eye" size={11}/>{k.views.toLocaleString()} views
              </div>
            </div>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, lineHeight: 1.3 }}>{k.title}</h3>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>Updated {k.updated}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- eLEARNING ---
const ELearningModule = ({ data }) => {
  const levelColor = { Beginner: "#3ecf8e", Intermediate: "#f7c94f", Advanced: "#f76f6f" };
  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>eLearning Platform</h2>
        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="plus" size={15}/> New Course</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {data.courses.map(c => (
          <div key={c.id} className="card">
            <div style={{ height: 100, background: "linear-gradient(135deg, var(--surface3), var(--surface2))", borderRadius: 8, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="elearning" size={36} color="var(--accent)"/>
            </div>
            <span className="badge" style={{ background: `${levelColor[c.level]}20`, color: levelColor[c.level], marginBottom: 8 }}>{c.level}</span>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, lineHeight: 1.3 }}>{c.title}</h3>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text2)", marginBottom: 10 }}>
              <span>{c.lessons} lessons</span>
              <span>{c.enrolled} enrolled</span>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>Completion</span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{c.completion}%</span>
              </div>
              <div style={{ height: 4, background: "var(--surface3)", borderRadius: 2 }}>
                <div style={{ width: `${c.completion}%`, height: "100%", background: "var(--accent)", borderRadius: 2 }}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- SOCIAL MARKETING ---
const SocialModule = ({ data }) => {
  const platColor = { LinkedIn: "#0a66c2", Twitter: "#1d9bf0", Instagram: "#e1306c" };
  const statusColor = { Published: "#3ecf8e", Scheduled: "#f7c94f", Draft: "#8a90a8" };
  return (
    <div className="fade-in" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Social Marketing</h2>
        <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="plus" size={15}/> New Post</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[{ p: "LinkedIn", c: "#0a66c2", followers: "4,230", growth: "+12%" }, { p: "Twitter", c: "#1d9bf0", followers: "8,910", growth: "+7.3%" }, { p: "Instagram", c: "#e1306c", followers: "12,450", growth: "+22%" }].map((s, i) => (
          <div key={i} className="stat-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, background: `${s.c}20`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="social" size={16} color={s.c}/>
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: s.c }}>{s.p}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-display)" }}>{s.followers}</div>
            <div style={{ fontSize: 12, color: "#3ecf8e", marginTop: 2 }}>{s.growth} this month</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>Scheduled & Recent Posts</h3>
        </div>
        <table>
          <thead><tr><th>Platform</th><th>Content</th><th>Scheduled</th><th>Status</th><th>Reach</th></tr></thead>
          <tbody>
            {data.socialPosts.map(p => (
              <tr key={p.id}>
                <td><span style={{ fontWeight: 700, color: platColor[p.platform] }}>{p.platform}</span></td>
                <td style={{ fontSize: 13, maxWidth: 300 }}><span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content}</span></td>
                <td style={{ fontSize: 12, color: "var(--text3)" }}>{p.scheduled}</td>
                <td><span className="badge" style={{ background: `${statusColor[p.status]}20`, color: statusColor[p.status] }}>{p.status}</span></td>
                <td style={{ fontWeight: 600 }}>{p.reach > 0 ? p.reach.toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- WHATSAPP ---
const WhatsAppModule = ({ data }) => {
  const [activeChat, setActiveChat] = useState(data.whatsapp[1]);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState({
    1: [{ from: "them", text: "Thanks for the proposal!", time: "10:32 AM" }],
    2: [{ from: "them", text: "Hi, I received your message.", time: "9:00 AM" }, { from: "them", text: "When can we schedule a call?", time: "9:15 AM" }],
    3: [{ from: "them", text: "Invoice received, will process.", time: "Yesterday" }],
  });

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessages(m => ({ ...m, [activeChat.id]: [...(m[activeChat.id] || []), { from: "me", text: message, time: "Just now" }] }));
    setMessage("");
  };

  return (
    <div className="fade-in" style={{ padding: 24, height: "calc(100vh - 120px)", display: "flex", gap: 16 }}>
      {/* Chats list */}
      <div style={{ width: 280, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="whatsapp" size={16} color="#25d366"/>WhatsApp
          </div>
          <input placeholder="Search chats..." style={{ fontSize: 12, height: 32 }}/>
        </div>
        {data.whatsapp.map(c => (
          <button key={c.id} onClick={() => setActiveChat(c)} style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", background: activeChat.id === c.id ? "var(--surface2)" : "transparent", borderLeft: activeChat.id === c.id ? "3px solid #25d366" : "3px solid transparent", borderRadius: 0, color: "var(--text)", width: "100%", textAlign: "left" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#25d36620", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#25d366", flexShrink: 0 }}>
              {c.contact.split(" ").map(w => w[0]).join("")}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.contact}</span>
                <span style={{ fontSize: 10, color: "var(--text3)" }}>{c.time}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastMessage}</div>
            </div>
            {c.unread > 0 && <span style={{ background: "#25d366", color: "#fff", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{c.unread}</span>}
          </button>
        ))}
      </div>

      {/* Chat window */}
      <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#25d36620", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#25d366" }}>
            {activeChat.contact.split(" ").map(w => w[0]).join("")}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{activeChat.contact}</div>
            <div style={{ fontSize: 11, color: "#25d366" }}>Online</div>
          </div>
          <div style={{ flex: 1 }}/>
          <button className="btn-ghost" style={{ padding: "6px 10px" }}><Icon name="phone" size={15}/></button>
        </div>

        <div style={{ flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, background: `url("data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h30v30H0z' fill='%230a0c10'/%3E%3C/svg%3E")` }}>
          {(messages[activeChat.id] || []).map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.from === "me" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "70%", background: msg.from === "me" ? "#25d366" : "var(--surface2)", color: msg.from === "me" ? "#fff" : "var(--text)", padding: "8px 12px", borderRadius: msg.from === "me" ? "12px 12px 0 12px" : "12px 12px 12px 0", fontSize: 13, lineHeight: 1.5 }}>
                {msg.text}
                <div style={{ fontSize: 10, opacity: .7, marginTop: 2, textAlign: "right" }}>{msg.time}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
          <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Type a message..." style={{ flex: 1, height: 38 }}/>
          <button onClick={sendMessage} style={{ background: "#25d366", color: "#fff", padding: "8px 16px", borderRadius: 8, display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13 }}>
            <Icon name="send" size={14} color="#fff"/> Send
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [active, setActive] = useState("commissions");
  const [collapsed, setCollapsed] = useState(false);
  const { data, update } = useStore();

  // On mount: if a stored access token exists, validate it and restore the session.
  useEffect(() => {
    if (!tokens.access) { setAuthLoading(false); return; }
    api("/auth/me")
      .then(({ user }) => { setSession(shapeSession(user)); setActive("commissions"); })
      .catch(() => { apiLogout(); })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogin = (s) => { setSession(s); setActive("commissions"); };

  const handleLogout = () => { apiLogout(); setSession(null); };

  if (authLoading) return <><GlobalStyle/><div style={{ height: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div></>;
  if (!session) return <><GlobalStyle/><LoginScreen onLogin={handleLogin}/></>;

  // Filter modules for clients
  const allowedModules = session.role === "admin" ? null : session.modules;

  const allModuleMap = {
    commissions: <CommissionHub session={session}/>,
    dashboard: <Dashboard data={data}/>,
    crm: <CRMModule data={data} update={update}/>,
    sales: <SalesModule data={data}/>,
    invoicing: <InvoicingModule data={data}/>,
    inventory: <InventoryModule data={data}/>,
    email: <EmailModule data={data}/>,
    documents: <DocumentsModule data={data}/>,
    database: <DatabaseModule/>,
    accounting: <AccountingModule data={data}/>,
    project: <ProjectModule data={data}/>,
    sign: <SignModule data={data}/>,
    knowledge: <KnowledgeModule data={data}/>,
    elearning: <ELearningModule data={data}/>,
    social: <SocialModule data={data}/>,
    whatsapp: <WhatsAppModule data={data}/>,
    ...(session.role === "admin" ? { clients: <ClientsModule/> } : {}),
  };

  // Ensure active module is accessible
  const effectiveActive = (allowedModules && !allowedModules.includes(active) && active !== "clients")
    ? (allowedModules[0] || "dashboard")
    : active;

  return (
    <>
      <GlobalStyle/>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar
          active={effectiveActive}
          setActive={setActive}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          session={session}
          onLogout={handleLogout}
          allowedModules={allowedModules}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Topbar module={effectiveActive} session={session} onLogout={handleLogout}/>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {allModuleMap[effectiveActive] || <div style={{ padding: 24 }}>Module not found</div>}
          </div>
        </div>
      </div>
    </>
  );
}
