import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../utils/toast';
import { showConfirm } from '../utils/confirm';

const BLUE   = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN  = '#2E7D32';
const RED    = '#C62828';

const PAYMENT_TYPES = ['deposit', 'progress', 'final', 'other'];
const CATEGORIES    = ['subcontractor', 'material', 'permit', 'other'];

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function today() { return new Date().toISOString().slice(0, 10); }
function nowTime() { return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5); }

const EMPTY_IN  = { customer_name: '', check_number: '', amount: '', date_received: today(), time_received: nowTime(), payment_type: 'deposit', credit_debit: 'credit', notes: '' };
const EMPTY_OUT = { payee_name: '', check_number: '', amount: '', date_paid: today(), time_paid: nowTime(), category: 'subcontractor', credit_debit: 'debit', notes: '' };

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1.5px solid #C8D4E4',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
};

export default function PaymentsTab({ jobId, token, job }) {
  const [received, setReceived]   = useState([]);
  const [made, setMade]           = useState([]);
  const [summary, setSummary]     = useState({ total_received: 0, total_paid_out: 0, balance: 0 });
  const [loading, setLoading]     = useState(true);
  const [showIn, setShowIn]       = useState(false);
  const [showOut, setShowOut]     = useState(false);
  const [formIn, setFormIn]       = useState({ ...EMPTY_IN, customer_name: job?.customer_name || '' });
  const [formOut, setFormOut]     = useState(EMPTY_OUT);
  const [saving, setSaving]       = useState(false);

  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/payments/job/${jobId}`, { headers: { 'x-auth-token': token } })
      .then(r => r.json())
      .then(data => {
        setReceived(data.received || []);
        setMade(data.made || []);
        setSummary(data.summary || { total_received: 0, total_paid_out: 0, balance: 0 });
        setLoading(false);
      });
  }, [jobId, token]);

  useEffect(() => { load(); }, [load]);

  const submitIn = async () => {
    if (!formIn.amount)        return showToast('Enter an amount', 'error');
    if (!formIn.date_received) return showToast('Enter a date', 'error');
    setSaving(true);
    const body = { ...formIn, job_id: jobId };
    const res  = await fetch('/api/payments/received', { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) {
      setFormIn({ ...EMPTY_IN, customer_name: job?.customer_name || '', date_received: today(), time_received: nowTime() });
      setShowIn(false);
      setSummary(data.summary);
      load();
      showToast('Check recorded');
    } else {
      showToast(data.error || 'Failed to save', 'error');
    }
    setSaving(false);
  };

  const submitOut = async () => {
    if (!formOut.payee_name) return showToast('Enter a payee name', 'error');
    if (!formOut.amount)     return showToast('Enter an amount', 'error');
    if (!formOut.date_paid)  return showToast('Enter a date', 'error');
    setSaving(true);
    const body = { ...formOut, job_id: jobId };
    const res  = await fetch('/api/payments/made', { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) {
      setFormOut({ ...EMPTY_OUT, date_paid: today(), time_paid: nowTime() });
      setShowOut(false);
      setSummary(data.summary);
      load();
      showToast('Payment recorded');
    } else {
      showToast(data.error || 'Failed to save', 'error');
    }
    setSaving(false);
  };

  const deleteReceived = async (p) => {
    if (!await showConfirm(`Delete check record: ${fmt(p.amount)} received on ${fmtDate(p.date_received)}?`)) return;
    const res  = await fetch(`/api/payments/received/${p.id}`, { method: 'DELETE', headers });
    const data = await res.json();
    if (res.ok) { setSummary(data.summary); load(); showToast('Record deleted'); }
    else showToast(data.error || 'Failed to delete', 'error');
  };

  const deleteMade = async (p) => {
    if (!await showConfirm(`Delete payment record: ${fmt(p.amount)} to ${p.payee_name}?`)) return;
    const res  = await fetch(`/api/payments/made/${p.id}`, { method: 'DELETE', headers });
    const data = await res.json();
    if (res.ok) { setSummary(data.summary); load(); showToast('Record deleted'); }
    else showToast(data.error || 'Failed to delete', 'error');
  };

  if (loading) return <div style={{ color: '#888', padding: 20 }}>Loading payments...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ color: BLUE, margin: 0 }}>Payment Tracking</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setShowIn(true); setShowOut(false); }}
            style={{ padding: '8px 14px', background: GREEN, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>
            + Check Received
          </button>
          <button onClick={() => { setShowOut(true); setShowIn(false); }}
            style={{ padding: '8px 14px', background: RED, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>
            + Check Paid Out
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <SummaryCard label="Total Received" value={fmt(summary.total_received)} color={GREEN} />
        <SummaryCard label="Total Paid Out" value={fmt(summary.total_paid_out)} color={RED} />
        <SummaryCard label="Balance"        value={fmt(summary.balance)}        color={summary.balance >= 0 ? BLUE : RED} />
      </div>

      {showIn && (
        <div style={{ background: '#f0fdf4', border: `1px solid ${GREEN}40`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 'bold', color: GREEN, marginBottom: 12, fontSize: 13 }}>Record Check Received (Credit)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
            <Field label="Customer Name">
              <input value={formIn.customer_name} onChange={e => setFormIn(p => ({ ...p, customer_name: e.target.value }))} placeholder="Name on check" style={inputStyle} />
            </Field>
            <Field label="Check #">
              <input value={formIn.check_number} onChange={e => setFormIn(p => ({ ...p, check_number: e.target.value }))} placeholder="e.g. 1042" style={inputStyle} />
            </Field>
            <Field label="Amount *">
              <input type="number" step="0.01" min="0" value={formIn.amount} onChange={e => setFormIn(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" style={inputStyle} />
            </Field>
            <Field label="Date *">
              <input type="date" value={formIn.date_received} onChange={e => setFormIn(p => ({ ...p, date_received: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Time">
              <input type="time" value={formIn.time_received} onChange={e => setFormIn(p => ({ ...p, time_received: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Payment Type">
              <select value={formIn.payment_type} onChange={e => setFormIn(p => ({ ...p, payment_type: e.target.value }))} style={inputStyle}>
                {PAYMENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Credit / Debit">
              <select value={formIn.credit_debit} onChange={e => setFormIn(p => ({ ...p, credit_debit: e.target.value }))} style={inputStyle}>
                <option value="credit">Credit (money in)</option>
                <option value="debit">Debit (refund out)</option>
              </select>
            </Field>
            <Field label="Notes">
              <input value={formIn.notes} onChange={e => setFormIn(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" style={inputStyle} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={submitIn} disabled={saving} style={{ padding: '8px 16px', background: GREEN, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setShowIn(false)} style={{ padding: '8px 12px', background: 'none', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#888' }}>Cancel</button>
          </div>
        </div>
      )}

      {showOut && (
        <div style={{ background: '#fff5f5', border: `1px solid ${RED}40`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 'bold', color: RED, marginBottom: 12, fontSize: 13 }}>Record Check Paid Out (Debit)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
            <Field label="Payee Name *">
              <input value={formOut.payee_name} onChange={e => setFormOut(p => ({ ...p, payee_name: e.target.value }))} placeholder="Subcontractor / vendor" style={inputStyle} />
            </Field>
            <Field label="Check #">
              <input value={formOut.check_number} onChange={e => setFormOut(p => ({ ...p, check_number: e.target.value }))} placeholder="e.g. 2210" style={inputStyle} />
            </Field>
            <Field label="Amount *">
              <input type="number" step="0.01" min="0" value={formOut.amount} onChange={e => setFormOut(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" style={inputStyle} />
            </Field>
            <Field label="Date *">
              <input type="date" value={formOut.date_paid} onChange={e => setFormOut(p => ({ ...p, date_paid: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Time">
              <input type="time" value={formOut.time_paid} onChange={e => setFormOut(p => ({ ...p, time_paid: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Category">
              <select value={formOut.category} onChange={e => setFormOut(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Credit / Debit">
              <select value={formOut.credit_debit} onChange={e => setFormOut(p => ({ ...p, credit_debit: e.target.value }))} style={inputStyle}>
                <option value="debit">Debit (money out)</option>
                <option value="credit">Credit (refund in)</option>
              </select>
            </Field>
            <Field label="Notes">
              <input value={formOut.notes} onChange={e => setFormOut(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" style={inputStyle} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={submitOut} disabled={saving} style={{ padding: '8px 16px', background: RED, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setShowOut(false)} style={{ padding: '8px 12px', background: 'none', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#888' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 'bold', color: GREEN, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          Checks Received
          <span style={{ fontSize: 12, fontWeight: 'normal', color: '#888' }}>({received.length})</span>
        </div>
        {received.length === 0 ? (
          <div style={{ color: '#aaa', fontSize: 13, padding: '12px 0' }}>No checks received recorded yet.</div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f0fdf4' }}>
                  {['Date & Time', 'From', 'Check #', 'Type', 'Cr/Dr', 'Amount', 'Recorded By', 'Notes', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#888', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {received.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDate(p.date_received)}{p.time_received && <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>{p.time_received}</span>}</td>
                    <td style={{ padding: '8px 10px' }}>{p.customer_name || '—'}</td>
                    <td style={{ padding: '8px 10px', color: '#888' }}>{p.check_number || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><TypeBadge type={p.payment_type} /></td>
                    <td style={{ padding: '8px 10px' }}><CrDrBadge value={p.credit_debit} /></td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold', color: p.credit_debit === 'debit' ? RED : GREEN }}>{fmt(p.amount)}</td>
                    <td style={{ padding: '8px 10px', color: '#888', fontSize: 11 }}>{p.recorded_by || '—'}</td>
                    <td style={{ padding: '8px 10px', color: '#888', fontSize: 12 }}>{p.notes || ''}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <button onClick={() => deleteReceived(p)} style={{ padding: '3px 8px', background: '#ff000011', color: RED, border: '1px solid #ff000022', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 'bold', color: RED, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          Checks Paid Out
          <span style={{ fontSize: 12, fontWeight: 'normal', color: '#888' }}>({made.length})</span>
        </div>
        {made.length === 0 ? (
          <div style={{ color: '#aaa', fontSize: 13, padding: '12px 0' }}>No outgoing checks recorded yet.</div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fff5f5' }}>
                  {['Date & Time', 'To', 'Check #', 'Category', 'Cr/Dr', 'Amount', 'Recorded By', 'Notes', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#888', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {made.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtDate(p.date_paid)}{p.time_paid && <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>{p.time_paid}</span>}</td>
                    <td style={{ padding: '8px 10px' }}>{p.payee_name}</td>
                    <td style={{ padding: '8px 10px', color: '#888' }}>{p.check_number || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><CategoryBadge cat={p.category} /></td>
                    <td style={{ padding: '8px 10px' }}><CrDrBadge value={p.credit_debit} /></td>
                    <td style={{ padding: '8px 10px', fontWeight: 'bold', color: p.credit_debit === 'credit' ? GREEN : RED }}>{fmt(p.amount)}</td>
                    <td style={{ padding: '8px 10px', color: '#888', fontSize: 11 }}>{p.recorded_by || '—'}</td>
                    <td style={{ padding: '8px 10px', color: '#888', fontSize: 12 }}>{p.notes || ''}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <button onClick={() => deleteMade(p)} style={{ padding: '3px 8px', background: '#ff000011', color: RED, border: '1px solid #ff000022', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{ borderRadius: 8, padding: '12px 16px', background: color + '11', border: `1px solid ${color}33` }}>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 'bold', color }}>{value}</div>
    </div>
  );
}

const TYPE_COLORS = { deposit: '#3B82F6', progress: ORANGE, final: GREEN, other: '#888' };
function TypeBadge({ type }) {
  const color = TYPE_COLORS[type] || '#888';
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: color + '22', color, fontWeight: 'bold' }}>{type?.charAt(0).toUpperCase() + type?.slice(1)}</span>;
}

const CAT_COLORS = { subcontractor: '#7C3AED', material: ORANGE, permit: '#0D9488', other: '#888' };
function CategoryBadge({ cat }) {
  const color = CAT_COLORS[cat] || '#888';
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: color + '22', color, fontWeight: 'bold' }}>{cat?.charAt(0).toUpperCase() + cat?.slice(1)}</span>;
}

function CrDrBadge({ value }) {
  const isCredit = value === 'credit';
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: isCredit ? '#2E7D3222' : '#C6282822', color: isCredit ? '#2E7D32' : '#C62828', fontWeight: 'bold' }}>{isCredit ? 'CR' : 'DR'}</span>;
}
