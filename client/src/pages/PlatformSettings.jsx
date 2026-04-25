import { useState, useEffect, useCallback } from 'react';

const BLUE = '#2F5A7E';
const DARK = '#163853';
const ORANGE = '#FF9500';

const TABS = ['Services', 'Feature Flags', 'Security', 'Platform Config'];

const FLAG_DEFS = [
  {
    key: 'self_onboarding',
    label: 'Self-Onboarding',
    desc: 'Allow contractors to sign up without an invite',
  },
  {
    key: 'new_tenants',
    label: 'New Tenant Creation',
    desc: 'Allow new tenants to be created (onboarding or admin)',
  },
  { key: 'ai_enabled', label: 'AI / Claude', desc: 'Enable AI features platform-wide' },
  { key: 'sms_enabled', label: 'SMS (Twilio)', desc: 'Enable SMS sending platform-wide' },
  { key: 'whatsapp_enabled', label: 'WhatsApp', desc: 'Enable WhatsApp messaging platform-wide' },
  { key: 'email_enabled', label: 'Email', desc: 'Enable outbound email platform-wide' },
  { key: 'signing_enabled', label: 'E-Signing', desc: 'Enable contract signing platform-wide' },
  {
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    desc: 'Show maintenance banner to all tenants',
    danger: true,
  },
];

