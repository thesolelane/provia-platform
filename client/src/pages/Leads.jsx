// client/src/pages/Leads.jsx
import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../utils/toast';
import { showConfirm } from '../utils/confirm';

const BLUE   = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN  = '#2e7d32';
const RED    = '#c62828';

const STAGES = [
  { key: 'incoming',            label: 'Incoming',             color: '#7B8EA0', bg: '#eef1f5' },
  { key: 'callback_done',       label: 'Callback Done',        color: '#5C6BC0', bg: '#e8eaf6' },
  { key: 'appointment_booked',  label: 'Appointment Booked',   color: '#0288D1', bg: '#e1f5fe' },
  { key: 'site_visit_complete', label: 'Site Visit Complete',  color: '#00838F', bg: '#e0f7fa' },
  { key: 'quote_draft',         label: 'Quote Draft',          color: '#F57C00', bg: '#fff3e0' },
  { key: 'quote_sent',          label: 'Quote Sent',           color: '#558B2F', bg: '#f1f8e9' },
  { key: 'follow_up_1',         label: 'Follow-up 1',          color: '#7B1FA2', bg: '#f3e5f5' },
  { key: 'follow_up_2',         label: 'Follow-up 2',          color: '#AD1457', bg: '#fce4ec' },
  { key: 'signed',              label: 'Signed',               color: GREEN,     bg: '#e8f5e9' },
  { key: 'rejected',            label: 'Rejected',             color: RED,       bg: '#ffebee' },
];

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

const NEXT_STAGE = {
  incoming:            'callback_done',
  callback_done:       'appointment_booked',
  appointment_booked:  'site_visit_complete',
  site_visit_complete: 'quote_draft',
  quote_draft:         'quote_sent',
  quote_sent:          'follow_up_1',
  follow_up_1:         'follow_up_2',
  follow_up_2:         'signed',
};

const NEXT_LABEL = {
  incoming:            'Mark Callback Done',
  callback_done:       'Book Appointment',
  appointment_booked:  'Mark Site Visit Done',
  site_visit_complete: 'Start Quote Draft',
  quote_draft:         'Mark as Sent to Customer',
  quote_sent:          'Log Follow-up 1',
  follow_up_1:         'Log Follow-up 2',
  follow_up_2:         'Mark as Signed',
};

const SOURCE_LABELS = {
  marblism: 'Marblism',
  referral: 'Referral',
  web: 'Web',
  'walk-in': 'Walk-in',
  other: 'Other',
};

const ARCHIVE_REASONS = [
  { value: 'price',       label: 'Price — too expensive' },
  { value: 'timing',      label: 'Timing — not ready yet' },
  { value: 'no_response', label: 'No response (x3)' },
  { value: 'other',       label: 'Other' },
];

