import { useState, useEffect, useCallback, useRef } from 'react';
import { showToast } from '../utils/toast';
import { reverseGeocode, getGpsPosition } from '../utils/reverseGeocode';

const BLUE   = '#1B3A6B';
const ORANGE = '#E07B2A';
const GREEN  = '#2e7d32';

const STAGE_LABELS = {
  incoming: 'Incoming', callback_done: 'Callback', appointment_booked: 'Appt Booked',
  site_visit_complete: 'Site Visited', quote_draft: 'Quote Draft',
  quote_sent: 'Quote Sent', follow_up_1: 'Follow-up 1', follow_up_2: 'Follow-up 2',
  signed: 'Signed',
};

// ── Auth-gated image ──────────────────────────────────────────────────────────
function AuthImage({ src, token, alt, style, onClick }) {
  const [blobUrl, setBlobUrl] = useState(null);
  useEffect(() => {
    let revoked = false;
    let objUrl  = null;
    fetch(src, { headers: { 'x-auth-token': token } })
      .then(r => r.blob())
      .then(blob => { if (revoked) return; objUrl = URL.createObjectURL(blob); setBlobUrl(objUrl); })
      .catch(() => {});
    return () => { revoked = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [src, token]);
  if (!blobUrl) return <div style={{ ...style, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 11 }}>Loading…</div>;
  return <img src={blobUrl} alt={alt} style={style} onClick={onClick} />;
}

function groupPhotos(photos) {
  const byLocation = {};
  for (const photo of photos) {
    const locKey  = photo.location_label || 'Unknown location';
    const dateKey = photo.taken_at
      ? new Date(photo.taken_at).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
      : 'Unknown date';
    if (!byLocation[locKey]) byLocation[locKey] = {};
    if (!byLocation[locKey][dateKey]) byLocation[locKey][dateKey] = [];
    byLocation[locKey][dateKey].push(photo);
  }
  return byLocation;
}

// ── Link-to modal ─────────────────────────────────────────────────────────────
function LinkModal({ jobs, leads, onSelect, onClose }) {
  const [mode,      setMode]      = useState(null);  // null | 'job' | 'lead'
  const [pickedJob, setPickedJob] = useState('');
  const [pickedLead,setPickedLead]= useState('');

  const activeLeads = leads.filter(l => !l.archived && l.stage !== 'rejected');

  const confirm = () => {
    if (mode === 'job')  { if (!pickedJob)  return showToast('Select a job first',  'error'); onSelect({ job_id: pickedJob,    lead_id: null }); }
    if (mode === 'lead') { if (!pickedLead) return showToast('Select a lead first', 'error'); onSelect({ lead_id: pickedLead,  job_id: null  }); }
    if (!mode)           { onSelect({ job_id: null, lead_id: null }); }
  };

  const selStyle = { width: '100%', border: '1px solid #dde3ed', borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: 'white', marginTop: 10, boxSizing: 'border-box' };
  const chipActive   = { padding: '10px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, border: '2px solid', flex: 1, textAlign: 'center' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, color: BLUE, fontSize: 16, marginBottom: 6 }}>📷 What is this photo for?</div>
        <div style={{ color: '#666', fontSize: 13, marginBottom: 18 }}>Choose where to link it, or save to inbox to decide later.</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setMode(null)}
            style={{ ...chipActive, background: !mode ? BLUE : '#f1f5f9', color: !mode ? 'white' : '#64748b', borderColor: !mode ? BLUE : '#cbd5e1' }}>
            📥 Inbox
          </button>
          <button onClick={() => setMode('job')}
            style={{ ...chipActive, background: mode === 'job' ? ORANGE : '#f1f5f9', color: mode === 'job' ? 'white' : '#64748b', borderColor: mode === 'job' ? ORANGE : '#cbd5e1' }}>
            🏠 Job
          </button>
          <button onClick={() => setMode('lead')}
            style={{ ...chipActive, background: mode === 'lead' ? GREEN : '#f1f5f9', color: mode === 'lead' ? 'white' : '#64748b', borderColor: mode === 'lead' ? GREEN : '#cbd5e1' }}>
            📞 Lead
          </button>
        </div>

        {mode === 'job' && (
          <select value={pickedJob} onChange={e => setPickedJob(e.target.value)} style={selStyle}>
            <option value="">— Select a job —</option>
            {jobs.map(j => (
              <option key={j.id} value={j.id}>
                {j.customer_name}{j.project_address ? ` · ${j.project_address}` : ''}
              </option>
            ))}
          </select>
        )}

        {mode === 'lead' && (
          <select value={pickedLead} onChange={e => setPickedLead(e.target.value)} style={selStyle}>
            <option value="">— Select a lead —</option>
            {activeLeads.map(l => {
              const addr = [l.job_address, l.job_city].filter(Boolean).join(', ');
              const stageLabel = STAGE_LABELS[l.stage] || l.stage;
              return (
                <option key={l.id} value={l.id}>
                  {l.caller_name} ({l.caller_phone}){addr ? ` · ${addr}` : ''} — {stageLabel}
                </option>
              );
            })}
            {activeLeads.length === 0 && <option disabled>No active leads in pipeline</option>}
          </select>
        )}

        {mode === null && (
          <div style={{ fontSize: 12, color: '#888', background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            Photo goes to the inbox — you can assign it to a job or lead later.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={confirm} style={{ background: BLUE, color: 'white', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            📷 Open Camera
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FieldCamera({ token }) {
  const [photos,          setPhotos]          = useState([]);
  const [jobs,            setJobs]            = useState([]);
  const [leads,           setLeads]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [uploading,       setUploading]       = useState(false);
  const [gpsStatus,       setGpsStatus]       = useState('idle');
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [assigningId,     setAssigningId]     = useState(null);
  const [assignMode,      setAssignMode]      = useState('job');  // 'job' | 'lead'
  const [selectedTarget,  setSelectedTarget]  = useState({});    // { [photoId]: value }
  const [linkModal,       setLinkModal]       = useState(null);  // 'camera' | 'file'
  const [pendingLink,     setPendingLink]     = useState({ job_id: null, lead_id: null });

  const cameraRef = useRef(null);
  const fileRef   = useRef(null);
  const headers   = { 'x-auth-token': token };

  const loadPhotos = useCallback(async () => {
    try {
      const res  = await fetch('/api/field-photos', { headers });
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch { setPhotos([]); }
    setLoading(false);
  }, [token]);

  const loadJobs = useCallback(async () => {
    try {
      const res  = await fetch('/api/jobs?limit=200', { headers });
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch { setJobs([]); }
  }, [token]);

  const loadLeads = useCallback(async () => {
    try {
      const res  = await fetch('/api/leads?archived=0', { headers });
      const data = await res.json();
      setLeads(data.leads || []);
    } catch { setLeads([]); }
  }, [token]);

  useEffect(() => { loadPhotos(); loadJobs(); loadLeads(); }, []);

  // ── Upload with optional pre-linked job/lead ──────────────────────────────
  const handleUpload = async (file, link = {}) => {
    if (!file) return;
    setUploading(true);
    setGpsStatus('locating');

    let lat = null, lon = null, accuracy = null, location_label = null;
    try {
      const pos  = await getGpsPosition();
      lat        = pos.lat;
      lon        = pos.lon;
      accuracy   = pos.accuracy;
      setGpsStatus('geocoding');
      location_label = await reverseGeocode(lat, lon);
      setGpsStatus('done');
    } catch {
      setGpsStatus('unavailable');
    }

    const formData = new FormData();
    formData.append('photo',    file);
    formData.append('taken_at', new Date().toISOString());
    if (lat !== null)      formData.append('lat',            lat);
    if (lon !== null)      formData.append('lon',            lon);
    if (accuracy !== null) formData.append('accuracy',       accuracy);
    if (location_label)    formData.append('location_label', location_label);
    if (link.job_id)       formData.append('job_id',         link.job_id);
    if (link.lead_id)      formData.append('lead_id',        link.lead_id);

    try {
      const res = await fetch('/api/field-photos', { method: 'POST', headers: { 'x-auth-token': token }, body: formData });
      if (res.ok) {
        const label = link.lead_id ? 'Photo linked to lead' : link.job_id ? 'Photo linked to job' : 'Photo saved to inbox';
        showToast(label);
        loadPhotos();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch { showToast('Upload failed', 'error'); }

    setUploading(false);
    setGpsStatus('idle');
    setPendingLink({ job_id: null, lead_id: null });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file, pendingLink);
    e.target.value = '';
  };

  // Called from LinkModal when user confirms their choice
  const handleLinkSelect = (link) => {
    setPendingLink(link);
    setLinkModal(null);
    // Small delay so state updates before the file input triggers
    setTimeout(() => {
      if (linkModal === 'camera') cameraRef.current?.click();
      else                        fileRef.current?.click();
    }, 50);
  };

  const openLinkModal = (type) => setLinkModal(type);

  // ── Assign inbox photo to job or lead ──────────────────────────────────────
  const handleAssign = async (photoId) => {
    const val = selectedTarget[photoId];
    if (!val) return showToast('Select a job or lead first', 'error');
    const body = assignMode === 'lead' ? { lead_id: val } : { job_id: val };
    try {
      const res = await fetch(`/api/field-photos/${photoId}/assign`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast(assignMode === 'lead' ? 'Photo linked to lead' : 'Photo moved to job');
        loadPhotos();
        setAssigningId(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to assign photo', 'error');
      }
    } catch { showToast('Failed to assign photo', 'error'); }
  };

  const handleAssignGroup = async (groupPhotos) => {
    const key = `group_${groupPhotos.map(p => p.id).join('_')}`;
    const val = selectedTarget[key];
    if (!val) return showToast('Select a job or lead first', 'error');
    const body = assignMode === 'lead' ? { lead_id: val } : { job_id: val };
    let count  = 0;
    for (const photo of groupPhotos) {
      try {
        const res = await fetch(`/api/field-photos/${photo.id}/assign`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) count++;
      } catch { /* skip */ }
    }
    showToast(`${count} photo(s) ${assignMode === 'lead' ? 'linked to lead' : 'moved to job'}`);
    loadPhotos();
  };

  const handleDelete = async (photoId) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      const res = await fetch(`/api/field-photos/${photoId}`, { method: 'DELETE', headers });
      if (res.ok) { showToast('Photo deleted'); setPhotos(prev => prev.filter(p => p.id !== photoId)); }
      else showToast('Failed to delete photo', 'error');
    } catch { showToast('Failed to delete photo', 'error'); }
  };

  const toggleGroup = (key) => setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const unassigned = photos.filter(p => !p.job_id && !p.lead_id);
  const grouped    = groupPhotos(unassigned);

  const gpsStatusText = {
    locating:    '📍 Getting GPS location…',
    geocoding:   '🗺️ Looking up address…',
    done:        '✅ Location captured',
    unavailable: '⚠️ GPS unavailable — photo saved without location',
  }[gpsStatus];

  const activeLeads = leads.filter(l => !l.archived && l.stage !== 'rejected');

  // Build assign dropdown options based on mode
  const assignOptions = assignMode === 'lead'
    ? activeLeads.map(l => {
        const addr = [l.job_address, l.job_city].filter(Boolean).join(', ');
        return { value: String(l.id), label: `${l.caller_name}${addr ? ' · ' + addr : ''} (${STAGE_LABELS[l.stage] || l.stage})` };
      })
    : jobs.map(j => ({ value: j.id, label: `${j.customer_name}${j.project_address ? ' · ' + j.project_address : ''}` }));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      <h2 style={{ color: BLUE, margin: '0 0 4px' }}>📷 Field Camera</h2>
      <p style={{ color: '#666', marginTop: 0, fontSize: 13 }}>
        Link photos directly to a lead or job at capture time — GPS coordinates are saved automatically.
      </p>

      {/* Hidden file inputs */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />
      <input ref={fileRef}   type="file" accept="image/*"                       onChange={handleFileChange} style={{ display: 'none' }} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => openLinkModal('camera')} disabled={uploading}
          style={{ padding: '11px 22px', background: BLUE, color: 'white', border: 'none', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 'bold', opacity: uploading ? 0.6 : 1 }}>
          📷 Take Photo
        </button>
        <button onClick={() => openLinkModal('file')} disabled={uploading}
          style={{ padding: '11px 22px', background: 'white', color: BLUE, border: `2px solid ${BLUE}`, borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 'bold', opacity: uploading ? 0.6 : 1 }}>
          📁 Upload from Library
        </button>
      </div>

      {uploading && (
        <div style={{ padding: '10px 14px', background: '#EBF5FF', borderRadius: 8, marginBottom: 14, fontSize: 13, color: BLUE, border: `1px solid ${BLUE}` }}>
          ⏳ Uploading photo…
          {gpsStatusText && <div style={{ marginTop: 4, opacity: 0.85 }}>{gpsStatusText}</div>}
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '20px 0' }} />

      {/* Lead-linked photos summary */}
      {photos.filter(p => p.lead_id).length > 0 && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#e8f5e9', borderRadius: 8, fontSize: 13, color: GREEN, border: '1px solid #c8e6c9' }}>
          📞 {photos.filter(p => p.lead_id).length} photo(s) linked to leads — visible on each lead card.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h3 style={{ color: BLUE, margin: 0, fontSize: 15 }}>
          Photo Inbox {unassigned.length > 0 && <span style={{ fontWeight: 'normal', color: '#888', fontSize: 13 }}>({unassigned.length} unassigned)</span>}
        </h3>
        {/* Global assign mode toggle for group assignment */}
        <div style={{ display: 'flex', gap: 6 }}>
          {['job','lead'].map(m => (
            <button key={m} onClick={() => setAssignMode(m)}
              style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: assignMode === m ? BLUE : '#f1f5f9', color: assignMode === m ? 'white' : '#64748b', borderColor: assignMode === m ? BLUE : '#cbd5e1' }}>
              {m === 'job' ? '🏠 Job' : '📞 Lead'}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ color: '#888', padding: 20 }}>Loading photos…</div>}

      {!loading && unassigned.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
          <div style={{ fontSize: 15, color: '#888' }}>No photos in the inbox yet.</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Take a photo above — select a lead or job to link it right away, or save to inbox first.</div>
        </div>
      )}

      {Object.entries(grouped).map(([locLabel, dateGroups]) => {
        const allPhotosInLoc = Object.values(dateGroups).flat();
        const locGroupKey    = `group_${allPhotosInLoc.map(p => p.id).join('_')}`;
        const isCollapsed    = collapsedGroups[locLabel];

        return (
          <div key={locLabel} style={{ marginBottom: 20, border: '1px solid #ddd', borderRadius: 10, overflow: 'hidden', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div onClick={() => toggleGroup(locLabel)}
              style={{ padding: '12px 16px', background: '#f8f9ff', borderBottom: isCollapsed ? 'none' : '1px solid #eee', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>📍</span>
                <span style={{ fontWeight: 'bold', color: BLUE, fontSize: 14 }}>{locLabel}</span>
                <span style={{ fontSize: 12, color: '#888', background: '#eee', borderRadius: 10, padding: '1px 8px' }}>
                  {allPhotosInLoc.length} photo{allPhotosInLoc.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                <select
                  value={selectedTarget[locGroupKey] || ''}
                  onChange={e => setSelectedTarget(prev => ({ ...prev, [locGroupKey]: e.target.value }))}
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc' }}
                >
                  <option value="">— Move all to {assignMode} —</option>
                  {assignOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button onClick={() => handleAssignGroup(allPhotosInLoc)}
                  style={{ padding: '4px 12px', background: ORANGE, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                  Move All
                </button>
                <span style={{ color: '#999', fontSize: 14 }}>{isCollapsed ? '▸' : '▾'}</span>
              </div>
            </div>

            {!isCollapsed && Object.entries(dateGroups).map(([dateKey, datePhotos]) => (
              <div key={dateKey} style={{ padding: '8px 16px 16px' }}>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 'bold', marginBottom: 8, marginTop: 4 }}>{dateKey}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                  {datePhotos.map(photo => (
                    <div key={photo.id} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #eee', background: '#fafafa' }}>
                      <AuthImage
                        src={`/api/field-photos/file/${photo.filename}`}
                        token={token}
                        alt={photo.original_name}
                        style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block', cursor: 'pointer' }}
                        onClick={() => {
                          fetch(`/api/field-photos/file/${photo.filename}`, { headers })
                            .then(r => r.blob())
                            .then(blob => { const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); })
                            .catch(() => {});
                        }}
                      />
                      <div style={{ padding: '6px 8px' }}>
                        <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>
                          {photo.taken_at ? new Date(photo.taken_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'No time'}
                        </div>
                        {photo.lat && photo.lon && (
                          <a href={`https://maps.google.com/?q=${photo.lat},${photo.lon}`} target="_blank" rel="noreferrer"
                            style={{ fontSize: 10, color: BLUE, display: 'block', marginBottom: 4 }}>
                            📍 View on map
                          </a>
                        )}

                        {assigningId === photo.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {['job','lead'].map(m => (
                                <button key={m} onClick={() => setAssignMode(m)}
                                  style={{ flex: 1, padding: '2px 0', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: assignMode === m ? BLUE : '#f1f5f9', color: assignMode === m ? 'white' : '#64748b', borderColor: assignMode === m ? BLUE : '#cbd5e1' }}>
                                  {m === 'job' ? 'Job' : 'Lead'}
                                </button>
                              ))}
                            </div>
                            <select
                              value={selectedTarget[photo.id] || ''}
                              onChange={e => setSelectedTarget(prev => ({ ...prev, [photo.id]: e.target.value }))}
                              style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid #ccc', width: '100%' }}
                            >
                              <option value="">— Select {assignMode} —</option>
                              {assignOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => handleAssign(photo.id)}
                                style={{ flex: 1, padding: '3px 0', background: ORANGE, color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}>
                                Link
                              </button>
                              <button onClick={() => setAssigningId(null)}
                                style={{ flex: 1, padding: '3px 0', background: '#eee', color: '#555', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => setAssigningId(photo.id)}
                              style={{ flex: 1, padding: '3px 0', background: BLUE, color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 'bold' }}>
                              Assign
                            </button>
                            <button onClick={() => handleDelete(photo.id)}
                              style={{ padding: '3px 6px', background: 'none', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: '#aaa' }}>
                              🗑
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {photos.filter(p => p.job_id).length > 0 && (
        <div style={{ marginTop: 8, padding: '10px 16px', background: '#f8f9ff', borderRadius: 8, fontSize: 13, color: '#888', border: '1px solid #eee' }}>
          {photos.filter(p => p.job_id).length} photo(s) assigned to jobs — view them in the job's Photos tab.
        </div>
      )}

      {/* Link-to modal */}
      {linkModal && (
        <LinkModal
          jobs={jobs}
          leads={leads}
          onSelect={handleLinkSelect}
          onClose={() => setLinkModal(null)}
        />
      )}
    </div>
  );
}
