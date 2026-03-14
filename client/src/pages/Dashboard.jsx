// client/src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { showToast } from '../utils/toast';
import { showConfirm } from '../utils/confirm';

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
  const [submitTab, setSubmitTab] = useState('text'); // 'text' | 'file'
  const [submitBusy, setSubmitBusy] = useState(false);
  const [manual, setManual] = useState({ customerName:'', customerEmail:'', customerPhone:'', projectAddress:'', estimateText:'' });
  const [uploadFile, setUploadFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const headers = { 'x-auth-token': token };

  const loadDashboard = () => Promise.all([
    fetch('/api/jobs', { headers }).then(r => r.json()),
    fetch('/api/jobs/stats/summary', { headers }).then(r => r.json())
  ]).then(([jobsData, statsData]) => {
    setJobs(jobsData.jobs || []);
    setStats(statsData);
    setLoading(false);
  });

  useEffect(() => {
    loadDashboard();

    // Open a persistent SSE connection — server pushes an event the instant a job finishes processing
    const es = new EventSource(`/api/jobs/events?token=${encodeURIComponent(token)}`);
    es.addEventListener('job_updated', () => loadDashboard());
    es.onerror = () => {}; // suppress console noise on background reconnects

    return () => es.close();
  }, []);

  const [showArchived, setShowArchived] = useState(false);
  const [archivedJobs, setArchivedJobs] = useState([]);

  const archiveJob = async (jobId, customerName) => {
    if (!await showConfirm(`Archive job for ${customerName || 'this customer'}? It will be permanently deleted after 90 days.`)) return;
    const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE', headers });
    if (res.ok) {
      setJobs(jobs.filter(j => j.id !== jobId));
      setStats(prev => prev ? { ...prev, total: (prev.total || 1) - 1 } : prev);
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to archive', 'error');
    }
  };

  const loadArchived = async () => {
    const res = await fetch('/api/jobs/archived/list', { headers });
    const data = await res.json();
    setArchivedJobs(data.jobs || []);
    setShowArchived(true);
  };

  const restoreJob = async (jobId) => {
    const res = await fetch(`/api/jobs/${jobId}/restore`, { method: 'POST', headers });
    if (res.ok) {
      setArchivedJobs(archivedJobs.filter(j => j.id !== jobId));
      window.location.reload();
    }
  };

  const submitManual = async () => {
    setSubmitBusy(true);
    const res = await fetch('/api/jobs/manual', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(manual)
    });
    const data = await res.json();
    setSubmitBusy(false);
    if (res.ok) { setShowManual(false); showToast('Estimate submitted — processing now'); window.location.reload(); }
    else { showToast(data.error || 'Error submitting estimate', 'error'); }
  };

  const submitUpload = async () => {
    if (!uploadFile) return showToast('Please select a file first.', 'warning');
    setSubmitBusy(true);
    const form = new FormData();
    form.append('estimate', uploadFile);
    form.append('customerName', manual.customerName);
    form.append('customerEmail', manual.customerEmail);
    form.append('customerPhone', manual.customerPhone);
    form.append('projectAddress', manual.projectAddress);
    const res = await fetch('/api/jobs/upload-estimate', {
      method: 'POST', headers, body: form
    });
    const data = await res.json();
    setSubmitBusy(false);
    if (res.ok) { setShowManual(false); showToast('File uploaded — processing now'); window.location.reload(); }
    else { showToast(data.error || 'Error processing file', 'error'); }
  };

  const openNewJob = () => {
    setSubmitTab('text');
    setUploadFile(null);
    setManual({ customerName:'', customerEmail:'', customerPhone:'', projectAddress:'', estimateText:'' });
    setShowManual(true);
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
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={openNewJob}
            style={{ background: '#1B3A6B', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}
          >
            + New Job
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total Jobs (YTD)', value: stats.total, icon: '📋' },
            { label: 'Quotes Done (YTD)', value: stats.thisMonth?.count || 0, icon: '📅' },
            { label: 'Pipeline Value', value: `$${(stats.totalValue || 0).toLocaleString()}`, icon: '💰' },
            { label: 'Won Revenue (YTD)', value: `$${(stats.thisMonth?.value || 0).toLocaleString()}`, icon: '📈' },
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
                <td style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Link to={`/jobs/${job.id}`} style={{ color: '#1B3A6B', fontSize: 12, fontWeight: 'bold', textDecoration: 'none' }}>View →</Link>
                  <button
                    onClick={() => archiveJob(job.id, job.customer_name)}
                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}
                    title="Archive job"
                  >Archive</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <button onClick={loadArchived} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
          View Archived Jobs
        </button>
      </div>

      {/* Archived jobs modal */}
      {showArchived && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 600, maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#1B3A6B', margin: 0 }}>Archived Jobs</h2>
              <button onClick={() => setShowArchived(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
            </div>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Archived jobs are permanently deleted after 90 days.</p>
            {archivedJobs.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', padding: 20 }}>No archived jobs.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11 }}>Customer</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11 }}>Archived</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11 }}>Days Left</th>
                    <th style={{ padding: '8px 12px', fontSize: 11 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {archivedJobs.map(job => {
                    const daysLeft = Math.max(0, 90 - Math.floor((Date.now() - new Date(job.archived_at).getTime()) / 86400000));
                    return (
                      <tr key={job.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px 12px', fontSize: 13 }}>{job.customer_name || '—'}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: '#888' }}>{new Date(job.archived_at).toLocaleDateString()}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: daysLeft < 14 ? '#C62828' : '#888' }}>{daysLeft} days</td>
                        <td style={{ padding: '8px 12px' }}>
                          <button onClick={() => restoreJob(job.id)} style={{ background: '#1B3A6B', color: 'white', border: 'none', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                            Restore
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* New Job modal */}
      {showManual && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 580, maxHeight: '92vh', overflow: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ color: '#1B3A6B', margin: 0, fontSize: 20 }}>New Job</h2>
              <button onClick={() => setShowManual(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
            </div>
            <p style={{ color: '#888', fontSize: 12, marginBottom: 20 }}>Submit an estimate any way you have it — Claude will extract the details automatically.</p>

            {/* Customer info (shared across tabs) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Customer Name', key: 'customerName', placeholder: 'John Smith' },
                { label: 'Customer Phone', key: 'customerPhone', placeholder: '+1 555 000 0000' },
                { label: 'Customer Email', key: 'customerEmail', placeholder: 'john@email.com' },
                { label: 'Project Address', key: 'projectAddress', placeholder: '123 Main St, City, FL' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>{f.label}</label>
                  <input
                    value={manual[f.key]}
                    onChange={e => setManual({ ...manual, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '2px solid #f0f0f0', marginBottom: 16 }}>
              {[
                { id: 'text', label: '✏️ Paste Text' },
                { id: 'file', label: '📎 Upload File' },
              ].map(tab => (
                <button key={tab.id} onClick={() => setSubmitTab(tab.id)} style={{
                  padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: submitTab === tab.id ? 'bold' : 'normal',
                  background: 'none', color: submitTab === tab.id ? '#1B3A6B' : '#888',
                  borderBottom: submitTab === tab.id ? '2px solid #1B3A6B' : '2px solid transparent', marginBottom: -2
                }}>{tab.label}</button>
              ))}
            </div>

            {/* Tab: Paste Text */}
            {submitTab === 'text' && (
              <div>
                <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4 }}>
                  Estimate details — paste scope notes, a forwarded email, or type it out
                </label>
                <textarea
                  rows={9}
                  value={manual.estimateText}
                  onChange={e => setManual({ ...manual, estimateText: e.target.value })}
                  style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder={`e.g. New 2-story build — 3-bay garage 1st floor, living space 2nd floor\nMetal roof, board & batten siding, mini splits x3\nPermit included. Start date flexible.\nBudget: $350,000`}
                />
                <button
                  onClick={submitManual}
                  disabled={submitBusy || !manual.estimateText.trim()}
                  style={{ marginTop: 12, width: '100%', padding: 12, background: submitBusy ? '#888' : '#1B3A6B', color: 'white', border: 'none', borderRadius: 6, cursor: submitBusy ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 14 }}
                >
                  {submitBusy ? '⏳ Processing with AI...' : '🤖 Generate Proposal'}
                </button>
              </div>
            )}

            {/* Tab: Upload File */}
            {submitTab === 'file' && (
              <div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}
                  style={{
                    border: `2px dashed ${dragOver ? '#1B3A6B' : '#ddd'}`, borderRadius: 8, padding: 32, textAlign: 'center',
                    background: dragOver ? '#f0f4ff' : '#fafafa', cursor: 'pointer', marginBottom: 12
                  }}
                  onClick={() => document.getElementById('estimate-file-input').click()}
                >
                  {uploadFile ? (
                    <div>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>{uploadFile.type.includes('pdf') ? '📄' : '🖼️'}</div>
                      <div style={{ fontWeight: 'bold', color: '#1B3A6B', fontSize: 14 }}>{uploadFile.name}</div>
                      <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>({(uploadFile.size / 1024).toFixed(1)} KB)</div>
                      <button onClick={e => { e.stopPropagation(); setUploadFile(null); }} style={{ marginTop: 8, background: 'none', border: 'none', color: '#C62828', cursor: 'pointer', fontSize: 12 }}>✕ Remove</button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
                      <div style={{ fontWeight: 'bold', color: '#555', fontSize: 14 }}>Drag & drop or click to browse</div>
                      <div style={{ color: '#888', fontSize: 12, marginTop: 6 }}>
                        Supports: PDF estimates, JPG/PNG photos of printed estimates, .txt files
                      </div>
                    </div>
                  )}
                  <input
                    id="estimate-file-input"
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/webp,.txt"
                    style={{ display: 'none' }}
                    onChange={e => { if (e.target.files[0]) setUploadFile(e.target.files[0]); }}
                  />
                </div>
                {uploadFile && uploadFile.type.startsWith('image/') && (
                  <p style={{ fontSize: 11, color: '#888', marginBottom: 8, marginTop: 0 }}>
                    AI will read the image and extract all text, line items, and dollar amounts automatically.
                  </p>
                )}
                <button
                  onClick={submitUpload}
                  disabled={submitBusy || !uploadFile}
                  style={{ width: '100%', padding: 12, background: submitBusy ? '#888' : '#1B3A6B', color: 'white', border: 'none', borderRadius: 6, cursor: submitBusy ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 14 }}
                >
                  {submitBusy ? '⏳ Processing with AI...' : '🤖 Upload & Generate Proposal'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