export default function PlatformSettings({ token }) {
  const [tab, setTab] = useState('Services');
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [flags, setFlags] = useState({});
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [toggling, setToggling] = useState({});
  const [msg, setMsg] = useState(null);
  const [ips, setIps] = useState([]);
  const [myIp, setMyIp] = useState('');
  const [newIp, setNewIp] = useState('');
  const [ipBusy, setIpBusy] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/admin/health', { headers });
      if (res.ok) setHealth(await res.json());
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadFlags = useCallback(async () => {
    setFlagsLoading(true);
    try {
      const res = await fetch('/api/admin/flags', { headers });
      if (res.ok) {
        const data = await res.json();
        setFlags(data.flags);
      }
    } finally {
      setFlagsLoading(false);
    }
  }, []);

  const loadSecurity = useCallback(async () => {
    const [ipRes, auditRes] = await Promise.all([
      fetch('/api/admin/security/ips', { headers }),
      fetch('/api/admin/audit?limit=50', { headers }),
    ]);
    if (ipRes.ok) {
      const d = await ipRes.json();
      setIps(d.ips);
      setMyIp(d.myIp);
    }
    if (auditRes.ok) {
      const d = await auditRes.json();
      setAuditLog(d.entries);
    }
  }, []);

  useEffect(() => {
    if (tab === 'Services') loadHealth();
    if (tab === 'Feature Flags') loadFlags();
    if (tab === 'Security') loadSecurity();
  }, [tab]);

  const toggleFlag = async (key, current) => {
    setToggling((t) => ({ ...t, [key]: true }));
    try {
      const res = await fetch('/api/admin/flags', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ key, value: !current }),
      });
      if (res.ok) {
        setFlags((f) => ({ ...f, [key]: !current }));
        setMsg({ type: 'ok', text: `${key} ${!current ? 'enabled' : 'disabled'}` });
        setTimeout(() => setMsg(null), 3000);
      }
    } finally {
      setToggling((t) => ({ ...t, [key]: false }));
    }
  };

  const card = (style = {}) => ({
    background: 'white',
    borderRadius: 10,
    padding: '16px 20px',
    marginBottom: 14,
    border: '1px solid #e8edf2',
    ...style,
  });

  const renderServices = () => {
    if (!health && !healthLoading) {
      return (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <button
            onClick={loadHealth}
            style={{
              padding: '10px 28px',
              background: BLUE,
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Run Health Check
          </button>
        </div>
      );
    }
    if (healthLoading)
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Checking services…</div>
      );

    const services = Object.entries(health.services);
    const allOk = services.every(([, s]) => s.ok);

    return (
      <div>
        <div
          style={{
            ...card(),
            background: allOk ? '#f0fdf4' : '#fff8f0',
            border: `1px solid ${allOk ? '#86efac' : ORANGE}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 'bold', color: allOk ? '#166534' : ORANGE, fontSize: 14 }}>
            {allOk
              ? '✅ All systems operational'
              : `⚠️ ${services.filter(([, s]) => s.ok).length} of ${services.length} services OK`}
          </span>
          <span style={{ fontSize: 11, color: '#888' }}>
            Uptime: {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
          </span>
        </div>

        {services.map(([key, svc]) => (
          <div
            key={key}
            style={{
              ...card(),
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: DARK }}>{svc.label}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{key}</div>
            </div>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                background: svc.ok ? '#dcfce7' : '#fee2e2',
                color: svc.ok ? '#166534' : '#991b1b',
              }}
            >
              {svc.ok ? 'Online' : 'Offline'}
            </span>
          </div>
        ))}

        <div style={{ ...card(), background: '#f8fafc' }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Platform Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {Object.entries(health.stats).map(([k, v]) => (
              <div key={k} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: BLUE }}>{v}</div>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'capitalize' }}>{k}</div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={loadHealth}
          style={{
            padding: '8px 20px',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Refresh
        </button>
      </div>
    );
  };

  const renderFlags = () => {
    if (flagsLoading)
      return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading…</div>;
    return (
      <div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
          These toggles take effect immediately — no redeploy needed.
        </p>
        {FLAG_DEFS.map((f) => {
          const on = !!flags[f.key];
          const busy = !!toggling[f.key];
          return (
            <div
              key={f.key}
              style={{
                ...card(),
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderLeft: f.danger ? `4px solid #ef4444` : undefined,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: f.danger ? '#991b1b' : DARK }}>
                  {f.label}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{f.desc}</div>
              </div>
              <button
                disabled={busy}
                onClick={() => toggleFlag(f.key, on)}
                style={{
                  width: 52,
                  height: 28,
                  borderRadius: 14,
                  border: 'none',
                  cursor: busy ? 'wait' : 'pointer',
                  background: on ? (f.danger ? '#ef4444' : BLUE) : '#cbd5e1',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: 'white',
                    transition: 'left 0.2s',
                    left: on ? 28 : 4,
                  }}
                />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const addIp = async (ip) => {
    setIpBusy(true);
    const res = await fetch('/api/admin/security/ips', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ip }),
    });
    if (res.ok) {
      const d = await res.json();
      setIps(d.ips);
      setNewIp('');
    }
    setIpBusy(false);
  };

  const removeIp = async (ip) => {
    setIpBusy(true);
    const res = await fetch('/api/admin/security/ips', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ ip }),
    });
    if (res.ok) {
      const d = await res.json();
      setIps(d.ips);
    }
    setIpBusy(false);
  };

  const renderSecurity = () => (
    <div>
      <div style={card()}>
        <div style={{ fontWeight: 700, fontSize: 14, color: DARK, marginBottom: 12 }}>
          Allowed IP Addresses
        </div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
          Only these IPs can access admin routes. Local network (192.168.x.x) is always allowed.
          Your current IP: <strong>{myIp || '—'}</strong>
        </p>
        {ips.length === 0 && (
          <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
            No IPs added — only local network has access.
          </div>
        )}
        {ips.map((ip) => (
          <div
            key={ip}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{ip}</span>
            <button
              onClick={() => removeIp(ip)}
              disabled={ipBusy}
              style={{
                background: 'none',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            placeholder="e.g. 203.0.113.42"
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: 13,
            }}
          />
          <button
            onClick={() => newIp && addIp(newIp)}
            disabled={ipBusy || !newIp}
            style={{
              padding: '8px 16px',
              background: BLUE,
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Add
          </button>
          {myIp && !ips.includes(myIp) && (
            <button
              onClick={() => addIp(myIp)}
              disabled={ipBusy}
              style={{
                padding: '8px 16px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Add My IP
            </button>
          )}
        </div>
      </div>

      <div style={card()}>
        <div style={{ fontWeight: 700, fontSize: 14, color: DARK, marginBottom: 4 }}>
          Rate Limiting
        </div>
        <div style={{ fontSize: 13, color: '#888' }}>
          Active on all routes — configured in server.
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            ['Login attempts', '10 per 15 min per IP'],
            ['API requests', '300 per min per IP'],
            ['Webhooks', '60 per min per IP'],
          ].map(([label, val]) => (
            <div
              key={label}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
            >
              <span style={{ color: DARK }}>{label}</span>
              <span style={{ color: '#888', fontFamily: 'monospace' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={card()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, color: DARK }}>Audit Log</div>
          <button
            onClick={loadSecurity}
            style={{
              fontSize: 12,
              padding: '4px 12px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
        {auditLoading && <div style={{ color: '#888', fontSize: 13 }}>Loading…</div>}
        {auditLog.length === 0 && !auditLoading && (
          <div style={{ color: '#888', fontSize: 13 }}>No audit entries yet.</div>
        )}
        {auditLog.map((e) => (
          <div
            key={e.id}
            style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: DARK }}>{e.action}</span>
              <span style={{ color: '#888' }}>{new Date(e.created_at).toLocaleString()}</span>
            </div>
            {e.details && <div style={{ color: '#888', marginTop: 2 }}>{e.details}</div>}
            {e.performed_by && (
              <div style={{ color: '#aaa', marginTop: 1 }}>by {e.performed_by}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderConfig = () => (
    <div style={{ color: '#888', fontSize: 14, padding: 20 }}>
      Platform-wide configuration (domain, branding, SMTP defaults) — coming soon.
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: DARK, fontSize: 22, fontWeight: 700 }}>Platform Settings</h2>
        <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>
          System-wide controls — changes apply to all tenants
        </p>
      </div>

      {msg && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            background: msg.type === 'ok' ? '#f0fdf4' : '#fef2f2',
            color: msg.type === 'ok' ? '#166534' : '#991b1b',
            border: `1px solid ${msg.type === 'ok' ? '#86efac' : '#fca5a5'}`,
          }}
        >
          {msg.text}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 24,
          borderBottom: '2px solid #e8edf2',
          paddingBottom: 0,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 18px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? BLUE : '#666',
              background: 'none',
              fontSize: 14,
              borderBottom: tab === t ? `3px solid ${BLUE}` : '3px solid transparent',
              marginBottom: -2,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Services' && renderServices()}
      {tab === 'Feature Flags' && renderFlags()}
      {tab === 'Security' && renderSecurity()}
      {tab === 'Platform Config' && renderConfig()}
    </div>
  );
}
