// client/src/pages/Settings.jsx
import { useState, useEffect } from 'react';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';

const BASE_TABS = ['Markup', 'Labor Rates', 'Allowances', 'Integrations', 'Bot Behavior', 'Calendar', 'Email Log'];

export default function Settings({ token, userRole }) {
  const TABS = userRole === 'system_admin' ? [...BASE_TABS, 'Secrets', 'Status'] : BASE_TABS;

  const [settings, setSettings] = useState({});
  const [activeTab, setActiveTab] = useState('Markup');
  const [saved, setSaved] = useState(false);
  const [integration, setIntegration] = useState({});
  const [calendars, setCalendars] = useState([]);
  const [calLoading, setCalLoading] = useState(false);
  const [calSaved, setCalSaved] = useState(false);
  const [secrets, setSecrets] = useState([]);
  const [secretsEdited, setSecretsEdited] = useState({});
  const [showValues, setShowValues] = useState({});
  const [secretsSaved, setSecretsSaved] = useState(false);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [statusData, setStatusData]     = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError]   = useState(null);
  const [emailLog, setEmailLog]         = useState(null);
  const [emailLogLoading, setEmailLogLoading] = useState(false);
  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch('/api/settings', { headers: { 'x-auth-token': token } })
      .then(r => r.json()).then(data => {
        if (data && !data.error) setSettings(data);
      });
    fetch('/api/settings/integrations/status', { headers: { 'x-auth-token': token } })
      .then(r => r.json()).then(data => {
        if (data && !data.error) setIntegration(data);
      });
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

  const loadCalendars = async () => {
    setCalLoading(true);
    try {
      const res  = await fetch('/api/tasks/calendars', { headers: { 'x-auth-token': token } });
      const data = await res.json();
      if (res.ok) setCalendars(data.calendars || []);
      else setCalendars([]);
    } catch { setCalendars([]); }
    setCalLoading(false);
  };

  const saveCal = async (calId, enabled) => {
    await fetch('/api/settings', {
      method: 'PUT', headers,
      body: JSON.stringify({ 'gcal.calendarId': calId, 'gcal.enabled': enabled ? 'true' : 'false' })
    });
    setCalSaved(true); setTimeout(() => setCalSaved(false), 2000);
  };

  const switchPlatform = async (platform) => {
    await fetch('/api/settings/integrations/switch', { method: 'POST', headers, body: JSON.stringify({ platform }) });
    setIntegration(prev => ({ ...prev, platform }));
  };

  const renderMarkup = () => {
    const items = settings.markup || [];
    const pricingItems = settings.pricing || [];
    const sqftLow  = pricingItems.find(s => s.key === 'pricing.sqftLow');
    const sqftHigh = pricingItems.find(s => s.key === 'pricing.sqftHigh');
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

        <div style={{ borderTop: '2px solid #e5e7eb', marginTop: 24, paddingTop: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 'bold', color: '#333', marginBottom: 6 }}>Target Price Range (per finished sq ft)</p>
          <p style={{ color: '#888', fontSize: 12, marginBottom: 16 }}>
            Claude will calibrate estimates to land within this range for finished/livable space. Unfinished garages and basements are excluded. A warning is shown on any job that falls outside this range.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Low ($/sqft)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#888' }}>$</span>
                <input type="number" min="100" max="1000" step="5"
                  value={sqftLow ? parseFloat(sqftLow.value) || 320 : 320}
                  onChange={e => sqftLow && update(sqftLow.key, parseFloat(e.target.value))}
                  style={{ width: 80, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, fontWeight: 'bold' }} />
              </div>
            </div>
            <span style={{ fontSize: 18, color: '#888', marginTop: 16 }}>—</span>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>High ($/sqft)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: '#888' }}>$</span>
                <input type="number" min="100" max="1000" step="5"
                  value={sqftHigh ? parseFloat(sqftHigh.value) || 350 : 350}
                  onChange={e => sqftHigh && update(sqftHigh.key, parseFloat(e.target.value))}
                  style={{ width: 80, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, fontWeight: 'bold' }} />
              </div>
            </div>
            <div style={{ marginTop: 16, padding: '6px 12px', background: '#f0f4ff', borderRadius: 6, fontSize: 12, color: BLUE, fontWeight: 500 }}>
              per finished sq ft
            </div>
          </div>
        </div>
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

  const renderCalendar = () => {
    const calItems = settings.calendar || [];
    const calIdSetting  = calItems.find(s => s.key === 'gcal.calendarId');
    const calEnSetting  = calItems.find(s => s.key === 'gcal.enabled');
    const currentCalId  = calIdSetting?.value || 'primary';
    const calEnabled    = calEnSetting?.value !== 'false';

    return (
      <div>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
          Your Google account is connected. Choose which calendar to save tasks and reminders to.
        </p>

        {/* Auto-add toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#fafafa', borderRadius: 8, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: '600', color: '#333' }}>Auto-add tasks to Google Calendar</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>When ON, every task with a due date is instantly added to your Google Calendar</div>
          </div>
          <button
            onClick={() => { update('gcal.enabled', calEnabled ? 'false' : 'true'); }}
            style={{ padding: '6px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 12,
              background: calEnabled ? '#2E7D32' : '#ccc', color: 'white' }}>
            {calEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Calendar picker */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 10 }}>Calendar to use</div>

          {calendars.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {calendars.map(cal => (
                <label key={cal.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  background: currentCalId === cal.id ? '#E3ECFF' : 'white',
                  border: `2px solid ${currentCalId === cal.id ? BLUE : '#eee'}`,
                  borderRadius: 8, cursor: 'pointer' }}>
                  <input type="radio" name="calId" value={cal.id}
                    checked={currentCalId === cal.id}
                    onChange={() => update('gcal.calendarId', cal.id)}
                    style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: '600', color: BLUE }}>
                      {cal.summary} {cal.primary ? '⭐ (Primary)' : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>{cal.id}</div>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div style={{ padding: '14px 16px', background: '#f8f9ff', border: '1px solid #e0e7ff', borderRadius: 8, fontSize: 13, color: '#555' }}>
              {calLoading
                ? '⏳ Loading your calendars...'
                : <span>Click <strong>Load My Calendars</strong> to see all calendars in your Google account.</span>}
            </div>
          )}

          <button onClick={loadCalendars} disabled={calLoading}
            style={{ marginTop: 12, padding: '8px 18px', background: '#4285F4', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
            {calLoading ? 'Loading...' : '📅 Load My Calendars'}
          </button>
        </div>

        {/* Save button */}
        <button onClick={() => saveCal(currentCalId, calEnabled)}
          style={{ padding: '10px 24px', background: calSaved ? '#2E7D32' : BLUE, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>
          {calSaved ? '✅ Saved!' : 'Save Calendar Settings'}
        </button>

        <div style={{ marginTop: 20, background: '#f8f9ff', border: '1px solid #e0e7ff', borderRadius: 8, padding: 14, fontSize: 12, color: '#444' }}>
          <strong>How it works:</strong> When you (or the bot) create a task with a due date, the system automatically adds it directly to the selected Google Calendar — no clicking required. You'll get email and popup reminders 60 and 30 minutes before.
        </div>
      </div>
    );
  };

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

  const loadSecrets = async () => {
    setSecretsLoading(true);
    try {
      const res = await fetch('/api/secrets', { headers: { 'x-auth-token': token } });
      const data = await res.json();
      if (res.ok) { setSecrets(data); setSecretsEdited({}); }
    } catch (e) {}
    setSecretsLoading(false);
  };

  const saveSecrets = async () => {
    if (Object.keys(secretsEdited).length === 0) return;
    const res = await fetch('/api/secrets', { method: 'PUT', headers, body: JSON.stringify(secretsEdited) });
    if (res.ok) {
      setSecrets(prev => prev.map(s => secretsEdited[s.key] !== undefined ? { ...s, value: secretsEdited[s.key] } : s));
      setSecretsEdited({});
      setSecretsSaved(true);
      setTimeout(() => setSecretsSaved(false), 3000);
    }
  };

  const renderSecrets = () => {
    if (secretsLoading) return <div style={{ color: '#888', fontSize: 13 }}>Loading...</div>;
    if (secrets.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>Load your current configuration keys to view or update them.</p>
          <button onClick={loadSecrets}
            style={{ padding: '10px 24px', background: BLUE, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>
            🔑 Load Configuration Keys
          </button>
        </div>
      );
    }

    const groups = [...new Set(secrets.map(s => s.group))];

    return (
      <div>
        <div style={{ background: '#fff8f0', border: `1px solid ${ORANGE}`, borderRadius: 8, padding: 12, fontSize: 12, color: '#5D3A00', marginBottom: 20 }}>
          ⚠️ Changes are saved to your <strong>.env</strong> file and take effect immediately for most settings. API key changes (Claude, Mailgun, Twilio) require a server restart to fully take effect.
        </div>

        {groups.map(group => (
          <div key={group} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#999', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 6 }}>
              {group}
            </div>
            {secrets.filter(s => s.group === group).map(s => {
              const currentVal = secretsEdited[s.key] !== undefined ? secretsEdited[s.key] : s.value;
              const isVisible = showValues[s.key] || s.noMask;
              const isEdited = secretsEdited[s.key] !== undefined;
              return (
                <div key={s.key} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: '600', color: '#444' }}>{s.label}</label>
                    <span style={{ fontSize: 10, color: '#bbb', fontFamily: 'monospace' }}>{s.key}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type={isVisible ? 'text' : 'password'}
                      value={currentVal}
                      onChange={e => setSecretsEdited(prev => ({ ...prev, [s.key]: e.target.value }))}
                      style={{
                        flex: 1, padding: '8px 10px', border: `1px solid ${isEdited ? ORANGE : '#ddd'}`,
                        borderRadius: 6, fontSize: 12, fontFamily: 'monospace',
                        background: isEdited ? '#fff8f0' : 'white'
                      }}
                    />
                    {!s.noMask && (
                      <button
                        onClick={() => setShowValues(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                        style={{ padding: '8px 10px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                        title={isVisible ? 'Hide' : 'Show'}>
                        {isVisible ? '🙈' : '👁'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <button onClick={saveSecrets}
            disabled={Object.keys(secretsEdited).length === 0}
            style={{
              padding: '10px 24px', border: 'none', borderRadius: 8, cursor: Object.keys(secretsEdited).length === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold', fontSize: 13,
              background: secretsSaved ? '#2E7D32' : Object.keys(secretsEdited).length === 0 ? '#ccc' : BLUE,
              color: 'white'
            }}>
            {secretsSaved ? '✅ Saved!' : `Save ${Object.keys(secretsEdited).length > 0 ? `(${Object.keys(secretsEdited).length} changed)` : 'Changes'}`}
          </button>
          <button onClick={loadSecrets}
            style={{ padding: '10px 16px', background: 'white', color: '#888', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
            ↺ Reload
          </button>
        </div>
      </div>
    );
  };

  const loadStatus = async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res  = await fetch('/api/status', { headers: { 'x-auth-token': token } });
      const data = await res.json();
      if (res.ok) {
        setStatusData(data);
      } else if (res.status === 401) {
        setStatusError('Session expired — please log out and log back in.');
      } else if (res.status === 403) {
        setStatusError('Access denied — system admin only.');
      } else {
        setStatusError(data.error || `Error ${res.status}`);
      }
    } catch (e) {
      setStatusError('Could not reach server — ' + e.message);
    }
    setStatusLoading(false);
  };

  const loadEmailLog = async () => {
    setEmailLogLoading(true);
    const res = await fetch('/api/email-log?limit=200', { headers: { 'x-auth-token': token } });
    const data = await res.json();
    setEmailLog(data);
    setEmailLogLoading(false);
  };

  const renderEmailLog = () => {
    if (!emailLog) {
      return (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <button onClick={loadEmailLog} disabled={emailLogLoading}
            style={{ background: BLUE, color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}>
            {emailLogLoading ? 'Loading...' : '📬 Load Email Log'}
          </button>
        </div>
      );
    }
    const { stats, byType, byDay, byMonth, emails } = emailLog;
    const openRate = stats.total > 0 ? Math.round((stats.opened / stats.total) * 100) : 0;

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: BLUE }}>Email Activity</h3>
          <button onClick={loadEmailLog} disabled={emailLogLoading}
            style={{ background: '#eee', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            {emailLogLoading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Today', value: stats.today },
            { label: 'This Month', value: stats.thisMonth },
            { label: 'This Year', value: stats.thisYear },
            { label: 'All Time', value: stats.total },
            { label: 'Open Rate', value: `${openRate}%` },
          ].map(c => (
            <div key={c.label} style={{ background: '#F3F6FC', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: BLUE }}>{c.value}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* By type */}
        {byType.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 'bold', color: '#444', marginBottom: 10 }}>By Type</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {byType.map(t => (
                <div key={t.email_type} style={{ background: '#E8F0FE', borderRadius: 20, padding: '4px 12px', fontSize: 12, color: BLUE }}>
                  {t.email_type} <strong>{t.count}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last 30 days chart */}
        {byDay.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 'bold', color: '#444', marginBottom: 10 }}>Last 30 Days</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60 }}>
              {[...byDay].reverse().map(d => {
                const max = Math.max(...byDay.map(x => x.count), 1);
                const h = Math.max(4, Math.round((d.count / max) * 56));
                return (
                  <div key={d.day} title={`${d.day}: ${d.count}`}
                    style={{ flex: 1, background: BLUE, borderRadius: '2px 2px 0 0', height: h, minWidth: 4 }} />
                );
              })}
            </div>
          </div>
        )}

        {/* Monthly breakdown */}
        {byMonth.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 'bold', color: '#444', marginBottom: 10 }}>Monthly Totals</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F3F6FC' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#555' }}>Month</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#555' }}>Emails Sent</th>
                </tr>
              </thead>
              <tbody>
                {byMonth.map(m => (
                  <tr key={m.month} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 12px' }}>{m.month}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'bold' }}>{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Recent emails */}
        <div>
          <div style={{ fontWeight: 'bold', color: '#444', marginBottom: 10 }}>Recent Emails ({emails.length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F3F6FC' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: '#555' }}>Sent</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: '#555' }}>To</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: '#555' }}>Subject</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: '#555' }}>Type</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: '#555' }}>Opened</th>
                </tr>
              </thead>
              <tbody>
                {emails.map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#666' }}>
                      {new Date(e.sent_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '7px 10px', color: '#333' }}>{e.to_address}</td>
                    <td style={{ padding: '7px 10px', color: '#333' }}>{e.subject}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ background: '#E8F0FE', color: BLUE, borderRadius: 10, padding: '2px 8px', fontSize: 11 }}>
                        {e.email_type}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                      {e.opened_at
                        ? <span title={`Opened ${e.opened_count}x — first: ${new Date(e.opened_at).toLocaleString()}`} style={{ color: '#2E7D32', fontWeight: 'bold' }}>✅ {e.opened_count}×</span>
                        : <span style={{ color: '#aaa' }}>—</span>}
                    </td>
                  </tr>
                ))}
                {emails.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>No emails logged yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderStatus = () => {
    const GREEN_C  = '#2E7D32';
    const RED_C    = '#C62828';
    const GREY_C   = '#888';

    if (!statusData) {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
            Run a live check on all connected services.
          </p>
          <button onClick={loadStatus} disabled={statusLoading}
            style={{ padding: '10px 28px', background: BLUE, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}>
            {statusLoading ? '⏳ Checking...' : '🔍 Run Status Check'}
          </button>
          {statusError && (
            <div style={{ marginTop: 16, padding: '10px 16px', background: '#fff3f3', border: '1px solid #ffcccc', borderRadius: 8, color: '#c00', fontSize: 13 }}>
              {statusError}
            </div>
          )}
        </div>
      );
    }

    const services = Object.values(statusData.services);
    const allOk    = services.every(s => s.ok);
    const okCount  = services.filter(s => s.ok).length;

    return (
      <div>
        {/* Summary bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', borderRadius: 8, marginBottom: 20,
          background: allOk ? '#f0fdf4' : '#fff8f0',
          border: `1px solid ${allOk ? '#bbf7d0' : ORANGE}`
        }}>
          <span style={{ fontSize: 14, fontWeight: 'bold', color: allOk ? GREEN_C : ORANGE }}>
            {allOk ? '✅ All systems operational' : `⚠️ ${okCount} of ${services.length} services OK`}
          </span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#888' }}>
              Checked: {new Date(statusData.checkedAt).toLocaleTimeString()}
            </span>
            <button onClick={loadStatus} disabled={statusLoading}
              style={{ padding: '5px 14px', background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}>
              {statusLoading ? '...' : '↺ Recheck'}
            </button>
          </div>
        </div>

        {/* Service rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {services.map((svc, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              padding: '14px 16px', borderRadius: 8,
              background: svc.ok ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${svc.ok ? '#bbf7d0' : '#fecaca'}`
            }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{svc.ok ? '🟢' : '🔴'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 'bold', color: svc.ok ? GREEN_C : RED_C, marginBottom: 3 }}>
                  {svc.label}
                </div>
                <div style={{ fontSize: 12, color: svc.ok ? '#555' : RED_C }}>
                  {svc.detail}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Alerts summary (last 24h) */}
        {statusData.alertsSummary && (
          <div style={{ borderTop: '1px solid #eee', paddingTop: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: BLUE, marginBottom: 12 }}>
              System Alerts Sent — Last 24 Hours
              <span style={{
                marginLeft: 10, padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 'bold',
                background: statusData.alertsSummary.last24hCount > 0 ? '#fef2f2' : '#f0fdf4',
                color: statusData.alertsSummary.last24hCount > 0 ? RED_C : GREEN_C,
                border: `1px solid ${statusData.alertsSummary.last24hCount > 0 ? '#fecaca' : '#bbf7d0'}`
              }}>
                {statusData.alertsSummary.last24hCount} alert{statusData.alertsSummary.last24hCount !== 1 ? 's' : ''}
              </span>
            </div>
            {statusData.alertsSummary.last24hCount === 0 ? (
              <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: GREEN_C }}>
                ✅ No system alerts fired in the last 24 hours
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {statusData.alertsSummary.last24h.map((alert, i) => (
                  <div key={i} style={{
                    padding: '12px 14px', borderRadius: 8,
                    background: alert.severity === 'critical' ? '#fef2f2' : '#fff8f0',
                    border: `1px solid ${alert.severity === 'critical' ? '#fecaca' : '#f9ddb3'}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 'bold', color: alert.severity === 'critical' ? RED_C : ORANGE }}>
                        {alert.severity === 'critical' ? '🔴' : '🟡'} {alert.source.toUpperCase()} — {alert.severity.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 11, color: '#888' }}>{new Date(alert.ts).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#1B3A6B', fontWeight: 500, marginBottom: 4 }}>{alert.suggestedCause}</div>
                    <div style={{ fontSize: 11, color: '#666', fontFamily: 'monospace', wordBreak: 'break-word' }}>{alert.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent error log */}
        <div style={{ borderTop: '1px solid #eee', paddingTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: BLUE, marginBottom: 12 }}>
            Recent Server Errors
            <span style={{ fontSize: 11, fontWeight: 'normal', color: '#888', marginLeft: 8 }}>
              (last {statusData.recentErrors?.length || 0} captured since last restart)
            </span>
          </div>
          {!statusData.recentErrors?.length ? (
            <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: GREEN_C }}>
              ✅ No errors recorded since last restart
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {statusData.recentErrors.map((err, i) => (
                <div key={i} style={{
                  padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 8, fontFamily: 'monospace'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 'bold', color: RED_C }}>🔴 {err.source}</span>
                    <span style={{ fontSize: 11, color: '#888' }}>{new Date(err.ts).toLocaleTimeString()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#333', wordBreak: 'break-word' }}>{err.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>⚙️ Settings</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a
            href="/api/blank-contract"
            download="PB_Contract_Template_BLANK.docx"
            style={{ background: 'white', color: BLUE, border: `2px solid ${BLUE}`, padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', textDecoration: 'none', fontSize: 14 }}
          >
            ⬇ Blank Contract
          </a>
          {activeTab !== 'Secrets' && activeTab !== 'Status' && (
            <button onClick={save}
              style={{ background: saved ? '#2E7D32' : BLUE, color: 'white', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>
              {saved ? '✅ Saved!' : 'Save Changes'}
            </button>
          )}
        </div>
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
        {activeTab === 'Calendar' && renderCalendar()}
        {activeTab === 'Email Log' && renderEmailLog()}
        {activeTab === 'Secrets' && renderSecrets()}
        {activeTab === 'Status' && renderStatus()}
      </div>
    </div>
  );
}
