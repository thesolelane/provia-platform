// client/src/pages/Vendors.jsx
import { useState, useEffect } from 'react';
import { showToast } from '../utils/toast';
import { showConfirm } from '../utils/confirm';

const TYPE_COLORS = {
  subcontractor: { bg: '#e8f5e9', color: '#2e7d32' },
  vendor:        { bg: '#e3f2fd', color: '#1565c0' },
};

const BLANK_FORM = {
  company_name: '',
  type: 'subcontractor',
  trade: '',
  phone: '',
  website: '',
  address: '',
  city: '',
  state: 'MA',
  zip: '',
  license_number: '',
  notes: '',
};

export default function Vendors({ token }) {
  const [vendors, setVendors]     = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(BLANK_FORM);
  const [saving, setSaving]       = useState(false);

  const headers = { 'x-auth-token': token };

  const load = async (q = '', tf = typeFilter) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('search', q);
    if (tf !== 'all') params.set('type', tf);
    const res = await fetch(`/api/vendors?${params}`, { headers });
    const data = await res.json();
    setVendors(data.vendors || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  useEffect(() => { load('', 'all'); }, []);

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(window._vendorSearch);
    window._vendorSearch = setTimeout(() => load(q, typeFilter), 300);
  };

  const handleTypeFilter = (tf) => {
    setTypeFilter(tf);
    load(search, tf);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(BLANK_FORM);
    setShowModal(true);
  };

  const openEdit = (v) => {
    setEditing(v);
    setForm({
      company_name:   v.company_name   || '',
      type:           v.type           || 'subcontractor',
      trade:          v.trade          || '',
      phone:          v.phone          || '',
      website:        v.website        || '',
      address:        v.address        || '',
      city:           v.city           || '',
      state:          v.state          || 'MA',
      zip:            v.zip            || '',
      license_number: v.license_number || '',
      notes:          v.notes          || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
  };

  const validateForm = () => {
    if (!form.company_name.trim()) return 'Company name is required.';
    if (form.zip && !/^\d{5}(-\d{4})?$/.test(form.zip.trim())) return 'ZIP code must be 5 digits.';
    if (form.phone && !/^[\d\s\(\)\-\+\.]{7,20}$/.test(form.phone.trim())) return 'Phone number format is invalid.';
    return null;
  };

  const save = async () => {
    const err = validateForm();
    if (err) { showToast(err, 'error'); return; }
    setSaving(true);
    const url    = editing ? `/api/vendors/${editing.id}` : '/api/vendors';
    const method = editing ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      closeModal();
      load(search, typeFilter);
      showToast(editing ? 'Entry updated.' : 'Entry added.', 'success');
    } else {
      const d = await res.json();
      showToast(d.error || 'Save failed', 'error');
    }
  };

  const deleteVendor = async (v) => {
    if (!await showConfirm(`Delete "${v.company_name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/vendors/${v.id}`, { method: 'DELETE', headers });
    if (res.ok) {
      load(search, typeFilter);
      showToast('Entry deleted.', 'success');
    } else {
      showToast('Delete failed', 'error');
    }
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });

  const inputStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid #ddd',
    borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 11, color: '#555', display: 'block', marginBottom: 3 };

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 'bold', color: '#1B3A6B', margin: 0 }}>Subs &amp; Vendors</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            {total} entr{total !== 1 ? 'ies' : 'y'} — companies Preferred Builders works with
          </p>
        </div>
        <button
          onClick={openAdd}
          style={{ background: '#1B3A6B', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
        >
          + Add Entry
        </button>
      </div>

      {/* Search + type filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={handleSearch}
          placeholder="Search by name, trade, phone, city, or license..."
          style={{ flex: 1, minWidth: 220, padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {[['all', 'All'], ['subcontractor', 'Subs'], ['vendor', 'Vendors']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => handleTypeFilter(val)}
              style={{
                padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
                background: typeFilter === val ? '#1B3A6B' : '#f0f0f0',
                color: typeFilter === val ? 'white' : '#555',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        {loading && vendors.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Loading...</div>
        ) : vendors.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>No subs or vendors yet</div>
            <div style={{ fontSize: 13 }}>Add the companies you work with to keep their contact info handy.</div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="pb-desktop-only" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#1B3A6B' }}>
                  {['Company', 'Type', 'Trade', 'Phone', 'Website', 'Address', 'License', ''].map(h => (
                    <th key={h} style={{ padding: '11px 14px', color: 'white', textAlign: 'left', fontSize: 11, fontWeight: 'bold' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendors.map((v, i) => {
                  const tc = TYPE_COLORS[v.type] || TYPE_COLORS.subcontractor;
                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '11px 14px', fontWeight: '600', fontSize: 13, color: '#1B3A6B' }}>{v.company_name}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ background: tc.bg, color: tc.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' }}>
                          {v.type === 'subcontractor' ? 'Sub' : 'Vendor'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#555' }}>{v.trade || <span style={{ color: '#bbb' }}>—</span>}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#555' }}>
                        {v.phone
                          ? <a href={`tel:${v.phone}`} style={{ color: '#1B3A6B', textDecoration: 'none' }}>{v.phone}</a>
                          : <span style={{ color: '#bbb' }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>
                        {v.website
                          ? <a href={v.website.startsWith('http') ? v.website : `https://${v.website}`} target="_blank" rel="noreferrer" style={{ color: '#1B3A6B' }}>
                              {v.website.replace(/^https?:\/\//, '')}
                            </a>
                          : <span style={{ color: '#bbb' }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#555' }}>
                        {[v.address, v.city, [v.state, v.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || <span style={{ color: '#bbb' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 11, color: '#555', fontFamily: 'monospace' }}>
                        {v.license_number || <span style={{ color: '#bbb', fontFamily: 'inherit' }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => openEdit(v)} style={{ marginRight: 6, background: '#f0f4ff', border: 'none', color: '#1B3A6B', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}>
                          Edit
                        </button>
                        <button onClick={() => deleteVendor(v)} style={{ background: '#fff0f0', border: 'none', color: '#C62828', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="pb-mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {vendors.map((v) => {
                const tc = TYPE_COLORS[v.type] || TYPE_COLORS.subcontractor;
                return (
                  <div key={v.id} style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: 14, color: '#1B3A6B' }}>{v.company_name}</div>
                        {v.trade && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{v.trade}</div>}
                      </div>
                      <span style={{ background: tc.bg, color: tc.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 'bold', flexShrink: 0, marginLeft: 8 }}>
                        {v.type === 'subcontractor' ? 'Sub' : 'Vendor'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: '#555', marginBottom: 8 }}>
                      {v.phone && <span>📞 <a href={`tel:${v.phone}`} style={{ color: '#1B3A6B' }}>{v.phone}</a></span>}
                      {(v.address || v.city) && <span>📍 {[v.address, v.city, [v.state, v.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span>}
                      {v.license_number && <span>🪪 {v.license_number}</span>}
                      {v.website && (
                        <span>🌐 <a href={v.website.startsWith('http') ? v.website : `https://${v.website}`} target="_blank" rel="noreferrer" style={{ color: '#1B3A6B' }}>
                          {v.website.replace(/^https?:\/\//, '')}
                        </a></span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openEdit(v)} style={{ flex: 1, background: '#f0f4ff', border: 'none', color: '#1B3A6B', padding: '7px 0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                        Edit
                      </button>
                      <button onClick={() => deleteVendor(v)} style={{ background: '#fff0f0', border: 'none', color: '#C62828', padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 680, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#1B3A6B', margin: 0, fontSize: 18 }}>
                {editing ? 'Edit Entry' : 'Add Sub / Vendor'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Company Name *</label>
                <input {...field('company_name')} placeholder="ABC Roofing LLC" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Type</label>
                <select {...field('type')} style={inputStyle}>
                  <option value="subcontractor">Subcontractor</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Trade / Category</label>
                <input {...field('trade')} placeholder="Roofing, Electrical, Lumber..." style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Phone</label>
                <input {...field('phone')} placeholder="(978) 555-1234" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Website</label>
                <input {...field('website')} placeholder="www.example.com" style={inputStyle} />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Street Address</label>
                <input {...field('address')} placeholder="123 Main St" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>City</label>
                <input {...field('city')} placeholder="Fitchburg" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>State</label>
                  <input {...field('state')} placeholder="MA" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ZIP</label>
                  <input {...field('zip')} placeholder="01420" style={inputStyle} />
                </div>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>License Number</label>
                <input {...field('license_number')} placeholder="CSL-123456" style={inputStyle} />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Notes</label>
                <textarea {...field('notes')} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={closeModal} style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', background: 'white', fontSize: 13 }}>
                Cancel
              </button>
              <button onClick={save} disabled={saving} style={{ flex: 2, padding: 10, background: '#1B3A6B', color: 'white', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 13, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
