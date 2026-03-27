import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const BLUE   = '#1B3A6B';
const ORANGE = '#E07B2A';

const MAIN_NAV = [
  { path: '/',             icon: '📊', label: 'Dashboard' },
  { path: '/tasks',        icon: '✅', label: 'Tasks' },
  { path: '/payments',     icon: '💰', label: 'Payments' },
  { path: '/field-camera', icon: '📷', label: 'Field Camera' },
  { path: '/chat',         icon: '🤖', label: 'Ask the Bot' },
  { path: '/contacts',     icon: '👥', label: 'Contacts' },
  { path: '/takeoff',      icon: '📐', label: 'Material Take-Off' },
  { path: '/analytics',    icon: '📈', label: 'Analytics' },
];

const CONFIG_NAV = [
  { path: '/settings',  icon: '⚙️',  label: 'Settings' },
  { path: '/knowledge', icon: '📚', label: 'Knowledge Base' },
  { path: '/team',      icon: '👷', label: 'Team' },
  { path: '/guide',     icon: '📋', label: 'Help Guide' },
];

// Bottom nav shows these 4 + "More"
const BOTTOM_NAV = [
  { path: '/',             icon: '📊', label: 'Jobs' },
  { path: '/tasks',        icon: '✅', label: 'Tasks' },
  { path: '/field-camera', icon: '📷', label: 'Camera' },
  { path: '/payments',     icon: '💰', label: 'Payments' },
];

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handle = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return width;
}

