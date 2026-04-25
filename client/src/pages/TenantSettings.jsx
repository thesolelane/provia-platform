import { useState, useEffect, useCallback } from 'react';

const BLUE = '#2F5A7E';
const DARK = '#163853';
const ORANGE = '#FF9500';

const INTEGRATIONS = [
  {
    key: 'hearth',
    label: 'Hearth',
    category: 'Estimation',
    fields: [{ name: 'HEARTH_ACCOUNT_ID', label: 'Account ID' }],
  },
  {
    key: 'wave',
    label: 'Wave',
    category: 'Estimation',
    fields: [{ name: 'WAVE_API_KEY', label: 'API Key' }],
  },
  {
    key: 'eagleview',
    label: 'EagleView',
    category: 'Measurements',
    fields: [
      { name: 'EAGLEVIEW_CLIENT_ID', label: 'Client ID' },
      { name: 'EAGLEVIEW_CLIENT_SECRET', label: 'Client Secret' },
    ],
  },
  {
    key: 'hover',
    label: 'Hover',
    category: 'Measurements',
    fields: [
      { name: 'HOVER_CLIENT_ID', label: 'Client ID' },
      { name: 'HOVER_CLIENT_SECRET', label: 'Client Secret' },
      { name: 'HOVER_ACCESS_TOKEN', label: 'Access Token' },
    ],
  },
  {
    key: 'google_solar',
    label: 'Google Solar / Maps',
    category: 'Measurements',
    fields: [{ name: 'GOOGLE_MAPS_API_KEY', label: 'API Key' }],
  },
  {
    key: 'building_footprints',
    label: 'Building Footprints',
    category: 'Measurements',
    fields: [],
    noKey: true,
  },
  {
    key: 'twilio',
    label: 'Twilio SMS',
    category: 'Communication',
    fields: [
      { name: 'TWILIO_ACCOUNT_SID', label: 'Account SID' },
      { name: 'TWILIO_AUTH_TOKEN', label: 'Auth Token' },
      { name: 'TWILIO_PHONE_NUMBER', label: 'Phone Number' },
    ],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    category: 'Communication',
    fields: [{ name: 'TWILIO_WHATSAPP_NUMBER', label: 'WhatsApp Number' }],
  },
  {
    key: 'google_calendar',
    label: 'Google Calendar',
    category: 'Communication',
    fields: [],
    connectButton: true,
  },
  {
    key: 'perplexity',
    label: 'Perplexity (Web Search)',
    category: 'AI',
    fields: [{ name: 'PERPLEXITY_API_KEY', label: 'API Key' }],
  },
];

const AI_MODELS = [
  { value: 'claude-sonnet', label: 'Claude Sonnet', note: 'Recommended' },
  { value: 'claude-haiku', label: 'Claude Haiku', note: 'Faster, lower cost' },
  { value: 'claude-opus', label: 'Claude Opus', note: 'Most powerful' },
  { value: 'bob', label: 'BOB (Local)', note: 'Platform AI — private' },
];

const MARKUP_FIELDS = [
  { key: 'markup.subOandP', label: 'Sub O&P', pct: true },
  { key: 'markup.gcOandP', label: 'GC O&P', pct: true },
  { key: 'markup.contingency', label: 'Contingency', pct: true },
  { key: 'markup.deposit', label: 'Deposit', pct: true },
];

