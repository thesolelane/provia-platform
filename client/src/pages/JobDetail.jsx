// client/src/pages/JobDetail.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { showToast } from '../utils/toast';
import { showConfirm } from '../utils/confirm';
import PhotosTab from '../components/PhotosTab';
import PaymentsTab from '../components/PaymentsTab';

const BLUE   = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN  = '#2E7D32';
const RED    = '#C62828';
const PURPLE = '#7C3AED';

const STATUS_COLORS = {
  received:          '#888',
  processing:        ORANGE,
  clarification:     '#F59E0B',
  review_pending:    '#E07B2A',
  proposal_ready:    '#3B82F6',
  proposal_sent:     '#8B5CF6',
  proposal_approved: '#059669',
  contract_ready:    '#0D9488',
  contract_sent:     '#047857',
  contract_signed:   '#1B3A6B',
  complete:          '#111827',
  error:             RED,
};

const STATUS_LABELS = {
  received:          'Received',
  processing:        'Processing',
  clarification:     'Needs Clarification',
  review_pending:    'Review Line Items',
  proposal_ready:    'Proposal Ready',
  proposal_sent:     'Sent for Approval',
  proposal_approved: 'Proposal Approved ✓',
  contract_ready:    'Contract Ready',
  contract_sent:     'Contract Sent',
  contract_signed:   'Contract Signed ✓',
  complete:          'Complete',
  error:             'Error',
};

