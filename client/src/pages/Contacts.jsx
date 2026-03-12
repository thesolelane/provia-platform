// client/src/pages/Contacts.jsx
import { useState, useEffect } from 'react';

const SOURCE_LABELS = {
  bulk_import: 'Invoice Import',
  manual: 'Manual Entry',
  job: 'From Job',
  email: 'Email',
  whatsapp: 'WhatsApp',
};

const TYPE_COLORS = {
  residential: { bg: '#e8f5e9', color: '#2e7d32' },
  commercial:  { bg: '#e3f2fd', color: '#1565c0' },
  unknown:     { bg: '#f5f5f5', color: '#757575' },
};

export default function Contacts({ token }) {
  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', phone:'', address:'', city:'', state:'MA', zip:'', customer_type:'residential', notes:'' });

  const headers = { 'x-auth-token': token };

  const load = async (q = '') => {
    setLoading(true);
    const res = await fetch(`/api/contacts?search=${encodeURIComponent(q)}&limit=200`, { headers });
    const data = await res.json();
    setContacts(data.contacts || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openContact = async (c) => {
    setSelected(c);
    setEditing(false);
    setForm({ name: c.name||'', email: c.email||'', phone: c.phone||'', address: c.address||'', city: c.city||'', state: c.state||'MA', zip: c.zip||'', customer_type: c.customer_type||'residential', notes: c.notes||'' });
    const res = await fetch(`/api/contacts/${c.id}`, { headers });
    const data = await res.json();
    setSelectedJobs(data.jobs || []);
  };

  const saveEdit = async () => {
    const url = selected ? `/api/contacts/${selected.id}` : '/api/contacts';
    const method = selected ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) {
      setSelected(null); setShowAdd(false); setEditing(false);
      load(search);
    } else {
      const d = await res.json();
      alert(d.error || 'Save failed');
    }
  };

  const deleteContact = async (id) => {
    if (!window.confirm('Delete this contact?')) return;
    await fetch(`/api/contacts/${id}`, { method: 'DELETE', headers });
    setSelected(null);
    load(search);
  };

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(window._contactSearch);
    window._contactSearch = setTimeout(() => load(q), 300);
  };

  const blankForm = () => setForm({ name:'', email:'', phone:'', address:'', city:'', state:'MA', zip:'', customer_type:'residential', notes:'' });

  if (loading && contacts.length === 0) return <div style={{ padding: 40, color: '#888' }}>Loading contacts...</div>;

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 'bold', color: '#1B3A6B', margin: 0 }}>Contacts</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>{total} contact{total !== 1 ? 's' : ''} — auto-populated from invoices and jobs</p>
        </div>
        <button
          onClick={() => { blankForm(); setSelected(null); setShowAdd(true); setEditing(true); }}
          style={{ background: '#1B3A6B', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
        >
          + Add Contact
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={handleSearch}
          placeholder="Search by name, email, phone, or address..."
          style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        {contacts.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>No contacts yet</div>
            <div style={{ fontSize: 13 }}>Contacts are automatically added when you import invoices or create jobs with customer info.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1B3A6B' }}>
                {['Name', 'Phone', 'Email', 'City / Address', 'Type', 'Source', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', color: 'white', textAlign: 'left', fontSize: 11, fontWeight: 'bold' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => {
                const tc = TYPE_COLORS[c.customer_type] || TYPE_COLORS.unknown;
                return (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer' }}
                    onClick={() => openContact(c)}
                  >
                    <td style={{ padding: '11px 14px', fontWeight: '500', fontSize: 13 }}>{c.name || <span style={{ color: '#bbb' }}>—</span>}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#555' }}>{c.phone || <span style={{ color: '#bbb' }}>—</span>}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#555' }}>{c.email || <span style={{ color: '#bbb' }}>—</span>}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#555' }}>{[c.city, c.address].filter(Boolean).join(' · ') || <span style={{ color: '#bbb' }}>—</span>}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ background: tc.bg, color: tc.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' }}>
                        {c.customer_type || 'unknown'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 11, color: '#888' }}>{SOURCE_LABELS[c.source] || c.source}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ color: '#1B3A6B', fontSize: 12, fontWeight: 'bold' }}>View →</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Contact detail / edit modal */}
      {(selected || showAdd) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#1B3A6B', margin: 0, fontSize: 18 }}>
                {showAdd && !selected ? 'New Contact' : editing ? 'Edit Contact' : selected?.name || 'Contact'}
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
                {selected && !editing && (
                  <button onClick={() => setEditing(true)} style={{ background: '#f0f4ff', border: 'none', color: '#1B3A6B', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                    Edit
                  </button>
                )}
                {selected && !editing && (
                  <button onClick={() => deleteContact(selected.id)} style={{ background: '#fff0f0', border: 'none', color: '#C62828', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                    Delete
                  </button>
                )}
                <button onClick={() => { setSelected(null); setShowAdd(false); setEditing(false); }} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
              </div>
            </div>

            {editing ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  {[
                    { label: 'Full Name', key: 'name', placeholder: 'John Smith' },
                    { label: 'Phone', key: 'phone', placeholder: '+1 555 000 0000' },
                    { label: 'Email', key: 'email', placeholder: 'john@email.com' },
                    { label: 'Street Address', key: 'address', placeholder: '123 Main St' },
                    { label: 'City', key: 'city', placeholder: 'Fitchburg' },
                    { label: 'State', key: 'state', placeholder: 'MA' },
                    { label: 'ZIP', key: 'zip', placeholder: '01420' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>{f.label}</label>
                      <input
                        value={form[f.key]}
                        onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Customer Type</label>
                    <select value={form.customer_type} onChange={e => setForm({ ...form, customer_type: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }}>
                      <option value="residential">Residential</option>
                      <option value="commercial">Commercial</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Notes</label>
                  <textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setEditing(false); if (showAdd) { setShowAdd(false); } }} style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', background: 'white', fontSize: 13 }}>Cancel</button>
                  <button onClick={saveEdit} style={{ flex: 2, padding: 10, background: '#1B3A6B', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>Save Contact</button>
                </div>
              </div>
            ) : (
              <div>
                {/* Contact info display */}
                <div style={{ background: '#f8f9ff', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                  {[
                    { label: 'Phone', value: selected?.phone },
                    { label: 'Email', value: selected?.email },
                    { label: 'Address', value: [selected?.address, selected?.city, selected?.state, selected?.zip].filter(Boolean).join(', ') },
                    { label: 'Type', value: selected?.customer_type },
                    { label: 'Source', value: SOURCE_LABELS[selected?.source] || selected?.source },
                    { label: 'Added', value: selected?.created_at ? new Date(selected.created_at).toLocaleDateString() : null },
                  ].map(row => row.value ? (
                    <div key={row.label} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: '#888', width: 70, flexShrink: 0 }}>{row.label}</span>
                      <span style={{ fontSize: 13, fontWeight: '500', textTransform: row.label === 'Type' ? 'capitalize' : 'none' }}>{row.value}</span>
                    </div>
                  ) : null)}
                  {selected?.notes && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Notes</div>
                      <div style={{ fontSize: 13 }}>{selected.notes}</div>
                    </div>
                  )}
                </div>

                {/* Job history */}
                <h3 style={{ fontSize: 14, color: '#1B3A6B', marginBottom: 10 }}>Job History ({selectedJobs.length})</h3>
                {selectedJobs.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#888', textAlign: 'center', padding: 16 }}>No jobs linked to this contact yet.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <tbody>
                      {selectedJobs.map(j => (
                        <tr key={j.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '8px 0', color: '#555' }}>{j.project_address || '—'}</td>
                          <td style={{ padding: '8px 4px', fontWeight: 'bold', color: '#1B3A6B' }}>{j.total_value ? `$${j.total_value.toLocaleString()}` : '—'}</td>
                          <td style={{ padding: '8px 4px' }}>
                            <span style={{ background: '#f0f4ff', color: '#1B3A6B', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 'bold' }}>{j.status}</span>
                          </td>
                          <td style={{ padding: '8px 0', color: '#aaa' }}>{new Date(j.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
