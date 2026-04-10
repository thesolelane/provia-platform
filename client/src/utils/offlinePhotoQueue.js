const DB_NAME = 'pb_photo_queue';
const STORE_NAME = 'pending_photos';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queuePhoto(jobId, file, caption, token) {
  const db = await openDB();
  const arrayBuf = await file.arrayBuffer();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({
      jobId,
      blob: arrayBuf,
      fileName: file.name,
      mimeType: file.type,
      caption: caption || '',
      token,
      queuedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.sync) {
      await reg.sync.register('pb-photo-sync');
    }
  } catch {
    // Background Sync not supported — manual fallback handles it
  }
}

export async function getPendingPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingCount() {
  const items = await getPendingPhotos();
  return items.length;
}

export async function removePendingPhoto(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function uploadPendingPhotos(onProgress) {
  const items = await getPendingPhotos();
  let uploaded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const blob = new Blob([item.blob], { type: item.mimeType });
      const formData = new FormData();
      formData.append('photo', blob, item.fileName);
      if (item.caption) formData.append('caption', item.caption);

      const res = await fetch(`/api/jobs/${item.jobId}/photos`, {
        method: 'POST',
        headers: { 'x-auth-token': item.token },
        body: formData,
      });

      if (res.ok) {
        await removePendingPhoto(item.id);
        uploaded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    if (onProgress) onProgress({ uploaded, failed, total: items.length });
  }

  return { uploaded, failed, total: items.length };
}

let syncInterval = null;

export function startAutoSync(onUpdate) {
  if (syncInterval) return;
  syncInterval = setInterval(async () => {
    try {
      if (!navigator.onLine) return;
      const count = await getPendingCount();
      if (count > 0) {
        await uploadPendingPhotos();
        if (onUpdate) onUpdate();
      }
    } catch {
      // Silently ignore auto-sync errors
    }
  }, 30000);
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
