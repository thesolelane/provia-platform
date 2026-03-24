import { useState, useEffect, useCallback, useRef } from 'react';
import { showToast } from '../utils/toast';
import { reverseGeocode, getGpsPosition } from '../utils/reverseGeocode';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';

function AuthImage({ src, token, alt, style, onClick }) {
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    let revoked = false;
    let objUrl = null;
    fetch(src, { headers: { 'x-auth-token': token } })
      .then(r => r.blob())
      .then(blob => {
        if (revoked) return;
        objUrl = URL.createObjectURL(blob);
        setBlobUrl(objUrl);
      })
      .catch(() => {});
    return () => {
      revoked = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [src, token]);

  if (!blobUrl) {
    return (
      <div style={{ ...style, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 11 }}>
        Loading...
      </div>
    );
  }
  return <img src={blobUrl} alt={alt} style={style} onClick={onClick} />;
}

function groupPhotos(photos) {
  const byLocation = {};
  for (const photo of photos) {
    const locKey = photo.location_label || 'Unknown location';
    if (!byLocation[locKey]) byLocation[locKey] = {};
    const dateKey = photo.taken_at
      ? new Date(photo.taken_at).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
      : 'Unknown date';
    if (!byLocation[locKey][dateKey]) byLocation[locKey][dateKey] = [];
    byLocation[locKey][dateKey].push(photo);
  }
  return byLocation;
}

