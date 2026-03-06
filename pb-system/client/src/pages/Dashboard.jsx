// client/src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const STATUS_COLORS = {
  received: '#888', processing: '#E07B2A', clarification: '#F59E0B',
  proposal_ready: '#3B82F6', proposal_sent: '#8B5CF6',
  customer_approved: '#10B981', contract_ready: '#059669',
  contract_sent: '#047857', complete: '#1B3A6B', error: '#C62828'
};

const STATUS_LABELS = {
  received: 'Received', processing: 'Processing', clarification: 'Needs Info',
  proposal_ready: 'Proposal Ready', proposal_sent: 'Proposal Sent',
  customer_approved: 'Approved', contract_ready: 'Contract Ready',
  contract_sent: 'Contract Sent', complete: 'Complete'
};

export default function Dashboard({ token }) {
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ customerName:'', customerEmail:'', customerPhone:'', projectAddress:'', estimateText:'' });

  const headers = { 'x-auth-token': token };

  useEffect(() => {
    Promise.all([
      fetch('/api/jobs', { headers }).then(r => r.json()),
      fetch('/api/jobs/stats/summary', { headers }).then(r => r.json())
    ]).then(([jobsData, statsData]) => {
      setJobs(jobsData.jobs || []);
      setStats(statsData);
      setLoading(false);
    });
  }, []);

  const submitManual = async () => {
    const res = await fetch('/api/jobs/manual', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(manual)
    });
    const data = await res.json();
    if (res.ok) { setShowManual(false); window.location.reload(); }
    else { alert(data.error); }
  };

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Loading...</div>;

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 'bold', color: '#1B3A6B', margin: 0 }}>Dashboard</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Preferred Builders AI Contract System</p>
        </div>
        <button
          onClick={() => setShowManual(true)}
          style={{ background: '#1B3A6B', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
        >
          + Manual Estimate
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total Jobs', value: stats.total, icon: '📋' },
            { label: 'This Month', value: stats.thisMonth?.count || 0, icon: '📅' },
            { label: 'Pipeline Value', value: `$${(stats.totalValue || 0).toLocaleString()}`, icon: '💰' },
            { label: 'Month Revenue', value: `$${(stats.thisMonth?.value || 0).toLocaleString()}`, icon: '📈' },
          ].map(card => (
            <div key={card.label} style={{ background: 'white', borderRadius: 10, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{card.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: '#1B3A6B' }}>{card.value}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Jobs table */}
      <div style={{ background: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#1B3A6B' }}>
              {['Customer', 'Address', 'Value', 'Status', 'Date', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', color: 'white', textAlign: 'left', fontSize: 12, fontWeight: 'bold' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#888' }}>No jobs yet. Waiting for estimates from Hearth...</td></tr>
            )}
            {jobs.map((job, i) => (
              <tr key={job.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: '500' }}>{job.customer_name || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#555' }}>{job.project_address || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: '500', color: '#1B3A6B' }}>
                  {job.total_value ? `$${job.total_value.toLocaleString()}` : '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    background: STATUS_COLORS[job.status] + '22',
                    color: STATUS_COLORS[job.status],
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 'bold'
                  }}>
                    {STATUS_LABELS[job.status] || job.status}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 11, color: '#888' }}>
                  {new Date(job.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <Link to={`/jobs/${job.id}`} style={{ color: '#1B3A6B', fontSize: 12, fontWeight: 'bold', textDecoration: 'none' }}>View →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Manual entry modal */}
      {showManual && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ color: '#1B3A6B', marginBottom: 20 }}>Manual Estimate Entry</h2>
            {[
              { label: 'Customer Name', key: 'customerName' },
              { label: 'Customer Email', key: 'customerEmail' },
              { label: 'Customer Phone', key: 'customerPhone' },
              { label: 'Project Address', key: 'projectAddress' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input
                  value={manual[f.key]}
                  onChange={e => setManual({ ...manual, [f.key]: e.target.value })}
                  style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Estimate Details (paste Hearth notes or describe scope)</label>
              <textarea
                rows={8}
                value={manual.estimateText}
                onChange={e => setManual({ ...manual, estimateText: e.target.value })}
                style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
                placeholder="e.g. New 2-story build, 3-bay garage 1st floor, living space 2nd floor, metal roof, board & batten, mini splits..."
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowManual(false)} style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', background: 'white' }}>Cancel</button>
              <button onClick={submitManual} style={{ flex: 2, padding: 10, background: '#1B3A6B', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>
                🤖 Generate Proposal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
