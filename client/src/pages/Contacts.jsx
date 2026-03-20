// client/src/pages/Contacts.jsx
import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../utils/toast';
import { showConfirm } from '../utils/confirm';

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
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', phone:'', address:'', city:'', state:'MA', zip:'', customer_type:'residential', notes:'' });
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [contactPayments, setContactPayments] = useState({ received: [], made: [] });

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
    setSelectedDocs([]);
    setPaymentSummary(null);
    setContactPayments({ received: [], made: [] });
    setForm({ name: c.name||'', email: c.email||'', phone: c.phone||'', address: c.address||'', city: c.city||'', state: c.state||'MA', zip: c.zip||'', customer_type: c.customer_type||'residential', notes: c.notes||'' });
    const [contactRes, payRes] = await Promise.all([
      fetch(`/api/contacts/${c.id}`, { headers }),
      fetch(`/api/payments/contact/${c.id}`, { headers }),
    ]);
    const data = await contactRes.json();
    setSelectedJobs(data.jobs || []);
    setSelectedDocs(data.documents || []);
    setPaymentSummary(data.paymentSummary || null);
    const payData = await payRes.json();
    setContactPayments({ received: payData.received || [], made: payData.made || [] });
  };

  const deleteDoc = async (docId) => {
    if (!await showConfirm('Remove this document from the contact?')) return;
    await fetch(`/api/contacts/${selected.id}/documents/${docId}`, { method: 'DELETE', headers });
    setSelectedDocs(prev => prev.filter(d => d.id !== docId));
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
      showToast(d.error || 'Save failed', 'error');
    }
  };

  const deleteContact = async (id) => {
    if (!await showConfirm('Delete this contact? This cannot be undone.')) return;
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
                {['Client ID', 'Name', 'Phone', 'Email', 'City / Address', 'Type', 'Source', ''].map(h => (
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
                    <td style={{ padding: '11px 14px', fontSize: 11, color: '#1B3A6B', fontWeight: '600', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {c.customer_number || <span style={{ color: '#bbb' }}>—</span>}
                    </td>
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
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 700, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
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
                </div>

                {/* Owner Mailing Address section */}
                <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1B3A6B', textTransform: 'uppercase', letterSpacing: 1 }}>Owner Mailing Address</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!form.address && !form.city && !form.zip}
                        onChange={e => {
                          if (e.target.checked) setForm({ ...form, address: '', city: '', state: 'MA', zip: '' });
                        }}
                      />
                      Same as project address
                    </label>
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                    Owner's home or billing address — appears on the contract. Leave blank if the owner lives at the job site.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Street Address', key: 'address', placeholder: '123 Main St', span: 2 },
                    { label: 'City', key: 'city', placeholder: 'Fitchburg' },
                    { label: 'State', key: 'state', placeholder: 'MA' },
                    { label: 'ZIP', key: 'zip', placeholder: '01420' },
                  ].map(f => (
                    <div key={f.key} style={f.span ? { gridColumn: `span ${f.span}` } : {}}>
                      <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>{f.label}</label>
                      <input
                        value={form[f.key]}
                        onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
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
                  {selected?.customer_number && (
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #e0e8ff' }}>
                      <span style={{ fontSize: 11, color: '#888', width: 70, flexShrink: 0 }}>Client ID</span>
                      <span style={{ fontSize: 13, fontWeight: '700', fontFamily: 'monospace', color: '#1B3A6B', letterSpacing: 1 }}>{selected.customer_number}</span>
                    </div>
                  )}
                  {[
                    { label: 'Phone', value: selected?.phone },
                    { label: 'Email', value: selected?.email },
                    { label: 'Mailing', value: [selected?.address, selected?.city, selected?.state, selected?.zip].filter(Boolean).join(', ') || '(same as project)' },
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

                {/* Documents */}
                {selectedDocs.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 14, color: '#1B3A6B', marginBottom: 10 }}>Documents ({selectedDocs.length})</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selectedDocs.map(doc => {
                        const icon = doc.mime_type === 'application/pdf' ? '📄' : doc.mime_type?.startsWith('image/') ? '🖼️' : '📎';
                        const url = `/contact-docs/${selected.id}/${doc.filename}`;
                        return (
                          <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8f9ff', borderRadius: 7, padding: '8px 12px' }}>
                            <span style={{ fontSize: 18 }}>{icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: '600', color: '#1B3A6B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.original_name || doc.filename}</div>
                              <div style={{ fontSize: 10, color: '#aaa' }}>{new Date(doc.created_at).toLocaleDateString()} · {doc.source === 'bulk_import' ? 'Invoice Import' : doc.source}</div>
                            </div>
                            <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#1B3A6B', fontWeight: 'bold', textDecoration: 'none', background: '#e8eeff', padding: '4px 10px', borderRadius: 5 }}>
                              View
                            </a>
                            <button onClick={() => deleteDoc(doc.id)} style={{ fontSize: 11, color: '#C62828', background: '#fff0f0', border: 'none', padding: '4px 8px', borderRadius: 5, cursor: 'pointer' }}>
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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

                {/* Client Payment Ledger */}
                <div style={{ marginTop: 24 }}>
                  <h3 style={{ fontSize: 14, color: '#1B3A6B', marginBottom: 10 }}>Client Payment Ledger</h3>
                  {paymentSummary && (paymentSummary.total_received > 0 || paymentSummary.total_paid_out > 0) ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
                      <div style={{ borderRadius: 6, padding: '10px 12px', background: '#2E7D3211', border: '1px solid #2E7D3233' }}>
                        <div style={{ fontSize: 10, color: '#888' }}>Received</div>
                        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#2E7D32' }}>${paymentSummary.total_received.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div style={{ borderRadius: 6, padding: '10px 12px', background: '#C6282811', border: '1px solid #C6282833' }}>
                        <div style={{ fontSize: 10, color: '#888' }}>Paid Out</div>
                        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#C62828' }}>${paymentSummary.total_paid_out.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div style={{ borderRadius: 6, padding: '10px 12px', background: paymentSummary.balance >= 0 ? '#1B3A6B11' : '#C6282811', border: `1px solid ${paymentSummary.balance >= 0 ? '#1B3A6B33' : '#C6282833'}` }}>
                        <div style={{ fontSize: 10, color: '#888' }}>Balance</div>
                        <div style={{ fontSize: 16, fontWeight: 'bold', color: paymentSummary.balance >= 0 ? '#1B3A6B' : '#C62828' }}>${paymentSummary.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                  ) : null}

                  {contactPayments.received.length === 0 && contactPayments.made.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#888', textAlign: 'center', padding: 16 }}>No payment records for this client yet.</p>
                  ) : (
                    <div>
                      {contactPayments.received.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 'bold', color: '#2E7D32', marginBottom: 6 }}>Checks Received ({contactPayments.received.length})</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                              <tr style={{ background: '#f0fdf4' }}>
                                {['Date', 'Time', 'Job', 'Check #', 'Type', 'Cr/Dr', 'Amount', 'By'].map(h => (
                                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, color: '#888', fontWeight: 'bold' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {contactPayments.received.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '6px 8px' }}>{p.date_received ? new Date(p.date_received + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                                  <td style={{ padding: '6px 8px', color: '#888' }}>{p.time_received || '—'}</td>
                                  <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.project_address || p.job_customer || '—'}</td>
                                  <td style={{ padding: '6px 8px', color: '#888' }}>{p.check_number || '—'}</td>
                                  <td style={{ padding: '6px 8px' }}><span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: '#3B82F622', color: '#3B82F6', fontWeight: 'bold' }}>{p.payment_type}</span></td>
                                  <td style={{ padding: '6px 8px' }}><span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: p.credit_debit === 'credit' ? '#2E7D3222' : '#C6282822', color: p.credit_debit === 'credit' ? '#2E7D32' : '#C62828', fontWeight: 'bold' }}>{p.credit_debit === 'credit' ? 'CR' : 'DR'}</span></td>
                                  <td style={{ padding: '6px 8px', fontWeight: 'bold', color: p.credit_debit === 'debit' ? '#C62828' : '#2E7D32' }}>${Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                  <td style={{ padding: '6px 8px', color: '#888', fontSize: 10 }}>{p.recorded_by || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {contactPayments.made.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 'bold', color: '#C62828', marginBottom: 6 }}>Checks Paid Out ({contactPayments.made.length})</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                              <tr style={{ background: '#fff5f5' }}>
                                {['Date', 'Time', 'Job', 'To', 'Check #', 'Cat.', 'Cr/Dr', 'Amount', 'By'].map(h => (
                                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, color: '#888', fontWeight: 'bold' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {contactPayments.made.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '6px 8px' }}>{p.date_paid ? new Date(p.date_paid + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                                  <td style={{ padding: '6px 8px', color: '#888' }}>{p.time_paid || '—'}</td>
                                  <td style={{ padding: '6px 8px', fontSize: 10 }}>{p.project_address || p.job_customer || '—'}</td>
                                  <td style={{ padding: '6px 8px' }}>{p.payee_name}</td>
                                  <td style={{ padding: '6px 8px', color: '#888' }}>{p.check_number || '—'}</td>
                                  <td style={{ padding: '6px 8px' }}><span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: '#7C3AED22', color: '#7C3AED', fontWeight: 'bold' }}>{p.category}</span></td>
                                  <td style={{ padding: '6px 8px' }}><span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: p.credit_debit === 'credit' ? '#2E7D3222' : '#C6282822', color: p.credit_debit === 'credit' ? '#2E7D32' : '#C62828', fontWeight: 'bold' }}>{p.credit_debit === 'credit' ? 'CR' : 'DR'}</span></td>
                                  <td style={{ padding: '6px 8px', fontWeight: 'bold', color: p.credit_debit === 'credit' ? '#2E7D32' : '#C62828' }}>${Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                  <td style={{ padding: '6px 8px', color: '#888', fontSize: 10 }}>{p.recorded_by || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
