import React, { useState } from 'react';
import { BLUE, GREEN } from './constants';
import { showToast } from '../../utils/toast';

const RED = '#C62828';

export default function ScanButton({ jobId, attachType, docType, label, token, onSuccess }) {
  // attachType: 'signature' | 'photo'
  // docType: 'contract' | 'proposal' | 'receipt' | 'check'
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(1);
  const [dpi, setDpi] = useState(300);
  const [scanning, setScanning] = useState(false);
  const [scanId, setScanId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [attaching, setAttaching] = useState(false);

  const openPanel = async () => {
    setOpen(true);
    if (!devicesLoaded) {
      try {
        const res = await fetch('/api/scan/devices', { headers: { 'x-auth-token': token } });
        const data = await res.json();
        setDevices(data.devices || []);
        if (data.devices?.length) setSelectedDevice(data.devices[0].index);
      } catch {
        showToast('Could not reach scan service', 'error');
      }
      setDevicesLoaded(true);
    }
  };

  const startScan = async () => {
    setScanning(true);
    setPreview(null);
    setScanId(null);
    try {
      const res = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIndex: selectedDevice, dpi }),
      });
      const data = await res.json();
      if (res.ok) {
        setScanId(data.scanId);
        setPreview(data.preview);
      } else {
        showToast(data.error || 'Scan failed', 'error');
      }
    } catch {
      showToast('Could not reach scan service', 'error');
    }
    setScanning(false);
  };

  const rescan = () => {
    if (scanId) {
      fetch(`/api/scan/temp/${scanId}`, { method: 'DELETE', headers: { 'x-auth-token': token } }).catch(() => {});
    }
    setScanId(null);
    setPreview(null);
  };

  const attachScan = async () => {
    if (!scanId) return;
    setAttaching(true);
    try {
      const res = await fetch(`/api/scan/attach/${jobId}`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, attachType, docType }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Scanned ${docType || 'document'} attached to job`, 'success');
        setOpen(false);
        setScanId(null);
        setPreview(null);
        if (onSuccess) onSuccess(data);
      } else {
        showToast(data.error || 'Failed to attach scan', 'error');
      }
    } catch {
      showToast('Could not attach scan', 'error');
    }
    setAttaching(false);
  };

  const cancel = () => {
    if (scanId) {
      fetch(`/api/scan/temp/${scanId}`, { method: 'DELETE', headers: { 'x-auth-token': token } }).catch(() => {});
    }
    setOpen(false);
    setScanId(null);
    setPreview(null);
  };

  return (
    <div style={{ display: 'inline-block', position: 'relative' }}>
      <button
        onClick={openPanel}
        style={{
          padding: '7px 14px',
          background: open ? '#f0fff4' : '#f4f6fb',
          border: `1px solid ${open ? GREEN : '#ddd'}`,
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 12,
          color: open ? GREEN : '#555',
          fontWeight: open ? 'bold' : 'normal',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        📄 {label || `Scan ${docType || 'document'}`}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            zIndex: 200,
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: 10,
            padding: 16,
            boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
            minWidth: 320,
            maxWidth: 380,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 'bold', color: BLUE, marginBottom: 12 }}>
            📄 Scan {label || docType}
          </div>

          {!preview ? (
            <>
              {/* Device selector */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
                  Scanner:
                </label>
                {!devicesLoaded ? (
                  <div style={{ fontSize: 12, color: '#888' }}>Detecting scanners...</div>
                ) : devices.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#888' }}>
                    No WIA scanners detected — make sure the HP is connected and its driver is installed.
                  </div>
                ) : (
                  <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(Number(e.target.value))}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                  >
                    {devices.map((d) => (
                      <option key={d.index} value={d.index}>{d.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* DPI selector */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>
                  Quality:
                </label>
                <select
                  value={dpi}
                  onChange={(e) => setDpi(Number(e.target.value))}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }}
                >
                  <option value={150}>150 DPI — faster, smaller file</option>
                  <option value={300}>300 DPI — standard (recommended)</option>
                  <option value={600}>600 DPI — high quality, slower</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={startScan}
                  disabled={scanning || devices.length === 0}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    background: GREEN,
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: (scanning || devices.length === 0) ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 'bold',
                    opacity: (scanning || devices.length === 0) ? 0.6 : 1,
                  }}
                >
                  {scanning ? '⏳ Scanning...' : '📄 Scan Now'}
                </button>
                <button
                  onClick={cancel}
                  style={{ padding: '9px 12px', background: '#f4f6fb', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#666' }}
                >
                  Cancel
                </button>
              </div>
              {scanning && (
                <div style={{ fontSize: 11, color: '#555', marginTop: 8, textAlign: 'center' }}>
                  Place document on the scanner — this takes 15–30 seconds...
                </div>
              )}
            </>
          ) : (
            <>
              {/* Preview */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 6, fontWeight: 'bold' }}>
                  Preview — does this look right?
                </div>
                <img
                  src={preview}
                  alt="Scan preview"
                  style={{ width: '100%', borderRadius: 6, border: '1px solid #ddd', maxHeight: 260, objectFit: 'contain', background: '#f8f8f8' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={attachScan}
                  disabled={attaching}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    background: BLUE,
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    cursor: attaching ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 'bold',
                    opacity: attaching ? 0.6 : 1,
                  }}
                >
                  {attaching ? 'Attaching...' : '✅ Attach to Job'}
                </button>
                <button
                  onClick={rescan}
                  style={{ padding: '9px 12px', background: '#fff8e1', border: '1px solid #f59e0b', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#92400e' }}
                >
                  🔄 Rescan
                </button>
                <button
                  onClick={cancel}
                  style={{ padding: '9px 12px', background: '#f4f6fb', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#666' }}
                >
                  Discard
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
