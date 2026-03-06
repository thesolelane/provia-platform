// client/src/pages/Whitelist.jsx
import { useState, useEffect } from 'react';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN = '#2E7D32';
const RED = '#C62828';

export default function Whitelist({ token }) {
  const [senders, setSenders] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ identifier: '', type: 'email', name: '', role: 'pm', language: 'en' });
  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  const load = () => fetch('/api/whitelist', { headers: { 'x-auth-token': token } }).then(r => r.json()).then(setSenders);
  useEffect(() => { load(); }, []);

  const add = async () => {
    await fetch('/api/whitelist', { method: 'POST', headers, body: JSON.stringify(form) });
    setShowAdd(false);
    setForm({ identifier: '', type: 'email', name: '', role: 'pm', language: 'en' });
    load();
  };

  const toggle = async (id, active) => {
    await fetch(`/api/whitelist/${id}`, { method: 'PUT', headers, body: JSON.stringify({ active: active ? 0 : 1 }) });
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this sender?')) return;
    await fetch(`/api/whitelist/${id}`, { method: 'DELETE', headers: { 'x-auth-token': token } });
    load();
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>🔒 Approved Senders</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Only these emails and WhatsApp numbers can trigger the bot</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ padding: '10px 20px', background: BLUE, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
          + Add Sender
        </button>
      </div>

      <div style={{ background: '#FFF8F0', border: `1px solid ${ORANGE}`, borderRadius: 8, padding: 14, marginBottom: 20, fontSize: 12, color: '#5D3A00' }}>
        ⚠️ Messages from numbers or emails NOT on this list are silently dropped — no reply is sent, no error is shown to the sender.
      </div>

      <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: BLUE }}>
              {['Name', 'Identifier', 'Type', 'Role', 'Language', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', color: 'white', textAlign: 'left', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {senders.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#888' }}>No approved senders yet.</td></tr>
            )}
            {senders.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: '500' }}>{s.name || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#555', fontFamily: 'monospace' }}>{s.identifier}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ background: s.type === 'email' ? '#E3ECFF' : '#E8F5E9', color: s.type === 'email' ? BLUE : GREEN, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 'bold' }}>
                    {s.type === 'email' ? '📧 Email' : '📱 WhatsApp'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#666', textTransform: 'capitalize' }}>{s.role}</td>
                <td style={{ padding: '12px 16px', fontSize: 12 }}>{s.language === 'pt-BR' ? '🇧🇷 PT-BR' : '🇺🇸 EN'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ color: s.active ? GREEN : '#ccc', fontWeight: 'bold', fontSize: 12 }}>
                    {s.active ? '● Active' : '○ Inactive'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => toggle(s.id, s.active)}
                      style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', background: 'white' }}>
                      {s.active ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => remove(s.id)}
                      style={{ fontSize: 11, padding: '4px 10px', border: `1px solid ${RED}`, borderRadius: 4, cursor: 'pointer', color: RED, background: 'white' }}>
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 440 }}>
            <h2 style={{ color: BLUE, marginBottom: 20 }}>Add Approved Sender</h2>
            {[
              { label: 'Name', key: 'name', placeholder: 'e.g. Jackson Deaquino' },
              { label: 'Email or WhatsApp number (with country code)', key: 'identifier', placeholder: 'email@example.com or +11234567890' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input value={form[f.key]} placeholder={f.placeholder} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            {[
              { label: 'Type', key: 'type', options: [['email', '📧 Email'], ['whatsapp', '📱 WhatsApp']] },
              { label: 'Role', key: 'role', options: [['owner', 'Owner'], ['pm', 'Project Manager'], ['staff', 'Staff']] },
              { label: 'Language', key: 'language', options: [['en', '🇺🇸 English'], ['pt-BR', '🇧🇷 Português']] },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <select value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
                  {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={add} disabled={!form.identifier}
                style={{ flex: 2, padding: 10, background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                Add to Whitelist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
