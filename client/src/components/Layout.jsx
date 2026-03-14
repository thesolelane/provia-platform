// client/src/components/Layout.jsx
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV = [
  { path: '/',           icon: '📊', label: 'Dashboard' },
  { path: '/tasks',      icon: '✅', label: 'Tasks' },
  { path: '/chat',       icon: '🤖', label: 'Ask the Bot' },
  { path: '/contacts',   icon: '👥', label: 'Contacts' },
  { path: '/settings',   icon: '⚙️',  label: 'Settings' },
  { path: '/knowledge',  icon: '📚', label: 'Knowledge Base' },
  { path: '/whitelist',  icon: '🔒', label: 'Whitelist' },
  { path: '/guide',      icon: '📋', label: "Help Guide" },
];

export default function Layout({ children, token, onLogout }) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Arial, sans-serif', background: '#f4f6fb' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 60 : 220,
        background: '#1B3A6B',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        flexShrink: 0
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {!collapsed && (
            <>
              <div style={{ fontWeight: 'bold', fontSize: 13, color: '#E07B2A' }}>PREFERRED BUILDERS</div>
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>AI Contract System</div>
            </>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 18, marginTop: collapsed ? 0 : 8 }}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {NAV.map(item => (
            <Link key={item.path} to={item.path} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px',
                background: pathname === item.path ? 'rgba(224,123,42,0.3)' : 'transparent',
                borderLeft: pathname === item.path ? '3px solid #E07B2A' : '3px solid transparent',
                color: 'white', fontSize: 13, cursor: 'pointer',
                transition: 'background 0.15s'
              }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </div>
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={onLogout}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
              padding: '8px 12px', borderRadius: 6, cursor: 'pointer', width: '100%',
              fontSize: 12
            }}
          >
            {collapsed ? '🚪' : '🚪 Logout'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
