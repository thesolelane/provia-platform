import { useState, useEffect, useRef, useCallback } from 'react';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';
const DARK_BUBBLE = '#1B3A6B';
const LIGHT_BUBBLE = '#e8ecf4';
const DESKTOP_MIN_WIDTH = 1024;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= DESKTOP_MIN_WIDTH);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= DESKTOP_MIN_WIDTH);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isDesktop;
}

function StaffChatWidget({ token }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const openRef = useRef(open);

  const senderName = localStorage.getItem('pb_user_name') || 'Staff';

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/staff-chat/messages', {
        headers: { 'x-auth-token': token },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('[StaffChat] fetch history error:', err);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const es = new EventSource(`/api/staff-chat/events?token=${encodeURIComponent(token)}`);

    es.addEventListener('staff-chat', (e) => {
      const msg = JSON.parse(e.data);
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (!openRef.current) {
        setUnread((n) => n + 1);
      }
    });

    es.onerror = () => {};

    return () => {
      es.close();
    };
  }, [token]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      fetchHistory();
    }
  }, [open, fetchHistory]);

  useEffect(() => {
    if (open) {
      setTimeout(scrollToBottom, 50);
    }
  }, [messages, open, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const savedInput = text;
    setInput('');
    try {
      const res = await fetch('/api/staff-chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token,
        },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        setInput(savedInput);
        console.error('[StaffChat] send failed:', res.status);
      }
    } catch (err) {
      setInput(savedInput);
      console.error('[StaffChat] send error:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {open && (
        <div
          style={{
            width: 340,
            height: 460,
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 12,
            overflow: 'hidden',
            border: '1px solid #dce1ea',
          }}
        >
          <div
            style={{
              background: BLUE,
              color: 'white',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 14 }}>Team Chat 💬</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1 }}>Staff only</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: 18,
                cursor: 'pointer',
                padding: '2px 6px',
                lineHeight: 1,
              }}
              title="Close chat"
            >
              ✕
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  color: '#999',
                  fontSize: 13,
                  marginTop: 40,
                }}
              >
                No messages yet. Say hello!
              </div>
            )}
            {messages.map((msg) => {
              const isOwn = msg.sender_name === senderName;
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isOwn ? 'flex-end' : 'flex-start',
                  }}
                >
                  {!isOwn && (
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 2, paddingLeft: 4 }}>
                      {msg.sender_name}
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: '78%',
                      background: isOwn ? DARK_BUBBLE : LIGHT_BUBBLE,
                      color: isOwn ? 'white' : '#1a1a2e',
                      padding: '8px 12px',
                      borderRadius: isOwn ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      fontSize: 13,
                      lineHeight: 1.45,
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.message}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: '#bbb',
                      marginTop: 2,
                      paddingLeft: isOwn ? 0 : 4,
                      paddingRight: isOwn ? 4 : 0,
                    }}
                  >
                    {formatTime(msg.created_at)}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderTop: '1px solid #eee',
              display: 'flex',
              gap: 8,
              flexShrink: 0,
              background: '#fafbfd',
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              style={{
                flex: 1,
                border: '1px solid #d0d5e0',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                outline: 'none',
                background: 'white',
              }}
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              style={{
                background: ORANGE,
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 'bold',
                cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
                opacity: input.trim() && !sending ? 1 : 0.55,
                flexShrink: 0,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: BLUE,
          color: 'white',
          border: 'none',
          borderRadius: 28,
          padding: '12px 20px',
          fontSize: 14,
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(27,58,107,0.45)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          position: 'relative',
          transition: 'transform 0.15s',
        }}
        title={open ? 'Close Team Chat' : 'Open Team Chat'}
      >
        <span>Team Chat 💬</span>
        {!open && unread > 0 && (
          <span
            style={{
              background: ORANGE,
              color: 'white',
              borderRadius: '50%',
              fontSize: 11,
              fontWeight: 'bold',
              minWidth: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}

export default function StaffChat({ token }) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return null;
  return <StaffChatWidget token={token} />;
}
