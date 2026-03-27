// client/src/pages/AdminChat.jsx
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

const BLUE   = '#1B3A6B';
const GREEN  = '#2E7D32';

export default function AdminChat({ token }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hi Jackson! I now have live access to your contacts and jobs, and I can create tasks and reminders for you.\n\nYou can also attach blueprints, building plans, or photos — I\'ll read them and help you build a quote.\n\nTry asking:\n• "What\'s the phone number for [customer name]?"\n• "What\'s the status of the job at 123 Main St?"\n• "Remind me to call for inspection tomorrow at 5pm for Oak St"\n\nOlá! Pode me perguntar em português também.'
    }
  ]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [language, setLanguage]     = useState('en');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const bottomRef   = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const removeFile = (i) => setAttachedFiles(prev => prev.filter((_, j) => j !== i));

  const send = async () => {
    if ((!input.trim() && !attachedFiles.length) || loading || extracting) return;

    let userMsg = input.trim();
    const filesSnapshot = [...attachedFiles];
    setInput('');
    setAttachedFiles([]);

    // If files attached, extract first and inject into message
    if (filesSnapshot.length > 0) {
      setExtracting(true);
      const fileNames = filesSnapshot.map(f => f.name).join(', ');
      setMessages(prev => [...prev, { role: 'user', content: userMsg || `[Attached: ${fileNames}]`, attachments: filesSnapshot.map(f => f.name) }]);

      try {
        const fd = new FormData();
        filesSnapshot.forEach((f, i) => fd.append(`file_${i}`, f));
        const extractRes = await fetch('/api/jobs/extract-from-files', {
          method: 'POST',
          headers: { 'x-auth-token': token },
          body: fd,
        });
        if (extractRes.ok) {
          const { extractedText, extractedAddress } = await extractRes.json();
          const addrNote = extractedAddress?.street
            ? `\nProject address found: ${[extractedAddress.street, extractedAddress.city, extractedAddress.state].filter(Boolean).join(', ')}`
            : '';
          userMsg = [
            userMsg || 'I\'ve attached construction documents. Please analyze them and help me build a quote.',
            `\n\n[ATTACHED DOCUMENTS: ${fileNames}]${addrNote}\n${extractedText}`
          ].join('');
        } else {
          userMsg = userMsg || `I tried to attach ${fileNames} but couldn't read it. Can you help?`;
        }
      } catch {
        userMsg = userMsg || `Attached ${fileNames} — couldn't extract content.`;
      }
      setExtracting(false);
    } else {
      setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    }

    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
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
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply, createdTask: data.createdTask || null }]);
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
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} } @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>🤖 Ask the Bot</h1>
          <p style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
            Contacts · Jobs · Prices · MA Codes · Reminders · Plans — EN & PT-BR
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
            <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: msg.attachments?.length ? 4 : 12 }}>
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

            {/* Attachment chips on user messages */}
            {msg.attachments?.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {msg.attachments.map((name, j) => (
                  <div key={j} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: '#dbe7ff', borderRadius: 20, padding: '3px 10px',
                    fontSize: 11, color: BLUE, fontWeight: 600,
                  }}>
                    <span>{name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? '🖼️' : '📄'}</span>
                    <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Task created card */}
            {msg.createdTask && (
              <div style={{
                margin: '0 0 14px 0',
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: 10, padding: '14px 16px',
                maxWidth: 380
              }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: GREEN, marginBottom: 8 }}>✅ Task Saved</div>
                <div style={{ fontSize: 13, fontWeight: 'bold', color: BLUE, marginBottom: 4 }}>{msg.createdTask.title}</div>
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

        {(extracting || loading) && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ background: '#f4f6fb', padding: '12px 16px', borderRadius: 12, fontSize: 13, color: '#888', display: 'flex', alignItems: 'center', gap: 8 }}>
              {extracting ? (
                <>
                  <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #1B3A6B', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Reading your files...
                </>
              ) : (
                <span style={{ animation: 'pulse 1.2s infinite' }}>Thinking...</span>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Attached file chips above input */}
      {attachedFiles.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {attachedFiles.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#e8f0fe', borderRadius: 20, padding: '4px 10px',
              fontSize: 11, color: BLUE, fontWeight: 600,
            }}>
              <span>{f.type.startsWith('image/') ? '🖼️' : '📄'}</span>
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button onClick={() => removeFile(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const newFiles = Array.from(e.target.files || []);
          setAttachedFiles(prev => {
            const names = new Set(prev.map(f => f.name));
            return [...prev, ...newFiles.filter(f => !names.has(f.name))];
          });
          e.target.value = '';
        }}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach plans, blueprints, or photos"
          style={{
            padding: '10px 14px', background: attachedFiles.length ? '#e8f0fe' : '#f4f6fb',
            border: `1.5px solid ${attachedFiles.length ? BLUE : '#C8D4E4'}`,
            borderRadius: 8, cursor: 'pointer', fontSize: 18, lineHeight: 1,
            color: attachedFiles.length ? BLUE : '#888',
            flexShrink: 0,
          }}
        >
          📎
        </button>

        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={
            attachedFiles.length
              ? 'Add a message or just hit Send to analyze the files...'
              : language === 'pt-BR' ? 'Faça sua pergunta...' : 'Ask anything, or attach plans/blueprints with 📎'
          }
          style={{ flex: 1, padding: '12px 16px', border: '1.5px solid #C8D4E4', borderRadius: 8, fontSize: 14, outline: 'none' }}
        />

        <button
          onClick={send}
          disabled={loading || extracting || (!input.trim() && !attachedFiles.length)}
          style={{
            padding: '12px 24px', background: BLUE, color: 'white', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14,
            opacity: (loading || extracting || (!input.trim() && !attachedFiles.length)) ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