export default function Leads({ token }) {
  const [leads, setLeads]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showNewForm, setShowNewForm]   = useState(false);
  const [newForm, setNewForm]       = useState({ caller_name: '', caller_phone: '', source: 'other', notes: '' });
  const [savingNew, setSavingNew]   = useState(false);
  const [archiveModal, setArchiveModal] = useState(null);
  const [archiveReason, setArchiveReason] = useState('price');

  const headers = { 'x-auth-token': token, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads?archived=${showArchived ? 1 : 0}`, { headers });
      const data = await res.json();
      setLeads(data.leads || []);
    } catch {
      showToast('Failed to load leads', 'error');
    }
    setLoading(false);
  }, [showArchived, token]);

  useEffect(() => { load(); }, [load]);

  const patchLead = async (id, body) => {
    const res = await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update lead');
    }
    return res.json();
  };

  const advanceStage = async (lead) => {
    const next = NEXT_STAGE[lead.stage];
    if (!next) return;
    try {
      const data = await patchLead(lead.id, { stage: next });
      setLeads(prev => prev.map(l => l.id === lead.id ? data.lead : l));
      showToast(`Lead moved to ${STAGE_MAP[next]?.label || next}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const saveNotes = async (lead, notes) => {
    try {
      await patchLead(lead.id, { notes });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const openArchiveModal = (lead) => {
    setArchiveModal(lead);
    setArchiveReason('price');
  };

  const confirmArchive = async () => {
    if (!archiveModal) return;
    try {
      const data = await patchLead(archiveModal.id, { stage: 'rejected', archive_reason: archiveReason });
      setLeads(prev => showArchived
        ? prev.map(l => l.id === archiveModal.id ? data.lead : l)
        : prev.filter(l => l.id !== archiveModal.id)
      );
      showToast('Lead archived', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
    setArchiveModal(null);
  };

  const deleteLead = async (lead) => {
    const ok = await showConfirm(`Delete lead for ${lead.caller_name}? This cannot be undone.`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error('Delete failed');
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      showToast('Lead deleted', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const createLead = async (e) => {
    e.preventDefault();
    if (!newForm.caller_name.trim() || !newForm.caller_phone.trim()) {
      showToast('Name and phone are required', 'error');
      return;
    }
    setSavingNew(true);
    try {
      const res = await fetch('/api/leads', { method: 'POST', headers, body: JSON.stringify(newForm) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create lead');
      }
      const data = await res.json();
      setLeads(prev => [data.lead, ...prev]);
      setNewForm({ caller_name: '', caller_phone: '', source: 'other', notes: '' });
      setShowNewForm(false);
      showToast('Lead created', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
    setSavingNew(false);
  };

  // Group active leads by stage
  const byStage = {};
  for (const s of STAGES) byStage[s.key] = [];
  for (const l of leads) {
    if (byStage[l.stage]) byStage[l.stage].push(l);
    else byStage['incoming'].push(l);
  }

  const activeStageCounts = STAGES.filter(s => s.key !== 'rejected').reduce((sum, s) => sum + byStage[s.key].length, 0);

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, color: BLUE, fontSize: 22, fontWeight: 700 }}>📞 Lead Pipeline</h1>
          <div style={{ color: '#666', fontSize: 13, marginTop: 3 }}>
            {activeStageCounts} active lead{activeStageCounts !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555', cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          <button
            onClick={() => setShowNewForm(v => !v)}
            style={{ background: ORANGE, color: 'white', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
          >
            + New Lead
          </button>
        </div>
      </div>

      {/* New lead form */}
      {showNewForm && (
        <div style={{ background: 'white', border: `1px solid #dde3ed`, borderRadius: 10, padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, color: BLUE, marginBottom: 14, fontSize: 15 }}>New Lead</div>
          <form onSubmit={createLead} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <input
              placeholder="Caller name *"
              value={newForm.caller_name}
              onChange={e => setNewForm(f => ({ ...f, caller_name: e.target.value }))}
              required
              style={inputStyle}
            />
            <input
              placeholder="Phone *"
              value={newForm.caller_phone}
              onChange={e => setNewForm(f => ({ ...f, caller_phone: e.target.value }))}
              required
              style={inputStyle}
            />
            <select
              value={newForm.source}
              onChange={e => setNewForm(f => ({ ...f, source: e.target.value }))}
              style={inputStyle}
            >
              {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input
              placeholder="Notes (optional)"
              value={newForm.notes}
              onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))}
              style={{ ...inputStyle, flex: '1 1 260px' }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <button type="submit" disabled={savingNew} style={{ background: BLUE, color: 'white', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {savingNew ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setShowNewForm(false)} style={{ background: '#eee', border: 'none', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 48 }}>Loading…</div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div>No leads yet. Marblism missed calls will appear here automatically.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {STAGES.filter(s => showArchived ? s.key === 'rejected' : s.key !== 'rejected').map(stg => {
            const stageLeads = byStage[stg.key] || [];
            if (!showArchived && stageLeads.length === 0) return null;
            return (
              <section key={stg.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ background: stg.bg, color: stg.color, borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700, border: `1px solid ${stg.color}30` }}>
                    {stg.label}
                  </span>
                  <span style={{ color: '#aaa', fontSize: 12 }}>{stageLeads.length} lead{stageLeads.length !== 1 ? 's' : ''}</span>
                </div>
                {stageLeads.length === 0 ? (
                  <div style={{ color: '#ccc', fontSize: 13, paddingLeft: 8 }}>—</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {stageLeads.map(lead => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        onAdvance={() => advanceStage(lead)}
                        onArchive={() => openArchiveModal(lead)}
                        onDelete={() => deleteLead(lead)}
                        onSaveNotes={(notes) => saveNotes(lead, notes)}
                        headers={headers}
                        setLeads={setLeads}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Archive modal */}
      {archiveModal && (
        <div style={overlayStyle} onClick={() => setArchiveModal(null)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: RED, fontSize: 16, marginBottom: 12 }}>Archive Lead</div>
            <div style={{ color: '#444', fontSize: 14, marginBottom: 16 }}>
              Archiving <strong>{archiveModal.caller_name}</strong>. Select a reason:
            </div>
            <select
              value={archiveReason}
              onChange={e => setArchiveReason(e.target.value)}
              style={{ ...inputStyle, width: '100%', marginBottom: 18 }}
            >
              {ARCHIVE_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setArchiveModal(null)} style={{ background: '#eee', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={confirmArchive} style={{ background: RED, color: 'white', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Archive</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead, onAdvance, onArchive, onDelete, onSaveNotes, headers, setLeads }) {
  const [notes, setNotes]   = useState(lead.notes || '');
  const [saving, setSaving] = useState(false);

  const stg = STAGE_MAP[lead.stage] || STAGE_MAP['incoming'];
  const nextLabel = NEXT_LABEL[lead.stage];
  const canAdvance = !!NEXT_STAGE[lead.stage];
  const isArchived = lead.archived === 1;
  const isSigned   = lead.stage === 'signed';
  const isQuoteDraft = lead.stage === 'quote_draft';

  const handleBlur = async () => {
    if (notes === (lead.notes || '')) return;
    setSaving(true);
    await onSaveNotes(notes);
    setSaving(false);
  };

  return (
    <div style={{
      background: 'white',
      border: '1px solid #dde3ed',
      borderRadius: 10,
      padding: '14px 16px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: '#1a1a2e', fontSize: 15 }}>{lead.caller_name}</div>
          <div style={{ color: '#555', fontSize: 13, marginTop: 2 }}>{lead.caller_phone}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ background: stg.bg, color: stg.color, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, border: `1px solid ${stg.color}30` }}>
              {stg.label}
            </span>
            <span style={{ background: '#f0f0f0', color: '#666', borderRadius: 20, padding: '2px 9px', fontSize: 11 }}>
              {SOURCE_LABELS[lead.source] || lead.source}
            </span>
            {lead.contact_id && (
              <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 20, padding: '2px 9px', fontSize: 11 }}>
                Contact linked
              </span>
            )}
            {isSigned && (
              <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>
                ✓ Signed
              </span>
            )}
            {isArchived && lead.archive_reason && (
              <span style={{ background: '#ffebee', color: '#c62828', borderRadius: 20, padding: '2px 9px', fontSize: 11 }}>
                {lead.archive_reason.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>
        <div style={{ color: '#aaa', fontSize: 11, whiteSpace: 'nowrap' }}>
          {new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Notes */}
      <div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={handleBlur}
          placeholder="Add notes…"
          rows={2}
          style={{
            width: '100%',
            border: '1px solid #dde3ed',
            borderRadius: 6,
            padding: '7px 10px',
            fontSize: 13,
            color: '#333',
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            background: saving ? '#fffbe6' : 'white',
          }}
        />
      </div>

      {/* Actions */}
      {!isArchived && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canAdvance && !isSigned && (
            <button
              onClick={onAdvance}
              style={{
                background: isQuoteDraft ? '#558B2F' : '#1B3A6B',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                padding: '7px 14px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {isQuoteDraft ? '✉ Mark as Sent to Customer' : nextLabel}
            </button>
          )}
          {isQuoteDraft && (
            <button
              onClick={() => showToast('Open the Jobs page to regenerate the quote.', 'info')}
              style={{ background: '#FFF3E0', color: '#E65100', border: '1px solid #FFB74D', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              Regenerate Quote
            </button>
          )}
          {!isSigned && (
            <button
              onClick={onArchive}
              style={{ background: '#fff', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 12 }}
            >
              Archive
            </button>
          )}
          <button
            onClick={onDelete}
            style={{ background: '#fff', color: '#aaa', border: '1px solid #ddd', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', fontSize: 11 }}
          >
            Delete
          </button>
        </div>
      )}
      {isArchived && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onDelete}
            style={{ background: '#fff', color: '#aaa', border: '1px solid #ddd', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 11 }}
          >
            Delete permanently
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  border: '1px solid #dde3ed',
  borderRadius: 6,
  padding: '8px 11px',
  fontSize: 13,
  color: '#333',
  outline: 'none',
  flex: '1 1 160px',
  fontFamily: 'inherit',
  background: 'white',
};

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalStyle = {
  background: 'white',
  borderRadius: 12,
  padding: '24px',
  width: '100%',
  maxWidth: 400,
  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
};
