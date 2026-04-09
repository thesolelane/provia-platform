// client/src/pages/Contacts.jsx
import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../utils/toast';
import { showConfirm } from '../utils/confirm';
import ActivityLog from '../components/ActivityLog';

const SOURCE_LABELS = {
  bulk_import: 'Invoice Import',
  manual: 'Manual Entry',
  job: 'From Job',
  email: 'Email',
  whatsapp: 'WhatsApp'
};

const TYPE_COLORS = {
  residential: { bg: '#e8f5e9', color: '#2e7d32' },
  commercial: { bg: '#e3f2fd', color: '#1565c0' },
  unknown: { bg: '#f5f5f5', color: '#757575' }
};

const PAST_STATUSES = new Set(['complete', 'completed', 'rejected', 'closed', 'archived']);

const STAGE_GROUPS = [
  { key: 'early', label: 'Received / Estimating', statuses: new Set(['received', 'estimating', 'clarification']) },
  { key: 'proposal', label: 'Proposal Sent', statuses: new Set(['proposal_ready', 'proposal_sent', 'proposal_approved']) },
  { key: 'contract', label: 'Contract', statuses: new Set(['contract_ready', 'contract_sent', 'contract_signed']) },
  { key: 'progress', label: 'In Progress', statuses: new Set(['in_progress']) },
];

const STATUS_META = {
  received:          { label: 'Received',           bg: '#f0f0f0', color: '#555' },
  estimating:        { label: 'Estimating',          bg: '#fff8e1', color: '#f59e0b' },
  clarification:     { label: 'Needs Clarification', bg: '#fff3e0', color: '#e65100' },
  proposal_ready:    { label: 'Proposal Ready',      bg: '#e3f2fd', color: '#1565c0' },
  proposal_sent:     { label: 'Proposal Sent',       bg: '#ede7f6', color: '#6a1b9a' },
  proposal_approved: { label: 'Proposal Approved',   bg: '#e8f5e9', color: '#2e7d32' },
  contract_ready:    { label: 'Contract Ready',      bg: '#e0f2f1', color: '#00695c' },
  contract_sent:     { label: 'Contract Sent',       bg: '#e0f7fa', color: '#006064' },
  contract_signed:   { label: 'Contract Signed ✓',  bg: '#e8eaf6', color: '#1B3A6B' },
  in_progress:       { label: 'In Progress',         bg: '#f1f8e9', color: '#33691e' },
  complete:          { label: 'Completed',            bg: '#f5f5f5', color: '#333' },
  completed:         { label: 'Completed',            bg: '#f5f5f5', color: '#333' },
  rejected:          { label: 'Rejected',             bg: '#ffebee', color: '#c62828' },
  closed:            { label: 'Closed',               bg: '#fff3e0', color: '#e65100' },
};

const STATUS_ORDER = [
  'received', 'estimating', 'clarification',
  'proposal_ready', 'proposal_sent', 'proposal_approved',
  'contract_ready', 'contract_sent', 'contract_signed',
  'in_progress', 'complete', 'completed'
];

function fmt(n) {
  if (!n && n !== 0) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, bg: '#f0f0f0', color: '#555' };
  return (
    <span style={{
      background: m.bg,
      color: m.color,
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 10,
      whiteSpace: 'nowrap'
    }}>
      {m.label}
    </span>
  );
}

