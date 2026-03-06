// client/src/App.jsx
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
import Layout from './components/Layout';

function App() {
  const [token, setToken] = useState(localStorage.getItem('pb_token'));

  const handleLogin = (newToken) => {
    localStorage.setItem('pb_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('pb_token');
    setToken(null);
  };

  if (!token) return <Login onLogin={handleLogin} />;

  return (
    <BrowserRouter>
      <Layout token={token} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Dashboard token={token} />} />
          <Route path="/jobs/:id" element={<JobDetail token={token} />} />
          <Route path="/settings" element={<Settings token={token} />} />
          <Route path="/knowledge" element={<KnowledgeBase token={token} />} />
          <Route path="/chat" element={<AdminChat token={token} />} />
          <Route path="/whitelist" element={<Whitelist token={token} />} />
          <Route path="/guide" element={<FieldGuide />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