export default function TenantSettings({ token }) {
  const [account, setAccount] = useState({ features: {}, secrets: {}, tenant: {} });
  const [settings, setSettings] = useState({});
  const [secretInputs, setSecretInputs] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const [emailLog, setEmailLog] = useState([]);
  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    const [acctRes, settingsRes, emailRes] = await Promise.all([
      fetch('/api/tenant/account', { headers }),
      fetch('/api/settings', { headers }),
      fetch('/api/email-log?limit=30', { headers }),
    ]);
    if (acctRes.ok) setAccount(await acctRes.json());
    if (settingsRes.ok) {
      const data = await settingsRes.json();
      const map = {};
      for (const s of data.settings || []) map[s.key] = s.value;
      setSettings(map);
    }
    if (emailRes.ok) {
      const d = await emailRes.json();
      setEmailLog(d.emails || d.log || []);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  const flash = (key) => {
    setSaved((s) => ({ ...s, [key]: true }));
    setTimeout(() => setSaved((s) => ({ ...s, [key]: false })), 2000);
  };

  const saveFeature = async (key, value) => {
    setSaving((s) => ({ ...s, [key]: true }));
    await fetch('/api/tenant/account/features', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ [key]: value }),
    });
    setAccount((a) => ({ ...a, features: { ...a.features, [key]: String(value) } }));
    setSaving((s) => ({ ...s, [key]: false }));
    flash(key);
  };

  const saveSecret = async (secretKey) => {
    const val = secretInputs[secretKey];
    if (!val) return;
    setSaving((s) => ({ ...s, [secretKey]: true }));
    await fetch(`/api/tenant/secret/${secretKey}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ value: val }),
    });
    setAccount((a) => ({ ...a, secrets: { ...a.secrets, [secretKey]: true } }));
    setSecretInputs((i) => ({ ...i, [secretKey]: '' }));
    setSaving((s) => ({ ...s, [secretKey]: false }));
    flash(secretKey);
  };

  const saveSetting = async (key, value) => {
    setSaving((s) => ({ ...s, [key]: true }));
    await fetch(`/api/settings/${key}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ value }),
    });
    setSettings((s) => ({ ...s, [key]: value }));
    setSaving((s) => ({ ...s, [key]: false }));
    flash(key);
  };

  const feat = (key) => account.features[key] === 'true' || account.features[key] === '1';

  const sec = { padding: '28px 0', borderBottom: '1px solid #e8edf2' };
  const sectionTitle = {
    fontSize: 13,
    fontWeight: 700,
    color: ORANGE,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  };
  const card = {
    background: 'white',
    border: '1px solid #e8edf2',
    borderRadius: 10,
    padding: '14px 16px',
    marginBottom: 10,
  };
  const input = {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
  };
  const btn = (active) => ({
    padding: '7px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    background: active ? BLUE : '#f1f5f9',
    color: active ? 'white' : '#666',
  });

  const categories = [...new Set(INTEGRATIONS.map((i) => i.category))];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 60px' }}>
      {/* ACCOUNT */}
      <div style={sec}>
        <div style={sectionTitle}>Account</div>
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Company</div>
              <div style={{ fontWeight: 600, color: DARK }}>{account.tenant?.name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Account Number</div>
              <div style={{ fontWeight: 600, color: DARK, fontFamily: 'monospace' }}>
                {account.tenant?.id || '—'}
              </div>
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: 13, color: DARK, marginBottom: 12 }}>
            Support Verification
          </div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
            Contacts authorized to submit support requests on your account.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input style={{ ...input, flex: 1 }} placeholder="Authorized email address" />
            <button style={btn(true)}>Add</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...input, flex: 1 }} placeholder="Authorized phone number" />
            <button style={btn(true)}>Add</button>
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: DARK, fontWeight: 600 }}>Support PIN</span>
            <input
              style={{ ...input, width: 140 }}
              type="password"
              placeholder="Set 6-digit PIN"
              maxLength={6}
              onChange={(e) => saveFeature('support_pin', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* AI MODEL */}
      <div style={sec}>
        <div style={sectionTitle}>AI Model</div>
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {AI_MODELS.map((m) => (
              <label
                key={m.value}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="ai_model"
                  value={m.value}
                  checked={(account.features.ai_model || 'claude-sonnet') === m.value}
                  onChange={() => saveFeature('ai_model', m.value)}
                  style={{ accentColor: BLUE }}
                />
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13, color: DARK }}>{m.label}</span>
                  <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{m.note}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* INTEGRATIONS */}
      <div style={sec}>
        <div style={sectionTitle}>Integrations</div>
        {categories.map((cat) => (
          <div key={cat}>
            <div
              style={{
                fontSize: 11,
                color: '#aaa',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 8,
                marginTop: 14,
              }}
            >
              {cat}
            </div>
            {INTEGRATIONS.filter((i) => i.category === cat).map((intg) => {
              const enabled = feat(intg.key);
              return (
                <div
                  key={intg.key}
                  style={{
                    ...card,
                    borderLeft: enabled ? `3px solid ${BLUE}` : '3px solid transparent',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => saveFeature(intg.key, e.target.checked)}
                        style={{ accentColor: BLUE, width: 16, height: 16 }}
                        disabled={intg.noKey}
                      />
                      <span style={{ fontWeight: 600, fontSize: 13, color: DARK }}>
                        {intg.label}
                      </span>
                    </label>
                    {intg.noKey && (
                      <span
                        style={{
                          fontSize: 11,
                          color: '#888',
                          background: '#f0fdf4',
                          padding: '2px 8px',
                          borderRadius: 10,
                        }}
                      >
                        No key needed
                      </span>
                    )}
                    {saved[intg.key] && (
                      <span style={{ fontSize: 11, color: '#166534' }}>Saved</span>
                    )}
                  </div>

                  {enabled && intg.fields.length > 0 && (
                    <div
                      style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
                    >
                      {intg.fields.map((f) => (
                        <div key={f.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ width: 140, fontSize: 12, color: '#888', flexShrink: 0 }}>
                            {f.label}
                            {account.secrets[f.name] && (
                              <span style={{ marginLeft: 6, fontSize: 10, color: '#166534' }}>
                                ✓ Set
                              </span>
                            )}
                          </div>
                          <input
                            style={{ ...input, flex: 1 }}
                            type="password"
                            placeholder={account.secrets[f.name] ? '••••••••' : 'Enter value'}
                            value={secretInputs[f.name] || ''}
                            onChange={(e) =>
                              setSecretInputs((i) => ({ ...i, [f.name]: e.target.value }))
                            }
                          />
                          <button
                            onClick={() => saveSecret(f.name)}
                            disabled={!secretInputs[f.name] || saving[f.name]}
                            style={btn(!!secretInputs[f.name])}
                          >
                            {saved[f.name] ? '✓' : 'Save'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {enabled && intg.connectButton && (
                    <div style={{ marginTop: 12 }}>
                      <button style={btn(true)}>Connect Google Account</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* RATES & ALLOWANCES */}
      <div style={sec}>
        <div style={sectionTitle}>Rates & Allowances</div>
        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: 13, color: DARK, marginBottom: 12 }}>Markup</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {MARKUP_FIELDS.map((f) => (
              <div key={f.key}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{f.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    style={{ ...input, width: 80 }}
                    type="number"
                    step="0.01"
                    value={
                      f.pct
                        ? Math.round(parseFloat(settings[f.key] || 0) * 100)
                        : settings[f.key] || ''
                    }
                    onChange={(e) => {
                      const val = f.pct ? String(parseFloat(e.target.value) / 100) : e.target.value;
                      setSettings((s) => ({ ...s, [f.key]: val }));
                    }}
                    onBlur={(e) => {
                      const val = f.pct ? String(parseFloat(e.target.value) / 100) : e.target.value;
                      saveSetting(f.key, val);
                    }}
                  />
                  {f.pct && <span style={{ fontSize: 13, color: '#888' }}>%</span>}
                  {saved[f.key] && <span style={{ fontSize: 11, color: '#166534' }}>✓</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HARDWARE */}
      <div style={sec}>
        <div style={sectionTitle}>Hardware</div>
        <div style={card}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: DARK, marginBottom: 6 }}>
              Default Printer
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...input, flex: 1 }}
                placeholder="e.g. HP77ED59"
                value={settings['hardware.printer'] || ''}
                onChange={(e) => setSettings((s) => ({ ...s, 'hardware.printer': e.target.value }))}
                onBlur={(e) => saveSetting('hardware.printer', e.target.value)}
              />
              {saved['hardware.printer'] && (
                <span style={{ fontSize: 11, color: '#166534', alignSelf: 'center' }}>✓</span>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: DARK, marginBottom: 6 }}>
              Scanner Inbox Folder
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...input, flex: 1 }}
                placeholder="e.g. C:\Users\scan_inbox"
                value={settings['hardware.scan_folder'] || ''}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, 'hardware.scan_folder': e.target.value }))
                }
                onBlur={(e) => saveSetting('hardware.scan_folder', e.target.value)}
              />
              {saved['hardware.scan_folder'] && (
                <span style={{ fontSize: 11, color: '#166534', alignSelf: 'center' }}>✓</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* EMAIL LOG */}
      <div style={{ paddingTop: 28 }}>
        <div style={sectionTitle}>Email Log</div>
        <div style={card}>
          {emailLog.length === 0 && (
            <div style={{ color: '#888', fontSize: 13 }}>No emails in the last 30 days.</div>
          )}
          {emailLog.slice(0, 20).map((e, i) => (
            <div
              key={i}
              style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, color: DARK }}>{e.subject || e.to || '—'}</span>
                <span style={{ color: '#888' }}>
                  {new Date(e.created_at || e.sent_at).toLocaleDateString()}
                </span>
              </div>
              {e.to && <div style={{ color: '#888', marginTop: 2 }}>To: {e.to}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
