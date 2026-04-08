// client/src/pages/Tasks.jsx
import { useState, useEffect } from 'react';
import { showToast } from '../utils/toast';
import { showConfirm } from '../utils/confirm';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN = '#2E7D32';
const RED = '#C62828';

const PRIORITY_COLORS = { high: RED, normal: ORANGE, low: '#888' };
const PRIORITY_LABELS = { high: '🔴 High', normal: '🟡 Normal', low: '🟢 Low' };

const SNOOZE_OPTIONS = [
  { label: '2 hours', hours: 2 },
  { label: '3 hours', hours: 3 },
  { label: '1 day', hours: 24 },
  { label: '2 days', hours: 48 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
  { label: '14 days', hours: 336 },
];

function calDiff(due) {
  if (!due) return null;
  const now = new Date();
  const d = new Date(due);
  const diff = Math.round((d - now) / 1000 / 60);
  if (diff < 0) return { label: 'Overdue', color: RED };
  if (diff < 60) return { label: `in ${diff}m`, color: RED };
  if (diff < 1440) return { label: `in ${Math.round(diff / 60)}h`, color: ORANGE };
  const days = Math.round(diff / 1440);
  if (days === 0) return { label: 'Today', color: ORANGE };
  if (days === 1) return { label: 'Tomorrow', color: '#F59E0B' };
  return { label: `in ${days}d`, color: '#888' };
}

function formatRemindAt(remindAt) {
  if (!remindAt) return null;
  const d = new Date(remindAt);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Tasks({ token }) {
  const [tasks, setTasks] = useState([]);
  const [todayCount, setTodayCount] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const [filter, setFilter] = useState('pending');
  const [range, setRange] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', due_at: '', priority: 'normal' });
  const [saving, setSaving] = useState(false);
  const [snoozing, setSnoozing] = useState({});

  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  const load = () => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('status', filter);
    if (range !== 'all') params.set('range', range);
    fetch(`/api/tasks?${params}`, { headers: { 'x-auth-token': token } })
      .then((r) => r.json())
      .then((data) => {
        setTasks(data.tasks || []);
        setTodayCount(data.todayCount || 0);
        setOverdue(data.overdue || 0);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, [filter, range]);

  const createTask = async () => {
    if (!form.title.trim()) return showToast('Title is required', 'error');
    setSaving(true);
    const res = await fetch('/api/tasks', { method: 'POST', headers, body: JSON.stringify(form) });
    const data = await res.json();
    if (res.ok) {
      setForm({ title: '', description: '', due_at: '', priority: 'normal' });
      setShowForm(false);
      load();
      showToast('Task created!');
    } else {
      showToast(data.error || 'Failed to create task', 'error');
    }
    setSaving(false);
  };

  const toggleDone = async (task) => {
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  };

  const deleteTask = async (task) => {
    if (!(await showConfirm(`Delete task "${task.title}"?`))) return;
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE', headers });
    load();
    showToast('Task deleted');
  };

  const snoozeTask = async (task, hours) => {
    setSnoozing((s) => ({ ...s, [task.id]: true }));
    const remindAt = new Date(Date.now() + hours * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ remind_at: remindAt, remind_interval_hours: hours }),
    });
    if (res.ok) {
      showToast(`Reminder set for ${SNOOZE_OPTIONS.find((o) => o.hours === hours)?.label}`);
      load();
    } else {
      showToast('Failed to update reminder', 'error');
    }
    setSnoozing((s) => ({ ...s, [task.id]: false }));
  };

  // Group tasks by date
  const grouped = tasks.reduce((acc, task) => {
    let key = 'No due date';
    if (task.due_at) {
      const d = new Date(task.due_at);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tom = new Date(today);
      tom.setDate(tom.getDate() + 1);
      if (d < today) key = '🔴 Overdue';
      else if (d < tom) key = '📅 Today';
      else {
        const nextDay = new Date(today);
        nextDay.setDate(nextDay.getDate() + 2);
        if (d < nextDay) key = '📅 Tomorrow';
        else
          key = d.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          });
      }
    }
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});

  const groupOrder = ['🔴 Overdue', '📅 Today', '📅 Tomorrow'];
  const sortedGroups = [
    ...groupOrder.filter((g) => grouped[g]),
    ...Object.keys(grouped)
      .filter((g) => !groupOrder.includes(g))
      .sort(),
  ];

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>
            ✅ Tasks & Reminders
          </h1>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            {todayCount > 0 && (
              <span
                style={{
                  fontSize: 12,
                  background: ORANGE + '22',
                  color: ORANGE,
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontWeight: 'bold',
                }}
              >
                📅 {todayCount} due today
              </span>
            )}
            {overdue > 0 && (
              <span
                style={{
                  fontSize: 12,
                  background: RED + '22',
                  color: RED,
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontWeight: 'bold',
                }}
              >
                🔴 {overdue} overdue
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '10px 20px',
            background: BLUE,
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 13,
          }}
        >
          + Add Task
        </button>
      </div>

      {/* New task form */}
      {showForm && (
        <div
          style={{
            background: 'white',
            borderRadius: 10,
            padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginBottom: 20,
          }}
        >
          <h3 style={{ color: BLUE, margin: '0 0 16px' }}>New Task</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Task title (e.g. Call for inspection at 123 Main St)"
              style={{
                padding: '10px 12px',
                border: '1.5px solid #C8D4E4',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Additional notes (optional)"
              rows={2}
              style={{
                padding: '10px 12px',
                border: '1.5px solid #C8D4E4',
                borderRadius: 6,
                fontSize: 13,
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
                  Due Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={form.due_at}
                  onChange={(e) => setForm((p) => ({ ...p, due_at: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1.5px solid #C8D4E4',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
                  Priority
                </label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                  style={{
                    padding: '8px 12px',
                    border: '1.5px solid #C8D4E4',
                    borderRadius: 6,
                    fontSize: 13,
                    height: 37,
                  }}
                >
                  <option value="high">🔴 High</option>
                  <option value="normal">🟡 Normal</option>
                  <option value="low">🟢 Low</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={createTask}
                disabled={saving}
                style={{
                  padding: '9px 20px',
                  background: BLUE,
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: 13,
                }}
              >
                {saving ? 'Saving...' : 'Create Task'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  padding: '9px 16px',
                  background: 'none',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#888',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ['pending', '⬜ Pending'],
          ['done', '✅ Done'],
          ['all', 'All'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid #ddd',
              background: filter === v ? BLUE : 'white',
              color: filter === v ? 'white' : '#555',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: filter === v ? 'bold' : 'normal',
            }}
          >
            {l}
          </button>
        ))}
        <div style={{ borderLeft: '1px solid #eee', margin: '0 4px' }} />
        {[
          ['all', 'All Dates'],
          ['today', 'Today'],
          ['week', 'This Week'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setRange(v)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid #ddd',
              background: range === v ? '#E07B2A' : 'white',
              color: range === v ? 'white' : '#555',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: range === v ? 'bold' : 'normal',
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : tasks.length === 0 ? (
        <div
          style={{
            background: 'white',
            borderRadius: 10,
            padding: 48,
            textAlign: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ color: '#888', fontSize: 14 }}>
            No tasks found. Add one above or ask the bot to create a reminder.
          </div>
        </div>
      ) : (
        sortedGroups.map((group) => (
          <div key={group} style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 'bold',
                color: group.includes('Overdue') ? RED : group.includes('Today') ? ORANGE : '#555',
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '.5px',
              }}
            >
              {group}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(grouped[group] || []).map((task) => {
                const diff = calDiff(task.due_at);
                const isDone = task.status === 'done';
                const remindLabel = formatRemindAt(task.remind_at);
                return (
                  <div
                    key={task.id}
                    style={{
                      background: 'white',
                      borderRadius: 8,
                      padding: '14px 16px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                      borderLeft: `4px solid ${isDone ? '#ddd' : PRIORITY_COLORS[task.priority]}`,
                      opacity: isDone ? 0.65 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => toggleDone(task)}
                        style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                      />

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 'bold',
                            fontSize: 14,
                            color: isDone ? '#aaa' : BLUE,
                            textDecoration: isDone ? 'line-through' : 'none',
                          }}
                        >
                          {task.title}
                        </div>
                        {task.description && (
                          <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
                            {task.description}
                          </div>
                        )}
                        <div
                          style={{
                            display: 'flex',
                            gap: 12,
                            marginTop: 6,
                            flexWrap: 'wrap',
                            alignItems: 'center',
                          }}
                        >
                          {task.due_at && (
                            <span style={{ fontSize: 11, color: '#888' }}>
                              🕐{' '}
                              {new Date(task.due_at).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                          {diff && !isDone && (
                            <span style={{ fontSize: 11, fontWeight: 'bold', color: diff.color }}>
                              ({diff.label})
                            </span>
                          )}
                          {task.job && (
                            <span style={{ fontSize: 11, color: '#3B82F6' }}>
                              🏠 {task.job.project_address}
                            </span>
                          )}
                          {task.contact && (
                            <span style={{ fontSize: 11, color: '#888' }}>
                              👤 {task.contact.name}
                            </span>
                          )}
                          <span style={{ fontSize: 10, color: PRIORITY_COLORS[task.priority] }}>
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                        </div>

                        {/* Reminder row — visible on all non-done tasks */}
                        {!isDone && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginTop: 8,
                              flexWrap: 'wrap',
                            }}
                          >
                            <span style={{ fontSize: 11, color: '#888' }}>🔔 Next reminder:</span>
                            <select
                              disabled={snoozing[task.id]}
                              onChange={(e) => {
                                const hours = parseInt(e.target.value, 10);
                                if (hours) snoozeTask(task, hours);
                                e.target.value = '';
                              }}
                              defaultValue=""
                              style={{
                                padding: '3px 8px',
                                border: '1px solid #C8D4E4',
                                borderRadius: 5,
                                fontSize: 11,
                                color: '#555',
                                cursor: 'pointer',
                                background: 'white',
                              }}
                            >
                              <option value="" disabled>
                                Set reminder…
                              </option>
                              {SNOOZE_OPTIONS.map((o) => (
                                <option key={o.hours} value={o.hours}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            {remindLabel && (
                              <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
                                Reminds: {remindLabel}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {task.calendar_url && !isDone && (
                          <a
                            href={task.calendar_url}
                            target="_blank"
                            rel="noreferrer"
                            title="Add to Google Calendar"
                            style={{
                              padding: '5px 10px',
                              background: '#4285F422',
                              color: '#4285F4',
                              borderRadius: 6,
                              textDecoration: 'none',
                              fontSize: 11,
                              fontWeight: 'bold',
                              border: '1px solid #4285F440',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            📅 Calendar
                          </a>
                        )}
                        <button
                          onClick={() => deleteTask(task)}
                          style={{
                            padding: '5px 10px',
                            background: '#ff000011',
                            color: RED,
                            border: '1px solid #ff000022',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 11,
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