export default function JobDetail({ token }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob]               = useState(null);
  const [conversations, setConversations] = useState([]);
  const [clarifications, setClarifications] = useState([]);
  const [auditLog, setAuditLog]     = useState([]);
  const [sigSessions, setSigSessions] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [note, setNote]             = useState('');
  const [clarAnswer, setClarAnswer] = useState('');
  const [activeTab, setActiveTab]   = useState('overview');
  const [editingLineItems, setEditingLineItems] = useState(null);
  const [savingLineItems, setSavingLineItems]   = useState(false);

  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  const [versionHistory, setVersionHistory] = useState([]);
  const [marginData, setMarginData] = useState(null);
  const [marginLoading, setMarginLoading] = useState(false);

  const load = () => {
    fetch(`/api/jobs/${id}`, { headers: { 'x-auth-token': token } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        setJob(data.job || null);
        setConversations(data.conversations || []);
        setClarifications(data.clarifications || []);
        setAuditLog(data.auditLog || []);
        setVersionHistory(data.versionHistory || []);
        setNote(data.job?.notes || '');
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch(`/api/signing/status/${id}`, { headers: { 'x-auth-token': token } })
      .then(r => r.json())
      .then(data => setSigSessions(data.sessions || []))
      .catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  // Load margin data when job loads (Financial Health Check — added by Task #16)
  useEffect(() => {
    if (!id) return;
    fetch(`/api/jobs/${id}/margin`, { headers: { 'x-auth-token': token } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { setMarginData(data); setMarginLoading(false); })
      .catch(() => { setMarginData(null); setMarginLoading(false); });
  }, [id, token]);

  // Auto-refresh via SSE when job is processing — no manual refresh needed
  useEffect(() => {
    if (!job || !['processing', 'received'].includes(job.status)) return;
    const es = new EventSource(`/api/jobs/events?token=${encodeURIComponent(token)}`);
    es.addEventListener('job_updated', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.jobId === id) load();
      } catch { load(); }
    });
    // Poll as fallback every 8 seconds while processing
    const poll = setInterval(load, 8000);
    return () => { es.close(); clearInterval(poll); };
  }, [job?.status, id]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const sendForApproval = async () => {
    if (!await showConfirm(`Send a proposal signing link to ${job.customer_email}?`)) return;
    setActionLoading(true);
    const res  = await fetch(`/api/signing/send-proposal/${id}`, { method: 'POST', headers });
    const data = await res.json();
    if (res.ok) { load(); showToast('Proposal signing link sent!'); }
    else        { showToast(data.error || 'Failed to send', 'error'); }
    setActionLoading(false);
  };

  const approveProposal = async () => {
    if (!await showConfirm('Mark this proposal as approved? This will allow you to generate the contract.')) return;
    setActionLoading(true);
    const res  = await fetch(`/api/jobs/${id}/mark-approved`, { method: 'POST', headers });
    const data = await res.json();
    if (res.ok) { load(); showToast('Proposal marked as approved'); }
    else        { showToast(data.error || 'Failed to approve proposal', 'error'); }
    setActionLoading(false);
  };

  const generateContract = async () => {
    if (!await showConfirm('Generate contract from this approved proposal?')) return;
    setActionLoading(true);
    const res  = await fetch(`/api/jobs/${id}/approve`, { method: 'POST', headers });
    const data = await res.json();
    if (res.ok) { load(); showToast('Contract generated'); }
    else        { showToast(data.error || 'Failed to generate contract', 'error'); }
    setActionLoading(false);
  };

  const sendContractForSigning = async () => {
    if (!await showConfirm(`Send contract signing link to ${job.customer_email}?`)) return;
    setActionLoading(true);
    const res  = await fetch(`/api/signing/send-contract/${id}`, { method: 'POST', headers });
    const data = await res.json();
    if (res.ok) { load(); showToast('Contract signing link sent!'); }
    else        { showToast(data.error || 'Failed to send', 'error'); }
    setActionLoading(false);
  };

  const reprocessJob = async () => {
    if (!await showConfirm('Retry AI processing on this job? The original scope will be re-submitted to Claude.')) return;
    setActionLoading(true);
    const res  = await fetch(`/api/jobs/${id}/reprocess`, { method: 'POST', headers });
    const data = await res.json();
    setActionLoading(false);
    if (res.ok) { load(); showToast('Reprocessing started — refresh in a moment', 'info'); }
    else        { showToast(data.error || 'Failed to reprocess', 'error'); }
  };

  const reviseEstimate = async () => {
    const currentVer = job.version || 1;
    const nextVer = currentVer + 1;
    if (!await showConfirm(
      `Open Revision ${nextVer} for editing?\n\nThis will reopen the line-item editor so you can adjust trades, costs, and descriptions before generating a new proposal PDF. Version ${currentVer} stays in the activity log. The existing contract PDF will be cleared.`
    )) return;
    setActionLoading(true);
    const res  = await fetch(`/api/jobs/${id}/revise`, { method: 'POST', headers });
    const data = await res.json();
    setActionLoading(false);
    if (res.ok) { load(); showToast(`Version ${data.version} opened for editing — adjust line items below`, 'info'); }
    else        { showToast(data.error || 'Failed to revise estimate', 'error'); }
  };

  const markComplete = async () => {
    if (!await showConfirm('Mark this job as complete?')) return;
    setActionLoading(true);
    await fetch(`/api/jobs/${id}/notes`, { method: 'PATCH', headers, body: JSON.stringify({ notes: note, status: 'complete' }) });
    load();
    setActionLoading(false);
    showToast('Job marked complete');
  };

  const saveNote = async () => {
    await fetch(`/api/jobs/${id}/notes`, { method: 'PATCH', headers, body: JSON.stringify({ notes: note }) });
    showToast('Note saved');
  };

  const startEditingLineItems = () => {
    const items = (job.proposal_data?.lineItems || []).map(li => ({ ...li }));
    setEditingLineItems(items);
  };

  const updateLineItem = (idx, field, value) => {
    setEditingLineItems(prev => prev.map((li, i) => i === idx ? { ...li, [field]: value } : li));
  };

  const addLineItem = () => {
    setEditingLineItems(prev => [...prev, { trade: '', baseCost: 0, description: '', scopeIncluded: [], scopeExcluded: [] }]);
  };

  const removeLineItem = (idx) => {
    setEditingLineItems(prev => prev.filter((_, i) => i !== idx));
  };

  const saveLineItems = async () => {
    // Client-side validation before hitting the server
    for (let i = 0; i < editingLineItems.length; i++) {
      const li = editingLineItems[i];
      if (!li.trade?.trim()) {
        showToast(`Row ${i + 1}: Trade name cannot be empty`, 'error'); return;
      }
      if (li.baseCost === '' || li.baseCost === null || Number(li.baseCost) < 0) {
        showToast(`Row ${i + 1} (${li.trade}): Cost must be 0 or greater`, 'error'); return;
      }
    }
    setSavingLineItems(true);
    const res  = await fetch(`/api/jobs/${id}/line-items`, { method: 'PATCH', headers, body: JSON.stringify({ lineItems: editingLineItems }) });
    const data = await res.json();
    setSavingLineItems(false);
    if (res.ok) { load(); showToast('Line items saved'); }
    else        { showToast(data.error || 'Failed to save', 'error'); }
  };

  const generateProposal = async () => {
    if (!await showConfirm('Generate the proposal PDF from these line items? This cannot be undone.')) return;
    setActionLoading(true);
    const res  = await fetch(`/api/jobs/${id}/generate-proposal`, { method: 'POST', headers });
    const data = await res.json();
    setActionLoading(false);
    if (res.ok) { setEditingLineItems(null); load(); showToast('Proposal generated!'); }
    else        { showToast(data.error || 'Failed to generate proposal', 'error'); }
  };

  const multiplier = (() => {
    const pricing = job?.proposal_data?.pricing;
    return pricing?.markupMultiplier || 1.5813;
  })();

  const submitClarAnswer = async (clarId) => {
    if (!clarAnswer.trim()) return;
    setActionLoading(true);
    const res  = await fetch(`/api/jobs/${id}/clarify/${clarId}`, {
      method: 'POST', headers, body: JSON.stringify({ answer: clarAnswer.trim() })
    });
    const data = await res.json();
    setClarAnswer('');
    setActionLoading(false);
    load();
    if (data.allAnswered) showToast('All questions answered — generating proposal now', 'info');
  };

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Loading job...</div>;
  if (!job)    return <div style={{ padding: 40, color: RED }}>Job not found.</div>;

  const statusColor = STATUS_COLORS[job.status] || '#888';
  const statusLabel = STATUS_LABELS[job.status] || job.status?.replace(/_/g, ' ').toUpperCase();
  const proposalData = job.proposal_data;
  const contractData = job.contract_data;

  // Most recent signing sessions
  const proposalSession = sigSessions.find(s => s.doc_type === 'proposal');
  const contractSession = sigSessions.find(s => s.doc_type === 'contract');

  const TABS = ['overview', 'history', 'payments', 'photos', 'signatures', 'proposal', 'contract', 'conversation', 'assessment'];

  // ── Read Receipt Badge ────────────────────────────────────────────────────
  const ReadReceiptBadge = ({ session, label }) => {
    if (!session) return null;
    return (
      <div style={{ background: '#f8f9ff', border: '1px solid #e0e7ff', borderRadius: 8, padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 'bold', color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          📬 {label} — Read Receipts
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, display: 'flex', gap: 8 }}>
            <span style={{ color: '#888', width: 80 }}>Sent:</span>
            <span style={{ color: '#333' }}>{session.email_sent_at ? new Date(session.email_sent_at).toLocaleString() : '—'}</span>
          </div>
          <div style={{ fontSize: 12, display: 'flex', gap: 8 }}>
            <span style={{ color: '#888', width: 80 }}>Opened:</span>
            {session.opened_at
              ? <span style={{ color: GREEN, fontWeight: 'bold' }}>✅ {new Date(session.opened_at).toLocaleString()} (IP: {session.opened_ip})</span>
              : <span style={{ color: '#aaa' }}>Not yet opened</span>}
          </div>
          <div style={{ fontSize: 12, display: 'flex', gap: 8 }}>
            <span style={{ color: '#888', width: 80 }}>Signed:</span>
            {session.signed_at
              ? <span style={{ color: BLUE, fontWeight: 'bold' }}>✍️ {new Date(session.signed_at).toLocaleString()} — {session.signer_name}</span>
              : <span style={{ color: '#aaa' }}>Not yet signed</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 32 }}>
      {/* Back */}
      <button onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', color: BLUE, cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>
        ← Back to Dashboard
      </button>

      {/* Header card */}
      <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 'bold', color: BLUE, margin: 0 }}>{job.customer_name || 'Unknown Customer'}</h1>
            <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>{job.project_address}</div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
              Job ID: {job.id?.slice(0, 8)}... &nbsp;|&nbsp; {new Date(job.created_at).toLocaleDateString()}
              {job.quote_number && (
                <span style={{ marginLeft: 8, color: BLUE, fontWeight: 'bold' }}>
                  &nbsp;|&nbsp; Quote #{job.quote_number}{job.version ? `/${job.version}` : ''}
                </span>
              )}
            </div>
          </div>
          <span style={{ background: statusColor + '22', color: statusColor, padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 'bold' }}>
            {statusLabel}
          </span>
        </div>

        {/* Key numbers */}
        <div style={{ display: 'flex', gap: 24, marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: '#888' }}>Contract Value</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: BLUE }}>{job.total_value ? `$${job.total_value.toLocaleString()}` : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888' }}>Deposit (33%)</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: ORANGE }}>{job.deposit_amount ? `$${job.deposit_amount.toLocaleString()}` : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888' }}>Email</div>
            <div style={{ fontSize: 13, color: '#333', marginTop: 4 }}>{job.customer_email || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888' }}>Phone</div>
            <div style={{ fontSize: 13, color: '#333', marginTop: 4 }}>{job.customer_phone || '—'}</div>
          </div>
        </div>

        {/* PDF links */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {job.proposal_pdf_path && (
            <a href={`/outputs/${job.proposal_pdf_path.split(/[\\/]/).pop()}?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer"
              style={{ padding: '7px 14px', background: '#3B82F620', color: '#3B82F6', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 'bold', border: '1px solid #3B82F640' }}>
              📄 View Proposal PDF
            </a>
          )}
          {job.contract_pdf_path && (
            <a href={`/outputs/${job.contract_pdf_path.split(/[\\/]/).pop()}?token=${encodeURIComponent(token)}`} target="_blank" rel="noreferrer"
              style={{ padding: '7px 14px', background: '#05966920', color: '#059669', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 'bold', border: '1px solid #05966940' }}>
              📄 View Contract PDF
            </a>
          )}
        </div>

        {/* ── ACTION BUTTONS ── */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>

          {/* Send proposal for approval */}
          {job.status === 'proposal_ready' && job.customer_email && (
            <button onClick={sendForApproval} disabled={actionLoading}
              style={{ padding: '9px 18px', background: '#8B5CF6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? '...' : '📨 Send Proposal for Signature'}
            </button>
          )}

          {/* Resend proposal link */}
          {job.status === 'proposal_sent' && job.customer_email && (
            <button onClick={sendForApproval} disabled={actionLoading}
              style={{ padding: '9px 18px', background: '#8B5CF620', color: '#8B5CF6', border: '1px solid #8B5CF640', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? '...' : '📨 Resend Proposal Link'}
            </button>
          )}

          {/* Manual approve — for in-person or verbal approvals */}
          {['proposal_ready', 'proposal_sent'].includes(job.status) && (
            <button onClick={approveProposal} disabled={actionLoading}
              style={{ padding: '9px 18px', background: '#059669', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? '...' : '✅ Mark Proposal Approved'}
            </button>
          )}

          {/* Generate contract (manual — after proposal approved, or if auto-gen failed) */}
          {['proposal_approved'].includes(job.status) && !job.contract_pdf_path && (
            <button onClick={generateContract} disabled={actionLoading}
              style={{ padding: '9px 18px', background: '#059669', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? 'Generating...' : '📋 Generate Contract'}
            </button>
          )}

          {/* Auto-gen note when contract_ready comes through */}
          {job.status === 'proposal_approved' && job.contract_pdf_path && (
            <span style={{ fontSize: 12, color: '#059669', padding: '9px 0', fontWeight: 'bold' }}>
              ✅ Contract auto-generated
            </span>
          )}

          {/* Send contract for signing */}
          {job.status === 'contract_ready' && job.customer_email && (
            <button onClick={sendContractForSigning} disabled={actionLoading}
              style={{ padding: '9px 18px', background: '#047857', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? '...' : '📧 Send Contract for Signature'}
            </button>
          )}

          {/* Resend contract link */}
          {job.status === 'contract_sent' && job.customer_email && (
            <button onClick={sendContractForSigning} disabled={actionLoading}
              style={{ padding: '9px 18px', background: '#04785720', color: '#047857', border: '1px solid #04785740', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? '...' : '📧 Resend Contract Link'}
            </button>
          )}

          {/* Retry failed job */}
          {job.status === 'error' && (
            <button onClick={reprocessJob} disabled={actionLoading}
              style={{ padding: '9px 18px', background: ORANGE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? 'Retrying...' : '🔄 Retry AI Processing'}
            </button>
          )}

          {/* Mark complete */}
          {job.status === 'contract_signed' && (
            <button onClick={markComplete} disabled={actionLoading}
              style={{ padding: '9px 18px', background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? '...' : '🎉 Mark Job Complete'}
            </button>
          )}

          {/* Revise estimate — show whenever a proposal PDF exists and not actively processing */}
          {(job.proposal_pdf_path || job.proposal_data) && !['received', 'processing', 'error', 'clarification'].includes(job.status) && (
            <button onClick={reviseEstimate} disabled={actionLoading}
              style={{ padding: '9px 18px', background: 'white', color: ORANGE, border: `2px solid ${ORANGE}`, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
              {actionLoading ? '...' : `✏️ Revise Estimate (v${job.version || 1})`}
            </button>
          )}
        </div>

        {/* Read receipt inline previews */}
        {proposalSession && ['proposal_sent', 'proposal_approved'].includes(job.status) && (
          <ReadReceiptBadge session={proposalSession} label="Proposal" />
        )}
        {contractSession && ['contract_sent', 'contract_signed'].includes(job.status) && (
          <ReadReceiptBadge session={contractSession} label="Contract" />
        )}
      </div>

      {/* ── Processing indicator ── auto-refreshes when done */}
      {['processing', 'received'].includes(job.status) && (
        <div style={{ background: '#FFF8F0', border: `2px solid ${ORANGE}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>⚙️</span>
            <div>
              <div style={{ fontWeight: 700, color: ORANGE, fontSize: 14 }}>AI Processing in Progress</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Analyzing scope, extracting line items, and calculating costs — this takes 30–90 seconds. This page will update automatically when done.</div>
            </div>
          </div>
          <div style={{ height: 8, background: '#fde8c8', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${ORANGE}, #f59e0b)`,
              animation: 'pb-progress 2s ease-in-out infinite',
              width: '40%',
            }} />
          </div>
          <style>{`
            @keyframes pb-progress {
              0%   { transform: translateX(-100%); width: 40%; }
              50%  { width: 70%; }
              100% { transform: translateX(280%); width: 40%; }
            }
          `}</style>
        </div>
      )}

      {/* Flagged items */}
      {job.flagged_items?.length > 0 && (
        <div style={{ background: '#FFF8F0', border: `1px solid ${ORANGE}`, borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
          <strong style={{ color: ORANGE }}>⚠️ {job.flagged_items.length} item(s) flagged for review:</strong>
          <ul style={{ margin: '6px 0 0 16px', color: '#5D3A00' }}>
            {job.flagged_items.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      {/* ── Review Pending — Line Item Editor ── */}
      {job.status === 'review_pending' && (
        <div style={{ background: '#FFF8F0', border: `2px solid ${ORANGE}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <strong style={{ color: ORANGE, fontSize: 15 }}>✏️ Review Extracted Line Items</strong>
              <div style={{ fontSize: 12, color: '#777', marginTop: 2 }}>
                Edit costs or descriptions before generating the proposal PDF.
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, background: '#fff3e0', color: '#b45309', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
                  Sub O&amp;P 15%
                </span>
                <span style={{ fontSize: 11, background: '#fff3e0', color: '#b45309', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
                  GC O&amp;P 25%
                </span>
                <span style={{ fontSize: 11, background: '#fff3e0', color: '#b45309', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
                  Contingency 10%
                </span>
                <span style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>
                  = {multiplier.toFixed(4)}× multiplier
                </span>
              </div>
            </div>
            {!editingLineItems && (
              <button onClick={startEditingLineItems}
                style={{ padding: '8px 16px', background: ORANGE, color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ✏️ Edit Line Items
              </button>
            )}
          </div>

          {/* Read-only summary (before editing starts) */}
          {!editingLineItems && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#555', fontWeight: 600 }}>Trade</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#555', fontWeight: 600 }}>Sub Cost</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#555', fontWeight: 600 }}>Client Price</th>
                </tr>
              </thead>
              <tbody>
                {(job.proposal_data?.lineItems || []).map((li, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '7px 8px', color: '#333' }}>{li.trade}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: '#777' }}>${(li.baseCost || 0).toLocaleString()}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, color: BLUE }}>${(li.finalPrice || 0).toLocaleString()}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid #e5e7eb', background: '#fff7ed' }}>
                  <td colSpan={2} style={{ padding: '8px', fontWeight: 700, color: '#333' }}>Estimated Total</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: ORANGE, fontSize: 15 }}>
                    ${(job.proposal_data?.totalValue || job.total_value || 0).toLocaleString()}
                  </td>
                </tr>
                {job.proposal_data?.pricing?.pricePerSqft && (
                  <tr style={{ background: job.proposal_data.pricing.sqftWarning ? (job.proposal_data.pricing.sqftWarning === 'below' ? '#fff3cd' : '#fde8e8') : '#f0f9f0' }}>
                    <td colSpan={2} style={{ padding: '6px 8px', fontSize: 12, color: '#555' }}>
                      Price per sq ft
                      {job.proposal_data.pricing.sqftWarning && (
                        <span style={{ marginLeft: 8, fontWeight: 600, color: job.proposal_data.pricing.sqftWarning === 'below' ? '#92400e' : '#991b1b' }}>
                          ⚠️ {job.proposal_data.pricing.sqftWarning === 'below' ? `Below target ($${job.proposal_data.pricing.sqftTargetLow}–$${job.proposal_data.pricing.sqftTargetHigh}/sqft)` : `Above target ($${job.proposal_data.pricing.sqftTargetLow}–$${job.proposal_data.pricing.sqftTargetHigh}/sqft)`}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, fontSize: 13, color: job.proposal_data.pricing.sqftWarning ? (job.proposal_data.pricing.sqftWarning === 'below' ? '#92400e' : '#991b1b') : '#166534' }}>
                      ${job.proposal_data.pricing.pricePerSqft}/sqft
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* Editable line items */}
          {editingLineItems && (
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '6px 4px', color: '#555', fontWeight: 600, width: '30%' }}>Trade</th>
                    <th style={{ textAlign: 'right', padding: '6px 4px', color: '#555', fontWeight: 600, width: '18%' }}>Sub Cost ($)</th>
                    <th style={{ textAlign: 'right', padding: '6px 4px', color: '#555', fontWeight: 600, width: '18%' }}>Client Price</th>
                    <th style={{ textAlign: 'left', padding: '6px 4px', color: '#555', fontWeight: 600 }}>Description</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {editingLineItems.map((li, i) => {
                    const tradeErr = !li.trade?.trim();
                    const costErr  = li.baseCost === '' || li.baseCost === null || Number(li.baseCost) < 0;
                    return (
                    <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' }}>
                      <td style={{ padding: '5px 4px' }}>
                        <input value={li.trade} onChange={e => updateLineItem(i, 'trade', e.target.value)}
                          title={tradeErr ? 'Trade name is required' : ''}
                          style={{ width: '100%', padding: '5px 7px', border: `1px solid ${tradeErr ? RED : '#ddd'}`, borderRadius: 4, fontSize: 12, boxSizing: 'border-box', background: tradeErr ? '#fff5f5' : 'white' }} />
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input type="number" value={li.baseCost} onChange={e => updateLineItem(i, 'baseCost', e.target.value)}
                          title={costErr ? 'Cost must be 0 or greater' : ''}
                          style={{ width: '100%', padding: '5px 7px', border: `1px solid ${costErr ? RED : '#ddd'}`, borderRadius: 4, fontSize: 12, textAlign: 'right', boxSizing: 'border-box', background: costErr ? '#fff5f5' : 'white' }} />
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 600, color: BLUE, fontSize: 12 }}>
                        ${Math.round((Number(li.baseCost) || 0) * multiplier).toLocaleString()}
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <input value={li.description || ''} onChange={e => updateLineItem(i, 'description', e.target.value)}
                          style={{ width: '100%', padding: '5px 7px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }} />
                      </td>
                      <td style={{ padding: '5px 4px' }}>
                        <button onClick={() => removeLineItem(i)} title="Remove"
                          style={{ background: '#fee2e2', color: RED, border: 'none', borderRadius: 4, cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>✕</button>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>

              <button onClick={addLineItem}
                style={{ marginTop: 10, padding: '6px 14px', background: 'white', border: `1px dashed ${ORANGE}`, color: ORANGE, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                + Add Line Item
              </button>

              <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditingLineItems(null)}
                  style={{ padding: '9px 18px', border: '1px solid #ddd', borderRadius: 6, background: 'white', cursor: 'pointer', fontSize: 13, color: '#555' }}>
                  Cancel
                </button>
                <button onClick={saveLineItems} disabled={savingLineItems}
                  style={{ padding: '9px 18px', background: '#6B7280', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {savingLineItems ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* Generate button — always visible when review_pending */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #fcd9a0', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={generateProposal} disabled={actionLoading}
              style={{ padding: '11px 28px', background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
              {actionLoading ? '⏳ Generating...' : '🤖 Generate Proposal PDF'}
            </button>
          </div>
        </div>
      )}

      {/* Clarification questions */}
      {job.status === 'clarification' && clarifications.length > 0 && (() => {
        const pending  = clarifications.find(c => !c.answer);
        const answered = clarifications.filter(c => c.answer);
        return (
          <div style={{ background: '#FFFDE7', border: '1px solid #F59E0B', borderRadius: 8, padding: 20, marginBottom: 16 }}>
            <strong style={{ color: '#92400E', fontSize: 14 }}>❓ Clarification Needed ({answered.length} of {clarifications.length} answered)</strong>
            {answered.map((c, i) => (
              <div key={c.id} style={{ marginTop: 12, padding: 10, background: '#f0fdf4', borderRadius: 6, borderLeft: `3px solid ${GREEN}` }}>
                <div style={{ fontSize: 12, color: '#888' }}>Question {i + 1}:</div>
                <div style={{ fontSize: 13, color: '#333', marginBottom: 4 }}>{c.question}</div>
                <div style={{ fontSize: 12, color: GREEN, fontWeight: 'bold' }}>✅ {c.answer}</div>
              </div>
            ))}
            {pending && (
              <div style={{ marginTop: 12, padding: 10, background: 'white', borderRadius: 6, borderLeft: '3px solid #F59E0B' }}>
                <div style={{ fontSize: 12, color: '#92400E', fontWeight: 'bold' }}>Question {answered.length + 1} of {clarifications.length}:</div>
                <div style={{ fontSize: 13, color: '#333', marginTop: 4, marginBottom: 8 }}>{pending.question}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={clarAnswer} onChange={e => setClarAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && clarAnswer.trim()) submitClarAnswer(pending.id); }}
                    placeholder="Type your answer..."
                    style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
                  <button onClick={() => submitClarAnswer(pending.id)} disabled={!clarAnswer.trim() || actionLoading}
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #eee', flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
              fontWeight: activeTab === tab ? 'bold' : 'normal',
              color: activeTab === tab ? BLUE : '#888',
              borderBottom: activeTab === tab ? `2px solid ${BLUE}` : '2px solid transparent',
              marginBottom: -2, textTransform: 'capitalize' }}>
            {tab === 'signatures' ? '✍️ Signatures' : tab === 'payments' ? '💰 Payments' : tab === 'history' ? '📋 Version History' : tab === 'assessment' ? '📊 Assessment' : tab}
          </button>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: 10, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>

        {/* VERSION HISTORY */}
        {activeTab === 'history' && (
          <div>
            <h3 style={{ color: BLUE, marginBottom: 16 }}>Estimate Version History</h3>
            {!job.quote_number ? (
              <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                <div>No quote number assigned yet.</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>Version history appears once Claude extracts a quote number from the estimate.</div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 14, fontSize: 13, color: '#555' }}>
                  All versions of quote <strong>{job.quote_number}</strong>:
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: BLUE, color: 'white' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Version</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Total Value</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Source</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {versionHistory.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>No versions found.</td></tr>
                    ) : versionHistory.map((v, i) => {
                      const isCurrent = v.id === job.id;
                      const rawQuoteNum = job.quote_number;
                      return (
                        <tr key={v.id} style={{ background: isCurrent ? '#EEF3FB' : (i % 2 === 0 ? 'white' : '#f8f8f8'), borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '10px 12px', fontWeight: isCurrent ? 'bold' : 'normal', color: isCurrent ? BLUE : '#333' }}>
                            {rawQuoteNum}/{v.version}
                            {isCurrent && <span style={{ marginLeft: 6, fontSize: 10, background: BLUE, color: 'white', borderRadius: 3, padding: '2px 6px' }}>current</span>}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#555' }}>
                            {new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: v.total_value ? BLUE : '#aaa' }}>
                            {v.total_value ? `$${Number(v.total_value).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', borderRadius: 3, padding: '2px 7px' }}>
                              {(v.status || '').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#777', fontSize: 12 }}>
                            {v.estimate_source === 'ai' ? '🤖 AI' : v.estimate_source === 'manual' ? '✏️ Manual' : v.estimate_source || '—'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {v.id !== job.id && (
                              <a href={`/jobs/${v.id}`} style={{ fontSize: 12, color: BLUE, textDecoration: 'none', fontWeight: 600 }}>View →</a>
                            )}
                            {v.proposal_pdf_path && (
                              <a href={`/outputs/${v.proposal_pdf_path.split(/[\\/]/).pop()}?token=${encodeURIComponent(token)}`}
                                target="_blank" rel="noreferrer"
                                style={{ marginLeft: 8, fontSize: 12, color: '#3B82F6', textDecoration: 'none' }}>
                                📄 PDF
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Activity log — all audit entries for this job */}
            <div style={{ marginTop: 28 }}>
              <h4 style={{ color: BLUE, marginBottom: 10, fontSize: 14 }}>📋 Activity Log</h4>
              {auditLog.length === 0
                ? <div style={{ color: '#aaa', fontSize: 13 }}>No activity recorded yet.</div>
                : auditLog.map(a => (
                  <div key={a.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12, flexWrap: 'wrap' }}>
                    <span style={{ color: '#aaa', width: 130, flexShrink: 0 }}>{new Date(a.created_at).toLocaleString()}</span>
                    <span style={{ fontWeight: 600, color: ORANGE, flexShrink: 0, minWidth: 160 }}>{a.action.replace(/_/g, ' ')}</span>
                    <span style={{ color: '#555', flex: 1 }}>{a.details}</span>
                    <span style={{ color: '#bbb', flexShrink: 0 }}>by {a.performed_by}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* PAYMENTS */}
        {activeTab === 'payments' && (
          <PaymentsTab jobId={id} token={token} job={job} />
        )}

        {/* PHOTOS */}
        {activeTab === 'photos' && (
          <PhotosTab jobId={id} token={token} />
        )}

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
                  ['Submitted Via', (() => {
                    const s = job.submitted_by || '';
                    if (s.startsWith('web:')) return `🖥️ Web Portal (${s.slice(4)})`;
                    if (s.startsWith('whatsapp:')) return `📱 WhatsApp (${s.replace('whatsapp:+1','').replace('whatsapp:','')})`;
                    if (s === 'wizard' || s === 'manual') return '🖥️ Web Portal';
                    if (s === 'hearth_api') return '🔗 Hearth API';
                    return s || '—';
                  })()],
                  ['Quote #', job.quote_number ? `${job.quote_number}${job.version ? `/${job.version}` : ''}` : '—'],
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
              <button onClick={saveNote}
                style={{ marginTop: 8, padding: '8px 16px', background: BLUE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                Save Note
              </button>
            </div>
          </div>
        )}

        {/* SIGNATURES tab */}
        {activeTab === 'signatures' && (
          <div>
            <h3 style={{ color: BLUE, marginBottom: 20 }}>Signatures & Read Receipts</h3>

            {sigSessions.length === 0 ? (
              <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
                <div>No signing links have been sent yet.</div>
                <div style={{ fontSize: 12, marginTop: 6, color: '#aaa' }}>
                  Once the proposal is ready, use "Send Proposal for Signature" to start the flow.
                </div>
              </div>
            ) : (
              sigSessions.map((s) => (
                <div key={s.id} style={{ background: '#f8f9ff', border: '1px solid #e0e7ff', borderRadius: 10, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ fontWeight: 'bold', color: BLUE, fontSize: 14 }}>
                      {s.doc_type === 'proposal' ? '📋 Proposal' : '📄 Contract'}
                    </div>
                    <span style={{
                      padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 'bold',
                      background: s.status === 'signed' ? '#05966920' : s.status === 'opened' ? '#F59E0B20' : '#88888820',
                      color:      s.status === 'signed' ? '#059669'  : s.status === 'opened' ? '#92400E'  : '#888',
                    }}>
                      {s.status === 'signed' ? '✍️ Signed' : s.status === 'opened' ? '👁 Opened' : '📨 Sent'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      ['📨 Sent',   s.email_sent_at ? new Date(s.email_sent_at).toLocaleString() : '—', null],
                      ['👁 Opened', s.opened_at ? new Date(s.opened_at).toLocaleString() : 'Not yet', s.opened_ip ? `IP: ${s.opened_ip}` : null],
                      ['✍️ Signed', s.signed_at ? new Date(s.signed_at).toLocaleString() : 'Not yet', s.signer_name || null],
                    ].map(([label, value, sub]) => (
                      <div key={label} style={{ padding: '10px 14px', background: 'white', borderRadius: 6, border: '1px solid #eee' }}>
                        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 'bold', color: value === 'Not yet' ? '#aaa' : '#1B3A6B' }}>{value}</div>
                        {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>}
                      </div>
                    ))}
                  </div>

                  {s.signature_data && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Captured Signature:</div>
                      <img src={s.signature_data} alt="signature"
                        style={{ border: '1px solid #e0e7ff', borderRadius: 6, maxWidth: 300, background: 'white', padding: 4 }} />
                    </div>
                  )}
                </div>
              ))
            )}
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
                    <div>
                      <div style={{ fontSize: 11, color: '#888' }}>Quote #</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>{proposalData.quoteNumber || '—'}</div>
                      {proposalData.quoteVersion > 1 && (
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Version {proposalData.quoteVersion}</div>
                      )}
                    </div>
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
                  ? 'Send the proposal for customer signature first. The contract will auto-generate upon approval.'
                  : job.status === 'proposal_approved'
                    ? 'Contract is being generated… refresh in a moment.'
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

        {/* ASSESSMENT — Proposal Assessment */}
        {activeTab === 'assessment' && (() => {
          const pd = job.proposal_data;
          const lineItems = pd?.lineItems || [];
          const isLocked = ['proposal_approved','customer_approved','contract_ready','contract_sent','contract_signed','complete'].includes(job.status);
          const isSemiLocked = ['proposal_ready','proposal_sent'].includes(job.status);

          const subTotal    = lineItems.reduce((s, li) => s + (Number(li.baseCost)   || 0), 0);
          const clientTotal = lineItems.reduce((s, li) => s + (Number(li.finalPrice) || 0), 0);
          const effectiveMult = subTotal > 0 ? clientTotal / subTotal : 0;
          const multOk = effectiveMult >= 1.55 && effectiveMult <= 1.62;

          const projectSqft = Number(pd?.project?.sqft) || 0;
          const sqftPrice   = pd?.pricing?.pricePerSqft
                              || (projectSqft > 0 && clientTotal > 0 ? Math.round(clientTotal / projectSqft) : null);
          const sqftWarning = pd?.pricing?.sqftWarning;
          const sqftTargetLow  = pd?.pricing?.sqftTargetLow  || 320;
          const sqftTargetHigh = pd?.pricing?.sqftTargetHigh || 350;
          const computedSqftWarning = sqftPrice && !sqftWarning
            ? (sqftPrice < sqftTargetLow ? 'below' : sqftPrice > sqftTargetHigh ? 'above' : null)
            : sqftWarning;
          const totalVal    = Number(pd?.totalValue  || job.total_value   || 0);
          const depositAmt  = Number(pd?.depositAmount || job.deposit_amount || 0);
          const depositPct  = totalVal > 0 ? Math.round((depositAmt / totalVal) * 100) : 0;
          const depositOk   = depositPct >= 28 && depositPct <= 38;

          // ── Project type: pd.project.type is the only stored source (no job.project_type column)
          // Normalize to canonical key: 'new_construction'|'adu'|'renovation'|'addition'|'garage'
          const rawType = pd?.project?.type || '';
          const normalizeType = (t) => {
            const s = (t || '').toLowerCase().replace(/[\s-]/g, '_');
            if (s.includes('new_construct') || s.includes('custom_home')) return 'new_construction';
            if (s === 'adu' || s.includes('accessory') || s.includes('carriage') || s.includes('in_law')) return 'adu';
            if (s.includes('addition')) return 'addition';
            if (s.includes('garage')) return 'garage';
            return s || 'renovation'; // renovation is the default for unknown
          };
          const projType    = normalizeType(rawType);
          const tradeNames  = lineItems.map(li => (li.trade || '').toLowerCase());
          const jobNameLc   = (job.project_name || job.address || '').toLowerCase();
          const descLc      = (pd?.project?.description || '').toLowerCase();
          const aduKeywords = ['adu','garage apartment','carriage house','in-law','inlaw','garage with apartment','accessory dwelling'];
          const garageKw    = ['garage','detached garage','attached garage'];
          const isADU       = projType === 'adu'
                              || aduKeywords.some(k => jobNameLc.includes(k) || descLc.includes(k) || tradeNames.some(t => t.includes(k)));
          const isGarage    = !isADU && (
                              garageKw.some(k => jobNameLc.includes(k) || descLc.includes(k))
                              || tradeNames.some(t => t.includes('garage door') || t.includes('garage slab'))
                            );
          const aduOnSeptic = pd?.job?.adu?.on_septic === true;

          // ── Project-type $/sqft band ──────────────────────────────────────
          const TYPE_BANDS = {
            garage:           { label: 'Detached Garage',           low: 85,  mid: 120, high: 160 },
            adu:              { label: 'Garage w/ Apartment / ADU', low: 130, mid: 190, high: 250 },
            new_construction: { label: 'Custom Home / New Build',   low: 180, mid: 250, high: 350 },
            renovation:       { label: 'Addition / Renovation',     low: 150, mid: 220, high: 300 },
            addition:         { label: 'Addition / Renovation',     low: 150, mid: 220, high: 300 },
          };
          const bandKey = isGarage ? 'garage' : isADU ? 'adu' : projType || null;
          const band    = bandKey ? (TYPE_BANDS[bandKey] || null) : null;
          const bandStatus = band && sqftPrice
            ? (sqftPrice < band.low ? 'low' : sqftPrice <= band.mid ? 'good_low' : sqftPrice <= band.high ? 'good_high' : 'high')
            : null;
          const BAND_COLOR = { low: '#fff3cd', good_low: '#f0fdf4', good_high: '#f0fdf4', high: '#fde8e8' };
          const BAND_LABEL = { low: '⬇ Below Low', good_low: '✅ Low–Mid Range', good_high: '✅ Mid–High Range', high: '🔴 Above High' };
          const BAND_TEXT  = { low: '#92400e',    good_low: '#166534',            good_high: '#166534',          high: '#991b1b' };

          // ── Expected trades by project type ──────────────────────────────
          const BASE_ADU_TRADES = [
            { label: 'Foundation / Slab',   kw: ['foundation','slab','concrete','crawl','pier','footing'] },
            { label: 'Framing',             kw: ['framing','frame','structural'] },
            { label: 'Roofing',             kw: ['roof','shingle','standing seam','metal roof'] },
            { label: 'Siding',              kw: ['siding','hardie','fiber cement','clapboard','board & batten'] },
            { label: 'Electrical',          kw: ['electric','wiring','panel'] },
            { label: 'Permits',             kw: ['permit','fee','stretch code'] },
          ];
          const EXPECTED_TRADES = {
            garage: [
              { label: 'Foundation / Slab',   kw: ['foundation','slab','concrete','crawl','pier','footing'] },
              { label: 'Framing',             kw: ['framing','frame','structural'] },
              { label: 'Roofing',             kw: ['roof','shingle','standing seam','metal roof'] },
              { label: 'Siding / Exterior',   kw: ['siding','hardie','fiber cement','clapboard','board & batten'] },
              { label: 'Electrical',          kw: ['electric','wiring','panel'] },
              { label: 'Permits',             kw: ['permit','fee','stretch code'] },
            ],
            adu: [
              ...BASE_ADU_TRADES,
              { label: 'Plumbing',            kw: ['plumbing','pipe','drain','fixture'] },
              { label: 'HVAC / Mini-Split',   kw: ['hvac','heat','mini-split','furnace','erv','mechanical'] },
              { label: 'Insulation',          kw: ['insulation','spray foam','batt','blown'] },
              { label: 'Drywall / Plaster',   kw: ['drywall','sheetrock','plaster','blueboard'] },
              ...(aduOnSeptic ? [
                { label: 'Title 5 / Septic Inspection', kw: ['title 5','title5','septic inspection','perc test'] },
                { label: 'Septic / Site Work',          kw: ['septic','leach','site work','excavat','well'] },
              ] : []),
            ],
            new_construction: [
              { label: 'Foundation / Slab',   kw: ['foundation','slab','concrete','crawl','pier','footing'] },
              { label: 'Framing',             kw: ['framing','frame','structural'] },
              { label: 'Roofing',             kw: ['roof','shingle','standing seam','metal roof','tpo'] },
              { label: 'Siding',              kw: ['siding','hardie','fiber cement','clapboard','board & batten'] },
              { label: 'Windows & Doors',     kw: ['window','door','entry door','garage door'] },
              { label: 'Electrical',          kw: ['electric','wiring','panel'] },
              { label: 'Plumbing',            kw: ['plumbing','pipe','drain','fixture'] },
              { label: 'HVAC',               kw: ['hvac','heat','mini-split','furnace','erv','mechanical'] },
              { label: 'Insulation',          kw: ['insulation','spray foam','batt','blown'] },
              { label: 'Drywall',             kw: ['drywall','sheetrock','plaster','blueboard'] },
              { label: 'Permits',             kw: ['permit','fee','stretch code'] },
            ],
            renovation: [
              { label: 'Electrical',          kw: ['electric','wiring','panel'] },
              { label: 'Plumbing',            kw: ['plumbing','pipe','drain','fixture'] },
              { label: 'Permits',             kw: ['permit','fee','stretch code'] },
            ],
            addition: [
              { label: 'Electrical',          kw: ['electric','wiring','panel'] },
              { label: 'Plumbing',            kw: ['plumbing','pipe','drain','fixture'] },
              { label: 'Permits',             kw: ['permit','fee','stretch code'] },
            ],
          };
          const expectedTradesKey = isGarage ? 'garage' : isADU ? 'adu'
            : (projType === 'addition' ? 'addition' : projType) || null;
          const expectedTrades = expectedTradesKey ? (EXPECTED_TRADES[expectedTradesKey] || []) : [];
          const missingTrades = expectedTrades.filter(et =>
            !tradeNames.some(t => et.kw.some(k => t.includes(k)))
          );

          // BENCHMARKS: note = display text; low/high = numeric sub-cost floor/ceiling (null = no range check)
          const BENCHMARKS = [
            { kw: ['foundation','slab','concrete','basement','crawl','pier','footing'],          note: '$18–55/sqft (sub cost)',          low: 5000,  high: 80000 },
            { kw: ['framing','frame','structural','lvl','tji'],                                  note: '$45–70/sqft labor+materials',     low: 8000,  high: 200000 },
            { kw: ['roof','shingle','metal roofing','tpo','standing seam'],                      note: '$450–650/sq; $18–28/sqft metal',  low: 3000,  high: 60000 },
            { kw: ['siding','hardie','fiber cement','vinyl siding','clapboard','board & batten'],note: '$4–20/sqft installed',            low: 2000,  high: 50000 },
            { kw: ['window','door','entry door','garage door'],                                  note: '$600–4,500 each by type',         low: 600,   high: 40000 },
            { kw: ['electric','wiring','panel','service upgrade','circuit'],                     note: '$12–20/sqft full house',          low: 2000,  high: 50000 },
            { kw: ['plumbing','pipe','drain','fixture','bath rough','kitchen rough'],             note: '$1,500–8,000/trade scope',        low: 1500,  high: 30000 },
            { kw: ['hvac','heat','mini-split','minisplit','furnace','erv','mechanical'],          note: '$3,500–20,000+ per system',       low: 3500,  high: 50000 },
            { kw: ['insulation','spray foam','batt','blown','rigid foam'],                       note: '$1.20–6/sqft by type',            low: 800,   high: 25000 },
            { kw: ['drywall','sheetrock','plaster','skim coat','blueboard'],                     note: '$3.50–6/sqft hang & finish',      low: 1500,  high: 40000 },
            { kw: ['permit','fee','inspection','compliance','stretch code'],                     note: '0.5–1.5% of project value',       low: 500,   high: 15000 },
            { kw: ['demo','demolition','removal','tear out'],                                    note: 'Varies by scope',                 low: null,  high: null },
            { kw: ['floor','tile','hardwood','carpet','lvp','vinyl plank'],                      note: '$5–25/sqft installed',            low: 1000,  high: 40000 },
            { kw: ['cabinet','kitchen','counter','quartz','granite'],                            note: 'Mid-range kitchen $25K–50K',      low: 5000,  high: 80000 },
            { kw: ['painting','interior paint','exterior paint'],                               note: '$1.50–4/sqft interior',           low: 500,   high: 15000 },
            { kw: ['trim','baseboard','millwork','interior finish','crown molding'],             note: 'Interior finishes pkg $35K–120K', low: 5000,  high: 120000 },
            { kw: ['septic','title 5','title5','leach field'],                                  note: 'Title 5 + septic $3K–30K+',       low: 1500,  high: 60000 },
            { kw: ['site work','excavat','grading','well','driveway'],                           note: 'Typically excluded — verify',     low: null,  high: null },
            { kw: ['dumpster','disposal','waste'],                                               note: '$500–1,500 typical',              low: 400,   high: 2500 },
          ];
          const matchBench = (trade) => {
            const lc = (trade || '').toLowerCase();
            return BENCHMARKS.find(b => b.kw.some(k => lc.includes(k)));
          };
          const benchStatus = (bench, baseCost) => {
            if (!bench || bench.low == null || baseCost === 0) return 'unknown';
            if (baseCost < bench.low) return 'low';
            if (baseCost > bench.high) return 'high';
            return 'ok';
          };

          return (
            <div>
              {/* ── Financial Profit Margin Breakdown ── */}
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ color: BLUE, marginBottom: 16, marginTop: 0 }}>💰 Financial Health Check</h3>
                {marginLoading ? (
                  <div style={{ color: '#888', fontSize: 13, padding: '20px 0' }}>Loading financial data...</div>
                ) : !marginData || !marginData.hasData ? (
                  <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 28, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
                    <div style={{ fontWeight: 600, color: '#555' }}>No estimate data yet</div>
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>Margin breakdown appears once a proposal has been generated for this job.</div>
                  </div>
                ) : (
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: BLUE, color: 'white' }}>
                          <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600 }}>Layer</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600 }}>Target %</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600 }}>Actual %</th>
                          <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600 }}>$ Added</th>
                          <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 600 }}>Pass / Fail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Base Cost row */}
                        <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #e9ecef' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#333' }}>Base Cost</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: '#aaa' }}>—</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: '#aaa' }}>—</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#333' }}>${marginData.baseCost.toLocaleString()}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', color: '#aaa' }}>—</td>
                        </tr>
                        {/* Markup layers */}
                        {marginData.layers.map((layer, i) => (
                          <tr key={layer.label} style={{ background: i % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                            <td style={{ padding: '10px 14px', color: '#444' }}>{layer.label}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: '#777' }}>{(layer.targetPct * 100).toFixed(1)}%</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: layer.pass ? '#166534' : '#991b1b' }}>
                              {(layer.actualPct * 100).toFixed(1)}%{!marginData.hasStoredRates && <span title="Assumed from current settings" style={{ fontSize: 10, color: '#aaa', marginLeft: 3 }}>*</span>}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: '#555' }}>+${layer.dollarAdded.toLocaleString()}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {layer.pass ? (
                                <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>✓ Pass</span>
                              ) : (
                                <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>✗ Fail</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {/* Contract Price row */}
                        <tr style={{ background: '#EEF3FB', borderTop: '2px solid #c7d7f4', fontWeight: 700 }}>
                          <td style={{ padding: '12px 14px', color: BLUE }}>Contract Price</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', color: '#aaa' }}>—</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', color: '#aaa' }}>—</td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', color: BLUE, fontSize: 15 }}>${marginData.contractPrice.toLocaleString()}</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            {marginData.overallPass === null ? (
                              <span style={{ color: '#bbb', fontSize: 12 }}>—</span>
                            ) : marginData.overallPass ? (
                              <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>✓ On Target</span>
                            ) : (
                              <span style={{ background: '#fff3cd', color: '#92400e', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>⚠ Off Target</span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {/* Net margin summary bar */}
                    <div style={{ background: marginData.actualNetMarginPct >= 30 ? '#f0fdf4' : marginData.actualNetMarginPct >= 20 ? '#fff7ed' : '#fef2f2', borderTop: '1px solid #e5e7eb', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 13, color: '#555' }}>
                        <span style={{ fontWeight: 600 }}>Actual Profit Margin</span>
                        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>(revenue − base cost) ÷ revenue</span>
                        {!marginData.hasStoredRates && (
                          <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>* Actual % assumed from current settings (proposal predates rate tracking)</div>
                        )}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: marginData.actualNetMarginPct >= 30 ? '#166534' : marginData.actualNetMarginPct >= 20 ? '#92400e' : '#991b1b' }}>
                        {marginData.actualNetMarginPct}%
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #eee', marginBottom: 24 }} />

              {/* Header + lock badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ color: BLUE, margin: 0 }}>Proposal Assessment</h3>
                {isLocked && (
                  <span style={{ background: '#f1f5f9', border: '1px solid #94a3b8', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: '#475569', fontWeight: 700 }}>
                    🔒 Locked — Proposal Approved
                  </span>
                )}
                {isSemiLocked && !isLocked && (
                  <span style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: '#c2410c', fontWeight: 700 }}>
                    📋 Semi-locked — Proposal Ready
                  </span>
                )}
              </div>

              {!pd ? (
                <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
                  <div style={{ fontWeight: 600 }}>Generate an estimate first to see the assessment.</div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>Upload an estimate and generate a proposal PDF to unlock this panel.</div>
                </div>
              ) : (
                <>
                  {/* Score cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                    <div style={{ background: '#EEF3FB', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Estimate Total</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: BLUE }}>${totalVal.toLocaleString()}</div>
                    </div>
                    <div style={{ background: bandStatus ? BAND_COLOR[bandStatus] : computedSqftWarning === 'below' ? '#fff3cd' : computedSqftWarning === 'above' ? '#fde8e8' : sqftPrice ? '#f0fdf4' : '#f8f8f8', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Price / Sq Ft</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: bandStatus ? BAND_TEXT[bandStatus] : computedSqftWarning ? (computedSqftWarning === 'below' ? '#92400e' : '#991b1b') : sqftPrice ? '#166534' : '#aaa' }}>
                        {sqftPrice ? `$${sqftPrice.toLocaleString()}/sqft` : '—'}
                      </div>
                      {projectSqft > 0 && <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{projectSqft.toLocaleString()} sqft · {band ? band.label : 'project'}</div>}
                      {bandStatus && band && (
                        <div style={{ fontSize: 10, color: BAND_TEXT[bandStatus], marginTop: 3, fontWeight: 600 }}>
                          {BAND_LABEL[bandStatus]} (${band.low}–${band.high}/sqft)
                        </div>
                      )}
                      {!bandStatus && computedSqftWarning && <div style={{ fontSize: 10, color: computedSqftWarning === 'below' ? '#92400e' : '#991b1b', marginTop: 2 }}>⚠️ {computedSqftWarning === 'below' ? `Below` : `Above`} target ({sqftTargetLow}–{sqftTargetHigh}/sqft)</div>}
                      {!bandStatus && !computedSqftWarning && sqftPrice && <div style={{ fontSize: 10, color: '#166534', marginTop: 2 }}>✅ In target range ({sqftTargetLow}–{sqftTargetHigh}/sqft)</div>}
                      {!sqftPrice && <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>Sqft not found in estimate</div>}
                    </div>
                    <div style={{ background: depositAmt > 0 ? (depositOk ? '#f0fdf4' : '#fff3cd') : '#f8f8f8', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Deposit</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: depositAmt > 0 ? (depositOk ? '#166534' : '#92400e') : '#aaa' }}>
                        {depositAmt > 0 ? `$${Number(depositAmt).toLocaleString()}` : '—'}
                      </div>
                      {depositAmt > 0 && <div style={{ fontSize: 10, color: depositOk ? '#166534' : '#92400e', marginTop: 2 }}>{depositPct}% of total {depositOk ? '✅' : '⚠️ (expect ~33%)'}</div>}
                    </div>
                  </div>

                  {/* Markup chain */}
                  <div style={{ background: '#f8f9fa', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#333', marginBottom: 10 }}>Markup Chain Verification</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
                      <span style={{ background: '#fff3e0', color: '#b45309', borderRadius: 4, padding: '3px 10px', fontWeight: 600 }}>Sub Cost ${subTotal.toLocaleString()}</span>
                      <span style={{ color: '#aaa' }}>→ Sub O&amp;P 15% →</span>
                      <span style={{ background: '#fff3e0', color: '#b45309', borderRadius: 4, padding: '3px 10px', fontWeight: 600 }}>GC O&amp;P 25%</span>
                      <span style={{ color: '#aaa' }}>→</span>
                      <span style={{ background: '#fff3e0', color: '#b45309', borderRadius: 4, padding: '3px 10px', fontWeight: 600 }}>Contingency 10%</span>
                      <span style={{ color: '#aaa' }}>→</span>
                      <span style={{ background: multOk ? '#dcfce7' : '#fee2e2', color: multOk ? '#166534' : '#991b1b', borderRadius: 4, padding: '3px 10px', fontWeight: 700 }}>
                        {effectiveMult > 0 ? `${effectiveMult.toFixed(4)}×` : '—'} {multOk ? '✅' : effectiveMult > 0 ? '⚠️' : ''}
                      </span>
                      <span style={{ color: '#555', fontSize: 12 }}>→ Client Price ${clientTotal.toLocaleString()}</span>
                    </div>
                    {!multOk && effectiveMult > 0 && (
                      <div style={{ fontSize: 12, color: '#991b1b', marginTop: 8 }}>Expected 1.5813×. Difference may indicate rounding or manual line-item adjustments.</div>
                    )}
                  </div>

                  {/* Flagged items — prefer job.flagged_items (persisted DB column), fall back to pd.flaggedItems */}
                  {(() => {
                    const flags = (Array.isArray(job.flagged_items) && job.flagged_items.length > 0)
                      ? job.flagged_items
                      : (pd.flaggedItems?.length > 0 ? pd.flaggedItems : []);
                    if (flags.length === 0) return null;
                    return (
                      <div style={{ background: '#FFF8F0', border: `1px solid ${ORANGE}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
                        <strong style={{ color: ORANGE, fontSize: 13 }}>⚠️ Items Flagged by AI ({flags.length})</strong>
                        <ul style={{ margin: '8px 0 0 18px', fontSize: 13, color: '#5D3A00' }}>
                          {flags.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    );
                  })()}

                  {/* Missing trades check */}
                  {missingTrades.length > 0 && (
                    <div style={{ background: '#fef9f0', border: '1px solid #fcd34d', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                      <strong style={{ color: '#92400e', fontSize: 13 }}>
                        ⚠️ Expected Trades Not Found ({missingTrades.length})
                        <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 8, color: '#b45309' }}>
                          — typical for a {band ? band.label : 'this project type'}
                        </span>
                      </strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {missingTrades.map(t => (
                          <span key={t.label} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                            {t.label}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: '#b45309', marginTop: 8 }}>
                        These trades are typically scoped in a {band ? band.label : 'this type of project'} but appear missing from the estimate. Confirm with the sub or verify the scope intentionally excludes them.
                        {isADU && aduOnSeptic && ' Note: ADU on private septic — Title 5 inspection + septic work may be required.'}
                      </div>
                    </div>
                  )}
                  {missingTrades.length === 0 && expectedTrades.length > 0 && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 12, color: '#166534' }}>
                      ✅ All expected trades present for a {band ? band.label : (projType || 'this')} project
                    </div>
                  )}

                  {/* Per-trade table */}
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#333', marginBottom: 8 }}>Line Item Breakdown vs. PB Benchmarks</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: BLUE, color: 'white' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Trade</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Sub Cost</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Client Price</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>PB Benchmark Range</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((li, i) => {
                        const bench = matchBench(li.trade);
                        const bc    = Number(li.baseCost) || 0;
                        const bs    = benchStatus(bench, bc);
                        const statusIcon = bs === 'ok' ? '✅' : bs === 'low' ? '⚠️ Low' : bs === 'high' ? '🔴 High' : '—';
                        const statusColor = bs === 'ok' ? '#166534' : bs === 'low' ? '#92400e' : bs === 'high' ? '#991b1b' : '#aaa';
                        const rowBg = bs === 'high' ? '#fff1f2' : bs === 'low' ? '#fffbeb' : (i % 2 === 0 ? 'white' : '#f8f8f8');
                        return (
                          <tr key={i} style={{ background: rowBg, borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px 10px', color: '#333' }}>{li.trade}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#777' }}>${bc.toLocaleString()}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: BLUE }}>${(Number(li.finalPrice) || 0).toLocaleString()}</td>
                            <td style={{ padding: '8px 10px', color: bench ? '#555' : '#bbb', fontSize: 12 }} title={bench ? `Range: $${bench.low?.toLocaleString()}–$${bench.high?.toLocaleString()} (sub cost)` : ''}>
                              {bench ? bench.note : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: statusColor }}>{statusIcon}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: '#EEF3FB', fontWeight: 700, borderTop: '2px solid #c7d7f4' }}>
                        <td style={{ padding: '10px', color: BLUE }}>TOTAL</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: '#555' }}>${subTotal.toLocaleString()}</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: BLUE }}>${clientTotal.toLocaleString()}</td>
                        <td style={{ padding: '10px' }}></td>
                        <td style={{ padding: '10px' }}></td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Lock note */}
                  {isLocked && (
                    <div style={{ marginTop: 16, padding: 12, background: '#f1f5f9', borderRadius: 8, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                      🔒 This assessment was locked when the proposal was approved and is preserved as a permanent historical record for this job.
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
