// client/src/components/ConfirmDialog.jsx
// Global confirm dialog — replaces window.confirm() across the app.
// Usage: import { showConfirm } from '../utils/confirm'; await showConfirm('Are you sure?')
import { useState, useEffect } from 'react';

const BLUE = '#1B3A6B';
const RED = '#C62828';

export default function ConfirmDialog() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      setDialog({
        message: e.detail.message,
        resolve: e.detail.resolve,
      });
    };
    window.addEventListener('pb-confirm', handler);
    return () => window.removeEventListener('pb-confirm', handler);
  }, []);

  if (!dialog) return null;

  const answer = (yes) => {
    dialog.resolve(yes);
    setDialog(null);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '28px 32px',
        maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <p style={{ fontSize: 15, color: '#333', margin: '0 0 24px', lineHeight: 1.5 }}>
          {dialog.message}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() => answer(false)}
            style={{
              padding: '10px 24px', borderRadius: 8, border: `2px solid #ccc`,
              background: '#fff', color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => answer(true)}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: RED, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14,
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