function OpenContractsPanel({ jobs }) {
  const [pastExpanded, setPastExpanded] = useState(false);

  const isPast = (j) => j.archived === 1 || PAST_STATUSES.has(j.status);

  const activeJobs = jobs.filter((j) => !isPast(j));
  const pastJobs   = jobs.filter((j) => isPast(j));

  const totalContracted = activeJobs.reduce((s, j) => s + (j.total_value || 0), 0);
  const totalReceived   = activeJobs.reduce((s, j) => s + (j.total_received || 0), 0);
  const totalOutstanding = activeJobs.reduce((s, j) => s + (j.outstanding || 0), 0);

  const cardStyle = {
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 8,
    background: '#fff',
    fontSize: 12
  };

  const PO_STATUS_COLOR = { draft: '#888', issued: '#b45309', received: '#3B82F6', closed: '#2e7d32' };
  const PO_STATUS_LABEL = { draft: 'Draft', issued: 'Issued', received: 'Received', closed: 'Closed' };

  function JobRow({ j }) {
    const [poExpanded, setPoExpanded] = useState(false);
    const [jobPOs, setJobPOs] = useState(null);
    const [loadingPOs, setLoadingPOs] = useState(false);

    const togglePOs = async () => {
      if (!poExpanded && jobPOs === null) {
        setLoadingPOs(true);
        try {
          const token = localStorage.getItem('auth_token') || '';
          const res = await fetch(`/api/purchase-orders?job_id=${j.id}&status=open`, {
            headers: { 'x-auth-token': token }
          });
          const data = await res.json();
          setJobPOs(data.purchase_orders || []);
        } catch {
          setJobPOs([]);
        } finally {
          setLoadingPOs(false);
        }
      }
      setPoExpanded(v => !v);
    };

    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              {j.pb_number && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#1B3A6B', background: '#e8eeff', padding: '1px 6px', borderRadius: 4 }}>
                  {j.pb_number}
                </span>
              )}
              {!j.pb_number && j.quote_number && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#555', background: '#f0f0f0', padding: '1px 6px', borderRadius: 4 }}>
                  #{j.quote_number}
                </span>
              )}
              <StatusBadge status={j.status} />
            </div>
            <div style={{ color: '#333', fontWeight: 500, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {j.project_address || '(no address)'}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: '#555', alignItems: 'center' }}>
              <span>
                <span style={{ color: '#888', fontSize: 10 }}>CONTRACTED </span>
                <strong>{fmt(j.total_value)}</strong>
              </span>
              <span>
                <span style={{ color: '#888', fontSize: 10 }}>RECEIVED </span>
                <strong style={{ color: '#2e7d32' }}>{fmt(j.total_received)}</strong>
              </span>
              <span>
                <span style={{ color: '#888', fontSize: 10 }}>OUTSTANDING </span>
                <strong style={{ color: j.outstanding > 0 ? '#c62828' : '#2e7d32' }}>
                  {fmt(j.outstanding)}
                </strong>
              </span>
              {j.po_count > 0 && (
                <button
                  onClick={togglePOs}
                  style={{
                    background: poExpanded ? '#ede9fe' : '#f5f3ff',
                    color: '#7C3AED',
                    border: '1px solid #c4b5fd',
                    borderRadius: 5,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  📦 {j.po_count} Open PO{j.po_count !== 1 ? 's' : ''} · {fmt(j.po_open)}
                  <span style={{ fontSize: 10 }}>{poExpanded ? '▲' : '▼'}</span>
                </button>
              )}
            </div>
          </div>
          <a
            href={`/jobs/${j.id}`}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#1B3A6B',
              textDecoration: 'none',
              background: '#e8eeff',
              padding: '5px 10px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            Open Job →
          </a>
        </div>

        {poExpanded && (
          <div style={{ marginTop: 10, borderTop: '1px solid #ede9fe', paddingTop: 10 }}>
            {loadingPOs ? (
              <div style={{ color: '#888', fontSize: 11, padding: '4px 0' }}>Loading purchase orders…</div>
            ) : jobPOs && jobPOs.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: 11, fontStyle: 'italic' }}>No open purchase orders for this job.</div>
            ) : (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', marginBottom: 6, letterSpacing: '0.05em' }}>OPEN PURCHASE ORDERS</div>
                {(jobPOs || []).map(po => (
                  <div key={po.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#faf8ff', border: '1px solid #ede9fe', borderRadius: 5, marginBottom: 4, gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', marginRight: 6 }}>{po.po_number}</span>
                      <span style={{ fontSize: 11, color: '#555' }}>{po.description}</span>
                      {po.vendor_name && <span style={{ fontSize: 10, color: '#999', marginLeft: 6 }}>· {po.vendor_name}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: PO_STATUS_COLOR[po.status] || '#888', background: '#f0f0f0', padding: '1px 6px', borderRadius: 3 }}>
                        {PO_STATUS_LABEL[po.status] || po.status}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#7C3AED' }}>{fmt(po.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, color: '#1B3A6B', marginBottom: 8 }}>Open Contracts</h3>
        <p style={{ fontSize: 12, color: '#888', textAlign: 'center', padding: 16 }}>
          No jobs linked to this contact yet.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, color: '#1B3A6B', marginBottom: 10 }}>
        Open Contracts ({activeJobs.length})
      </h3>

      {activeJobs.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 12,
          background: '#f8faff',
          border: '1px solid #dde8ff',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 12,
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 2 }}>TOTAL CONTRACTED</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1B3A6B' }}>{fmt(totalContracted)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 2 }}>TOTAL RECEIVED</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#2e7d32' }}>{fmt(totalReceived)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 2 }}>OUTSTANDING</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: totalOutstanding > 0 ? '#c62828' : '#2e7d32' }}>{fmt(totalOutstanding)}</div>
          </div>
        </div>
      )}

      {activeJobs.length === 0 && (
        <p style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>No open contracts.</p>
      )}

      {STAGE_GROUPS.map((group) => {
        const groupJobs = activeJobs.filter((j) => group.statuses.has(j.status));
        if (groupJobs.length === 0) return null;
        return (
          <div key={group.key} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#888',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: 6,
              paddingBottom: 3,
              borderBottom: '1px solid #e8edf5'
            }}>
              {group.label}
            </div>
            {groupJobs.map((j) => <JobRow key={j.id} j={j} />)}
          </div>
        );
      })}

      {/* Ungrouped active jobs (unrecognised statuses) */}
      {activeJobs.filter((j) => !STAGE_GROUPS.some((g) => g.statuses.has(j.status))).map((j) => (
        <JobRow key={j.id} j={j} />
      ))}

      {pastJobs.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setPastExpanded((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: '#888',
              fontWeight: 600,
              padding: '4px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {pastExpanded ? '▾' : '▸'} Past Jobs ({pastJobs.length})
          </button>
          {pastExpanded && (
            <div style={{ marginTop: 8 }}>
              {pastJobs.map((j) => <JobRow key={j.id} j={j} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: 'MA',
    zip: '',
    customer_type: 'residential',
    notes: ''
  });
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

  useEffect(() => {
    load();
  }, []);

  const openContact = async (c) => {
    setSelected(c);
    setEditing(false);
    setSelectedDocs([]);
    setPaymentSummary(null);
    setContactPayments({ received: [], made: [] });
    setForm({
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || 'MA',
      zip: c.zip || '',
      customer_type: c.customer_type || 'residential',
      notes: c.notes || ''
    });
    const [contactRes, payRes] = await Promise.all([
      fetch(`/api/contacts/${c.id}`, { headers }),
      fetch(`/api/payments/contact/${c.id}`, { headers })
    ]);
    const data = await contactRes.json();
    setSelectedJobs(data.jobs || []);
    setSelectedDocs(data.documents || []);
    setPaymentSummary(data.paymentSummary || null);
    const payData = await payRes.json();
    setContactPayments({ received: payData.received || [], made: payData.made || [] });
  };

  const deleteDoc = async (docId) => {
    if (!(await showConfirm('Remove this document from the contact?'))) return;
    await fetch(`/api/contacts/${selected.id}/documents/${docId}`, { method: 'DELETE', headers });
    setSelectedDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  const validateForm = () => {
    const nameParts = form.name.trim().split(/\s+/);
    if (!form.name.trim()) return 'Full name is required.';
    if (nameParts.length < 2) return 'Please enter both first and last name.';

    if (form.email) {
      const emailOk = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(form.email.trim());
      if (!emailOk)
        return 'Email address does not look right — check the format (e.g. name@gmail.com, name@company.net, name@domain.io).';
    }

    if (form.phone) {
      const phoneOk = /^[\d\s\(\)\-\+\.]{7,20}$/.test(form.phone.trim());
      if (!phoneOk) return 'Phone number format is invalid.';
    }

    if (form.zip) {
      const zipOk = /^\d{5}(-\d{4})?$/.test(form.zip.trim());
      if (!zipOk) return 'ZIP code must be 5 digits (e.g. 01420).';
    }

    return null;
  };

  const saveEdit = async () => {
    const err = validateForm();
    if (err) {
      showToast(err, 'error');
      return;
    }

    const url = selected ? `/api/contacts/${selected.id}` : '/api/contacts';
    const method = selected ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    if (res.ok) {
      setSelected(null);
      setShowAdd(false);
      setEditing(false);
      load(search);
    } else {
      const d = await res.json();
      showToast(d.error || 'Save failed', 'error');
    }
  };

  const deleteContact = async (id) => {
    if (!(await showConfirm('Delete this contact? This cannot be undone.'))) return;
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

  const blankForm = () =>
    setForm({
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: 'MA',
      zip: '',
      customer_type: 'residential',
      notes: ''
    });

  if (loading && contacts.length === 0)
    return <div style={{ padding: 40, color: '#888' }}>Loading contacts...</div>;

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 'bold', color: '#1B3A6B', margin: 0 }}>
            Contacts
          </h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            {total} contact{total !== 1 ? 's' : ''} — auto-populated from invoices and jobs
          </p>
        </div>
        <button
          onClick={() => {
            blankForm();
            setSelected(null);
            setShowAdd(true);
            setEditing(true);
          }}
          style={{
            background: '#1B3A6B',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
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
          style={{
            width: '100%',
            padding: '10px 14px',
            border: '1px solid #ddd',
            borderRadius: 8,
            fontSize: 13,
            boxSizing: 'border-box'
          }}
        />
      </div>

      {/* Table */}
      <div
        style={{
          background: 'white',
          borderRadius: 10,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          overflow: 'hidden'
        }}
      >
        {contacts.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>No contacts yet</div>
            <div style={{ fontSize: 13 }}>
              Contacts are automatically added when you import invoices or create jobs with customer
              info.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1B3A6B' }}>
                {[
                  'Client ID',
                  'Name',
                  'Phone',
                  'Email',
                  'City / Address',
                  'Type',
                  'Source',
                  ''
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '11px 14px',
                      color: 'white',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 'bold'
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => {
                const tc = TYPE_COLORS[c.customer_type] || TYPE_COLORS.unknown;
                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid #f0f0f0',
                      background: i % 2 === 0 ? 'white' : '#fafafa',
                      cursor: 'pointer'
                    }}
                    onClick={() => openContact(c)}
                  >
                    <td
                      style={{
                        padding: '11px 14px',
                        fontSize: 11,
                        color: '#1B3A6B',
                        fontWeight: '600',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {c.customer_number || <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: '500', fontSize: 13 }}>
                      {c.name || <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#555' }}>
                      {c.phone || <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#555' }}>
                      {c.email || <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#555' }}>
                      {[c.city, c.address].filter(Boolean).join(' · ') || (
                        <span style={{ color: '#bbb' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span
                        style={{
                          background: tc.bg,
                          color: tc.color,
                          padding: '2px 8px',
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 'bold',
                          textTransform: 'capitalize'
                        }}
                      >
                        {c.customer_type || 'unknown'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 11, color: '#888' }}>
                      {SOURCE_LABELS[c.source] || c.source}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ color: '#1B3A6B', fontSize: 12, fontWeight: 'bold' }}>
                        View →
                      </span>
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
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              padding: 32,
              width: 700,
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20
              }}
            >
              <h2 style={{ color: '#1B3A6B', margin: 0, fontSize: 18 }}>
                {showAdd && !selected
                  ? 'New Contact'
                  : editing
                    ? 'Edit Contact'
                    : selected?.name || 'Contact'}
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
                {selected && !editing && (
                  <button
                    onClick={() => setEditing(true)}
                    style={{
                      background: '#f0f4ff',
                      border: 'none',
                      color: '#1B3A6B',
                      padding: '6px 14px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 'bold'
                    }}
                  >
                    Edit
                  </button>
                )}
                {selected && !editing && (
                  <button
                    onClick={() => deleteContact(selected.id)}
                    style={{
                      background: '#fff0f0',
                      border: 'none',
                      color: '#C62828',
                      padding: '6px 14px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelected(null);
                    setShowAdd(false);
                    setEditing(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 22,
                    cursor: 'pointer',
                    color: '#888'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {editing ? (
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    marginBottom: 12
                  }}
                >
                  {[
                    { label: 'Full Name', key: 'name', placeholder: 'John Smith' },
                    { label: 'Phone', key: 'phone', placeholder: '+1 555 000 0000' },
                    { label: 'Email', key: 'email', placeholder: 'john@email.com' }
                  ].map((f) => (
                    <div key={f.key}>
                      <label
                        style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}
                      >
                        {f.label}
                      </label>
                      <input
                        value={form[f.key]}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid #ddd',
                          borderRadius: 6,
                          fontSize: 12,
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Owner Mailing Address section */}
                <div style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#1B3A6B',
                        textTransform: 'uppercase',
                        letterSpacing: 1
                      }}
                    >
                      Owner Mailing Address
                    </div>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        color: '#555',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!form.address && !form.city && !form.zip}
                        onChange={(e) => {
                          if (e.target.checked)
                            setForm({ ...form, address: '', city: '', state: 'MA', zip: '' });
                        }}
                      />
                      Same as project address
                    </label>
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                    Owner's home or billing address — appears on the contract. Leave blank if the
                    owner lives at the job site.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      {
                        label: 'Street Address',
                        key: 'address',
                        placeholder: '123 Main St',
                        span: 2
                      },
                      { label: 'City', key: 'city', placeholder: 'Fitchburg' },
                      { label: 'State', key: 'state', placeholder: 'MA' },
                      { label: 'ZIP', key: 'zip', placeholder: '01420' }
                    ].map((f) => (
                      <div key={f.key} style={f.span ? { gridColumn: `span ${f.span}` } : {}}>
                        <label
                          style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}
                        >
                          {f.label}
                        </label>
                        <input
                          value={form[f.key]}
                          onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                          placeholder={f.placeholder}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            border: '1px solid #ddd',
                            borderRadius: 6,
                            fontSize: 12,
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    marginBottom: 12
                  }}
                >
                  <div>
                    <label
                      style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}
                    >
                      Customer Type
                    </label>
                    <select
                      value={form.customer_type}
                      onChange={(e) => setForm({ ...form, customer_type: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid #ddd',
                        borderRadius: 6,
                        fontSize: 12,
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="residential">Residential</option>
                      <option value="commercial">Commercial</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>
                    Notes
                  </label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      border: '1px solid #ddd',
                      borderRadius: 6,
                      fontSize: 12,
                      boxSizing: 'border-box',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => {
                      setEditing(false);
                      if (showAdd) {
                        setShowAdd(false);
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: 10,
                      border: '1px solid #ddd',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: 'white',
                      fontSize: 13
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    style={{
                      flex: 2,
                      padding: 10,
                      background: '#1B3A6B',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: 13
                    }}
                  >
                    Save Contact
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Contact info display */}
                <div
                  style={{ background: '#f8f9ff', borderRadius: 8, padding: 16, marginBottom: 20 }}
                >
                  {(selected?.customer_number || selected?.pb_customer_number) && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginBottom: 12,
                        paddingBottom: 10,
                        borderBottom: '1px solid #e0e8ff',
                        flexWrap: 'wrap',
                        alignItems: 'center'
                      }}
                    >
                      {selected?.pb_customer_number && (
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: '800',
                            fontSize: 14,
                            color: '#1B3A6B',
                            background: '#e0e8ff',
                            padding: '3px 10px',
                            borderRadius: 8,
                            letterSpacing: 1
                          }}
                        >
                          {selected.pb_customer_number}
                        </span>
                      )}
                      {selected?.customer_number && (
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 11,
                            color: '#888',
                            background: '#f0f0f0',
                            padding: '2px 8px',
                            borderRadius: 6
                          }}
                        >
                          {selected.customer_number}
                        </span>
                      )}
                    </div>
                  )}
                  {[
                    { label: 'Phone', value: selected?.phone },
                    { label: 'Email', value: selected?.email },
                    {
                      label: 'Mailing',
                      value:
                        [selected?.address, selected?.city, selected?.state, selected?.zip]
                          .filter(Boolean)
                          .join(', ') || '(same as project)'
                    },
                    { label: 'Type', value: selected?.customer_type },
                    { label: 'Source', value: SOURCE_LABELS[selected?.source] || selected?.source },
                    {
                      label: 'Added',
                      value: selected?.created_at
                        ? new Date(selected.created_at).toLocaleDateString()
                        : null
                    }
                  ].map((row) =>
                    row.value ? (
                      <div key={row.label} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: '#888', width: 70, flexShrink: 0 }}>
                          {row.label}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: '500',
                            textTransform: row.label === 'Type' ? 'capitalize' : 'none'
                          }}
                        >
                          {row.value}
                        </span>
                      </div>
                    ) : null
                  )}
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
                    <h3 style={{ fontSize: 14, color: '#1B3A6B', marginBottom: 10 }}>
                      Documents ({selectedDocs.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {selectedDocs.map((doc) => {
                        const icon =
                          doc.mime_type === 'application/pdf'
                            ? '📄'
                            : doc.mime_type?.startsWith('image/')
                              ? '🖼️'
                              : '📎';
                        const url = `/contact-docs/${selected.id}/${doc.filename}`;
                        return (
                          <div
                            key={doc.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              background: '#f8f9ff',
                              borderRadius: 7,
                              padding: '8px 12px'
                            }}
                          >
                            <span style={{ fontSize: 18 }}>{icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: '600',
                                  color: '#1B3A6B',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {doc.original_name || doc.filename}
                              </div>
                              <div style={{ fontSize: 10, color: '#aaa' }}>
                                {new Date(doc.created_at).toLocaleDateString()} ·{' '}
                                {doc.source === 'bulk_import' ? 'Invoice Import' : doc.source}
                              </div>
                            </div>
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: 11,
                                color: '#1B3A6B',
                                fontWeight: 'bold',
                                textDecoration: 'none',
                                background: '#e8eeff',
                                padding: '4px 10px',
                                borderRadius: 5
                              }}
                            >
                              View
                            </a>
                            <button
                              onClick={() => deleteDoc(doc.id)}
                              style={{
                                fontSize: 11,
                                color: '#C62828',
                                background: '#fff0f0',
                                border: 'none',
                                padding: '4px 8px',
                                borderRadius: 5,
                                cursor: 'pointer'
                              }}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Open Contracts & Jobs Summary */}
                <OpenContractsPanel jobs={selectedJobs} />

                {/* Client Payment Ledger */}
                <div style={{ marginTop: 24 }}>
                  <h3 style={{ fontSize: 14, color: '#1B3A6B', marginBottom: 10 }}>
                    Client Payment Ledger
                  </h3>
                  {paymentSummary &&
                  (paymentSummary.total_received > 0 || paymentSummary.total_paid_out > 0) ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 8,
                        marginBottom: 16
                      }}
                    >
                      <div
                        style={{
                          borderRadius: 6,
                          padding: '10px 12px',
                          background: '#2E7D3211',
                          border: '1px solid #2E7D3233'
                        }}
                      >
                        <div style={{ fontSize: 10, color: '#888' }}>Received</div>
                        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#2E7D32' }}>
                          $
                          {paymentSummary.total_received.toLocaleString('en-US', {
                            minimumFractionDigits: 2
                          })}
                        </div>
                      </div>
                      <div
                        style={{
                          borderRadius: 6,
                          padding: '10px 12px',
                          background: '#C6282811',
                          border: '1px solid #C6282833'
                        }}
                      >
                        <div style={{ fontSize: 10, color: '#888' }}>Paid Out</div>
                        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#C62828' }}>
                          $
                          {paymentSummary.total_paid_out.toLocaleString('en-US', {
                            minimumFractionDigits: 2
                          })}
                        </div>
                      </div>
                      <div
                        style={{
                          borderRadius: 6,
                          padding: '10px 12px',
                          background: paymentSummary.balance >= 0 ? '#1B3A6B11' : '#C6282811',
                          border: `1px solid ${paymentSummary.balance >= 0 ? '#1B3A6B33' : '#C6282833'}`
                        }}
                      >
                        <div style={{ fontSize: 10, color: '#888' }}>Balance</div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 'bold',
                            color: paymentSummary.balance >= 0 ? '#1B3A6B' : '#C62828'
                          }}
                        >
                          $
                          {paymentSummary.balance.toLocaleString('en-US', {
                            minimumFractionDigits: 2
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {contactPayments.received.length === 0 && contactPayments.made.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#888', textAlign: 'center', padding: 16 }}>
                      No payment records for this client yet.
                    </p>
                  ) : (
                    <div>
                      {contactPayments.received.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 'bold',
                              color: '#2E7D32',
                              marginBottom: 6
                            }}
                          >
                            Checks Received ({contactPayments.received.length})
                          </div>
                          <table
                            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}
                          >
                            <thead>
                              <tr style={{ background: '#f0fdf4' }}>
                                {[
                                  'Date',
                                  'Time',
                                  'Job',
                                  'Check #',
                                  'Type',
                                  'Cr/Dr',
                                  'Amount',
                                  'By'
                                ].map((h) => (
                                  <th
                                    key={h}
                                    style={{
                                      padding: '6px 8px',
                                      textAlign: 'left',
                                      fontSize: 10,
                                      color: '#888',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {contactPayments.received.map((p) => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '6px 8px' }}>
                                    {p.date_received
                                      ? new Date(p.date_received + 'T12:00:00').toLocaleDateString(
                                          'en-US',
                                          { month: 'short', day: 'numeric' }
                                        )
                                      : '—'}
                                  </td>
                                  <td style={{ padding: '6px 8px', color: '#888' }}>
                                    {p.time_received || '—'}
                                  </td>
                                  <td style={{ padding: '6px 8px', fontSize: 10 }}>
                                    {p.project_address || p.job_customer || '—'}
                                  </td>
                                  <td style={{ padding: '6px 8px', color: '#888' }}>
                                    {p.check_number || '—'}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <span
                                      style={{
                                        fontSize: 9,
                                        padding: '1px 6px',
                                        borderRadius: 8,
                                        background: '#3B82F622',
                                        color: '#3B82F6',
                                        fontWeight: 'bold'
                                      }}
                                    >
                                      {p.payment_type}
                                    </span>
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <span
                                      style={{
                                        fontSize: 9,
                                        padding: '1px 6px',
                                        borderRadius: 8,
                                        background:
                                          p.credit_debit === 'credit' ? '#2E7D3222' : '#C6282822',
                                        color: p.credit_debit === 'credit' ? '#2E7D32' : '#C62828',
                                        fontWeight: 'bold'
                                      }}
                                    >
                                      {p.credit_debit === 'credit' ? 'CR' : 'DR'}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      padding: '6px 8px',
                                      fontWeight: 'bold',
                                      color: p.credit_debit === 'debit' ? '#C62828' : '#2E7D32'
                                    }}
                                  >
                                    $
                                    {Number(p.amount).toLocaleString('en-US', {
                                      minimumFractionDigits: 2
                                    })}
                                  </td>
                                  <td style={{ padding: '6px 8px', color: '#888', fontSize: 10 }}>
                                    {p.recorded_by || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {contactPayments.made.length > 0 && (
                        <div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 'bold',
                              color: '#C62828',
                              marginBottom: 6
                            }}
                          >
                            Checks Paid Out ({contactPayments.made.length})
                          </div>
                          <table
                            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}
                          >
                            <thead>
                              <tr style={{ background: '#fff5f5' }}>
                                {[
                                  'Date',
                                  'Time',
                                  'Job',
                                  'To',
                                  'Check #',
                                  'Cat.',
                                  'Cr/Dr',
                                  'Amount',
                                  'By'
                                ].map((h) => (
                                  <th
                                    key={h}
                                    style={{
                                      padding: '6px 8px',
                                      textAlign: 'left',
                                      fontSize: 10,
                                      color: '#888',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {contactPayments.made.map((p) => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '6px 8px' }}>
                                    {p.date_paid
                                      ? new Date(p.date_paid + 'T12:00:00').toLocaleDateString(
                                          'en-US',
                                          { month: 'short', day: 'numeric' }
                                        )
                                      : '—'}
                                  </td>
                                  <td style={{ padding: '6px 8px', color: '#888' }}>
                                    {p.time_paid || '—'}
                                  </td>
                                  <td style={{ padding: '6px 8px', fontSize: 10 }}>
                                    {p.project_address || p.job_customer || '—'}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>{p.payee_name}</td>
                                  <td style={{ padding: '6px 8px', color: '#888' }}>
                                    {p.check_number || '—'}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <span
                                      style={{
                                        fontSize: 9,
                                        padding: '1px 6px',
                                        borderRadius: 8,
                                        background: '#7C3AED22',
                                        color: '#7C3AED',
                                        fontWeight: 'bold'
                                      }}
                                    >
                                      {p.category}
                                    </span>
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <span
                                      style={{
                                        fontSize: 9,
                                        padding: '1px 6px',
                                        borderRadius: 8,
                                        background:
                                          p.credit_debit === 'credit' ? '#2E7D3222' : '#C6282822',
                                        color: p.credit_debit === 'credit' ? '#2E7D32' : '#C62828',
                                        fontWeight: 'bold'
                                      }}
                                    >
                                      {p.credit_debit === 'credit' ? 'CR' : 'DR'}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      padding: '6px 8px',
                                      fontWeight: 'bold',
                                      color: p.credit_debit === 'credit' ? '#2E7D32' : '#C62828'
                                    }}
                                  >
                                    $
                                    {Number(p.amount).toLocaleString('en-US', {
                                      minimumFractionDigits: 2
                                    })}
                                  </td>
                                  <td style={{ padding: '6px 8px', color: '#888', fontSize: 10 }}>
                                    {p.recorded_by || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selected?.pb_customer_number && (
                  <ActivityLog
                    customerNumber={selected.pb_customer_number}
                    token={token}
                    collapsed={false}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
