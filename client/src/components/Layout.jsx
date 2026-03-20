import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const MAIN_NAV = [
  { path: '/',         icon: '📊', label: 'Dashboard' },
  { path: '/tasks',    icon: '✅', label: 'Tasks' },
  { path: '/payments', icon: '💰', label: 'Payments' },
  { path: '/chat',     icon: '🤖', label: 'Ask the Bot' },
  { path: '/contacts', icon: '👥', label: 'Contacts' },
  { path: '/takeoff',  icon: '📐', label: 'Material Take-Off' },
  { path: '/analytics', icon: '📈', label: 'Analytics' },
];

const CONFIG_NAV = [
  { path: '/settings',  icon: '⚙️',  label: 'Settings' },
  { path: '/knowledge', icon: '📚', label: 'Knowledge Base' },
  { path: '/team',      icon: '👷', label: 'Team' },
  { path: '/guide',     icon: '📋', label: 'Help Guide' },
];

function NavItem({ item, active, collapsed }) {
  return (
    <Link to={item.path} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 16px',
        background: active ? 'rgba(224,123,42,0.28)' : 'transparent',
        borderLeft: active ? '3px solid #E07B2A' : '3px solid transparent',
        color: 'white', fontSize: 13, cursor: 'pointer',
        transition: 'background 0.15s',
      }}
        title={collapsed ? item.label : undefined}
      >
        <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
        {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
      </div>
    </Link>
  );
}

export default function Layout({ children, token, onLogout, userName, userRole }) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  const configActive = CONFIG_NAV.some(n => n.path === pathname);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Arial, sans-serif', background: '#f4f6fb' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 58 : 222,
        background: '#1B3A6B',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {/* Logo + collapse toggle */}
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          {!collapsed && (
            <>
              <div style={{ fontWeight: 'bold', fontSize: 12, color: '#E07B2A', letterSpacing: '0.04em' }}>PREFERRED BUILDERS</div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>AI Contract System</div>
            </>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 17, marginTop: collapsed ? 0 : 8, padding: 0 }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* Main nav */}
        <nav style={{ flex: 1, paddingTop: 6, overflowY: 'auto', overflowX: 'hidden' }}>
          {MAIN_NAV.map(item => (
            <NavItem key={item.path} item={item} active={pathname === item.path} collapsed={collapsed} />
          ))}

          {/* ── Config / Admin collapsible section ── */}
          <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4 }}>
            {/* Section toggle button */}
            <button
              onClick={() => setConfigOpen(o => !o)}
              style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 16px',
                color: configActive ? '#E07B2A' : 'rgba(255,255,255,0.55)',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
              }}
              title={collapsed ? 'Config & Tools' : undefined}
            >
              <span style={{ fontSize: 15, flexShrink: 0 }}>🛠️</span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left' }}>Config &amp; Tools</span>
                  <span style={{ fontSize: 12, opacity: 0.7, marginRight: 2 }}>{configOpen ? '▾' : '▸'}</span>
                </>
              )}
            </button>

            {/* Collapsed sidebar: always show config icons */}
            {collapsed && CONFIG_NAV.map(item => (
              <NavItem key={item.path} item={item} active={pathname === item.path} collapsed={true} />
            ))}

            {/* Expanded sidebar: show only when configOpen */}
            {!collapsed && configOpen && (
              <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, margin: '2px 8px 6px' }}>
                {CONFIG_NAV.map(item => (
                  <Link key={item.path} to={item.path} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 14px',
                      background: pathname === item.path ? 'rgba(224,123,42,0.28)' : 'transparent',
                      borderLeft: pathname === item.path ? '3px solid #E07B2A' : '3px solid transparent',
                      color: pathname === item.path ? 'white' : 'rgba(255,255,255,0.75)',
                      fontSize: 12, cursor: 'pointer', borderRadius: 4,
                      transition: 'background 0.15s',
                    }}>
                      <span style={{ fontSize: 15 }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* User info + Logout */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          {!collapsed && userName && (
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8, lineHeight: 1.4 }}>
              Signed in as<br />
              <span style={{ fontWeight: 'bold', fontSize: 12 }}>{userName}</span>
              {userRole && (
                <span style={{ fontSize: 10, opacity: 0.65, marginLeft: 5 }}>
                  ({ { system_admin: 'Sys Admin', admin: 'Admin', pm: 'PM', staff: 'Staff' }[userRole] || userRole })
                </span>
              )}
            </div>
          )}
          <button
            onClick={onLogout}
            title="Logout"
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
              padding: '7px 10px', borderRadius: 6, cursor: 'pointer', width: '100%', fontSize: 12,
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
