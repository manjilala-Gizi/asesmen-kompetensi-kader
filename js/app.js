// Pintu masuk aplikasi: router sederhana berbasis hash, menu, status sinkron, service worker.

import * as V from './views.js';
import { h } from './util.js';
import { mulaiOtomatis, hitungPending, kirimSemua, state as sync } from './sync.js';
import { toast } from './util.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const chip = document.getElementById('chip-sync');

const IKON = {
  beranda: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  nilai: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8l1.5 1.5L13 7M9 14h6M9 17h4"/></svg>',
  riwayat: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  rekap: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  setelan: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
};
const MENU = [
  ['#/', 'Beranda', 'beranda', ['']],
  ['#/baru', 'Menilai', 'nilai', ['baru', 'gabung', 'nilai']],
  ['#/riwayat', 'Riwayat', 'riwayat', ['riwayat', 'hasil', 'paket']],
  ['#/rekap', 'Rekap', 'rekap', ['rekap']],
  ['#/setelan', 'Setelan', 'setelan', ['setelan', 'tentang']],
];
MENU.forEach(([href, label, ik]) => nav.append(h('a', { href, html: IKON[ik] + `<span>${label}</span>` })));

function tandaiMenu(rute) {
  [...nav.children].forEach((a, i) => {
    if (MENU[i][3].includes(rute)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function urai() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const seg = path.split('/').filter(Boolean);
  return { rute: seg[0] || '', param: seg[1] ? decodeURIComponent(seg[1]) : '', paramMentah: seg[1] || '', query: new URLSearchParams(qs || '') };
}

let nomor = 0;
async function tampilkan() {
  const my = ++nomor;
  const { rute, param, paramMentah, query } = urai();
  let hasil;
  try {
    switch (rute) {
      case '': hasil = await V.beranda(); break;
      case 'baru': hasil = await V.baru(query); break;
      case 'gabung': hasil = await V.gabung(paramMentah); break;
      case 'nilai': hasil = await V.nilai(param); break;
      case 'hasil': hasil = await V.hasil(param); break;
      case 'paket': hasil = await V.paket(param); break;
      case 'riwayat': hasil = await V.riwayat(); break;
      case 'rekap': hasil = await V.rekap(paramMentah); break;
      case 'setelan': hasil = await V.setelan(query); break;
      case 'tentang': hasil = await V.tentang(); break;
      default: hasil = { el: h('div', { class: 'kosong-state' }, h('b', null, 'Halaman tidak ditemukan'), h('a', { class: 'btn', href: '#/' }, 'Ke beranda')), judul: 'Tidak ditemukan' };
    }
  } catch (e) {
    console.error(e);
    hasil = { el: h('div', { class: 'note bad' }, 'Terjadi kesalahan saat membuka halaman: ' + (e.message || e)), judul: 'Kesalahan' };
  }
  if (my !== nomor) return; // navigasi lain sudah berjalan
  app.replaceChildren(hasil.el);
  document.body.classList.toggle('fokus', !!hasil.fokus);
  document.title = (hasil.judul ? hasil.judul + ' · ' : '') + 'e-Asesmen Kompetensi Kader';
  tandaiMenu(rute);
  if (!window.__pertama) window.__pertama = true;
  else {
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }
}

window.addEventListener('hashchange', tampilkan);

// ---- status sinkron di bilah atas
function gambarChip(s) {
  const span = chip.querySelector('span');
  chip.className = 'chip';
  if (!s.aktif) {
    chip.classList.add('off');
    span.textContent = s.pending ? `${s.pending} belum terkirim` : 'Mode lokal';
    chip.title = 'Google Sheets belum diatur. Data tersimpan di perangkat ini.';
  } else if (!navigator.onLine) {
    chip.classList.add('off');
    span.textContent = s.pending ? `Offline · ${s.pending} antre` : 'Offline';
    chip.title = 'Tidak ada jaringan. Data akan dikirim otomatis saat tersambung.';
  } else if (s.pending) {
    chip.classList.add('warn');
    span.textContent = `${s.pending} belum terkirim`;
    chip.title = s.error || 'Ketuk untuk mengirim sekarang.';
  } else {
    span.textContent = 'Tersinkron';
    chip.title = 'Semua data sudah terkirim ke Google Sheets.';
  }
}
window.addEventListener('syncstate', (e) => gambarChip(e.detail));
chip.addEventListener('click', async () => {
  if (!sync.aktif) return (location.hash = '#/setelan');
  toast('Mengirim data...');
  const r = await kirimSemua();
  if (r.offline) toast('Tidak ada jaringan. Data tetap aman di perangkat.');
  else if (r.gagal) toast('Gagal mengirim: ' + sync.error);
  else toast(r.dikirim ? `${r.dikirim} data terkirim.` : 'Semua data sudah terkirim.');
});

// ---- pasang ke layar utama
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__installPrompt = e;
  document.getElementById('btn-pasang')?.removeAttribute('hidden');
});

// ---- service worker (offline)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
navigator.storage?.persist?.().catch(() => {});

tampilkan();
hitungPending().then(() => mulaiOtomatis());
