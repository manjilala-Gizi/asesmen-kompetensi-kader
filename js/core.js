/* core.js — logika inti: penyimpanan (IndexedDB), perhitungan nilai, sinkronisasi */
(function () {
  'use strict';
  const T = window.TILIK;
  const LULUS = T.lulus; // 80

  /* ---------- Util ---------- */
  const pointById = {};
  T.kelompok.forEach(k => k.points.forEach(p => { pointById[p.id] = p; p.kdObj = k; }));
  function listItems(p) {
    // daftar butir datar dengan id stabil: i1..in
    if (p._flat) return p._flat;
    const out = [];
    if (p.items) p.items.forEach((t, i) => out.push({ id: 'i' + (i + 1), no: i + 1, teks: t }));
    else {
      let n = 0;
      p.sections.forEach(s => s.sub.forEach(sb => sb.items.forEach(t => {
        n++; out.push({ id: 'i' + n, no: n, teks: t, sec: s.kode });
      })));
    }
    p._flat = out; return out;
  }
  function kodeSesi() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; const a = new Uint8Array(6); crypto.getRandomValues(a);
    a.forEach(v => s += abc[v % abc.length]); return s;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function kaderKey(k) {
    return [k.nama, k.desa, k.posyandu].map(x => (x || '').toLowerCase().replace(/\s+/g, ' ').trim()).join('|');
  }
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---------- IndexedDB ---------- */
  let dbp;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('easkader', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('sesi', { keyPath: 'kode' });
        d.createObjectStore('records', { keyPath: 'id' });  // rekaman penilai ini
        d.createObjectStore('remote', { keyPath: 'id' });   // cache rekaman penilai lain
        d.createObjectStore('kv', { keyPath: 'k' });
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode); const s = t.objectStore(store);
      const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
  }
  const get = (st, k) => db().then(d => new Promise((res, rej) => { const r = d.transaction(st).objectStore(st).get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const all = st => db().then(d => new Promise((res, rej) => { const r = d.transaction(st).objectStore(st).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const put = (st, v) => tx(st, 'readwrite', s => { s.put(v); });
  const del = (st, k) => tx(st, 'readwrite', s => { s.delete(k); });
  const clear = st => tx(st, 'readwrite', s => { s.clear(); });
  async function kvGet(k, def) { const r = await get('kv', k); return r ? r.v : def; }
  const kvSet = (k, v) => put('kv', { k, v });

  /* ---------- Perhitungan ---------- */
  function skorRecord(p, rec) {
    const items = listItems(p); let s = 0, jawab = 0;
    items.forEach(it => { const v = rec && rec.answers ? rec.answers[it.id] : undefined; if (v === 1 || v === 0) jawab++; if (v === 1) s++; });
    return { skor: s, jawab, n: items.length };
  }
  function kategoriP3(p, rataSkor) {
    if (!p.kategori) return null;
    const v = Math.floor(rataSkor + 1e-9);
    for (const [nama, lo, hi] of p.kategori) if (v >= lo && v <= hi) return nama;
    return p.kategori[0][0];
  }
  // rekaman role 1 & 2 untuk (kode, pointId); sumber: lokal + cache remote
  async function recordsFor(kode, pointId) {
    const out = {};
    const [loc, rem] = await Promise.all([all('records'), all('remote')]);
    [...rem, ...loc].forEach(r => { if (r.kode === kode && r.pointId === pointId && r.status === 'selesai') out[r.role] = r; });
    return out;
  }
  function final(p, recs) {
    const n = listItems(p).length;
    const r1 = recs[1], r2 = recs[2];
    const s1 = r1 ? skorRecord(p, r1).skor : null, s2 = r2 ? skorRecord(p, r2).skor : null;
    const lengkap = !!(r1 && r2);
    const jumlah = (s1 || 0) + (s2 || 0);
    const pembagi = n * (lengkap ? 2 : 1);
    const persen = (r1 || r2) ? Math.round(jumlah / pembagi * 1000) / 10 : null;
    const lulus = persen !== null && persen >= LULUS;
    const out = { n, s1, s2, lengkap, jumlah, pembagi, persen, lulus, status: !lengkap ? 'sementara' : (lulus ? 'lulus' : 'tidak') };
    if (p.kategori && (r1 || r2)) {
      const rata = lengkap ? (s1 + s2) / 2 : (s1 !== null ? s1 : s2);
      out.kategori = kategoriP3(p, rata); out.rataSkor = rata;
    }
    // nilai gabungan per butir 0-2
    out.butir = listItems(p).map(it => {
      const a = r1 && r1.answers ? r1.answers[it.id] : undefined, b = r2 && r2.answers ? r2.answers[it.id] : undefined;
      return { id: it.id, a, b, gabungan: (a === 1 ? 1 : 0) + (b === 1 ? 1 : 0), belum: !(a === 1 && (lengkap ? b === 1 : true)) };
    });
    return out;
  }

  /* ---------- Sesi & rekaman ---------- */
  async function buatSesi({ kode, kader, penilai, role, tanggal }) {
    const s = { kode: kode || kodeSesi(), kader, penilai, role, tanggal: tanggal || today(), dibuat: Date.now() };
    await put('sesi', s); return s;
  }
  async function attemptKe(kader, pointId, kode) {
    const key = kaderKey(kader); const [sesi, rec] = await Promise.all([all('sesi'), all('records')]);
    const byKode = {}; sesi.forEach(s => byKode[s.kode] = s);
    const kodes = new Set();
    rec.forEach(r => { const s = byKode[r.kode]; if (s && r.pointId === pointId && r.kode !== kode && kaderKey(s.kader) === key) kodes.add(r.kode + '@' + (byKode[r.kode].dibuat)); });
    return kodes.size + 1;
  }
  async function getRecord(kode, pointId, role) {
    const id = `${kode}|${pointId}|${role}`;
    let r = await get('records', id);
    if (r) return r;
    const s = await get('sesi', kode);
    r = {
      id, kode, pointId, role, answers: {}, catatan: '', status: 'draft', synced: false,
      kader: s.kader, penilai: s.penilai, tanggal: s.tanggal,
      attempt: await attemptKe(s.kader, pointId, kode), dibuat: Date.now(), diubah: Date.now()
    };
    return r;
  }
  async function simpanRecord(r) { r.diubah = Date.now(); r.synced = false; await put('records', r); return r; }

  /* ---------- Sinkronisasi Google Sheets ---------- */
  const listeners = new Set();
  const onSync = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach(f => { try { f(); } catch (e) { } });
  async function cfg() { return { url: await kvGet('syncUrl', ''), token: await kvGet('syncToken', '') }; }
  async function pending() { return (await all('records')).filter(r => r.status === 'selesai' && !r.synced); }
  function payload(r) {
    const p = pointById[r.pointId]; const sk = skorRecord(p, r);
    return {
      id: r.id, kode: r.kode, pointId: r.pointId, kd: p.kd, pointNo: p.no, pointJudul: p.judul, role: r.role, attempt: r.attempt,
      tanggal: r.tanggal, kader: r.kader, penilai: r.penilai, n: sk.n, skor: sk.skor, answers: r.answers, catatan: r.catatan || '',
      diubah: r.diubah
    };
  }
  let sending = false;
  async function kirim() {
    if (sending) return { ok: false, alasan: 'sedang mengirim' };
    const c = await cfg(); if (!c.url) return { ok: false, alasan: 'belum diatur' };
    if (!navigator.onLine) return { ok: false, alasan: 'offline' };
    const list = await pending(); if (!list.length) return { ok: true, terkirim: 0 };
    sending = true;
    try {
      const resp = await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: c.token, action: 'upsert', records: list.map(payload) }) });
      const j = await resp.json();
      if (!j.ok) return { ok: false, alasan: j.error || 'ditolak server' };
      for (const r of list) { const cur = await get('records', r.id); if (cur && cur.diubah === r.diubah) { cur.synced = true; await put('records', cur); } }
      await kvSet('lastSync', Date.now()); emit();
      return { ok: true, terkirim: list.length };
    } catch (e) { return { ok: false, alasan: 'gagal terhubung' }; }
    finally { sending = false; emit(); }
  }
  async function ambilRemote(kode) {
    const c = await cfg(); if (!c.url) return { ok: false, alasan: 'belum diatur' };
    if (!navigator.onLine) return { ok: false, alasan: 'offline' };
    try {
      const u = c.url + (c.url.includes('?') ? '&' : '?') + 'action=get&kode=' + encodeURIComponent(kode) + '&token=' + encodeURIComponent(c.token);
      const j = await (await fetch(u)).json();
      if (!j.ok) return { ok: false, alasan: j.error || 'ditolak server' };
      for (const r of j.records || []) {
        // simpan hanya rekaman yang bukan milik rekaman lokal yang sama
        const loc = await get('records', r.id);
        if (!loc) await put('remote', Object.assign({ status: 'selesai' }, r));
      }
      emit(); return { ok: true, records: j.records || [], sesi: j.sesi || null };
    } catch (e) { return { ok: false, alasan: 'gagal terhubung' }; }
  }
  async function tes() {
    const c = await cfg(); if (!c.url) return { ok: false, alasan: 'URL belum diisi' };
    try { const j = await (await fetch(c.url + (c.url.includes('?') ? '&' : '?') + 'action=ping&token=' + encodeURIComponent(c.token))).json(); return j.ok ? { ok: true } : { ok: false, alasan: j.error || 'ditolak' }; }
    catch (e) { return { ok: false, alasan: 'gagal terhubung' }; }
  }
  window.addEventListener('online', () => kirim());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kirim(); });
  setInterval(() => { if (navigator.onLine) kirim(); }, 60000);

  /* ---------- Cadangan ---------- */
  async function eksporSemua() {
    return { app: 'e-Asesmen Kompetensi Kader', versi: 1, waktu: new Date().toISOString(), sesi: await all('sesi'), records: await all('records'), remote: await all('remote') };
  }
  async function imporSemua(o) {
    if (!o || o.app !== 'e-Asesmen Kompetensi Kader') throw new Error('Berkas bukan cadangan aplikasi ini');
    for (const s of o.sesi || []) await put('sesi', s);
    for (const r of o.records || []) { const cur = await get('records', r.id); if (!cur || cur.diubah < r.diubah) await put('records', r); }
    for (const r of o.remote || []) await put('remote', r);
  }

  window.Core = {
    T, LULUS, pointById, listItems, kodeSesi, uid, kaderKey, today,
    all, get, put, del, clear, kvGet, kvSet,
    skorRecord, final, recordsFor, buatSesi, getRecord, simpanRecord, attemptKe,
    cfg, pending, kirim, ambilRemote, tes, onSync, eksporSemua, imporSemua
  };
})();
