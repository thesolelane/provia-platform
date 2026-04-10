// client/src/components/Toast.jsx
import { useState, useEffect } from 'react';

const TYPE_STYLES = {
  success: { background: '#1B3A6B', icon: '✓', border: '#E07B2A' },
  error: { background: '#C62828', icon: '✕', border: '#ff6b6b' },
  info: { background: '#0277bd', icon: 'ℹ', border: '#4fc3f7' },
  warning: { background: '#E65100', icon: '⚠', border: '#ffb74d' },
};

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const { message, type = 'success' } = e.detail;
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };
    window.addEventListener('pb-toast', handler);
    return () => window.removeEventListener('pb-toast', handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 360,
      }}
    >
      {toasts.map((t) => {
        const style = TYPE_STYLES[t.type] || TYPE_STYLES.success;
        return (
          <div
            key={t.id}
            style={{
              background: style.background,
              borderLeft: `4px solid ${style.border}`,
              color: 'white',
              padding: '12px 16px',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 13,
              lineHeight: 1.5,
              animation: 'slideIn 0.2s ease',
            }}
          >
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{style.icon}</span>
            <span>{t.message}</span>
          </div>
        );
      })}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
