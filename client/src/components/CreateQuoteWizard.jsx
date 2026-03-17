import { useState, useEffect, useRef } from 'react';
import { showToast } from '../utils/toast';

const STEPS = ['Contact', 'Job Address', 'Scope of Work', 'Review'];

const inputStyle = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  outline: 'none',
};

const labelStyle = {
  fontSize: 11,
  color: '#555',
  display: 'block',
  marginBottom: 4,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

export default function CreateQuoteWizard({ token, onClose, onSubmitted }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [address, setAddress] = useState({ street: '', city: '', state: '', zip: '' });
  const [scope, setScope] = useState('');

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimeout = useRef(null);
  const nameRef = useRef(null);

  const headers = { 'x-auth-token': token };

  const fetchSuggestions = (query) => {
    clearTimeout(suggestTimeout.current);
    if (!query || query.length < 2) { setSuggestions([]); return; }
    suggestTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts?search=${encodeURIComponent(query)}&limit=6`, { headers });
        const data = await res.json();
        setSuggestions(data.contacts || []);
      } catch { setSuggestions([]); }
    }, 250);
  };

  const applySuggestion = (c) => {
    setContact({ name: c.name || '', phone: c.phone || '', email: c.email || '' });
    if (c.address || c.city || c.state) {
      setAddress(prev => ({
        street: c.address || prev.street,
        city: c.city || prev.city,
        state: c.state || prev.state,
        zip: prev.zip,
      }));
    }
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleNameChange = (val) => {
    setContact(prev => ({ ...prev, name: val }));
    setShowSuggestions(true);
    fetchSuggestions(val);
  };

  useEffect(() => {
    const handler = (e) => {
      if (nameRef.current && !nameRef.current.contains(e.target)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => clearTimeout(suggestTimeout.current);
  }, []);

  const canNext = () => {
    if (step === 0) return contact.name.trim().length > 0;
    if (step === 1) return address.street.trim().length > 0 && address.city.trim().length > 0;
    if (step === 2) return scope.trim().length > 0;
    return true;
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/jobs/wizard', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: contact.name,
          contactPhone: contact.phone,
          contactEmail: contact.email,
          street: address.street,
          city: address.city,
          state: address.state,
          zip: address.zip,
          scopeText: scope,
        }),
      });
      const data = await res.json();
      setBusy(false);
      if (res.ok) {
        showToast('Quote submitted — processing now');
        onSubmitted();
        onClose();
      } else {
        showToast(data.error || 'Error submitting quote', 'error');
      }
    } catch {
      setBusy(false);
      showToast('Network error — please try again', 'error');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div style={{ background: 'white', borderRadius: 14, width: 540, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: '#1B3A6B', fontWeight: 700 }}>Create Quote</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#aaa', lineHeight: 1, marginTop: -2 }}>×</button>
        </div>

        {/* Progress bar */}
        <div style={{ padding: '16px 28px 0' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((label, i) => (
              <div key={label} style={{ flex: 1 }}>
                <div style={{
                  height: 4,
                  borderRadius: 2,
                  background: i <= step ? '#1B3A6B' : '#e5e7eb',
                  transition: 'background 0.2s',
                }} />
                <div style={{ fontSize: 10, color: i === step ? '#1B3A6B' : '#bbb', marginTop: 4, fontWeight: i === step ? 700 : 400, textAlign: 'center' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div style={{ padding: '24px 28px' }}>

          {/* Step 1 — Contact */}
          {step === 0 && (
            <div>
              <div ref={nameRef} style={{ position: 'relative', marginBottom: 14 }}>
                <label style={labelStyle}>Name *</label>
                <input
                  autoFocus
                  value={contact.name}
                  onChange={e => handleNameChange(e.target.value)}
                  onFocus={() => contact.name.length >= 2 && setShowSuggestions(true)}
                  placeholder="e.g. John Smith"
                  style={inputStyle}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
                    border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 10, maxHeight: 200, overflow: 'auto',
                  }}>
                    {suggestions.map(c => (
                      <div
                        key={c.id}
                        onMouseDown={() => applySuggestion(c)}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f5f8ff'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1B3A6B' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                          {[c.phone, c.email].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input value={contact.phone} onChange={e => setContact(p => ({ ...p, phone: e.target.value }))} placeholder="+1 555 000 0000" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input value={contact.email} onChange={e => setContact(p => ({ ...p, email: e.target.value }))} placeholder="john@email.com" type="email" style={inputStyle} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Job Address */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Street *</label>
                <input autoFocus value={address.street} onChange={e => setAddress(p => ({ ...p, street: e.target.value }))} placeholder="123 Main St" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>City *</label>
                  <input value={address.city} onChange={e => setAddress(p => ({ ...p, city: e.target.value }))} placeholder="Boston" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <input value={address.state} onChange={e => setAddress(p => ({ ...p, state: e.target.value }))} placeholder="MA" style={{ ...inputStyle }} />
                </div>
                <div>
                  <label style={labelStyle}>Zip</label>
                  <input value={address.zip} onChange={e => setAddress(p => ({ ...p, zip: e.target.value }))} placeholder="02101" style={inputStyle} />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Scope of Work */}
          {step === 2 && (
            <div>
              <label style={labelStyle}>Scope of Work *</label>
              <p style={{ fontSize: 12, color: '#777', margin: '0 0 8px' }}>
                Describe the work — trades involved, rough scope, any specific materials?
              </p>
              <textarea
                autoFocus
                rows={9}
                value={scope}
                onChange={e => setScope(e.target.value)}
                placeholder={`e.g. 2-story addition — framing, insulation, drywall\nNew kitchen: cabinets, countertops, tile backsplash\nElectrical panel upgrade, mini-split x2\nBudget ~$180,000`}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>
          )}

          {/* Step 4 — Review */}
          {step === 3 && (
            <div>
              <p style={{ fontSize: 13, color: '#555', marginTop: 0, marginBottom: 16 }}>
                Review everything before generating the proposal. Click any section to go back and edit.
              </p>

              {[
                {
                  label: 'Contact',
                  stepIndex: 0,
                  rows: [
                    { key: 'Name', value: contact.name },
                    { key: 'Phone', value: contact.phone || '—' },
                    { key: 'Email', value: contact.email || '—' },
                  ],
                },
                {
                  label: 'Job Address',
                  stepIndex: 1,
                  rows: [
                    { key: 'Street', value: address.street },
                    { key: 'City', value: address.city },
                    { key: 'State', value: address.state || '—' },
                    { key: 'Zip', value: address.zip || '—' },
                  ],
                },
                {
                  label: 'Scope of Work',
                  stepIndex: 2,
                  rows: [{ key: '', value: scope }],
                },
              ].map(section => (
                <div key={section.label} style={{ background: '#f8f9fc', borderRadius: 8, padding: '14px 16px', marginBottom: 12, border: '1px solid #e8eaf0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1B3A6B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{section.label}</span>
                    <button
                      onClick={() => setStep(section.stepIndex)}
                      style={{ background: 'none', border: 'none', fontSize: 11, color: '#1B3A6B', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      Edit
                    </button>
                  </div>
                  {section.rows.map(row => (
                    <div key={row.key} style={{ fontSize: 13, color: '#333', marginBottom: row.key ? 4 : 0, whiteSpace: row.key ? 'normal' : 'pre-wrap' }}>
                      {row.key ? <><span style={{ color: '#888', marginRight: 6 }}>{row.key}:</span>{row.value}</> : row.value}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div style={{ padding: '0 28px 24px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <button
            onClick={step === 0 ? onClose : () => setStep(s => s - 1)}
            style={{ padding: '10px 20px', border: '1px solid #ddd', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13, color: '#555' }}
          >
            {step === 0 ? 'Cancel' : '← Back'}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              style={{
                padding: '10px 24px', borderRadius: 6, border: 'none', cursor: canNext() ? 'pointer' : 'not-allowed',
                background: canNext() ? '#1B3A6B' : '#c5ccd8', color: 'white', fontWeight: 700, fontSize: 13,
              }}
            >
              Next →
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy}
              style={{
                padding: '10px 24px', borderRadius: 6, border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
                background: busy ? '#888' : '#1B3A6B', color: 'white', fontWeight: 700, fontSize: 14,
              }}
            >
              {busy ? '⏳ Generating...' : '🤖 Generate Proposal'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
