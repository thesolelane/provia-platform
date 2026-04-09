// client/src/pages/Team.jsx
import { useState, useEffect } from 'react';
import { showConfirm } from '../utils/confirm';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN = '#2E7D32';
const RED = '#C62828';
const GOLD = '#B8860B';

const ROLES = [
  { value: 'system_admin', label: 'System Admin', color: GOLD, bg: '#FFF8DC' },
  { value: 'admin', label: 'Admin', color: BLUE, bg: '#E3ECFF' },
  { value: 'pm', label: 'Project Manager', color: GREEN, bg: '#E8F5E9' },
  { value: 'staff', label: 'Staff', color: '#555', bg: '#F5F5F5' }
];

const roleInfo = (role) => ROLES.find((r) => r.value === role) || ROLES[3];

const ROLE_LEVELS = { system_admin: 4, admin: 3, pm: 2, staff: 1 };
const hasLevel = (role, min) => (ROLE_LEVELS[role] || 0) >= (ROLE_LEVELS[min] || 0);

const inp = {
  width: '100%',
  padding: '9px 10px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box'
};
const lbl = { fontSize: 12, color: '#555', display: 'block', marginBottom: 4, fontWeight: '500' };

export default function Team({ token, userRole }) {
  const [tab, setTab] = useState('team');
  const [users, setUsers] = useState([]);
  const [senders, setSenders] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [pwdUser, setPwdUser] = useState(null);
  const [showAddSender, setShowAddSender] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'pm',
    title: 'Team Member',
    phone: '',
    language: 'en'
  });
  const [senderForm, setSenderForm] = useState({
    identifier: '',
    type: 'email',
    name: '',
    role: 'pm',
    language: 'en'
  });
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwdErr, setPwdErr] = useState('');

  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  const loadUsers = () =>
    fetch('/api/users', { headers: { 'x-auth-token': token } })
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d : []));

  const loadSenders = () =>
    fetch('/api/whitelist', { headers: { 'x-auth-token': token } })
      .then((r) => r.json())
      .then((d) => setSenders(Array.isArray(d) ? d : []));

  useEffect(() => {
    loadUsers();
    loadSenders();
  }, []);

  const addUser = async () => {
    if (!form.name || !form.email || !form.password) return;
    const res = await fetch('/api/users', { method: 'POST', headers, body: JSON.stringify(form) });
    if (res.ok) {
      setShowAdd(false);
      setForm({
        name: '',
        email: '',
        password: '',
        role: 'pm',
        title: 'Team Member',
        phone: '',
        language: 'en'
      });
      loadUsers();
    } else {
      const d = await res.json();
      alert(d.error || 'Error');
    }
  };

  const saveEdit = async () => {
    const res = await fetch(`/api/users/${editUser.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(editUser)
    });
    if (res.ok) {
      setEditUser(null);
      loadUsers();
    }
  };

  const toggleUser = async (u) => {
    await fetch(`/api/users/${u.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ active: !u.active })
    });
    loadUsers();
  };

  const deleteUser = async (u) => {
    if (!(await showConfirm(`Remove ${u.name} from the team?`))) return;
    await fetch(`/api/users/${u.id}`, { method: 'DELETE', headers: { 'x-auth-token': token } });
    loadUsers();
  };

  const savePassword = async () => {
    setPwdErr('');
    if (pwdForm.newPassword !== pwdForm.confirm) {
      setPwdErr('Passwords do not match');
      return;
    }
    if (pwdForm.newPassword.length < 8) {
      setPwdErr('Password must be at least 8 characters');
      return;
    }
    const res = await fetch(`/api/users/${pwdUser.id}/password`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(pwdForm)
    });
    if (res.ok) {
      setPwdUser(null);
      setPwdForm({ currentPassword: '', newPassword: '', confirm: '' });
    } else {
      const d = await res.json();
      setPwdErr(d.error || 'Error');
    }
  };

  const addSender = async () => {
    await fetch('/api/whitelist', { method: 'POST', headers, body: JSON.stringify(senderForm) });
    setShowAddSender(false);
    setSenderForm({ identifier: '', type: 'email', name: '', role: 'pm', language: 'en' });
    loadSenders();
  };

  const toggleSender = async (id, active) => {
    await fetch(`/api/whitelist/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ active: active ? 0 : 1 })
    });
    loadSenders();
  };

  const removeSender = async (id) => {
    if (!(await showConfirm('Remove this contact from the bot whitelist?'))) return;
    await fetch(`/api/whitelist/${id}`, { method: 'DELETE', headers: { 'x-auth-token': token } });
    loadSenders();
  };

  const isSysAdmin = hasLevel(userRole, 'system_admin');

  return (
    <div style={{ padding: 32 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>
            👷 Team & Access
          </h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            Manage team members, logins, and bot contacts
          </p>
        </div>
        {tab === 'team' && isSysAdmin && (
          <button
            onClick={() => setShowAdd(true)}
            style={{
              padding: '10px 20px',
              background: BLUE,
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            + Add Team Member
          </button>
        )}
        {tab === 'bot' && isSysAdmin && (
          <button
            onClick={() => setShowAddSender(true)}
            style={{
              padding: '10px 20px',
              background: BLUE,
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            + Add Bot Contact
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #e0e0e0' }}>
        {[
          ['team', '🧑‍💼 Team Members'],
          ['bot', '🤖 Bot Contacts']
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 24px',
              border: 'none',
              borderBottom: tab === key ? `2px solid ${BLUE}` : '2px solid transparent',
              background: 'none',
              color: tab === key ? BLUE : '#888',
              fontWeight: tab === key ? 'bold' : 'normal',
              cursor: 'pointer',
              fontSize: 13,
              marginBottom: -2
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TEAM MEMBERS ── */}
      {tab === 'team' && (
        <div
          style={{
            background: 'white',
            borderRadius: 10,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            overflowX: 'auto'
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: BLUE }}>
                {['Name / Title', 'Email', 'Role', 'Phone', 'Lang', 'Status', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: '11px 14px',
                        color: 'white',
                        textAlign: 'left',
                        fontSize: 12,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#888' }}>
                    No team members found.
                  </td>
                </tr>
              )}
              {users.map((u, i) => {
                const ri = roleInfo(u.role);
                return (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid #f0f0f0',
                      background: i % 2 === 0 ? 'white' : '#fafafa'
                    }}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: '600' }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{u.title}</div>
                    </td>
                    <td
                      style={{
                        padding: '11px 14px',
                        fontSize: 12,
                        color: '#555',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {u.email}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span
                        style={{
                          background: ri.bg,
                          color: ri.color,
                          padding: '3px 9px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 'bold',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {ri.label}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '11px 14px',
                        fontSize: 12,
                        color: '#555',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {u.phone || '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {u.language === 'pt-BR' ? '🇧🇷' : '🇺🇸'}
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          color: u.active ? GREEN : '#bbb',
                          fontWeight: 'bold',
                          fontSize: 12
                        }}
                      >
                        {u.active ? '● Active' : '○ Off'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap' }}>
                        <button
                          onClick={() => setEditUser({ ...u })}
                          style={{
                            fontSize: 11,
                            padding: '5px 10px',
                            border: '1px solid #ccc',
                            borderRadius: 5,
                            cursor: 'pointer',
                            background: 'white',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => {
                            setPwdUser(u);
                            setPwdForm({ currentPassword: '', newPassword: '', confirm: '' });
                            setPwdErr('');
                          }}
                          style={{
                            fontSize: 11,
                            padding: '5px 10px',
                            border: '1px solid #ccc',
                            borderRadius: 5,
                            cursor: 'pointer',
                            background: 'white',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          🔑 Pwd
                        </button>
                        {isSysAdmin && (
                          <>
                            <button
                              onClick={() => toggleUser(u)}
                              style={{
                                fontSize: 11,
                                padding: '5px 10px',
                                border: '1px solid #ccc',
                                borderRadius: 5,
                                cursor: 'pointer',
                                background: 'white',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {u.active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => deleteUser(u)}
                              style={{
                                fontSize: 11,
                                padding: '5px 11px',
                                border: `1px solid ${RED}`,
                                borderRadius: 5,
                                cursor: 'pointer',
                                color: 'white',
                                background: RED,
                                fontWeight: 'bold',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              🗑 Remove
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── BOT CONTACTS ── */}
      {tab === 'bot' && (
        <>
          <div
            style={{
              background: '#FFF8F0',
              border: `1px solid ${ORANGE}`,
              borderRadius: 8,
              padding: 14,
              marginBottom: 16,
              fontSize: 12,
              color: '#5D3A00'
            }}
          >
            ⚠️ Only emails and WhatsApp numbers on this list can trigger the bot. Messages from
            others are silently dropped.
          </div>
          <div
            style={{
              background: 'white',
              borderRadius: 10,
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              overflowX: 'auto'
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr style={{ background: BLUE }}>
                  {['Name', 'Identifier', 'Type', 'Role', 'Lang', 'Status', 'Actions'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '11px 14px',
                        color: 'white',
                        textAlign: 'left',
                        fontSize: 12,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {senders.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#888' }}>
                      No bot contacts yet.
                    </td>
                  </tr>
                )}
                {senders.map((s, i) => (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: '1px solid #f0f0f0',
                      background: i % 2 === 0 ? 'white' : '#fafafa'
                    }}
                  >
                    <td
                      style={{
                        padding: '11px 14px',
                        fontSize: 13,
                        fontWeight: '500',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {s.name || '—'}
                    </td>
                    <td
                      style={{
                        padding: '11px 14px',
                        fontSize: 12,
                        color: '#555',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {s.identifier}
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          background: s.type === 'email' ? '#E3ECFF' : '#E8F5E9',
                          color: s.type === 'email' ? BLUE : GREEN,
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 'bold'
                        }}
                      >
                        {s.type === 'email' ? '📧 Email' : '📱 WhatsApp'}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '11px 14px',
                        fontSize: 12,
                        color: '#666',
                        textTransform: 'capitalize',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {s.role}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {s.language === 'pt-BR' ? '🇧🇷' : '🇺🇸'}
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          color: s.active ? GREEN : '#bbb',
                          fontWeight: 'bold',
                          fontSize: 12
                        }}
                      >
                        {s.active ? '● Active' : '○ Off'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                        <button
                          onClick={() => toggleSender(s.id, s.active)}
                          style={{
                            fontSize: 11,
                            padding: '5px 10px',
                            border: '1px solid #ccc',
                            borderRadius: 5,
                            cursor: 'pointer',
                            background: 'white',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {s.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => removeSender(s.id)}
                          style={{
                            fontSize: 11,
                            padding: '5px 11px',
                            border: `1px solid ${RED}`,
                            borderRadius: 5,
                            cursor: 'pointer',
                            color: 'white',
                            background: RED,
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          🗑 Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── ADD USER MODAL ── */}
      {showAdd && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              padding: 32,
              width: 480,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <h2 style={{ color: BLUE, marginBottom: 20, marginTop: 0 }}>Add Team Member</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                ['Name', 'name', 'Full name'],
                ['Email', 'email', 'Login email']
              ].map(([label, key, ph]) => (
                <div key={key}>
                  <label style={lbl}>{label}</label>
                  <input
                    value={form[key]}
                    placeholder={ph}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    style={inp}
                  />
                </div>
              ))}
              <div>
                <label style={lbl}>Temporary Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>Job Title</label>
                <input
                  value={form.title}
                  placeholder="e.g. Project Manager"
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>WhatsApp Phone</label>
                <input
                  value={form.phone}
                  placeholder="+11234567890"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>Language</label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  style={inp}
                >
                  <option value="en">🇺🇸 English</option>
                  <option value="pt-BR">🇧🇷 Português</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={lbl}>Permission Level</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                style={inp}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#888',
                marginTop: 8,
                padding: '8px 12px',
                background: '#f8f8f8',
                borderRadius: 6
              }}
            >
              <strong>Admin</strong> — jobs, tasks, contacts, settings &nbsp;|&nbsp;{' '}
              <strong>System Admin</strong> — + secrets, user management
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowAdd(false)}
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: 'white'
                }}
              >
                Cancel
              </button>
              <button
                onClick={addUser}
                disabled={!form.name || !form.email || !form.password}
                style={{
                  flex: 2,
                  padding: 10,
                  background: BLUE,
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Add Team Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT USER MODAL ── */}
      {editUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              padding: 32,
              width: 480,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <h2 style={{ color: BLUE, marginBottom: 20, marginTop: 0 }}>
              Edit Profile — {editUser.name}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Name</label>
                <input
                  value={editUser.name}
                  onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>Job Title</label>
                <input
                  value={editUser.title}
                  onChange={(e) => setEditUser({ ...editUser, title: e.target.value })}
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>WhatsApp Phone</label>
                <input
                  value={editUser.phone}
                  placeholder="+11234567890"
                  onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })}
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>Language</label>
                <select
                  value={editUser.language}
                  onChange={(e) => setEditUser({ ...editUser, language: e.target.value })}
                  style={inp}
                >
                  <option value="en">🇺🇸 English</option>
                  <option value="pt-BR">🇧🇷 Português</option>
                </select>
              </div>
            </div>
            {isSysAdmin && (
              <div style={{ marginTop: 12 }}>
                <label style={lbl}>Permission Level</label>
                <select
                  value={editUser.role}
                  onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                  style={inp}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setEditUser(null)}
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: 'white'
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                style={{
                  flex: 2,
                  padding: 10,
                  background: BLUE,
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CHANGE PASSWORD MODAL ── */}
      {pwdUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 400 }}>
            <h2 style={{ color: BLUE, marginBottom: 20, marginTop: 0 }}>
              Change Password — {pwdUser.name}
            </h2>
            {!isSysAdmin && (
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Current Password</label>
                <input
                  type="password"
                  value={pwdForm.currentPassword}
                  onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                  style={inp}
                />
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>New Password</label>
              <input
                type="password"
                value={pwdForm.newPassword}
                onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                style={inp}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Confirm New Password</label>
              <input
                type="password"
                value={pwdForm.confirm}
                onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })}
                style={inp}
              />
            </div>
            {pwdErr && <div style={{ color: RED, fontSize: 12, marginBottom: 10 }}>{pwdErr}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setPwdUser(null)}
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: 'white'
                }}
              >
                Cancel
              </button>
              <button
                onClick={savePassword}
                style={{
                  flex: 2,
                  padding: 10,
                  background: BLUE,
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD BOT CONTACT MODAL ── */}
      {showAddSender && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 440 }}>
            <h2 style={{ color: BLUE, marginBottom: 20, marginTop: 0 }}>Add Bot Contact</h2>
            {[
              { label: 'Name', key: 'name', placeholder: 'e.g. Jackson Deaquino' },
              {
                label: 'Email or WhatsApp (with country code)',
                key: 'identifier',
                placeholder: 'email@example.com or +11234567890'
              }
            ].map((f) => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={lbl}>{f.label}</label>
                <input
                  value={senderForm[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setSenderForm({ ...senderForm, [f.key]: e.target.value })}
                  style={inp}
                />
              </div>
            ))}
            {[
              {
                label: 'Type',
                key: 'type',
                options: [
                  ['email', '📧 Email'],
                  ['whatsapp', '📱 WhatsApp']
                ]
              },
              {
                label: 'Role',
                key: 'role',
                options: [
                  ['system_admin', 'System Admin'],
                  ['admin', 'Admin'],
                  ['pm', 'Project Manager'],
                  ['staff', 'Staff']
                ]
              },
              {
                label: 'Language',
                key: 'language',
                options: [
                  ['en', '🇺🇸 English'],
                  ['pt-BR', '🇧🇷 Português']
                ]
              }
            ].map((f) => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={lbl}>{f.label}</label>
                <select
                  value={senderForm[f.key]}
                  onChange={(e) => setSenderForm({ ...senderForm, [f.key]: e.target.value })}
                  style={inp}
                >
                  {f.options.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setShowAddSender(false)}
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: 'white'
                }}
              >
                Cancel
              </button>
              <button
                onClick={addSender}
                disabled={!senderForm.identifier}
                style={{
                  flex: 2,
                  padding: 10,
                  background: BLUE,
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Add Contact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
