// Service worker: aplikasi bisa dibuka dan dipakai tanpa internet.
// Naikkan VERSI setiap kali file aplikasi diubah agar perangkat mengambil versi baru.
const VERSI = 'v1.3.0';
const CACHE = 'e-asesmen-kader-' + VERSI;
const FILE = [
  './', 'index.html', 'manifest.webmanifest',
  'css/styles.css',
  'js/app.js', 'js/config.js', 'js/views.js', 'js/util.js', 'js/db.js', 'js/scoring.js', 'js/sync.js', 'js/pdf.js', 'js/data/tilik.js',
  'vendor/pdf-lib.min.js',
  'vendor/fonts/poppins-Regular.woff', 'vendor/fonts/poppins-Medium.woff', 'vendor/fonts/poppins-Bold.woff',
  'assets/logo-poltekkes.png', 'assets/mark.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('e-asesmen-kader-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Google Apps Script dll. tidak disentuh
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const jaringan = fetch(req)
        .then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || jaringan.then((r) => r || caches.match('index.html'));
    })
  );
});
