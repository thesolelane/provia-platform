// client/src/pages/JobDetail.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { showToast } from '../utils/toast';
import { showConfirm } from '../utils/confirm';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN = '#2E7D32';
const RED = '#C62828';

const STATUS_COLORS = {
  received: '#888', processing: ORANGE, clarification: '#F59E0B',
  proposal_ready: '#3B82F6', proposal_sent: '#8B5CF6',
  customer_approved: GREEN, contract_ready: '#059669',
  contract_sent: '#047857', complete: BLUE
};

export default function JobDetail({ token }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [clarifications, setClarifications] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [note, setNote] = useState('');
  const [clarAnswer, setClarAnswer] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  const load = () => {
    fetch(`/api/jobs/${id}`, { headers: { 'x-auth-token': token } })
      .then(r => r.json())
      .then(data => {
        setJob(data.job);
        setConversations(data.conversations || []);
        setClarifications(data.clarifications || []);
        setAuditLog(data.auditLog || []);
        setNote(data.job?.notes || '');
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, [id]);

  const approveProposal = async () => {
    setActionLoading(true);
    const res = await fetch(`/api/jobs/${id}/approve`, { method: 'POST', headers });
    const data = await res.json();
    if (res.ok) { load(); showToast('Contract generated successfully'); }
    else { showToast(data.error || 'Failed to generate contract', 'error'); }
    setActionLoading(false);
  };

  const sendToCustomer = async () => {
    if (!await showConfirm(`Send the contract to ${job.customer_email}? This will email the signed contract to the customer.`)) return;
    setActionLoading(true);
    const res = await fetch(`/api/jobs/${id}/send-to-customer`, { method: 'POST', headers });
    const data = await res.json();
    if (res.ok) { load(); showToast('Contract sent to customer'); }
    else { showToast(data.error || 'Failed to send contract', 'error'); }
    setActionLoading(false);
  };

  const saveNote = async () => {
    await fetch(`/api/jobs/${id}/notes`, { method: 'PATCH', headers, body: JSON.stringify({ notes: note }) });
  };

  const submitClarAnswer = async (clarId) => {
    if (!clarAnswer.trim()) return;
    setActionLoading(true);
    const res = await fetch(`/api/jobs/${id}/clarify/${clarId}`, {
      method: 'POST', headers, body: JSON.stringify({ answer: clarAnswer.trim() })
    });
    const data = await res.json();
    setClarAnswer('');
    setActionLoading(false);
    load();
    if (data.allAnswered) {
      showToast('All questions answered — generating proposal now', 'info');
    }
  };

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Loading job...</div>;
  if (!job) return <div style={{ padding: 40, color: RED }}>Job not found.</div>;

  const statusColor = STATUS_COLORS[job.status] || '#888';
  const proposalData = job.proposal_data;
  const contractData = job.contract_data;

  const TABS = ['overview', 'proposal', 'contract', 'conversation', 'audit'];

  return (
    <div style={{ padding: 32 }}>
      {/* Back */}
      <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>
        ← Back to Dashboard
      </button>

      {/* Header */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>{job.customer_name || 'Unknown Customer'}</h1>
            <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>{job.project_address}</div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>Job ID: {job.id?.slice(0, 8)}... &nbsp;|&nbsp; {new Date(job.created_at).toLocaleDateString()}</div>
          </div>
          <span style={{ background: statusColor + '22', color: statusColor, padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 'bold' }}>
            {job.status?.replace(/_/g, ' ').toUpperCase()}
          </span>
        </div>

        {/* Key numbers */}
        <div style={{ display: 'flex', gap: 24, marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
          <div><div style={{ fontSize: 11, color: '#888' }}>Contract Value</div><div style={{ fontSize: 20, fontWeight: 'bold', color: BLUE }}>{job.total_value ? `$${job.total_value.toLocaleString()}` : '—'}</div></div>
          <div><div style={{ fontSize: 11, color: '#888' }}>Deposit (33%)</div><div style={{ fontSize: 20, fontWeight: 'bold', color: ORANGE }}>{job.deposit_amount ? `$${job.deposit_amount.toLocaleString()}` : '—'}</div></div>
          <div><div style={{ fontSize: 11, color: '#888' }}>Email</div><div style={{ fontSize: 13, color: '#333', marginTop: 4 }}>{job.customer_email || '—'}</div></div>
          <div><div style={{ fontSize: 11, color: '#888' }}>Phone</div><div style={{ fontSize: 13, color: '#333', marginTop: 4 }}>{job.customer_phone || '—'}</div></div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {job.proposal_pdf_path && (
            <a href={`/outputs/${job.proposal_pdf_path.split('/').pop()}`} target="_blank" rel="noreferrer"
              style={{ padding: '8px 16px', background: '#3B82F6', color: 'white', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 'bold' }}>
              📄 View Proposal PDF
            </a>
          )}
          {job.contract_pdf_path && (
            <a href={`/outputs/${job.contract_pdf_path.split('/').pop()}`} target="_blank" rel="noreferrer"
              style={{ padding: '8px 16px', background: '#059669', color: 'white', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 'bold' }}>
              📄 View Contract PDF
            </a>
          )}
          {['proposal_ready', 'proposal_sent'].includes(job.status) && (
            <button onClick={approveProposal} disabled={actionLoading}
              style={{ padding: '8px 16px', background: GREEN, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? '...' : '✅ Approve → Generate Contract'}
            </button>
          )}
          {['contract_ready'].includes(job.status) && job.customer_email && (
            <button onClick={sendToCustomer} disabled={actionLoading}
              style={{ padding: '8px 16px', background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? '...' : '📧 Send Contract to Customer'}
            </button>
          )}
        </div>
      </div>

      {/* Flagged items warning */}
      {job.flagged_items?.length > 0 && (
        <div style={{ background: '#FFF8F0', border: `1px solid ${ORANGE}`, borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
          <strong style={{ color: ORANGE }}>⚠️ {job.flagged_items.length} item(s) flagged for review:</strong>
          <ul style={{ margin: '6px 0 0 16px', color: '#5D3A00' }}>
            {job.flagged_items.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      {/* Clarification questions */}
      {job.status === 'clarification' && clarifications.length > 0 && (() => {
        const pending = clarifications.find(c => !c.answer);
        const answered = clarifications.filter(c => c.answer);
        const total = clarifications.length;
        return (
          <div style={{ background: '#FFFDE7', border: '1px solid #F59E0B', borderRadius: 8, padding: 20, marginBottom: 16 }}>
            <strong style={{ color: '#92400E', fontSize: 14 }}>❓ Clarification Needed ({answered.length} of {total} answered)</strong>
            {answered.map((c, i) => (
              <div key={c.id} style={{ marginTop: 12, padding: 10, background: '#f0fdf4', borderRadius: 6, borderLeft: `3px solid ${GREEN}` }}>
                <div style={{ fontSize: 12, color: '#888' }}>Question {i + 1}:</div>
                <div style={{ fontSize: 13, color: '#333', marginBottom: 4 }}>{c.question}</div>
                <div style={{ fontSize: 12, color: GREEN, fontWeight: 'bold' }}>✅ {c.answer}</div>
              </div>
            ))}
            {pending && (
              <div style={{ marginTop: 12, padding: 10, background: 'white', borderRadius: 6, borderLeft: `3px solid #F59E0B` }}>
                <div style={{ fontSize: 12, color: '#92400E', fontWeight: 'bold' }}>Question {answered.length + 1} of {total}:</div>
                <div style={{ fontSize: 13, color: '#333', marginTop: 4, marginBottom: 8 }}>{pending.question}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={clarAnswer}
                    onChange={e => setClarAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && clarAnswer.trim()) { submitClarAnswer(pending.id); } }}
                    placeholder="Type your answer..."
                    style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}
                  />
                  <button
                    onClick={() => submitClarAnswer(pending.id)}
                    disabled={!clarAnswer.trim() || actionLoading}
                    style={{ padding: '8px 16px', background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                    {actionLoading ? '...' : 'Submit'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #eee' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              color: activeTab === tab ? BLUE : '#888',
              borderBottom: activeTab === tab ? `2px solid ${BLUE}` : '2px solid transparent',
              marginBottom: -2, textTransform: 'capitalize' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: 'white', borderRadius: 10, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            <h3 style={{ color: BLUE, marginBottom: 16 }}>Project Details</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Customer', job.customer_name],
                  ['Email', job.customer_email],
                  ['Phone', job.customer_phone],
                  ['Project Address', job.project_address],
                  ['City', job.project_city],
                  ['Stretch Code Town', job.stretch_code_town ? '✅ Yes — Stretch Code applies' : '❌ No'],
                  ['Submitted Via', job.submitted_by],
                  ['Total Value', job.total_value ? `$${job.total_value.toLocaleString()}` : '—'],
                  ['Deposit', job.deposit_amount ? `$${job.deposit_amount.toLocaleString()}` : '—'],
                ].map(([label, value]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 0', fontSize: 12, color: '#888', width: 160 }}>{label}</td>
                    <td style={{ padding: '10px 0', fontSize: 13, color: '#222' }}>{value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ color: BLUE, marginBottom: 10 }}>Internal Notes</h3>
              <textarea rows={4} value={note} onChange={e => setNote(e.target.value)}
                style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
                placeholder="Add internal notes here..." />
              <button onClick={saveNote} style={{ marginTop: 8, padding: '8px 16px', background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                Save Note
              </button>
            </div>
          </div>
        )}

        {/* PROPOSAL */}
        {activeTab === 'proposal' && (
          <div>
            {!proposalData ? (
              <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>No proposal generated yet.</div>
            ) : (
              <div>
                <h3 style={{ color: BLUE, marginBottom: 16 }}>Proposal Summary</h3>
                <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <div><div style={{ fontSize: 11, color: '#888' }}>Total</div><div style={{ fontSize: 18, fontWeight: 'bold', color: BLUE }}>${proposalData.totalValue?.toLocaleString()}</div></div>
                    <div><div style={{ fontSize: 11, color: '#888' }}>Deposit</div><div style={{ fontSize: 18, fontWeight: 'bold', color: ORANGE }}>${proposalData.depositAmount?.toLocaleString()}</div></div>
                    <div><div style={{ fontSize: 11, color: '#888' }}>Quote #</div><div style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>{proposalData.quoteNumber}</div></div>
                  </div>
                </div>
                {proposalData.flaggedItems?.length > 0 && (
                  <div style={{ background: '#FFF8F0', border: `1px solid ${ORANGE}`, borderRadius: 6, padding: 12, marginBottom: 12, fontSize: 12 }}>
                    ⚠️ Flagged: {proposalData.flaggedItems.join(' • ')}
                  </div>
                )}
                <pre style={{ background: '#f4f6fb', borderRadius: 8, padding: 16, fontSize: 11, overflow: 'auto', maxHeight: 400 }}>
                  {JSON.stringify(proposalData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* CONTRACT */}
        {activeTab === 'contract' && (
          <div>
            {!contractData ? (
              <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
                {['proposal_ready', 'proposal_sent'].includes(job.status)
                  ? 'Approve the proposal above to generate the contract.'
                  : 'No contract generated yet.'}
              </div>
            ) : (
              <div>
                <h3 style={{ color: BLUE, marginBottom: 16 }}>Contract Summary</h3>
                <pre style={{ background: '#f4f6fb', borderRadius: 8, padding: 16, fontSize: 11, overflow: 'auto', maxHeight: 400 }}>
                  {JSON.stringify(contractData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* CONVERSATION */}
        {activeTab === 'conversation' && (
          <div>
            <h3 style={{ color: BLUE, marginBottom: 16 }}>Communication Thread</h3>
            {conversations.length === 0
              ? <div style={{ color: '#888', textAlign: 'center', padding: 20 }}>No messages yet.</div>
              : conversations.map(c => (
                <div key={c.id} style={{
                  marginBottom: 12, padding: 12, borderRadius: 8,
                  background: c.direction === 'inbound' ? '#f0f4ff' : '#f9fff9',
                  borderLeft: `3px solid ${c.direction === 'inbound' ? BLUE : GREEN}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 'bold', color: c.direction === 'inbound' ? BLUE : GREEN }}>
                      {c.direction.toUpperCase()} · {c.channel.toUpperCase()} · {c.from_address}
                    </span>
                    <span style={{ fontSize: 10, color: '#888' }}>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#333', whiteSpace: 'pre-wrap' }}>{c.message}</div>
                </div>
              ))
            }
          </div>
        )}

        {/* AUDIT */}
        {activeTab === 'audit' && (
          <div>
            <h3 style={{ color: BLUE, marginBottom: 16 }}>Audit Log</h3>
            {auditLog.length === 0
              ? <div style={{ color: '#888' }}>No audit entries.</div>
              : auditLog.map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
                  <span style={{ color: '#888', width: 140, flexShrink: 0 }}>{new Date(a.created_at).toLocaleString()}</span>
                  <span style={{ fontWeight: 'bold', color: BLUE, width: 160, flexShrink: 0 }}>{a.action}</span>
                  <span style={{ color: '#555' }}>{a.details}</span>
                  <span style={{ color: '#aaa', marginLeft: 'auto', flexShrink: 0 }}>by {a.performed_by}</span>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
