// client/src/pages/AdminChat.jsx
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

const BLUE   = '#1B3A6B';
const GREEN  = '#2E7D32';

export default function AdminChat({ token }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hi Jackson! I now have live access to your contacts and jobs, and I can create tasks and reminders for you.\n\nTry asking:\n• "What\'s the phone number for [customer name]?"\n• "What\'s the status of the job at 123 Main St?"\n• "Remind me to call for inspection tomorrow at 5pm for Oak St"\n\nOlá! Pode me perguntar em português também.'
    }
  ]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [language, setLanguage] = useState('en');
  const bottomRef               = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res  = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body:    JSON.stringify({ message: userMsg, language })
      });
      if (res.status === 401) {
        setMessages(prev => [...prev, { role: 'assistant', content: '❌ Session expired. Please refresh and log in again.' }]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error: ' + (data.error || 'Something went wrong.') }]);
        setLoading(false);
        return;
      }

      const newMsg = { role: 'assistant', content: data.reply, createdTask: data.createdTask || null };
      setMessages(prev => [...prev, newMsg]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Connection error. Please try again.' }]);
    }
    setLoading(false);
  };

  const quickPrompts = [
    "What's the phone number for [customer name]?",
    "What's the status of the job at [address]?",
    "Remind me to call for inspection tomorrow at 5pm",
    "What is the Stretch Code requirement for Ashby?",
    "How do I calculate GC markup on a $50K framing job?",
    "Quanto custa revestimento spray foam?",
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 32, boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>🤖 Ask the Bot</h1>
          <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
            Contacts · Jobs · Prices · MA Codes · Reminders — EN & PT-BR
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link to="/tasks"
            style={{ padding: '7px 14px', background: '#f0f4ff', color: BLUE, borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 'bold', border: '1px solid #C8D4E4' }}>
            ✅ View Tasks
          </Link>
          <select value={language} onChange={e => setLanguage(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
            <option value="en">🇺🇸 English</option>
            <option value="pt-BR">🇧🇷 Português</option>
          </select>
        </div>
      </div>

      {/* Quick prompts */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {quickPrompts.map(p => (
          <button key={p} onClick={() => setInput(p)}
            style={{ fontSize: 11, padding: '4px 10px', background: '#E3ECFF', border: '1px solid #1B3A6B33', borderRadius: 20, cursor: 'pointer', color: BLUE }}>
            {p}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', background: 'white', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 14 }}>
        {messages.map((msg, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
              <div style={{
                maxWidth: '78%',
                background: msg.role === 'user' ? BLUE : '#f4f6fb',
                color: msg.role === 'user' ? 'white' : '#222',
                padding: '12px 16px', borderRadius: 12,
                fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap'
              }}>
                {msg.content}
              </div>
            </div>

            {/* Task created card */}
            {msg.createdTask && (
              <div style={{
                margin: '0 0 14px 0',
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: 10, padding: '14px 16px',
                maxWidth: 380
              }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: GREEN, marginBottom: 8 }}>
                  ✅ Task Saved
                </div>
                <div style={{ fontSize: 13, fontWeight: 'bold', color: BLUE, marginBottom: 4 }}>
                  {msg.createdTask.title}
                </div>
                {msg.createdTask.due_at && (
                  <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
                    🕐 {new Date(msg.createdTask.due_at).toLocaleString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link to="/tasks"
                    style={{ padding: '6px 12px', background: BLUE, color: 'white', borderRadius: 6, textDecoration: 'none', fontSize: 11, fontWeight: 'bold' }}>
                    View in Tasks
                  </Link>
                  {msg.createdTask.calendar_url && (
                    <a href={msg.createdTask.calendar_url} target="_blank" rel="noreferrer"
                      style={{ padding: '6px 12px', background: '#4285F422', color: '#4285F4', border: '1px solid #4285F440', borderRadius: 6, textDecoration: 'none', fontSize: 11, fontWeight: 'bold' }}>
                      📅 Add to Google Calendar
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ background: '#f4f6fb', padding: '12px 16px', borderRadius: 12, fontSize: 13, color: '#888' }}>
              <span style={{ display: 'inline-block', animation: 'pulse 1.2s infinite' }}>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={language === 'pt-BR' ? 'Faça sua pergunta...' : "Ask anything — contact info, job status, reminders..."}
          style={{ flex: 1, padding: '12px 16px', border: '1.5px solid #C8D4E4', borderRadius: 8, fontSize: 14, outline: 'none' }}
        />
        <button onClick={send} disabled={loading || !input.trim()}
          style={{ padding: '12px 24px', background: BLUE, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14, opacity: (loading || !input.trim()) ? 0.5 : 1 }}>
          Send
        </button>
      </div>
    </div>
  );
}
