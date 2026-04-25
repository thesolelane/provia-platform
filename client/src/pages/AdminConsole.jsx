import { useState, useEffect, useCallback } from 'react';

const BLUE  = '#2F5A7E';
const DARK  = '#163853';
const ORANGE = '#FF9500';

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: 'white', borderRadius: 10, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: BLUE }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ServiceBadge({ label, ok }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: ok ? '#f0fdf4' : '#fff5f5', borderRadius: 8, border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}` }}>
      <span style={{ fontSize: 14 }}>{ok ? '🟢' : '🔴'}</span>
      <span style={{ fontSize: 12, color: ok ? '#166534' : '#991b1b', fontWeight: 600 }}>{label}</span>
    </div>
  );
}

const TABS = ['Dashboard', 'Tenants', 'Users', 'Stats'];

export default function AdminConsole({ token }) {
  const [tab, setTab] = useState('Dashboard');
  const [health, setHealth] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tenant form
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [tenantForm, setTenantForm] = useState({ name: '', license: '', hic_license: '', address: '', city: '', state: '', zip: '', phone: '', email: '', website: '' });

  // User form
  const [showUserForm, setShowUserForm] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'admin', tenant_id: '' });

  const headers = { 'Content-Type': 'application/json', 'x-auth-token': token };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, t, u, s] = await Promise.all([
        fetch('/api/admin/health', { headers }).then(r => r.json()),
        fetch('/api/admin/tenants', { headers }).then(r => r.json()),
        fetch('/api/admin/users', { headers }).then(r => r.json()),
        fetch('/api/admin/stats', { headers }).then(r => r.json()),
      ]);
      setHealth(h);
      setTenants(t.tenants || []);
      setUsers(u.users || []);
      setStats(s);
    } catch (e) {
      setError('Failed to load admin data');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const createTenant = async () => {
    const res = await fetch('/api/admin/tenants', { method: 'POST', headers, body: JSON.stringify(tenantForm) });
    if (res.ok) { setShowTenantForm(false); setTenantForm({ name: '', license: '', hic_license: '', address: '', city: '', state: '', zip: '', phone: '', email: '', website: '' }); load(); }
  };

  const deleteTenant = async (id) => {
    if (!confirm('Delete this tenant? This cannot be undone.')) return;
    await fetch(`/api/admin/tenants/${id}`, { method: 'DELETE', headers });
    load();
  };

  const toggleProvia = async (id, current) => {
    await fetch(`/api/admin/tenants/${id}`, { method: 'PATCH', headers, body: JSON.stringify({ provia_plus: !current }) });
    load();
  };

  const createUser = async () => {
    const res = await fetch('/api/admin/users', { method: 'POST', headers, body: JSON.stringify(userForm) });
    if (res.ok) { setShowUserForm(false); setUserForm({ name: '', email: '', password: '', role: 'admin', tenant_id: '' }); load(); }
  };

  const impersonate = async (tenantId) => {
    const res = await fetch(`/api/admin/impersonate/${tenantId}`, { method: 'POST', headers });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('provia_impersonate', JSON.stringify(data));
      alert(`Impersonating ${data.name} — copy this token to log in as them:\n\n${data.token}`);
    }
  };

  if (loading) return <div style={{ padding: 40, color: BLUE, textAlign: 'center' }}>Loading admin console…</div>;
  if (error)   return <div style={{ padding: 40, color: '#c00', textAlign: 'center' }}>{error}</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ background: DARK, color: 'white', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, letterSpacing: '0.08em' }}>PROVIA</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>Admin Console</div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>Uptime: {health ? Math.floor(health.uptime / 3600) + 'h ' + Math.floor((health.uptime % 3600) / 60) + 'm' : '—'}</div>
      </div>

      {/* Tabs */}
      <div style={{ background: BLUE, display: 'flex', gap: 4, padding: '0 32px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', color: tab === t ? ORANGE : 'rgba(255,255,255,0.65)', fontWeight: tab === t ? 700 : 400, fontSize: 13, padding: '12px 16px', cursor: 'pointer', borderBottom: tab === t ? `2px solid ${ORANGE}` : '2px solid transparent' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '32px' }}>

        {/* ── DASHBOARD ── */}
        {tab === 'Dashboard' && health && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
              <StatCard label="Jobs"       value={health.stats.jobs}     />
              <StatCard label="Users"      value={health.stats.users}    />
              <StatCard label="Leads"      value={health.stats.leads}    />
              <StatCard label="Tasks"      value={health.stats.tasks}    />
              <StatCard label="Signed"     value={health.stats.signing}  />
              <StatCard label="Pending Sig" value={health.stats.pending} />
              <StatCard label="Invoices"   value={health.stats.invoices} />
              <StatCard label="Contacts"   value={health.stats.contacts} />
              <StatCard label="Tenants"    value={tenants.length}        />
            </div>

            <div style={{ background: 'white', borderRadius: 10, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: BLUE, marginBottom: 16 }}>Platform Services</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {health.services && Object.values(health.services).map(s => (
                  <ServiceBadge key={s.label} label={s.label} ok={s.ok} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── TENANTS ── */}
        {tab === 'Tenants' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: BLUE }}>Tenants ({tenants.length})</div>
              <button onClick={() => setShowTenantForm(true)} style={{ background: BLUE, color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>+ Add Tenant</button>
            </div>

            {showTenantForm && (
              <div style={{ background: 'white', borderRadius: 10, padding: 24, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: BLUE, marginBottom: 16 }}>New Tenant</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[['Company Name', 'name'], ['License #', 'license'], ['HIC License', 'hic_license'], ['Phone', 'phone'], ['Email', 'email'], ['Website', 'website'], ['Address', 'address'], ['City', 'city'], ['State', 'state'], ['ZIP', 'zip']].map(([label, key]) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
                      <input value={tenantForm[key]} onChange={e => setTenantForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={createTenant} style={{ background: BLUE, color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Create Tenant</button>
                  <button onClick={() => setShowTenantForm(false)} style={{ background: '#eee', color: '#555', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tenants.length === 0 && <div style={{ color: '#888', fontSize: 14, padding: 20 }}>No tenants yet. Add one above.</div>}
              {tenants.map(t => (
                <div key={t.id} style={{ background: 'white', borderRadius: 10, padding: '18px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: BLUE }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{t.email} · {t.phone}</div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{t.city}{t.state ? ', ' + t.state : ''} · {t.license}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, color: BLUE }}>{t.user_count}</div>
                    <div>users</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, color: BLUE }}>{t.job_count}</div>
                    <div>jobs</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => toggleProvia(t.id, t.provia_plus)} style={{ background: t.provia_plus ? ORANGE : '#eee', color: t.provia_plus ? 'white' : '#555', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                      {t.provia_plus ? 'Provia+ ON' : 'Provia+'}
                    </button>
                    <button onClick={() => impersonate(t.id)} style={{ background: '#e8f0fe', color: BLUE, border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                      Impersonate
                    </button>
                    <button onClick={() => deleteTenant(t.id)} style={{ background: '#fff5f5', color: '#c00', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── USERS ── */}
        {tab === 'Users' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: BLUE }}>Users ({users.length})</div>
              <button onClick={() => setShowUserForm(true)} style={{ background: BLUE, color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>+ Add User</button>
            </div>

            {showUserForm && (
              <div style={{ background: 'white', borderRadius: 10, padding: 24, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: BLUE, marginBottom: 16 }}>New User</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[['Name', 'name', 'text'], ['Email', 'email', 'email'], ['Password', 'password', 'password']].map(([label, key, type]) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
                      <input type={type} value={userForm[key]} onChange={e => setUserForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Role</div>
                    <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                      <option value="admin">Admin</option>
                      <option value="pm">PM</option>
                      <option value="staff">Staff</option>
                      <option value="system_admin">System Admin</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Tenant</div>
                    <select value={userForm.tenant_id} onChange={e => setUserForm(f => ({ ...f, tenant_id: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                      <option value="">No tenant (system)</option>
                      {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button onClick={createUser} style={{ background: BLUE, color: 'white', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Create User</button>
                  <button onClick={() => setShowUserForm(false)} style={{ background: '#eee', color: '#555', border: 'none', borderRadius: 6, padding: '10px 24px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8f9ff', borderBottom: '1px solid #eee' }}>
                    {['Name', 'Email', 'Role', 'Tenant', 'Joined'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#666', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: BLUE }}>{u.name}</td>
                      <td style={{ padding: '12px 16px', color: '#555' }}>{u.email}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: u.role === 'system_admin' ? DARK : u.role === 'admin' ? BLUE : '#eee', color: u.role === 'system_admin' || u.role === 'admin' ? 'white' : '#555', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#888', fontSize: 12 }}>{u.tenant_id ? tenants.find(t => t.id === u.tenant_id)?.name || u.tenant_id.slice(0, 8) + '…' : '— system —'}</td>
                      <td style={{ padding: '12px 16px', color: '#aaa', fontSize: 11 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── STATS ── */}
        {tab === 'Stats' && stats && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div style={{ background: 'white', borderRadius: 10, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: BLUE, marginBottom: 16 }}>Jobs by Status</div>
                {stats.jobsByStatus?.map(s => (
                  <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                    <span style={{ color: '#555' }}>{s.status}</span>
                    <span style={{ fontWeight: 700, color: BLUE }}>{s.count}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: 'white', borderRadius: 10, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: BLUE, marginBottom: 16 }}>AI Token Usage</div>
                {stats.tokenUsage?.map(t => (
                  <div key={t.service} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                    <span style={{ color: '#555' }}>{t.service}</span>
                    <span style={{ fontWeight: 700, color: BLUE }}>{((t.input || 0) + (t.output || 0)).toLocaleString()} tokens</span>
                  </div>
                ))}
                {(!stats.tokenUsage || stats.tokenUsage.length === 0) && <div style={{ color: '#aaa', fontSize: 13 }}>No token usage recorded yet</div>}
              </div>

              <div style={{ background: 'white', borderRadius: 10, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', gridColumn: '1 / -1' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: BLUE, marginBottom: 16 }}>Recent Jobs</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      {['Customer', 'Address', 'Status', 'Value', 'Date'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#888', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentJobs?.map(j => (
                      <tr key={j.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: BLUE }}>{j.customer_name || '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#555' }}>{j.project_address || '—'}</td>
                        <td style={{ padding: '10px 12px' }}><span style={{ background: '#f0f4ff', color: BLUE, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{j.status}</span></td>
                        <td style={{ padding: '10px 12px', color: '#555' }}>{j.total_value ? '$' + Number(j.total_value).toLocaleString() : '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#aaa', fontSize: 11 }}>{new Date(j.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
