// client/src/pages/AdminChat.jsx
import { useState, useRef, useEffect } from 'react';

export default function AdminChat({ token }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '👋 Hi! I\'m the Preferred Builders AI. Ask me anything — pricing, MA building codes, scope questions, how to fill out an estimate, or anything about your projects.\n\n*Olá Jackson! Pode me perguntar em português também.*' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('en');
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ message: userMsg, language })
      });
      if (res.status === 401) {
        setMessages(prev => [...prev, { role: 'assistant', content: '❌ Session expired. Please refresh the page and log in again.' }]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: '❌ Error: ' + (data.error || 'Something went wrong. Please try again.') }]);
        setLoading(false);
        return;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Connection error. Please try again.' }]);
    }
    setLoading(false);
  };

  const quickPrompts = [
    'What is the Stretch Code requirement for Ashby?',
    'Quanto custa revestimento spray foam?',
    'What framing do I need for a metal roof at 3:12?',
    'What are the standard MA contract legal requirements?',
    'How do I calculate GC markup on a $50K framing job?',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 32, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', color: '#1B3A6B', margin: 0 }}>🤖 Ask the Bot</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Pricing questions, MA codes, scope guidance — EN & PT-BR</p>
        </div>
        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
        >
          <option value="en">🇺🇸 English</option>
          <option value="pt-BR">🇧🇷 Português</option>
        </select>
      </div>

      {/* Quick prompts */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {quickPrompts.map(p => (
          <button key={p} onClick={() => { setInput(p); }}
            style={{ fontSize: 11, padding: '4px 10px', background: '#E3ECFF', border: '1px solid #1B3A6B33', borderRadius: 20, cursor: 'pointer', color: '#1B3A6B' }}>
            {p}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', background: 'white', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
            <div style={{
              maxWidth: '75%',
              background: msg.role === 'user' ? '#1B3A6B' : '#f4f6fb',
              color: msg.role === 'user' ? 'white' : '#222',
              padding: '12px 16px', borderRadius: 12,
              fontSize: 13, lineHeight: 1.6,
              whiteSpace: 'pre-wrap'
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
            <div style={{ background: '#f4f6fb', padding: '12px 16px', borderRadius: 12, fontSize: 13, color: '#888' }}>
              Thinking...
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
          placeholder={language === 'pt-BR' ? 'Faça sua pergunta...' : 'Ask a question...'}
          style={{ flex: 1, padding: '12px 16px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none' }}
        />
        <button onClick={send} disabled={loading || !input.trim()}
          style={{ padding: '12px 24px', background: '#1B3A6B', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}>
          Send
        </button>
      </div>
    </div>
  );
}
