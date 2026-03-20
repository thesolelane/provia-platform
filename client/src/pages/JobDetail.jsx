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

  const TABS = ['overview', 'history', 'payments', 'photos', 'signatures', 'proposal', 'contract', 'conversation', 'audit'];

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
                Edit costs or descriptions before generating the proposal PDF. Client price = base cost × {multiplier.toFixed(4)}×.
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
            {tab === 'signatures' ? '✍️ Signatures' : tab === 'payments' ? '💰 Payments' : tab === 'history' ? '📋 Version History' : tab}
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

        {/* AUDIT */}
        {activeTab === 'audit' && (
          <div>
            <h3 style={{ color: BLUE, marginBottom: 16 }}>Audit Log</h3>
            {auditLog.length === 0
              ? <div style={{ color: '#888' }}>No audit entries.</div>
              : auditLog.map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
                  <span style={{ color: '#888', width: 140, flexShrink: 0 }}>{new Date(a.created_at).toLocaleString()}</span>
                  <span style={{ fontWeight: 'bold', color: BLUE, width: 180, flexShrink: 0 }}>{a.action}</span>
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
