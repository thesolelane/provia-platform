// client/src/pages/Agents.jsx
import { useState, useEffect, useRef } from 'react';

const BLUE   = '#1B3A6B';
const ORANGE = '#E07B2A';

function statusDot(online) {
  return (
    <span style={{
      display: 'inline-block',
      width: 10, height: 10,
      borderRadius: '50%',
      background: online ? '#43a047' : '#bdbdbd',
      boxShadow: online ? '0 0 6px #43a04790' : 'none',
      flexShrink: 0,
    }} title={online ? 'Online' : 'Offline'} />
  );
}

function fmtDate(s) {
  if (!s) return 'Never';
  return new Date(s).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function Agents({ token, userRole }) {
  const [agents, setAgents]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);
  const selectedRef = useRef(null);

  const isAdminOrPm = ['admin', 'pm', 'system_admin'].includes(userRole);

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    if (!isAdminOrPm) return;

    const es = new EventSource(`/api/agents/events?token=${token}`);

    es.addEventListener('agent_message', (e) => {
      const msg = JSON.parse(e.data);
      const sel = selectedRef.current;
      if (sel && msg.agentId === sel.id) {
        setMessages(prev => [...prev, msg]);
      } else {
        setAgents(prev => prev.map(a => a.id === msg.agentId ? { ...a, _unread: (a._unread || 0) + 1 } : a));
      }
    });

    es.addEventListener('agent_status', (e) => {
      const { agentId } = JSON.parse(e.data);
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, online: true, last_seen: new Date().toISOString() } : a));
    });

    es.onerror = () => es.close();
    return () => es.close();
  }, [isAdminOrPm, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadAgents() {
    setLoading(true);
    try {
      const r = await fetch('/api/agents', { headers: { 'x-auth-token': token } });
      if (r.ok) {
        const data = await r.json();
        setAgents(data.agents || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function openThread(agent) {
    setSelected(agent);
    setMessages([]);
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, _unread: 0 } : a));
    try {
      const r = await fetch(`/api/agents/${agent.id}/messages`, { headers: { 'x-auth-token': token } });
      if (r.ok) {
        const data = await r.json();
        setMessages(data.messages || []);
      }
    } catch { /* ignore */ }
  }

  async function sendMessage() {
    if (!input.trim() || !selected || sending) return;
    setSending(true);
    const text = input.trim();
    setInput('');
    try {
      const r = await fetch(`/api/agents/${selected.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ message: text }),
      });
      if (r.ok) {
        const data = await r.json();
        if (data.message) setMessages(prev => [...prev, data.message]);
      }
    } catch { /* ignore */ }
    setSending(false);
  }

  if (!isAdminOrPm) {
    return (
      <div style={{ padding: 32, color: '#888' }}>
        You do not have permission to view this page.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif', background: '#f4f6fb' }}>

      {/* Left panel: agent cards */}
      <div style={{ width: 280, background: 'white', borderRight: '1px solid #e0e7ef', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid #e0e7ef' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 'bold', color: BLUE }}>🤖 Agents</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>Marbilism AI connections</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
          {loading && (
            <div style={{ padding: 20, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Loading…</div>
          )}
          {!loading && agents.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#aaa', fontSize: 13 }}>No agents configured.</div>
          )}
          {agents.map(a => (
            <button
              key={a.id}
              onClick={() => openThread(a)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 14px', marginBottom: 6,
                background: selected?.id === a.id ? '#e8f0fe' : '#f8f9fb',
                border: `1.5px solid ${selected?.id === a.id ? BLUE : '#e0e7ef'}`,
                borderRadius: 10, cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {statusDot(a.online)}
                <span style={{ fontWeight: 'bold', fontSize: 13, color: BLUE, flex: 1 }}>{a.name}</span>
                {a._unread > 0 && (
                  <span style={{ background: ORANGE, color: 'white', borderRadius: 10, fontSize: 10, padding: '1px 7px', fontWeight: 'bold' }}>
                    {a._unread}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {a.online ? 'Online' : `Last seen: ${fmtDate(a.last_seen)}`}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                {a.request_count} request{a.request_count !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid #e0e7ef' }}>
          <button
            onClick={loadAgents}
            style={{ width: '100%', padding: '8px', background: '#f0f4ff', border: `1px solid ${BLUE}44`, borderRadius: 6, color: BLUE, fontSize: 12, cursor: 'pointer', fontWeight: 'bold' }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Right panel: thread or placeholder */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#bbb' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
            <div style={{ fontSize: 15 }}>Select an agent to open its chat thread</div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div style={{ padding: '14px 20px', background: 'white', borderBottom: '1px solid #e0e7ef', display: 'flex', alignItems: 'center', gap: 10 }}>
              {statusDot(selected.online)}
              <div>
                <div style={{ fontWeight: 'bold', fontSize: 15, color: BLUE }}>{selected.name}</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {selected.online ? 'Online now' : `Last seen ${fmtDate(selected.last_seen)}`}
                  {selected.callback_url && <span style={{ marginLeft: 8, color: '#aaa' }}>· {selected.callback_url}</span>}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, marginTop: 40 }}>
                  No messages yet. Say hello!
                </div>
              )}
              {messages.map((msg, i) => {
                const isOutbound = msg.direction === 'outbound';
                return (
                  <div key={msg.id || i} style={{ display: 'flex', justifyContent: isOutbound ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '72%', padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.55,
                      background: isOutbound ? BLUE : '#f0f4fb',
                      color: isOutbound ? 'white' : '#222',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.message}
                      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 5, textAlign: isOutbound ? 'right' : 'left' }}>
                        {fmtDate(msg.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Compose */}
            <div style={{ padding: '12px 16px', background: 'white', borderTop: '1px solid #e0e7ef', display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder={`Message ${selected.name}…`}
                style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #C8D4E4', borderRadius: 8, fontSize: 13, outline: 'none' }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                style={{
                  padding: '10px 20px', background: BLUE, color: 'white', border: 'none',
                  borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 13,
                  opacity: (!input.trim() || sending) ? 0.5 : 1, flexShrink: 0,
                }}
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
