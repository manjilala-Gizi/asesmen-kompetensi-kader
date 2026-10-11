// Sinkronisasi ke Google Sheets (lewat Google Apps Script). Offline-first:
// data selalu disimpan di perangkat dulu, lalu dikirim saat ada jaringan.

import { semuaRecord, simpanRecord, ambilPengaturan } from './db.js';

let sedangKirim = false;

export const state = { pending: 0, last: null, error: '', online: navigator.onLine, aktif: false };
const emit = () => window.dispatchEvent(new CustomEvent('syncstate', { detail: { ...state } }));

export async function hitungPending() {
  const all = await semuaRecord();
  state.pending = all.filter((r) => !r.remote && r.status === 'selesai' && !r.synced).length;
  const cfg = await ambilPengaturan();
  state.aktif = !!(cfg.syncUrl && cfg.syncKey);
  emit();
  return state.pending;
}

function payload(rec) {
  return {
    key: rec.key,
    sessionId: rec.sessionId,
    role: rec.role,
    pointId: rec.pointId,
    pointJudul: rec.pointJudul,
    attempt: rec.attempt,
    tanggal: rec.tanggal,
    kader: rec.kader,
    penilai: rec.penilai,
    answers: rec.answers,
    nItems: rec.nItems,
    status: rec.status,
    updatedAt: rec.updatedAt,
  };
}

async function panggil(cfg, opts, query) {
  const url = cfg.syncUrl + (query ? (cfg.syncUrl.includes('?') ? '&' : '?') + query : '');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal, redirect: 'follow' });
    const json = await res.json();
    return json;
  } finally {
    clearTimeout(t);
  }
}

export async function kirimSemua() {
  if (sedangKirim) return { dikirim: 0, gagal: 0, dilewati: true };
  const cfg = await ambilPengaturan();
  if (!cfg.syncUrl || !cfg.syncKey) {
    await hitungPending();
    return { dikirim: 0, gagal: 0, tanpaKonfigurasi: true };
  }
  if (!navigator.onLine) {
    state.online = false;
    await hitungPending();
    return { dikirim: 0, gagal: 0, offline: true };
  }
  sedangKirim = true;
  let dikirim = 0;
  let gagal = 0;
  try {
    const all = await semuaRecord();
    const antre = all.filter((r) => !r.remote && r.status === 'selesai' && !r.synced);
    for (const rec of antre) {
      try {
        const json = await panggil(cfg, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'upsert', key: cfg.syncKey, record: payload(rec) }),
        });
        if (json && json.ok) {
          const terbaru = (await semuaRecord()).find((r) => r.key === rec.key);
          // hanya tandai terkirim bila isinya belum berubah sejak dikirim
          if (terbaru && terbaru.updatedAt === rec.updatedAt) {
            terbaru.synced = true;
            terbaru.syncedAt = Date.now();
            await simpanRecord(terbaru);
          }
          dikirim++;
        } else {
          gagal++;
          state.error = (json && json.error) || 'Server menolak data';
        }
      } catch (e) {
        gagal++;
        state.error = 'Tidak dapat terhubung ke server';
        break; // jaringan bermasalah: coba lagi nanti
      }
    }
    if (!gagal) {
      state.error = '';
      state.last = Date.now();
    }
  } finally {
    sedangKirim = false;
    await hitungPending();
  }
  return { dikirim, gagal };
}

// Ambil data penilai lain untuk satu sesi
export async function ambilSesi(sessionId) {
  const cfg = await ambilPengaturan();
  if (!cfg.syncUrl || !cfg.syncKey) return { ok: false, alasan: 'Alamat Google Sheets belum diatur di Pengaturan.' };
  if (!navigator.onLine) return { ok: false, alasan: 'Tidak ada jaringan.' };
  try {
    const json = await panggil(cfg, { method: 'GET' }, `action=session&id=${encodeURIComponent(sessionId)}&key=${encodeURIComponent(cfg.syncKey)}`);
    if (!json || !json.ok) return { ok: false, alasan: (json && json.error) || 'Server menolak permintaan.' };
    const lokal = await semuaRecord();
    let baru = 0;
    for (const r of json.records || []) {
      const key = `${r.sessionId}-${r.role}`;
      const ada = lokal.find((x) => x.key === key);
      if (ada && !ada.remote) continue; // catatan milik perangkat ini tidak ditimpa
      if (ada && ada.remote && ada.updatedAt >= r.updatedAt) continue;
      await simpanRecord({ ...r, key, remote: true, synced: true });
      baru++;
    }
    return { ok: true, baru, records: json.records || [] };
  } catch {
    return { ok: false, alasan: 'Tidak dapat terhubung ke server.' };
  }
}

export async function ujiKoneksi(url, key) {
  try {
    const json = await panggil({ syncUrl: url }, { method: 'GET' }, `action=ping&key=${encodeURIComponent(key)}`);
    return json || { ok: false, error: 'Tidak ada jawaban' };
  } catch {
    return { ok: false, error: 'Tidak dapat terhubung. Periksa alamat dan jaringan.' };
  }
}

export function mulaiOtomatis() {
  const coba = () => {
    state.online = navigator.onLine;
    if (navigator.onLine) kirimSemua();
    else hitungPending();
  };
  window.addEventListener('online', coba);
  window.addEventListener('offline', coba);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') coba();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && state.pending > 0) coba();
  }, 45000);
  coba();
}
