import { useState, useEffect, useCallback, useRef } from 'react';
import { showToast } from '../utils/toast';
import { compressImage } from '../utils/compressImage';
import {
  queuePhoto,
  getPendingCount,
  uploadPendingPhotos,
  startAutoSync,
  stopAutoSync,
} from '../utils/offlinePhotoQueue';

const BLUE = '#1B3A6B';
const ORANGE = '#E07B2A';

function AuthImage({ src, token, alt, style, onClick }) {
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    let revoke;
    fetch(src, { headers: { 'x-auth-token': token } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        revoke = url;
      })
      .catch(() => {});
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [src, token]);

  if (!blobUrl) {
    return (
      <div
        style={{
          ...style,
          background: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#aaa',
          fontSize: 12,
        }}
      >
        Loading...
      </div>
    );
  }

  return <img src={blobUrl} alt={alt} style={style} onClick={onClick} />;
}

export default function PhotosTab({ jobId, token }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  const headers = { 'x-auth-token': token };

  const loadPhotos = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, { headers });
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch {
      setPhotos([]);
    }
    setLoading(false);
  }, [jobId, token]);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => {
    loadPhotos();
    refreshPendingCount();
    startAutoSync(() => {
      loadPhotos();
      refreshPendingCount();
    });

    const handleSWMessage = (event) => {
      if (event.data?.type === 'PHOTOS_SYNCED') {
        loadPhotos();
        refreshPendingCount();
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    return () => {
      stopAutoSync();
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
    };
  }, [jobId]);

  const handleOpenFullPhoto = async (photo) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos/file/${photo.filename}`, {
        headers: { 'x-auth-token': token },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      showToast('Failed to open photo', 'error');
    }
  };

  const uploadFile = async (file) => {
    if (!file) return;

    const compressed = await compressImage(file);
    const formData = new FormData();
    formData.append('photo', compressed);

    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, {
        method: 'POST',
        headers: { 'x-auth-token': token },
        body: formData,
      });

      if (res.ok) {
        showToast('Photo uploaded');
        loadPhotos();
      } else if (!navigator.onLine) {
        await queuePhoto(jobId, file, '', token);
        refreshPendingCount();
        showToast('No connection — photo queued for upload', 'info');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch {
      await queuePhoto(jobId, file, '', token);
      refreshPendingCount();
      showToast('No connection — photo queued for upload', 'info');
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    await uploadFile(file);
    setUploading(false);
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      await uploadFile(file);
    }
    setUploading(false);
  };

  const handleDelete = async (photoId) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos/${photoId}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        showToast('Photo deleted');
        loadPhotos();
      } else {
        showToast('Failed to delete photo', 'error');
      }
    } catch {
      showToast('Failed to delete photo', 'error');
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const result = await uploadPendingPhotos();
      if (result.uploaded > 0) {
        showToast(`${result.uploaded} photo(s) uploaded`);
        loadPhotos();
      }
      if (result.failed > 0) {
        showToast(`${result.failed} photo(s) still pending`, 'error');
      }
    } catch {
      showToast('Sync failed — will retry automatically', 'error');
    }
    refreshPendingCount();
    setSyncing(false);
  };

  if (loading) return <div style={{ padding: 20, color: '#888' }}>Loading photos...</div>;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <h3 style={{ color: BLUE, margin: 0 }}>Job Photos</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '8px 16px',
              background: BLUE,
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 'bold',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            📷 Take Photo
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '8px 16px',
              background: 'white',
              color: BLUE,
              border: `1px solid ${BLUE}`,
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 'bold',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            📁 Upload from Library
          </button>
        </div>
      </div>

      {uploading && (
        <div
          style={{
            padding: 10,
            background: '#EBF5FF',
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 13,
            color: BLUE,
          }}
        >
          Uploading photo...
        </div>
      )}

      {pendingCount > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 12,
            background: '#FFF8F0',
            border: `1px solid ${ORANGE}`,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 13, color: '#92400E', fontWeight: 'bold' }}>
            ⏳ {pendingCount} photo(s) pending upload
          </span>
          <button
            onClick={handleManualSync}
            disabled={syncing}
            style={{
              padding: '6px 14px',
              background: ORANGE,
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 'bold',
              opacity: syncing ? 0.6 : 1,
            }}
          >
            {syncing ? 'Uploading...' : '⬆️ Upload Pending'}
          </button>
        </div>
      )}

      {photos.length === 0 ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
          <div>No photos yet.</div>
          <div style={{ fontSize: 12, marginTop: 6, color: '#aaa' }}>
            Take a photo on-site or upload from your library.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 12,
          }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                borderRadius: 8,
                overflow: 'hidden',
                border: '1px solid #eee',
                background: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <AuthImage
                src={`/api/jobs/${jobId}/photos/file/${photo.filename}`}
                token={token}
                alt={photo.original_name}
                style={{
                  width: '100%',
                  height: 160,
                  objectFit: 'cover',
                  display: 'block',
                  cursor: 'pointer',
                }}
                onClick={() => handleOpenFullPhoto(photo)}
              />
              <div style={{ padding: 8 }}>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {new Date(photo.uploaded_at).toLocaleDateString()}
                </div>
                {photo.caption && (
                  <div style={{ fontSize: 12, color: '#333', marginTop: 2 }}>{photo.caption}</div>
                )}
                <button
                  onClick={() => handleDelete(photo.id)}
                  style={{
                    marginTop: 6,
                    padding: '3px 8px',
                    background: 'none',
                    border: '1px solid #ddd',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 11,
                    color: '#888',
                  }}
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
