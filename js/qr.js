// QR code: membuat (undangan Penilai 2) dan memindai (halaman Gabung). Semua berjalan tanpa internet.
// Pustaka dimuat saat dibutuhkan saja: vendor/qrcode.min.js (MIT) dan vendor/jsQR.min.js (Apache-2.0).

import { h } from './util.js';

const dimuat = new Map();
function muatSkrip(src) {
  if (!dimuat.has(src)) {
    dimuat.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => (dimuat.delete(src), reject(new Error('Gagal memuat ' + src)));
        document.head.append(s);
      })
    );
  }
  return dimuat.get(src);
}

// Elemen SVG berisi QR dari teks (tajam di semua ukuran layar)
export async function qrSvg(teks, label = 'QR code') {
  await muatSkrip('vendor/qrcode.min.js');
  const qr = window.qrcode(0, 'L');
  qr.addData(teks, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const tepi = 4;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + tepi} ${y + tepi}h1v1h-1z`;
  const ukuran = n + tepi * 2;
  return h('div', {
    class: 'qr-gambar',
    html: `<svg viewBox="0 0 ${ukuran} ${ukuran}" role="img" aria-label="${label}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${ukuran}" height="${ukuran}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`,
  });
}

// Pemindai: membuka kamera belakang dalam lapisan layar penuh. onHasil(teks) dipanggil sekali.
export function bukaPemindai({ onHasil, cocok = () => true }) {
  const video = h('video', { playsinline: true, muted: true, autoplay: true });
  video.setAttribute('playsinline', '');
  video.muted = true;
  const pesan = h('p', { class: 'pindai-pesan', role: 'status' }, 'Menyalakan kamera…');
  const tutup = h('button', { type: 'button', class: 'btn alt' }, 'Tutup');
  const lapisan = h('div', { class: 'pindai', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pindai QR code' }, h('div', { class: 'pindai-bingkai' }, video, h('div', { class: 'pindai-kotak', 'aria-hidden': 'true' })), pesan, tutup);
  document.body.append(lapisan);

  let aktif = true;
  let stream = null;
  const kanvas = document.createElement('canvas');
  const ctx = kanvas.getContext('2d', { willReadFrequently: true });
  let detektor = null;

  const berhenti = () => {
    aktif = false;
    stream?.getTracks().forEach((t) => t.stop());
    lapisan.remove();
  };
  tutup.addEventListener('click', berhenti);

  const putar = async () => {
    if (!aktif) return;
    if (video.readyState >= 2 && video.videoWidth) {
      let teks = null;
      try {
        if (detektor) {
          const hasil = await detektor.detect(video);
          teks = hasil[0]?.rawValue || null;
        } else {
          const w = Math.min(video.videoWidth, 720);
          const hgt = Math.round((video.videoHeight / video.videoWidth) * w);
          kanvas.width = w;
          kanvas.height = hgt;
          ctx.drawImage(video, 0, 0, w, hgt);
          const img = ctx.getImageData(0, 0, w, hgt);
          teks = window.jsQR(img.data, w, hgt, { inversionAttempts: 'dontInvert' })?.data || null;
        }
      } catch {
        teks = null;
      }
      if (teks) {
        if (cocok(teks)) {
          berhenti();
          onHasil(teks);
          return;
        }
        pesan.textContent = 'QR terbaca, tetapi bukan undangan e-Asesmen. Arahkan ke QR dari HP Penilai 1.';
      }
    }
    setTimeout(putar, 180);
  };

  (async () => {
    try {
      if ('BarcodeDetector' in window) {
        const format = await window.BarcodeDetector.getSupportedFormats?.().catch(() => []);
        if (!format || format.includes('qr_code')) detektor = new window.BarcodeDetector({ formats: ['qr_code'] });
      }
      if (!detektor) await muatSkrip('vendor/jsQR.min.js');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('kamera');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!aktif) return stream.getTracks().forEach((t) => t.stop());
      video.srcObject = stream;
      await video.play().catch(() => {});
      pesan.textContent = 'Arahkan kamera ke QR code di HP Penilai 1.';
      putar();
    } catch (e) {
      pesan.textContent =
        e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
          ? 'Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser, atau minta tautan lewat WhatsApp.'
          : 'Kamera tidak bisa dibuka di perangkat ini. Minta Penilai 1 mengirim tautan lewat WhatsApp.';
    }
  })();

  return berhenti;
}
