// client/src/pages/Settings.jsx
import { useState, useEffect } from 'react';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';

const TABS = ['Markup', 'Labor Rates', 'Allowances', 'Integrations', 'Bot Behavior'];

export default function Settings({ token }) {
  const [settings, setSettings] = useState({});
  const [activeTab, setActiveTab] = useState('Markup');
  const [saved, setSaved] = useState(false);
  const [integration, setIntegration] = useState({});
  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch('/api/settings', { headers: { 'x-auth-token': token } })
      .then(r => r.json()).then(setSettings);
    fetch('/api/settings/integrations/status', { headers: { 'x-auth-token': token } })
      .then(r => r.json()).then(setIntegration);
  }, []);

  const update = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [Object.keys(prev).find(cat => prev[cat].find(s => s.key === key))]: prev[Object.keys(prev).find(cat => prev[cat].find(s => s.key === key))].map(s => s.key === key ? { ...s, value } : s)
    }));
  };

  const save = async () => {
    const allSettings = {};
    Object.values(settings).flat().forEach(s => { allSettings[s.key] = s.value; });
    await fetch('/api/settings', { method: 'PUT', headers, body: JSON.stringify(allSettings) });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const switchPlatform = async (platform) => {
    await fetch('/api/settings/integrations/switch', { method: 'POST', headers, body: JSON.stringify({ platform }) });
    setIntegration(prev => ({ ...prev, platform }));
  };

  const renderMarkup = () => {
    const items = settings.markup || [];
    return (
      <div>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>These percentages are applied to every estimate automatically.</p>
        {items.map(s => (
          <div key={s.key} style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 'bold', color: '#333', display: 'block', marginBottom: 6 }}>{s.label}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min="0" max="0.5" step="0.01"
                value={parseFloat(s.value) || 0}
                onChange={e => update(s.key, parseFloat(e.target.value))}
                style={{ flex: 1 }} />
              <span style={{ width: 50, textAlign: 'right', fontWeight: 'bold', color: BLUE }}>
                {Math.round((parseFloat(s.value) || 0) * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderLaborRates = () => {
    const items = settings.labor || [];
    return (
      <div>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>Set low and high labor rates by trade. Bot uses the midpoint by default.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: BLUE }}>
              {['Trade', 'Low Rate', 'High Rate', 'Unit'].map(h => (
                <th key={h} style={{ padding: '10px 12px', color: 'white', textAlign: 'left', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((s, i) => {
              const val = typeof s.value === 'object' ? s.value : {};
              return (
                <tr key={s.key} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: '500' }}>{s.label}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="number" value={val.low || 0}
                      onChange={e => update(s.key, { ...val, low: parseFloat(e.target.value) })}
                      style={{ width: 70, padding: 6, border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="number" value={val.high || 0}
                      onChange={e => update(s.key, { ...val, high: parseFloat(e.target.value) })}
                      style={{ width: 70, padding: 6, border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }} />
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#888' }}>${val.unit || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderAllowances = () => {
    const items = settings.allowance || [];
    return (
      <div>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>Contractor-grade allowances — included in every Exhibit A automatically.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: BLUE }}>
              {['Item', 'Amount', 'Unit'].map(h => (
                <th key={h} style={{ padding: '10px 12px', color: 'white', textAlign: 'left', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((s, i) => {
              const val = typeof s.value === 'object' ? s.value : {};
              return (
                <tr key={s.key} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{s.label}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#888' }}>$</span>
                      <input type="number" step="0.01" value={val.amount || 0}
                        onChange={e => update(s.key, { ...val, amount: parseFloat(e.target.value) })}
                        style={{ width: 90, padding: 6, border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }} />
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#888' }}>{val.unit || 'each'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderIntegrations = () => (
    <div>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>Switch between estimation platforms seamlessly. Your data is never affected.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { id: 'hearth', name: 'HEARTH', desc: 'Current platform. Jackson uses Hearth for estimates and invoicing.', cost: '$1,800/yr', configured: integration.hearth?.configured },
          { id: 'wave', name: 'WAVE', desc: 'Free alternative. Switch when ready — same workflow, lower cost.', cost: '$192/yr (API only)', configured: integration.wave?.configured },
        ].map(p => (
          <div key={p.id} style={{
            border: `2px solid ${integration.platform === p.id ? BLUE : '#ddd'}`,
            borderRadius: 10, padding: 20,
            background: integration.platform === p.id ? '#E3ECFF' : 'white'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 'bold', fontSize: 16, color: BLUE }}>{p.name}</span>
              {integration.platform === p.id
                ? <span style={{ background: '#2E7D32', color: 'white', padding: '2px 10px', borderRadius: 20, fontSize: 11 }}>● ACTIVE</span>
                : <span style={{ background: '#eee', color: '#888', padding: '2px 10px', borderRadius: 20, fontSize: 11 }}>STANDBY</span>}
            </div>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{p.desc}</p>
            <p style={{ fontSize: 11, color: ORANGE, fontWeight: 'bold', marginBottom: 12 }}>{p.cost}</p>
            {integration.platform !== p.id && (
              <button onClick={() => switchPlatform(p.id)}
                style={{ width: '100%', padding: 8, background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                Switch to {p.name}
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, background: '#fff8f0', border: `1px solid ${ORANGE}`, borderRadius: 8, padding: 16, fontSize: 12, color: '#5D3A00' }}>
        ⚠️ Switching platforms only affects new estimates going forward. All existing jobs remain in the system unchanged.
      </div>
    </div>
  );

  const renderBotBehavior = () => {
    const items = settings.behavior || [];
    return (
      <div>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>Control how the bot behaves when processing estimates.</p>
        {items.map(s => (
          <div key={s.key} style={{ marginBottom: 16, padding: 14, background: '#fafafa', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: '500', color: '#333' }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{s.key}</div>
            </div>
            {s.value === 'true' || s.value === 'false' || s.value === true || s.value === false ? (
              <button onClick={() => update(s.key, s.value === 'true' || s.value === true ? 'false' : 'true')}
                style={{ padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12,
                  background: (s.value === 'true' || s.value === true) ? '#2E7D32' : '#ccc',
                  color: 'white' }}>
                {(s.value === 'true' || s.value === true) ? 'ON' : 'OFF'}
              </button>
            ) : (
              <input value={s.value || ''} onChange={e => update(s.key, e.target.value)}
                style={{ width: 100, padding: 6, border: '1px solid #ddd', borderRadius: 4, fontSize: 13, textAlign: 'center' }} />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>⚙️ Settings</h1>
        <button onClick={save}
          style={{ background: saved ? '#2E7D32' : BLUE, color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
          {saved ? '✅ Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #eee' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              color: activeTab === tab ? BLUE : '#888',
              borderBottom: activeTab === tab ? `2px solid ${BLUE}` : '2px solid transparent',
              marginBottom: -2 }}>
            {tab}
          </button>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: 10, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        {activeTab === 'Markup' && renderMarkup()}
        {activeTab === 'Labor Rates' && renderLaborRates()}
        {activeTab === 'Allowances' && renderAllowances()}
        {activeTab === 'Integrations' && renderIntegrations()}
        {activeTab === 'Bot Behavior' && renderBotBehavior()}
      </div>
    </div>
  );
}
