// Penyimpanan lokal di perangkat (IndexedDB). Semua penilaian tersimpan di sini lebih dulu.

const NAMA = 'e-asesmen-kader';
let dbp;

function buka() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(NAMA, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await buka();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const semuaRecord = () => tx('records', 'readonly', (s) => s.getAll());
export const ambilRecord = (key) => tx('records', 'readonly', (s) => s.get(key));
export const simpanRecord = (rec) => tx('records', 'readwrite', (s) => s.put(rec));
export const hapusRecord = (key) => tx('records', 'readwrite', (s) => s.delete(key));
export const kosongkanRecord = () => tx('records', 'readwrite', (s) => s.clear());

const DEFAULT = {
  penilai: { nama: '', institusi: '' },
  syncUrl: '',
  syncKey: '',
};

export async function ambilPengaturan() {
  const r = await tx('meta', 'readonly', (s) => s.get('settings'));
  return { ...DEFAULT, ...(r ? r.v : {}), penilai: { ...DEFAULT.penilai, ...((r && r.v && r.v.penilai) || {}) } };
}

export async function simpanPengaturan(v) {
  await tx('meta', 'readwrite', (s) => s.put({ k: 'settings', v }));
}

export async function sesiRecords(sessionId) {
  const all = await semuaRecord();
  return all.filter((r) => r.sessionId === sessionId);
}