export default function FieldCamera({ token }) {
  const [photos, setPhotos] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('idle');
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [assigningId, setAssigningId] = useState(null);
  const [selectedJob, setSelectedJob] = useState({});
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  const headers = { 'x-auth-token': token };

  const loadPhotos = useCallback(async () => {
    try {
      const res = await fetch('/api/field-photos', { headers });
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch {
      setPhotos([]);
    }
    setLoading(false);
  }, [token]);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs?limit=200', { headers });
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch {
      setJobs([]);
    }
  }, [token]);

  useEffect(() => {
    loadPhotos();
    loadJobs();
  }, []);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setGpsStatus('locating');

    let lat = null, lon = null, accuracy = null, location_label = null;

    try {
      const pos = await getGpsPosition();
      lat = pos.lat;
      lon = pos.lon;
      accuracy = pos.accuracy;
      setGpsStatus('geocoding');
      location_label = await reverseGeocode(lat, lon);
      setGpsStatus('done');
    } catch {
      setGpsStatus('unavailable');
      location_label = null;
    }

    const formData = new FormData();
    formData.append('photo', file);
    formData.append('taken_at', new Date().toISOString());
    if (lat !== null) formData.append('lat', lat);
    if (lon !== null) formData.append('lon', lon);
    if (accuracy !== null) formData.append('accuracy', accuracy);
    if (location_label) formData.append('location_label', location_label);

    try {
      const res = await fetch('/api/field-photos', {
        method: 'POST',
        headers: { 'x-auth-token': token },
        body: formData
      });
      if (res.ok) {
        showToast('Photo saved to inbox');
        loadPhotos();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch {
      showToast('Upload failed', 'error');
    }

    setUploading(false);
    setGpsStatus('idle');
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  const handleDelete = async (photoId) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      const res = await fetch(`/api/field-photos/${photoId}`, { method: 'DELETE', headers });
      if (res.ok) {
        showToast('Photo deleted');
        setPhotos(prev => prev.filter(p => p.id !== photoId));
      } else {
        showToast('Failed to delete photo', 'error');
      }
    } catch {
      showToast('Failed to delete photo', 'error');
    }
  };

  const handleAssign = async (photoId) => {
    const job_id = selectedJob[photoId];
    if (!job_id) return showToast('Please select a job first', 'error');
    try {
      const res = await fetch(`/api/field-photos/${photoId}/assign`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id })
      });
      if (res.ok) {
        showToast('Photo moved to job');
        loadPhotos();
        setAssigningId(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to assign photo', 'error');
      }
    } catch {
      showToast('Failed to assign photo', 'error');
    }
  };

  const handleAssignGroup = async (groupPhotos) => {
    const photoId = groupPhotos[0]?.id;
    if (!photoId) return;
    const job_id = selectedJob[`group_${groupPhotos.map(p => p.id).join('_')}`];
    if (!job_id) return showToast('Please select a job first', 'error');
    try {
      let count = 0;
      for (const photo of groupPhotos) {
        const res = await fetch(`/api/field-photos/${photo.id}/assign`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id })
        });
        if (res.ok) count++;
      }
      showToast(`${count} photo(s) moved to job`);
      loadPhotos();
    } catch {
      showToast('Failed to assign photos', 'error');
    }
  };

  const toggleGroup = (key) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const unassignedPhotos = photos.filter(p => !p.job_id);
  const grouped = groupPhotos(unassignedPhotos);

  const gpsStatusText = {
    locating: '📍 Getting GPS location...',
    geocoding: '🗺️ Looking up address...',
    done: '✅ Location captured',
    unavailable: '⚠️ GPS unavailable — photo saved without location',
  }[gpsStatus];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>
      <h2 style={{ color: BLUE, margin: '0 0 4px' }}>📷 Field Camera</h2>
      <p style={{ color: '#666', marginTop: 0, fontSize: 13 }}>
        Take photos anywhere — they land in your inbox grouped by location. Assign them to a job anytime.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '11px 22px', background: BLUE, color: 'white',
            border: 'none', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: 15, fontWeight: 'bold', opacity: uploading ? 0.6 : 1
          }}
        >
          📷 Take Photo
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '11px 22px', background: 'white', color: BLUE,
            border: `2px solid ${BLUE}`, borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
            fontSize: 15, fontWeight: 'bold', opacity: uploading ? 0.6 : 1
          }}
        >
          📁 Upload from Library
        </button>
      </div>

      {uploading && (
        <div style={{ padding: '10px 14px', background: '#EBF5FF', borderRadius: 8, marginBottom: 14, fontSize: 13, color: BLUE, border: `1px solid ${BLUE}` }}>
          ⏳ Uploading photo...
          {gpsStatusText && <div style={{ marginTop: 4, opacity: 0.85 }}>{gpsStatusText}</div>}
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '20px 0' }} />

      <h3 style={{ color: BLUE, margin: '0 0 12px', fontSize: 15 }}>
        Photo Inbox {unassignedPhotos.length > 0 && <span style={{ fontWeight: 'normal', color: '#888', fontSize: 13 }}>({unassignedPhotos.length} unassigned)</span>}
      </h3>

      {loading && <div style={{ color: '#888', padding: 20 }}>Loading photos...</div>}

      {!loading && unassignedPhotos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#aaa' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
          <div style={{ fontSize: 15, color: '#888' }}>No photos in the inbox yet.</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Take a photo above and it will appear here, grouped by location.</div>
        </div>
      )}

      {Object.entries(grouped).map(([locLabel, dateGroups]) => {
        const allPhotosInLoc = Object.values(dateGroups).flat();
        const locGroupKey = `group_${allPhotosInLoc.map(p => p.id).join('_')}`;
        const isLocCollapsed = collapsedGroups[locLabel];

        return (
          <div key={locLabel} style={{ marginBottom: 20, border: '1px solid #ddd', borderRadius: 10, overflow: 'hidden', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div
              onClick={() => toggleGroup(locLabel)}
              style={{
                padding: '12px 16px', background: '#f8f9ff', borderBottom: isLocCollapsed ? 'none' : '1px solid #eee',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>📍</span>
                <span style={{ fontWeight: 'bold', color: BLUE, fontSize: 14 }}>{locLabel}</span>
                <span style={{ fontSize: 12, color: '#888', background: '#eee', borderRadius: 10, padding: '1px 8px' }}>
                  {allPhotosInLoc.length} photo{allPhotosInLoc.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={e => e.stopPropagation()}>
                <select
                  value={selectedJob[locGroupKey] || ''}
                  onChange={e => setSelectedJob(prev => ({ ...prev, [locGroupKey]: e.target.value }))}
                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc' }}
                >
                  <option value="">— Move all to job —</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>
                      {j.customer_name} {j.project_address ? `· ${j.project_address}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleAssignGroup(allPhotosInLoc)}
                  style={{
                    padding: '4px 12px', background: ORANGE, color: 'white',
                    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold'
                  }}
                >
                  Move All
                </button>
                <span style={{ color: '#999', fontSize: 14 }}>{isLocCollapsed ? '▸' : '▾'}</span>
              </div>
            </div>

            {!isLocCollapsed && Object.entries(dateGroups).map(([dateKey, datePhotos]) => (
              <div key={dateKey} style={{ padding: '8px 16px 16px' }}>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 'bold', marginBottom: 8, marginTop: 4 }}>
                  {dateKey}
                </div>
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
                            .then(blob => {
                              const url = URL.createObjectURL(blob);
                              window.open(url, '_blank');
                              setTimeout(() => URL.revokeObjectURL(url), 60000);
                            }).catch(() => {});
                        }}
                      />
                      <div style={{ padding: '6px 8px' }}>
                        <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>
                          {photo.taken_at
                            ? new Date(photo.taken_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                            : 'No time'}
                        </div>

                        {assigningId === photo.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <select
                              value={selectedJob[photo.id] || ''}
                              onChange={e => setSelectedJob(prev => ({ ...prev, [photo.id]: e.target.value }))}
                              style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid #ccc', width: '100%' }}
                            >
                              <option value="">— Select job —</option>
                              {jobs.map(j => (
                                <option key={j.id} value={j.id}>
                                  {j.customer_name}{j.project_address ? ` · ${j.project_address}` : ''}
                                </option>
                              ))}
                            </select>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                onClick={() => handleAssign(photo.id)}
                                style={{ flex: 1, padding: '3px 0', background: ORANGE, color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}
                              >
                                Move
                              </button>
                              <button
                                onClick={() => setAssigningId(null)}
                                style={{ flex: 1, padding: '3px 0', background: '#eee', color: '#555', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => setAssigningId(photo.id)}
                              style={{
                                flex: 1, padding: '3px 0', background: BLUE, color: 'white',
                                border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 'bold'
                              }}
                            >
                              Assign to Job
                            </button>
                            <button
                              onClick={() => handleDelete(photo.id)}
                              style={{
                                padding: '3px 6px', background: 'none',
                                border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: '#aaa'
                              }}
                            >
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
        <div style={{ marginTop: 16, padding: '10px 16px', background: '#f8f9ff', borderRadius: 8, fontSize: 13, color: '#888', border: '1px solid #eee' }}>
          {photos.filter(p => p.job_id).length} photo(s) already assigned to jobs — view them in the job's Photos tab.
        </div>
      )}
    </div>
  );
}
