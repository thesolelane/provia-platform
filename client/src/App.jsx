import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import JobDetail from './pages/JobDetail';
import Settings from './pages/Settings';
import KnowledgeBase from './pages/KnowledgeBase';
import AdminChat from './pages/AdminChat';
import Whitelist from './pages/Whitelist';
import FieldGuide from './pages/FieldGuide';
import Contacts from './pages/Contacts';
import Tasks from './pages/Tasks';
import Layout from './components/Layout';
import Toast from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';

function App() {
  const [token, setToken] = useState(localStorage.getItem('pb_token'));
  const [userName, setUserName] = useState(localStorage.getItem('pb_user_name') || '');
  const [userRole, setUserRole] = useState(localStorage.getItem('pb_user_role') || '');

  const handleLogin = (newToken, name, role) => {
    localStorage.setItem('pb_token', newToken);
    localStorage.setItem('pb_user_name', name);
    localStorage.setItem('pb_user_role', role);
    setToken(newToken);
    setUserName(name);
    setUserRole(role);
  };

  const handleLogout = () => {
    const currentToken = localStorage.getItem('pb_token');
    if (currentToken) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'x-auth-token': currentToken }
      }).catch(() => {});
    }
    localStorage.removeItem('pb_token');
    localStorage.removeItem('pb_user_name');
    localStorage.removeItem('pb_user_role');
    setToken(null);
    setUserName('');
    setUserRole('');
  };

  useEffect(() => {
    if (!token) return;
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await origFetch(...args);
      if (res.status === 401) {
        handleLogout();
      }
      return res;
    };
    return () => { window.fetch = origFetch; };
  }, [token]);

  if (!token) return <Login onLogin={handleLogin} />;

  return (
    <BrowserRouter>
      <Toast />
      <ConfirmDialog />
      <Layout token={token} onLogout={handleLogout} userName={userName} userRole={userRole}>
        <Routes>
          <Route path="/" element={<Dashboard token={token} />} />
          <Route path="/jobs/:id" element={<JobDetail token={token} />} />
          <Route path="/settings" element={<Settings token={token} />} />
          <Route path="/knowledge" element={<KnowledgeBase token={token} />} />
          <Route path="/chat" element={<AdminChat token={token} />} />
          <Route path="/whitelist" element={<Whitelist token={token} />} />
          <Route path="/contacts" element={<Contacts token={token} />} />
          <Route path="/tasks" element={<Tasks token={token} />} />
          <Route path="/guide" element={<FieldGuide />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