function SidebarNavItem({ item, active, collapsed }) {
  return (
    <Link to={item.path} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 16px',
        background: active ? 'rgba(224,123,42,0.28)' : 'transparent',
        borderLeft: active ? `3px solid ${ORANGE}` : '3px solid transparent',
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

function Sidebar({ collapsed, setCollapsed, pathname, configOpen, setConfigOpen, onLogout, userName, userRole }) {
  const configActive = CONFIG_NAV.some(n => n.path === pathname);
  return (
    <aside style={{
      width: collapsed ? 58 : 222,
      background: BLUE,
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s',
      flexShrink: 0,
      overflow: 'hidden',
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
        {!collapsed && (
          <>
            <div style={{ fontWeight: 'bold', fontSize: 12, color: ORANGE, letterSpacing: '0.04em' }}>PREFERRED BUILDERS</div>
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

      <nav style={{ flex: 1, paddingTop: 6, overflowY: 'auto', overflowX: 'hidden' }}>
        {MAIN_NAV.map(item => (
          <SidebarNavItem key={item.path} item={item} active={pathname === item.path} collapsed={collapsed} />
        ))}

        <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 4 }}>
          <button
            onClick={() => setConfigOpen(o => !o)}
            style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 16px',
              color: configActive ? ORANGE : 'rgba(255,255,255,0.55)',
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

          {collapsed && CONFIG_NAV.map(item => (
            <SidebarNavItem key={item.path} item={item} active={pathname === item.path} collapsed={true} />
          ))}

          {!collapsed && configOpen && (
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, margin: '2px 8px 6px' }}>
              {CONFIG_NAV.map(item => (
                <Link key={item.path} to={item.path} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 14px',
                    background: pathname === item.path ? 'rgba(224,123,42,0.28)' : 'transparent',
                    borderLeft: pathname === item.path ? `3px solid ${ORANGE}` : '3px solid transparent',
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
  );
}

function MobileBottomNav({ pathname, onMoreClick }) {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
      background: BLUE, display: 'flex', borderTop: '1px solid rgba(255,255,255,0.15)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {BOTTOM_NAV.map(item => {
        const active = pathname === item.path;
        return (
          <Link key={item.path} to={item.path} style={{ flex: 1, textDecoration: 'none' }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '10px 0 8px',
              color: active ? ORANGE : 'rgba(255,255,255,0.65)',
              fontSize: 10, fontWeight: active ? 'bold' : 'normal',
              borderTop: active ? `2px solid ${ORANGE}` : '2px solid transparent',
            }}>
              <span style={{ fontSize: 20, marginBottom: 2 }}>{item.icon}</span>
              {item.label}
            </div>
          </Link>
        );
      })}
      <button onClick={onMoreClick} style={{
        flex: 1, background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '10px 0 8px',
        color: 'rgba(255,255,255,0.65)', fontSize: 10,
        borderTop: '2px solid transparent',
      }}>
        <span style={{ fontSize: 20, marginBottom: 2 }}>☰</span>
        More
      </button>
    </nav>
  );
}

function MobileSheet({ open, onClose, pathname, onLogout, userName, userRole }) {
  if (!open) return null;
  const ALL_NAV = [...MAIN_NAV, ...CONFIG_NAV];
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100,
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1200,
        background: BLUE, borderRadius: '16px 16px 0 0',
        maxHeight: '75vh', overflowY: 'auto',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <div style={{ padding: '12px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: 13, color: ORANGE }}>PREFERRED BUILDERS</div>
            {userName && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{userName}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>✕</button>
        </div>

        <div style={{ padding: '4px 0 8px' }}>
          {ALL_NAV.map(item => {
            const active = pathname === item.path;
            return (
              <Link key={item.path} to={item.path} onClick={onClose} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '13px 20px',
                  background: active ? 'rgba(224,123,42,0.25)' : 'transparent',
                  borderLeft: active ? `3px solid ${ORANGE}` : '3px solid transparent',
                  color: active ? 'white' : 'rgba(255,255,255,0.8)',
                  fontSize: 15,
                }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {active && <span style={{ marginLeft: 'auto', color: ORANGE, fontSize: 12 }}>●</span>}
                </div>
              </Link>
            );
          })}
        </div>

        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={() => { onClose(); onLogout(); }} style={{
            width: '100%', background: 'rgba(255,255,255,0.1)', border: 'none',
            color: 'white', padding: '12px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
          }}>
            🚪 Logout
          </button>
        </div>
      </div>
    </>
  );
}

function MobileHeader({ onMenuClick, pathname }) {
  const current = [...MAIN_NAV, ...CONFIG_NAV].find(n => n.path === pathname);
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 900,
      background: BLUE, color: 'white',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      paddingTop: 'calc(12px + env(safe-area-inset-top))',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 'bold', fontSize: 11, color: ORANGE, letterSpacing: '0.05em' }}>PREFERRED BUILDERS</div>
        <div style={{ fontSize: 13, fontWeight: 'bold', marginTop: 1 }}>
          {current ? `${current.icon} ${current.label}` : '📊 Dashboard'}
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children, token, onLogout, userName, userRole }) {
  const { pathname } = useLocation();
  const width = useWindowWidth();
  const [collapsed, setCollapsed] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isMobile = width < 640;
  const isTablet = width >= 640 && width < 1024;

  // Auto-collapse sidebar on tablet
  const effectiveCollapsed = isTablet ? true : collapsed;

  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f6fb', fontFamily: 'Arial, sans-serif' }}>
        <MobileHeader pathname={pathname} />
        <main style={{ paddingBottom: 72, minHeight: 'calc(100vh - 56px)' }}>
          {children}
        </main>
        <MobileBottomNav pathname={pathname} onMoreClick={() => setSheetOpen(true)} />
        <MobileSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          pathname={pathname}
          onLogout={onLogout}
          userName={userName}
          userRole={userRole}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Arial, sans-serif', background: '#f4f6fb' }}>
      <Sidebar
        collapsed={effectiveCollapsed}
        setCollapsed={isTablet ? () => {} : setCollapsed}
        pathname={pathname}
        configOpen={configOpen}
        setConfigOpen={setConfigOpen}
        onLogout={onLogout}
        userName={userName}
        userRole={userRole}
      />
      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
