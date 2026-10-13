// Halaman-halaman aplikasi. Setiap fungsi mengembalikan { el, fokus?, judul? }.

import { h, toast, kodeSesi, hariIni, tanggalIndo, waktuIndo, norm, kaderKey, persen, b64encode, b64decode, unduh, debounce, slug } from './util.js';
import { TILIK } from './data/tilik.js';
import { cariPoint, cariKd, semuaPoint, ringkasanSesi, hitungFinal, skorRecord, labelStatus, AMBANG } from './scoring.js';
import { semuaRecord, ambilRecord, simpanRecord, hapusRecord, kosongkanRecord, ambilPengaturan, simpanPengaturan, sesiRecords } from './db.js';
import { BAWAAN } from './config.js';
import { kirimSemua, ambilSesi, ambilPaket, ujiKoneksi, hitungPending, state as syncState } from './sync.js';
import { buatPdfPoint, buatPdfRekap, unduhPdf, namaFilePoint, namaFileRekap } from './pdf.js';

const ROM = ['', 'I', 'II', 'III', 'IV', 'V'];
const WARNA = ['', '#00b8ab', '#62c0d0', '#77d68f', '#cddc2b', '#0b6b66'];
const TEKS = ['', '#06302e', '#06302e', '#06302e', '#06302e', '#ffffff'];

const baseUrl = () => new URL('./', location.href).href;
const pasang = (id) => (location.hash = id);

function lencana(kd, cls = 'rom') {
  return h('span', { class: cls, style: `background:${WARNA[kd]};color:${TEKS[kd]}`, 'aria-hidden': 'true' }, ROM[kd]);
}

function chipStatus(status) {
  return h('span', { class: 'chip ' + status }, labelStatus[status] || status);
}

async function semuaSesi() {
  const all = await semuaRecord();
  const m = new Map();
  for (const r of all) {
    if (!m.has(r.sessionId)) m.set(r.sessionId, []);
    m.get(r.sessionId).push(r);
  }
  const out = [];
  for (const [id, recs] of m) {
    const point = cariPoint(recs[0].pointId);
    if (!point) continue;
    const ref = recs.find((r) => !r.remote) || recs[0];
    const rs = ringkasanSesi(point, recs);
    out.push({ id, recs, ref, point, ...rs, updatedAt: Math.max(...recs.map((r) => r.updatedAt || 0)) });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

function buatRecord({ sessionId, role, point, attempt, tanggal, kader, penilai }) {
  const now = Date.now();
  return {
    key: `${sessionId}-${role}`,
    sessionId,
    role,
    pointId: point.id,
    pointJudul: point.judul,
    attempt,
    tanggal,
    kader,
    penilai,
    answers: Array(point.items.length).fill(null),
    nItems: point.items.length,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    synced: false,
    remote: false,
  };
}

function tautanGabung(rec) {
  const p = { s: rec.sessionId, p: rec.pointId, a: rec.attempt, t: rec.tanggal, k: [rec.kader.nama, rec.kader.desa, rec.kader.posyandu], o: [rec.penilai.nama, rec.penilai.institusi] };
  return baseUrl() + '#/gabung/' + b64encode(p);
}

/* ---- paket: beberapa point dinilai sekaligus. Kode sesi tiap point = KODE-point (mis. K7QM2A-1.3) */
const POLA_PAKET = /^([A-HJ-NP-Z2-9]{6})-(\d+\.\d+)$/;
export const kodePaket = (sessionId) => (POLA_PAKET.exec(sessionId || '') || [])[1] || '';
const urutanResmi = new Map(semuaPoint().map((p, i) => [p.id, i]));
const urutkanPoint = (ids) => [...new Set(ids)].filter((id) => urutanResmi.has(id)).sort((a, b) => urutanResmi.get(a) - urutanResmi.get(b));

async function paketRecords(kode) {
  return (await semuaRecord()).filter((r) => kodePaket(r.sessionId) === kode);
}

function pointPaket(recs) {
  const dariLokal = recs.find((r) => r.paket && Array.isArray(r.paket.points));
  return urutkanPoint(dariLokal ? dariLokal.paket.points.concat(recs.map((r) => r.pointId)) : recs.map((r) => r.pointId));
}

function tautanGabungPaket(kode, points, rec) {
  const p = { s: kode, ps: points, a: rec.attempt, t: rec.tanggal, k: [rec.kader.nama, rec.kader.desa, rec.kader.posyandu], o: [rec.penilai.nama, rec.penilai.institusi] };
  return baseUrl() + '#/gabung/' + b64encode(p);
}

// ringkas daftar point: "KD I Point 1-6, KD II Point 2"
function ringkasPoint(ids) {
  const per = new Map();
  ids.map(cariPoint).filter(Boolean).forEach((p) => per.set(p.kdKode, [...(per.get(p.kdKode) || []), p.no]));
  return [...per].map(([kd, nos]) => {
    const n = nos.sort((a, b) => a - b);
    const urut = n.every((x, i) => i === 0 || x === n[i - 1] + 1);
    return `${kd} Point ${n.length > 2 && urut ? n[0] + '–' + n.at(-1) : n.join(', ')}`;
  }).join(' · ');
}

// status per KD: KOMPETEN bila semua point KD sudah final dan lulus
export function statusKd(kd, hasilPerPoint) {
  const pts = cariKd(kd).points;
  const ada = pts.map((p) => hasilPerPoint.get(p.id)).filter(Boolean);
  const lengkap = ada.filter((x) => x.lengkap);
  const lulus = lengkap.filter((x) => x.lulus).length;
  let status = 'menunggu';
  let label = ada.length ? 'BELUM LENGKAP' : 'BELUM DINILAI';
  if (lengkap.length === pts.length) {
    status = lulus === pts.length ? 'lulus' : 'tidak';
    label = lulus === pts.length ? 'KOMPETEN' : 'BELUM KOMPETEN';
  }
  return { status, label, lulus, final: lengkap.length, dinilai: ada.length, total: pts.length };
}

function panelUndang({ judul, kode, link, pesan }) {
  const salin = h('button', { class: 'btn alt kecil', type: 'button' }, 'Salin tautan');
  salin.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Tautan disalin.');
    } catch {
      toast('Tidak bisa menyalin otomatis. Tahan dan salin tautan di atas.');
    }
  });
  const wa = h('a', { class: 'btn kecil', href: 'https://wa.me/?text=' + encodeURIComponent(pesan), target: '_blank', rel: 'noopener' }, 'Kirim lewat WhatsApp');
  const bagi = navigator.share ? h('button', { class: 'btn alt kecil', type: 'button', onclick: () => navigator.share({ title: 'Sesi penilaian', text: pesan }).catch(() => {}) }, 'Bagikan…') : null;
  return h('div', { class: 'panel tint' }, h('h3', null, judul), h('p', { class: 'small', style: 'margin:0 0 4px' }, 'Kode'), h('div', { class: 'kode' }, kode), h('div', { class: 'tautan' }, link), h('div', { class: 'row' }, wa, salin, bagi), h('p', { class: 'small muted', style: 'margin:12px 0 0' }, 'Tautan berisi data kader, jadi Penilai 2 bisa membukanya tanpa internet. Nilai gabungan muncul setelah kedua penilai selesai dan data terkirim.'));
}

/* =========================================================== BERANDA */
function bungaSvg() {
  const sudut = [0, 72, 144, 216, 288];
  const petal = 'M100 106 C70 84 66 40 100 14 C134 40 130 84 100 106 Z';
  const g = TILIK.map((k, i) => {
    const a = sudut[i];
    return `<a href="#/baru?kd=${k.kd}" aria-label="${k.kode}: ${k.judul}, ${k.points.length} point">
      <g transform="rotate(${a} 100 100)"><g class="buka" style="--i:${i}">
        <path class="kelopak" d="${petal}" fill="${WARNA[k.kd]}" stroke="#f4faf8" stroke-width="3"/>
        <text x="100" y="58" text-anchor="middle" font-size="${k.kode.length > 4 ? 13 : 15}" fill="${TEKS[k.kd]}" transform="rotate(${-a} 100 52)">${ROM[k.kd]}</text>
      </g></g></a>`;
  }).join('');
  const wrap = h('div', { html: `<svg class="bunga" viewBox="0 0 200 200" role="group" aria-label="Lima kompetensi, pilih salah satu untuk memulai">${g}<circle cx="100" cy="100" r="17" fill="#fff"/><text x="100" y="105" text-anchor="middle" font-size="12" fill="#06302e" font-family="Poppins,sans-serif" font-weight="700">KD</text></svg>` });
  return wrap.firstChild;
}

export async function beranda() {
  const totalPoint = semuaPoint().length;
  const totalButir = semuaPoint().reduce((a, p) => a + p.items.length, 0);
  const pasangBtn = h('button', { type: 'button', class: 'btn alt', hidden: !window.__installPrompt, id: 'btn-pasang' }, 'Pasang di layar utama');
  pasangBtn.addEventListener('click', async () => {
    if (!window.__installPrompt) return;
    window.__installPrompt.prompt();
    await window.__installPrompt.userChoice;
    window.__installPrompt = null;
    pasangBtn.hidden = true;
  });
  const el = h(
    'div',
    null,
    h(
      'section',
      { class: 'hero' },
      h(
        'div',
        null,
        h('h1', null, 'e-Asesmen Kompetensi Kader'),
        h('p', { class: 'lead' }, 'Dua penilai mengisi daftar tilik di perangkat masing-masing. Nilai final dan laporan PDF dibuat otomatis.'),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/baru' }, 'Mulai penilaian'), h('a', { class: 'btn alt', href: '#/gabung' }, 'Gabung sesi penilai'), pasangBtn),
        h('p', { class: 'muted small', style: 'margin-top:14px' }, 'Bisa dipakai tanpa internet. Data tersimpan di perangkat dan terkirim ke Google Sheets begitu jaringan tersedia.')
      ),
      bungaSvg()
    ),
    h('h2', null, 'Pilih kompetensi'),
    h(
      'ul',
      { class: 'daftar-kd' },
      TILIK.map((k) =>
        h('li', null, h('a', { href: `#/baru?kd=${k.kd}` }, lencana(k.kd), h('span', null, h('strong', null, `${k.kode}. ${k.judul}`)), h('span', { class: 'jml' }, `${k.points.length} point · ${k.points.reduce((a, p) => a + p.items.length, 0)} butir`)))
      )
    ),
    h('h2', null, 'Cara memakai'),
    h(
      'ol',
      { class: 'langkah' },
      h('li', null, h('b', null, 'Isi identitas dan centang point'), h('span', null, 'Identitas kader dan penilai diisi sekali, lalu centang semua point yang dinilai hari ini.')),
      h('li', null, h('b', null, 'Nilai per butir'), h('span', null, 'Setiap penilai memilih Sesuai atau Tidak Sesuai di perangkatnya sendiri, point demi point.')),
      h('li', null, h('b', null, 'Lihat nilai final'), h('span', null, 'Nilai kedua penilai digabung otomatis menjadi satu hasil.')),
      h('li', null, h('b', null, 'Cetak PDF'), h('span', null, 'Laporan per point atau rekap semua point untuk satu kader.'))
    ),
    h('h2', null, 'Aturan penilaian'),
    h(
      'ul',
      { class: 'aturan' },
      h('li', null, h('b', null, '2 penilai'), 'Tiap butir dinilai Sesuai (1) atau Tidak Sesuai (0) oleh masing-masing penilai.'),
      h('li', null, h('b', null, `Lulus ≥ ${AMBANG}%`), 'Nilai final = jumlah nilai kedua penilai ÷ (jumlah butir × 2) × 100%.'),
      h('li', null, h('b', null, 'Boleh mengulang'), 'Point yang belum lulus bisa dinilai ulang. Setiap percobaan tersimpan di riwayat.')
    ),
    h('footer', { class: 'kaki' }, `${totalPoint} point · ${totalButir} butir · Poltekkes Kemenkes Makassar`)
  );
  return { el, judul: 'Beranda' };
}

/* =========================================================== PENILAIAN BARU */
export async function baru(query) {
  const cfg = await ambilPengaturan();
  const all = await semuaRecord();
  const kaderUnik = new Map();
  all.forEach((r) => kaderUnik.set(kaderKey(r.kader), r.kader));
  const kdBuka = Number(query.get('kd')) || 0;
  const pointAwal = query.get('point') || '';

  const f = (name, label, opts = {}) =>
    h('label', { class: 'f' }, label, h('input', { type: opts.type || 'text', name, required: opts.req !== false, autocomplete: opts.ac || 'off', list: opts.list, value: opts.val || '', placeholder: opts.ph || '' }));

  const dl = h('datalist', { id: 'dl-kader' }, [...kaderUnik.values()].map((k) => h('option', { value: k.nama })));
  const form = h('form', { novalidate: true });
  const galat = h('div', { class: 'note bad', hidden: true, role: 'alert' });
  const peringatan = h('div', { class: 'note warn', hidden: true, role: 'status' });

  // pilihan point: kotak centang, dengan "pilih semua" per KD
  const daftarPoint = TILIK.map((k) => {
    const centangKd = (p) => kdBuka === k.kd || pointAwal === p.id;
    const semua = h('input', { type: 'checkbox', class: 'semua', 'aria-label': `Pilih semua point ${k.kode}` });
    const hitung = h('span', { class: 'jml-pilih' });
    const kotak = k.points.map((p) => h('input', { type: 'checkbox', name: 'point', value: p.id, checked: centangKd(p) }));
    const segarkan = () => {
      const n = kotak.filter((x) => x.checked).length;
      semua.checked = n === kotak.length;
      semua.indeterminate = n > 0 && n < kotak.length;
      hitung.textContent = n ? `${n}/${kotak.length} dipilih` : '';
    };
    semua.addEventListener('change', () => {
      kotak.forEach((x) => (x.checked = semua.checked));
      segarkan();
      form.dispatchEvent(new Event('pilihan'));
    });
    kotak.forEach((x) => x.addEventListener('change', () => (segarkan(), form.dispatchEvent(new Event('pilihan')))));
    queueMicrotask(segarkan);
    return h(
      'details',
      { class: 'kdp', open: kdBuka === k.kd || (!kdBuka && !pointAwal && k.kd === 1) || k.points.some((p) => p.id === pointAwal) },
      h('summary', null, lencana(k.kd), h('span', null, `${k.kode}. ${k.judul}`), hitung),
      h(
        'div',
        { class: 'pilih-point' },
        h('label', { class: 'semua-label' }, semua, h('span', null, h('b', null, `Pilih semua point ${k.kode}`), h('small', null, `${k.points.length} point · ${k.points.reduce((a, p) => a + p.items.length, 0)} butir`))),
        k.points.map((p, i) => h('label', null, kotak[i], h('span', null, `${p.no}. ${p.judul}`, h('small', null, `${p.items.length} butir`))))
      )
    );
  });

  const inputAttempt = h('input', { type: 'number', name: 'attempt', min: 1, max: 20, value: 1, required: true, inputmode: 'numeric' });

  form.append(
    dl,
    h('fieldset', { class: 'blok' }, h('legend', null, 'Kader yang dinilai'), h('div', { class: 'grid3' }, f('kNama', 'Nama kader', { list: 'dl-kader', ac: 'off' }), f('kDesa', 'Asal desa'), f('kPos', 'Posyandu'))),
    h('fieldset', { class: 'blok' }, h('legend', null, 'Penilai 1 (Anda)'), h('div', { class: 'grid2' }, f('pNama', 'Nama penilai', { val: cfg.penilai.nama, ac: 'name' }), f('pInst', 'Asal institusi', { val: cfg.penilai.institusi, ac: 'organization' }))),
    h('fieldset', { class: 'blok' }, h('legend', null, 'Waktu'), h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Tanggal penilaian', h('input', { type: 'date', name: 'tanggal', value: hariIni(), required: true })), h('label', { class: 'f' }, 'Percobaan ke-', inputAttempt))),
    h('fieldset', { class: 'blok' }, h('legend', null, 'Point yang dinilai hari ini'), h('p', { class: 'muted small', style: 'margin:0 0 10px' }, 'Centang semua point yang dinilai. Semua point dalam satu KD dinilai pada hari yang sama.'), daftarPoint, peringatan),
    galat,
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn' }, 'Mulai menilai'), h('a', { class: 'btn alt', href: '#/' }, 'Batal'))
  );

  const terpilih = () => [...form.querySelectorAll('input[name=point]:checked')].map((x) => x.value);

  // isi otomatis desa/posyandu bila kader sudah pernah dinilai
  const nm = form.elements.kNama;
  nm.addEventListener('change', () => {
    const k = [...kaderUnik.values()].find((x) => norm(x.nama) === norm(nm.value));
    if (k) {
      form.elements.kDesa.value = k.desa;
      form.elements.kPos.value = k.posyandu;
    }
    hitungPercobaan();
  });
  // percobaan ke- = jumlah penilaian sebelumnya pada point yang sama untuk kader ini, ditambah 1
  const hitungPercobaan = () => {
    const pts = terpilih();
    const kader = { nama: form.elements.kNama.value, desa: form.elements.kDesa.value, posyandu: form.elements.kPos.value };
    if (!pts.length || !kader.nama) return;
    const n = Math.max(0, ...pts.map((pt) => new Set(all.filter((r) => r.pointId === pt && kaderKey(r.kader) === kaderKey(kader)).map((r) => r.sessionId)).size));
    inputAttempt.value = n + 1;
  };
  // peringatan bila ada KD yang hanya sebagian point-nya dicentang
  const cekSebagian = () => {
    const pts = new Set(terpilih());
    const sebagian = TILIK.map((k) => ({ k, n: k.points.filter((p) => pts.has(p.id)).length })).filter((x) => x.n > 0 && x.n < x.k.points.length);
    peringatan.hidden = !sebagian.length;
    peringatan.textContent = sebagian.map((x) => `${x.k.kode}: baru ${x.n} dari ${x.k.points.length} point dicentang.`).join(' ') + ' Point lain dalam KD yang sama sebaiknya ikut dinilai hari ini.';
  };
  form.addEventListener('pilihan', () => (hitungPercobaan(), cekSebagian()));
  form.addEventListener('change', (e) => {
    if (e.target.name === 'kDesa' || e.target.name === 'kPos') hitungPercobaan();
  });
  queueMicrotask(cekSebagian);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const pts = terpilih();
    const kurang = [];
    if (!d.kNama?.trim()) kurang.push('nama kader');
    if (!d.kDesa?.trim()) kurang.push('asal desa');
    if (!d.kPos?.trim()) kurang.push('posyandu');
    if (!d.pNama?.trim()) kurang.push('nama penilai');
    if (!d.pInst?.trim()) kurang.push('asal institusi penilai');
    if (!pts.length) kurang.push('minimal satu point yang dinilai');
    if (kurang.length) {
      galat.hidden = false;
      galat.textContent = 'Lengkapi dulu: ' + kurang.join(', ') + '.';
      galat.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    // satu paket = satu kode untuk semua point yang dicentang; kode sesi tiap point = KODE-point
    const kode = kodeSesi();
    const umum = {
      role: 1,
      attempt: Math.max(1, Number(d.attempt) || 1),
      tanggal: d.tanggal,
      kader: { nama: d.kNama.trim(), desa: d.kDesa.trim(), posyandu: d.kPos.trim() },
      penilai: { nama: d.pNama.trim(), institusi: d.pInst.trim() },
    };
    const recs = pts.map((pid) => ({ ...buatRecord({ ...umum, sessionId: `${kode}-${pid}`, point: cariPoint(pid) }), paket: { id: kode, points: pts } }));
    for (const r of recs) await simpanRecord(r);
    await simpanPengaturan({ ...cfg, penilai: umum.penilai });
    pasang(`#/nilai/${recs[0].key}`);
  });

  const el = h('div', null, h('h1', null, 'Penilaian baru'), h('p', { class: 'muted' }, 'Isi identitas, centang point yang dinilai, lalu mulai menilai. Penilai 2 bergabung lewat satu tautan untuk semua point.'), form);
  return { el, judul: 'Penilaian baru' };
}

/* =========================================================== GABUNG */
export async function gabung(payloadStr) {
  const cfg = await ambilPengaturan();
  let info = null;
  if (payloadStr) {
    const p = b64decode(payloadStr);
    const umum = p && p.s ? { attempt: p.a || 1, tanggal: p.t || hariIni(), kader: { nama: p.k[0], desa: p.k[1], posyandu: p.k[2] }, penilai1: p.o ? { nama: p.o[0], institusi: p.o[1] } : null } : null;
    if (umum && Array.isArray(p.ps) && urutkanPoint(p.ps).length) info = { ...umum, kode: p.s, points: urutkanPoint(p.ps) }; // paket
    else if (umum && cariPoint(p.p)) info = { ...umum, sessionId: p.s, pointId: p.p }; // tautan lama: satu point
  }
  const el = h('div', null, h('h1', null, 'Gabung sesi penilai'));
  const isi = h('div');
  el.append(isi);

  const tampilForm = (inf, bolehUbah) => {
    isi.replaceChildren();
    const paketMode = !!inf.points;
    const ada = inf.penilai1 ? `Penilai 1: ${inf.penilai1.nama}${inf.penilai1.institusi ? ' (' + inf.penilai1.institusi + ')' : ''}` : '';
    const form = h('form', { novalidate: true });
    const g = h('div', { class: 'note bad', hidden: true, role: 'alert' });
    const inp = (name, label, val, ro) => h('label', { class: 'f' }, label, h('input', { type: 'text', name, value: val || '', required: true, readonly: ro, autocomplete: 'off' }));
    const bagianPoint = paketMode
      ? h('fieldset', { class: 'blok' }, h('legend', null, `Point yang dinilai (${inf.points.length})`), h('ul', { class: 'daftar-point' }, inf.points.map((pid) => cariPoint(pid)).map((p) => h('li', null, h('b', null, `${p.kdKode} Point ${p.no}. `), p.judul, h('small', { class: 'muted' }, ` · ${p.items.length} butir`)))))
      : h('fieldset', { class: 'blok' }, h('legend', null, 'Point'), h('label', { class: 'f' }, 'Point yang dinilai', h('select', { name: 'point', required: true, disabled: !bolehUbah }, TILIK.map((k) => h('optgroup', { label: `${k.kode}. ${k.judul}` }, k.points.map((p) => h('option', { value: p.id, selected: p.id === inf.pointId }, `${p.no}. ${p.judul}`)))))));
    form.append(
      h('div', { class: 'panel tint' }, h('p', { style: 'margin:0' }, h('b', null, 'Kode '), h('span', { class: 'kode' }, paketMode ? inf.kode : inf.sessionId)), ada && h('p', { class: 'small muted', style: 'margin:6px 0 0' }, ada)),
      h('fieldset', { class: 'blok' }, h('legend', null, 'Kader yang dinilai'), h('div', { class: 'grid3' }, inp('kNama', 'Nama kader', inf.kader.nama, !bolehUbah), inp('kDesa', 'Asal desa', inf.kader.desa, !bolehUbah), inp('kPos', 'Posyandu', inf.kader.posyandu, !bolehUbah))),
      bagianPoint,
      h('fieldset', { class: 'blok' }, h('legend', null, 'Waktu'), h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Tanggal', h('input', { type: 'date', name: 'tanggal', value: inf.tanggal, required: true })), h('label', { class: 'f' }, 'Percobaan ke-', h('input', { type: 'number', name: 'attempt', min: 1, max: 20, value: inf.attempt, required: true })))),
      h('fieldset', { class: 'blok' }, h('legend', null, 'Penilai 2 (Anda)'), h('div', { class: 'grid2' }, inp('pNama', 'Nama penilai', cfg.penilai.nama), inp('pInst', 'Asal institusi', cfg.penilai.institusi))),
      g,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Mulai menilai'), h('a', { class: 'btn alt', href: '#/' }, 'Batal'))
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      if (!d.kNama.trim() || !d.kDesa.trim() || !d.kPos.trim() || !d.pNama.trim() || !d.pInst.trim()) {
        g.hidden = false;
        g.textContent = 'Lengkapi semua isian identitas.';
        return;
      }
      const umum = {
        role: 2,
        attempt: Math.max(1, Number(d.attempt) || 1),
        tanggal: d.tanggal,
        kader: { nama: d.kNama.trim(), desa: d.kDesa.trim(), posyandu: d.kPos.trim() },
        penilai: { nama: d.pNama.trim(), institusi: d.pInst.trim() },
      };
      await simpanPengaturan({ ...cfg, penilai: umum.penilai });
      if (!paketMode) {
        const key = `${inf.sessionId}-2`;
        const ada2 = await ambilRecord(key);
        if (ada2 && !ada2.remote) return pasang(`#/nilai/${key}`);
        const rec = buatRecord({ ...umum, sessionId: inf.sessionId, point: cariPoint(bolehUbah ? d.point : inf.pointId) });
        await simpanRecord(rec);
        return pasang(`#/nilai/${rec.key}`);
      }
      // paket: satu catatan Penilai 2 untuk setiap point; yang sudah ada di perangkat ini tidak ditimpa
      const milik = [];
      for (const pid of inf.points) {
        const key = `${inf.kode}-${pid}-2`;
        const ada2 = await ambilRecord(key);
        if (ada2 && !ada2.remote) {
          milik.push(ada2);
          continue;
        }
        const rec = { ...buatRecord({ ...umum, sessionId: `${inf.kode}-${pid}`, point: cariPoint(pid) }), paket: { id: inf.kode, points: inf.points } };
        await simpanRecord(rec);
        milik.push(rec);
      }
      const pertama = milik.find((r) => r.status !== 'selesai');
      pasang(pertama ? `#/nilai/${pertama.key}` : `#/paket/${inf.kode}`);
    });
    isi.append(form);
  };

  if (info) {
    tampilForm(info, false);
    el.prepend(h('p', { class: 'muted' }, 'Periksa data kader di bawah, lengkapi identitas Anda, lalu mulai menilai.'));
    return { el, judul: 'Gabung sesi' };
  }

  // belum ada data: tempel tautan atau ketik kode
  const input = h('input', { type: 'text', name: 'kode', placeholder: 'Tempel tautan atau ketik kode', autocomplete: 'off', autocapitalize: 'characters' });
  const pesan = h('div', { class: 'note', hidden: true, role: 'status' });
  const cari = h('form', { novalidate: true }, h('label', { class: 'f' }, 'Tautan atau kode dari Penilai 1', input), h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Lanjut'), h('a', { class: 'btn alt', href: '#/' }, 'Batal')), pesan);
  isi.append(h('p', { class: 'muted' }, 'Minta Penilai 1 membagikan tautan. Membuka tautan itu akan mengisi data kader dan daftar point otomatis, bahkan tanpa internet.'), cari);
  cari.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    pesan.hidden = false;
    pesan.className = 'note';
    const m = v.match(/#\/gabung\/([A-Za-z0-9_-]+)/);
    if (m) return pasang('#/gabung/' + m[1]);
    const kode = v.toUpperCase().replace(/\s/g, '');
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(kode)) {
      pesan.classList.add('bad');
      pesan.textContent = 'Kode terdiri dari 6 huruf/angka. Periksa kembali, atau tempel seluruh tautan.';
      return;
    }
    pesan.textContent = 'Mencari...';
    // coba sebagai paket (versi baru), lalu sebagai sesi satu point (versi lama)
    const rp = await ambilPaket(kode);
    const p1 = rp.ok ? rp.records.filter((x) => x.role === 1) : [];
    if (p1.length) {
      const r1 = p1[0];
      return tampilForm({ kode, points: urutkanPoint(p1.map((x) => x.pointId)), attempt: r1.attempt, tanggal: r1.tanggal, kader: r1.kader, penilai1: r1.penilai }, false);
    }
    const r = await ambilSesi(kode);
    const r1 = r.ok ? r.records.find((x) => x.role === 1) : null;
    if (r1 && cariPoint(r1.pointId)) return tampilForm({ sessionId: kode, pointId: r1.pointId, attempt: r1.attempt, tanggal: r1.tanggal, kader: r1.kader, penilai1: r1.penilai }, false);
    pesan.classList.add('warn');
    pesan.textContent = (r.ok ? 'Kode belum ditemukan di Google Sheets (Penilai 1 mungkin belum menyelesaikan satu point pun, atau datanya belum terkirim).' : r.alasan) + ' Cara paling mudah: minta Penilai 1 mengirim tautan. Atau isi data kader manual untuk satu point.';
    const lanjut = h('button', { class: 'btn alt kecil', type: 'button', style: 'margin-top:10px' }, 'Isi data kader manual');
    lanjut.addEventListener('click', () => tampilForm({ sessionId: kode, pointId: TILIK[0].points[0].id, attempt: 1, tanggal: hariIni(), kader: { nama: '', desa: '', posyandu: '' }, penilai1: null }, true));
    pesan.append(h('br'), lanjut);
  });
  return { el, judul: 'Gabung sesi' };
}

/* =========================================================== CHECKLIST */
export async function nilai(key) {
  const rec = await ambilRecord(key);
  if (!rec || rec.remote) return { el: h('div', { class: 'kosong-state' }, h('b', null, 'Penilaian tidak ditemukan'), h('a', { class: 'btn', href: '#/' }, 'Ke beranda')), judul: 'Tidak ditemukan' };
  const point = cariPoint(rec.pointId);
  const kd = cariKd(point.kd);
  const n = point.items.length;
  const info = h('span', { class: 'info' });
  const bar = h('div', { style: 'width:0' });

  // paket: urutan point milik penilai ini, untuk penanda langkah dan lanjut otomatis
  const kode = kodePaket(rec.sessionId);
  let langkah = [];
  if (kode) {
    const milik = (await paketRecords(kode)).filter((r) => !r.remote && r.role === rec.role);
    langkah = pointPaket(milik).map((pid) => milik.find((r) => r.pointId === pid)).filter(Boolean);
  }
  const posisi = langkah.findIndex((r) => r.key === rec.key);
  const adaLanjut = langkah.length > 1;
  const btnSelesai = h('button', { type: 'button', class: 'btn' }, adaLanjut ? 'Selesai, lanjut' : 'Selesai');
  const btnSimpan = h('button', { type: 'button', class: 'btn alt' }, 'Simpan');

  const hitung = () => skorRecord(rec, point);
  const segarkan = () => {
    const s = hitung();
    bar.style.width = (s.terisi / n) * 100 + '%';
    info.replaceChildren(h('b', null, `${s.terisi}/${n}`), ' butir terisi');
    document.querySelectorAll('.butir').forEach((b, i) => b.classList.toggle('terisi', rec.answers[i] === 0 || rec.answers[i] === 1));
  };

  const simpan = debounce(async () => {
    rec.updatedAt = Date.now();
    rec.synced = false;
    await simpanRecord(rec);
    hitungPending();
  }, 150);

  const daftar = h('div');
  let gAktif = null;
  let sAktif = null;
  point.items.forEach((it, i) => {
    if (it.g && it.g !== gAktif) {
      daftar.append(h('div', { class: 'grup' }, it.g));
      gAktif = it.g;
      sAktif = null;
    }
    if (it.s && it.s !== sAktif) {
      daftar.append(h('div', { class: 'subgrup' }, it.s));
      sAktif = it.s;
    }
    const nm = 'b' + i;
    const radio = (val, cls, label) => h('label', null, h('input', { type: 'radio', name: nm, value: val, checked: rec.answers[i] === val }), h('span', { class: cls }, label));
    const kartu = h('div', { class: 'butir', id: 'butir-' + i, role: 'group', 'aria-labelledby': 'bt-' + i }, h('div', { class: 'no' }, `Butir ${i + 1}`), h('div', { class: 'teks', id: 'bt-' + i }, it.t), h('div', { class: 'pilihan' }, radio(1, 'ya', 'Sesuai'), radio(0, 'tdk', 'Tidak sesuai')));
    kartu.addEventListener('change', (e) => {
      rec.answers[i] = Number(e.target.value);
      if (rec.status === 'selesai') {
        rec.status = 'draft';
        toast('Penilaian dibuka kembali. Tekan Selesai untuk mengirim ulang.');
      }
      segarkan();
      simpan();
    });
    daftar.append(kartu);
  });

  btnSimpan.addEventListener('click', async () => {
    rec.updatedAt = Date.now();
    await simpanRecord(rec);
    toast('Tersimpan di perangkat ini.');
  });
  btnSelesai.addEventListener('click', async () => {
    const s = hitung();
    if (!s.lengkap) {
      const idx = rec.answers.findIndex((v) => v !== 0 && v !== 1);
      toast(`Masih ada ${n - s.terisi} butir yang belum diisi.`);
      document.getElementById('butir-' + idx)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    rec.status = 'selesai';
    rec.updatedAt = Date.now();
    rec.synced = false;
    await simpanRecord(rec);
    kirimSemua();
    if (!kode) return pasang('#/hasil/' + rec.sessionId);
    // lanjut ke point berikutnya dalam paket yang belum selesai
    const terkini = await Promise.all(langkah.map((r) => ambilRecord(r.key)));
    const urut = terkini.slice(posisi + 1).concat(terkini.slice(0, posisi));
    const berikut = urut.find((r) => r && r.status !== 'selesai');
    if (berikut) {
      const p = cariPoint(berikut.pointId);
      toast(`Point ${point.no} selesai. Lanjut ${p.kdKode} Point ${p.no}.`);
      pasang('#/nilai/' + berikut.key);
    } else {
      toast('Semua point selesai.');
      pasang('#/paket/' + kode);
    }
  });

  const el = h(
    'div',
    null,
    h(
      'div',
      { class: 'kepala-nilai' },
      h('h1', { style: 'font-size:1.35rem' }, `${point.kdKode} Point ${point.no}. ${point.judul}`),
      h('div', { class: 'meta' }, h('span', null, 'Kader: ', h('b', null, rec.kader.nama)), h('span', null, 'Desa: ', h('b', null, rec.kader.desa)), h('span', null, 'Posyandu: ', h('b', null, rec.kader.posyandu))),
      h('div', { class: 'meta', style: 'margin-bottom:10px' }, h('span', null, 'Anda: ', h('b', null, `Penilai ${rec.role} (${rec.penilai.nama})`)), h('span', null, 'Kode: ', h('b', null, kode || rec.sessionId)), h('span', null, `Percobaan ke-${rec.attempt}`)),
      adaLanjut &&
        h(
          'nav',
          { class: 'langkah-paket', 'aria-label': 'Point dalam paket ini' },
          h('span', { class: 'small muted' }, `Point ${posisi + 1} dari ${langkah.length}`),
          langkah.map((r) => {
            const p = cariPoint(r.pointId);
            return h('a', { href: '#/nilai/' + r.key, class: (r.key === rec.key ? 'kini ' : '') + (r.status === 'selesai' ? 'beres' : ''), 'aria-current': r.key === rec.key ? 'step' : null, title: p.judul }, `${ROM[p.kd]}.${p.no}`);
          }),
          h('a', { href: '#/paket/' + kode, class: 'ke-paket' }, 'Ringkasan')
        ),
      h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Butir terisi' }, bar)
    ),
    rec.status === 'selesai' && h('div', { class: 'note' }, 'Penilaian ini sudah selesai. Mengubah jawaban akan membukanya kembali.'),
    daftar,
    h('div', { class: 'aksi-bawah' }, info, btnSimpan, btnSelesai)
  );
  void kd;
  queueMicrotask(segarkan);
  return { el, fokus: true, judul: 'Penilaian' };
}

/* =========================================================== HASIL */
function tandaJawab(v) {
  if (v === 1) return h('span', { class: 'ok', 'aria-label': 'Sesuai' }, '✓');
  if (v === 0) return h('span', { class: 'no-ok', 'aria-label': 'Tidak sesuai' }, '✗');
  return h('span', { class: 'kosong', 'aria-label': 'Belum diisi' }, '–');
}

export async function hasil(sessionId) {
  const recs = await sesiRecords(sessionId);
  if (!recs.length) return { el: h('div', { class: 'kosong-state' }, h('b', null, 'Sesi tidak ditemukan di perangkat ini'), h('p', null, 'Jika Anda Penilai 1 atau 2, buka kembali dari Riwayat.'), h('a', { class: 'btn', href: '#/riwayat' }, 'Buka riwayat')), judul: 'Hasil' };
  const point = cariPoint(recs[0].pointId);
  const { r1, r2, hasil: hs } = ringkasanSesi(point, recs);
  const ref = recs.find((r) => !r.remote) || recs[0];
  const lokal = recs.filter((r) => !r.remote);
  const saya = lokal.length === 1 ? lokal[0] : null;
  const cfg = await ambilPengaturan();
  const kode = kodePaket(sessionId);
  const el = h('div');

  el.append(
    kode && h('a', { class: 'kembali', href: '#/paket/' + kode }, '← Ringkasan semua point'),
    h('h1', { style: 'font-size:1.5rem' }, `${point.kdKode} Point ${point.no}. ${point.judul}`),
    h('p', { class: 'muted', style: 'margin-bottom:18px' }, `${ref.kader.nama} · Desa ${ref.kader.desa} · Posyandu ${ref.kader.posyandu} · ${tanggalIndo(ref.tanggal)} · Percobaan ke-${ref.attempt} · Kode ${sessionId}`)
  );

  if (hs.lengkap) {
    el.append(
      h(
        'div',
        { class: 'skor-besar' },
        h('div', { class: 'panel', style: 'margin:0' }, h('div', { class: 'muted small' }, 'Nilai final (gabungan dua penilai)'), h('div', { class: 'nilai' }, persen(hs.pct)), h('div', { class: 'muted small', style: 'margin-top:8px' }, `${hs.total} dari ${hs.maks} (${hs.n} butir × 2 penilai) · batas lulus ${AMBANG}%`), hs.kategori && h('p', { style: 'margin:10px 0 0' }, h('b', null, 'Kategori kepatuhan: '), `${hs.kategori} (rata-rata skor ${hs.rataRata.toLocaleString('id-ID')} dari ${hs.n})`)),
        h('div', { class: 'status-blok ' + hs.status }, h('span', { class: 'small' }, 'Status'), h('b', null, labelStatus[hs.status]), h('span', { class: 'small' }, hs.lulus ? 'Kader dinyatakan kompeten pada point ini.' : 'Dapat mengulang untuk butir yang belum sesuai.'))
      )
    );
  } else {
    const tunggu = !r1 ? 'Penilai 1' : !r2 ? 'Penilai 2' : r1.status !== 'selesai' ? 'Penilai 1' : 'Penilai 2';
    el.append(h('div', { class: 'note warn' }, h('b', null, 'Belum final. '), `Menunggu ${tunggu} menyelesaikan penilaian. Nilai sementara: ${persen(hs.pctSem)} (${hs.total} dari ${hs.n * Math.max(1, hs.penilaiAda)}).`));
  }

  // status penilai
  const kartuPenilai = (role, r) => {
    const st = !r ? ['Belum bergabung', 'menunggu'] : r.status === 'selesai' ? ['Selesai', 'lulus'] : ['Sedang menilai', 'menunggu'];
    const sk = r ? skorRecord(r, point) : null;
    return h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', null, `Penilai ${role}`), h('span', { class: 'chip ' + st[1] }, st[0])),
      r ? h('p', { style: 'margin:6px 0 0' }, r.penilai.nama, h('br'), h('span', { class: 'muted small' }, r.penilai.institusi)) : h('p', { class: 'muted', style: 'margin:6px 0 0' }, '-'),
      sk && h('p', { class: 'small muted', style: 'margin:6px 0 0' }, `Skor ${sk.skor} dari ${sk.n}`, r.remote ? ' · data dari server' : r.synced ? ' · terkirim ✓' : r.status === 'selesai' ? ' · belum terkirim' : '')
    );
  };
  el.append(h('div', { class: 'penilai-st' }, kartuPenilai(1, r1), kartuPenilai(2, r2)));

  // ajakan Penilai 2 (untuk paket, undangan ada di halaman ringkasan)
  if (r1 && !r1.remote && !r2 && kode) {
    el.append(h('div', { class: 'note' }, 'Undang Penilai 2 dari ', h('a', { href: '#/paket/' + kode }, 'halaman ringkasan'), ', satu tautan untuk semua point.'));
  } else if (r1 && !r1.remote && !r2) {
    const link = tautanGabung(r1);
    const pesan = `Halo, mohon bantu menilai sebagai Penilai 2 untuk kader ${r1.kader.nama} (${point.kdKode} Point ${point.no}) di e-Asesmen Kompetensi Kader.\nKode sesi: ${sessionId}\nBuka: ${link}`;
    const salin = h('button', { class: 'btn alt kecil', type: 'button' }, 'Salin tautan');
    salin.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
        toast('Tautan disalin.');
      } catch {
        toast('Tidak bisa menyalin otomatis. Tahan dan salin tautan di atas.');
      }
    });
    const wa = h('a', { class: 'btn kecil', href: 'https://wa.me/?text=' + encodeURIComponent(pesan), target: '_blank', rel: 'noopener' }, 'Kirim lewat WhatsApp');
    const bagi = navigator.share ? h('button', { class: 'btn alt kecil', type: 'button', onclick: () => navigator.share({ title: 'Sesi penilaian', text: pesan }).catch(() => {}) }, 'Bagikan…') : null;
    el.append(h('div', { class: 'panel tint' }, h('h3', null, 'Undang Penilai 2'), h('p', { class: 'small', style: 'margin:0 0 4px' }, 'Kode sesi'), h('div', { class: 'kode' }, sessionId), h('div', { class: 'tautan' }, link), h('div', { class: 'row' }, wa, salin, bagi), h('p', { class: 'small muted', style: 'margin:12px 0 0' }, 'Tautan berisi data kader, jadi Penilai 2 bisa membukanya tanpa internet. Nilai gabungan muncul setelah kedua penilai selesai dan data terkirim.')));
  }

  // tombol aksi
  const aksi = h('div', { class: 'row', style: 'margin-bottom:22px' });
  const btnPdf = h('button', { class: 'btn', type: 'button' }, hs.lengkap ? 'Cetak PDF' : 'Cetak PDF (sementara)');
  btnPdf.addEventListener('click', async () => {
    btnPdf.disabled = true;
    btnPdf.textContent = 'Menyiapkan PDF...';
    try {
      const bytes = await buatPdfPoint({ point: { ...point }, r1, r2, hasil: hs });
      await unduhPdf(bytes, namaFilePoint(point, ref.kader, sessionId));
      toast('PDF dibuat.');
    } catch (e) {
      console.error(e);
      toast('PDF gagal dibuat: ' + (e.message || e));
    } finally {
      btnPdf.disabled = false;
      btnPdf.textContent = hs.lengkap ? 'Cetak PDF' : 'Cetak PDF (sementara)';
    }
  });
  aksi.append(btnPdf);
  if (!hs.lengkap && cfg.syncUrl) {
    const btnAmbil = h('button', { class: 'btn alt', type: 'button' }, 'Ambil nilai penilai lain');
    btnAmbil.addEventListener('click', async () => {
      btnAmbil.disabled = true;
      await kirimSemua();
      const r = kode ? await ambilPaket(kode, pointPaket(await paketRecords(kode))) : await ambilSesi(sessionId);
      btnAmbil.disabled = false;
      if (!r.ok) return toast(r.alasan);
      toast(r.baru ? 'Data penilai lain diterima.' : 'Belum ada data baru dari penilai lain.');
      if (r.baru) window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    aksi.append(btnAmbil);
  }
  if (saya) aksi.append(h('a', { class: 'btn alt', href: `#/nilai/${saya.key}` }, 'Ubah penilaian saya'));
  else if (lokal.length === 2) lokal.forEach((r) => aksi.append(h('a', { class: 'btn alt', href: `#/nilai/${r.key}` }, `Ubah Penilai ${r.role}`)));
  el.append(aksi);

  // bagian (khusus antropometri)
  if (hs.bagian1 && hs.lengkap) {
    el.append(
      h('h2', null, 'Skor per bagian'),
      h(
        'div',
        { class: 'tabel-wrap' },
        h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Bagian'), h('th', { class: 'c' }, 'Penilai 1'), h('th', { class: 'c' }, 'Penilai 2'))), h('tbody', null, hs.bagian1.map((b, i) => h('tr', null, h('td', null, b.bagian), h('td', { class: 'c' }, `${b.skor} / ${b.n}`), h('td', { class: 'c' }, `${hs.bagian2[i].skor} / ${hs.bagian2[i].n}`)))))
      )
    );
  }

  // butir yang perlu diulang
  if (hs.lengkap && hs.kurang.length) {
    el.append(
      h('h2', null, 'Butir yang belum sesuai'),
      h('p', { class: 'muted small' }, 'Dapat diulang pada pengamatan berikutnya.'),
      h('ul', { class: 'daftar', style: 'margin-bottom:22px' }, hs.kurang.map((k) => h('li', { class: 'panel', style: 'margin:0;padding:12px 16px' }, h('b', null, `${k.idx + 1}. `), point.items[k.idx].t, h('div', { class: 'small muted' }, k.jumlah === 0 ? 'Kedua penilai: tidak sesuai' : k.p1 === 1 ? 'Penilai 2: tidak sesuai' : 'Penilai 1: tidak sesuai'))))
    );
  }

  // tabel rincian
  const baris = [];
  let gAktif = null;
  point.items.forEach((it, i) => {
    if (it.g && it.g !== gAktif) {
      baris.push(h('tr', { class: 'gh' }, h('td', { colspan: 4 }, it.g)));
      gAktif = it.g;
    }
    baris.push(h('tr', null, h('td', { class: 'c' }, i + 1), h('td', null, it.t), h('td', { class: 'c' }, tandaJawab(r1 && r1.answers ? r1.answers[i] : null)), h('td', { class: 'c' }, tandaJawab(r2 && r2.answers ? r2.answers[i] : null))));
  });
  el.append(h('h2', null, 'Rincian per butir'), h('div', { class: 'tabel-wrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', { class: 'c' }, 'No'), h('th', null, 'Keterampilan'), h('th', { class: 'c' }, 'Penilai 1'), h('th', { class: 'c' }, 'Penilai 2'))), h('tbody', null, baris))));
  return { el, judul: 'Hasil' };
}

/* =========================================================== PAKET */
export async function paket(kode) {
  const recs = await paketRecords(kode);
  if (!recs.length) return { el: h('div', { class: 'kosong-state' }, h('b', null, 'Penilaian tidak ditemukan di perangkat ini'), h('a', { class: 'btn', href: '#/riwayat' }, 'Buka riwayat')), judul: 'Ringkasan' };
  const cfg = await ambilPengaturan();
  const lokal = recs.filter((r) => !r.remote);
  const ref = lokal[0] || recs[0];
  const ids = pointPaket(recs);
  const baris = ids.map((pid) => {
    const point = cariPoint(pid);
    const { r1, r2, hasil: hs } = ringkasanSesi(point, recs.filter((r) => r.pointId === pid));
    return { point, r1, r2, hs, sessionId: `${kode}-${pid}` };
  });
  const roleSaya = lokal.length ? lokal[0].role : 0;
  const milik = baris.map((b) => (roleSaya === 1 ? b.r1 : b.r2)).filter((r) => r && !r.remote);
  const belum = milik.filter((r) => r.status !== 'selesai');
  const final = baris.filter((b) => b.hs.lengkap);
  const lulus = final.filter((b) => b.hs.lulus).length;
  const hasilPer = new Map(baris.map((b) => [b.point.id, b.hs]));
  const kdAda = [...new Set(baris.map((b) => b.point.kd))];

  const el = h(
    'div',
    null,
    h('h1', { style: 'font-size:1.5rem' }, ref.kader.nama),
    h('p', { class: 'muted', style: 'margin-bottom:18px' }, `Desa ${ref.kader.desa} · Posyandu ${ref.kader.posyandu} · ${tanggalIndo(ref.tanggal)} · Percobaan ke-${ref.attempt} · Kode ${kode}`)
  );

  // status per KD
  el.append(
    h(
      'div',
      { class: 'kd-status' },
      kdAda.map((kd) => {
        const k = cariKd(kd);
        const st = statusKd(kd, hasilPer);
        const ket = st.final === st.total ? `${st.lulus} dari ${st.total} point lulus` : st.dinilai < st.total ? `${st.dinilai} dari ${st.total} point dinilai di sini` : `${st.final} dari ${st.total} point sudah final`;
        return h('div', { class: 'status-blok ' + st.status }, h('span', { class: 'small' }, `${k.kode}. ${k.judul}`), h('b', null, st.label), h('span', { class: 'small' }, ket));
      })
    )
  );

  if (belum.length) {
    el.append(h('div', { class: 'note warn' }, h('b', null, `${belum.length} point belum Anda selesaikan. `), h('a', { href: '#/nilai/' + belum[0].key }, 'Lanjutkan menilai →')));
  } else if (final.length < baris.length) {
    el.append(h('div', { class: 'note' }, `Penilaian Anda sudah selesai. Nilai final muncul setelah penilai lain selesai dan datanya diambil (${final.length} dari ${baris.length} point sudah final).`));
  }

  // undangan Penilai 2: satu tautan untuk semua point
  if (roleSaya === 1 && !recs.some((r) => r.role === 2)) {
    const link = tautanGabungPaket(kode, ids, ref);
    const pesan = `Halo, mohon bantu menilai sebagai Penilai 2 untuk kader ${ref.kader.nama} (${ringkasPoint(ids)}) di e-Asesmen Kompetensi Kader.\nKode: ${kode}\nBuka: ${link}`;
    el.append(panelUndang({ judul: 'Undang Penilai 2', kode, link, pesan }));
  }

  // aksi
  const aksi = h('div', { class: 'row', style: 'margin-bottom:22px' });
  if (cfg.syncUrl && final.length < baris.length) {
    const btnAmbil = h('button', { class: 'btn', type: 'button' }, 'Ambil nilai penilai lain');
    btnAmbil.addEventListener('click', async () => {
      btnAmbil.disabled = true;
      await kirimSemua();
      const r = await ambilPaket(kode, ids);
      btnAmbil.disabled = false;
      if (!r.ok) return toast(r.alasan);
      toast(r.baru ? 'Data penilai lain diterima.' : 'Belum ada data baru dari penilai lain.');
      if (r.baru) window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    aksi.append(btnAmbil);
  }
  const btnPdf = h('button', { class: final.length < baris.length && cfg.syncUrl ? 'btn alt' : 'btn', type: 'button' }, final.length === baris.length ? 'Cetak PDF semua point' : 'Cetak PDF semua point (sementara)');
  btnPdf.addEventListener('click', async () => {
    btnPdf.disabled = true;
    const label = btnPdf.textContent;
    btnPdf.textContent = 'Menyiapkan PDF...';
    try {
      const L = window.PDFLib;
      const gabung = await L.PDFDocument.create();
      gabung.setTitle(`Asesmen Kompetensi Kader - ${ref.kader.nama} - ${kode}`);
      for (const b of baris) {
        if (!b.r1 && !b.r2) continue;
        const src = await L.PDFDocument.load(await buatPdfPoint({ point: { ...b.point }, r1: b.r1, r2: b.r2, hasil: b.hs }));
        (await gabung.copyPages(src, src.getPageIndices())).forEach((pg) => gabung.addPage(pg));
      }
      await unduhPdf(await gabung.save(), `Asesmen_${slug(ref.kader.nama)}_${kode}`);
      toast('PDF dibuat.');
    } catch (e) {
      console.error(e);
      toast('PDF gagal dibuat: ' + (e.message || e));
    } finally {
      btnPdf.disabled = false;
      btnPdf.textContent = label;
    }
  });
  aksi.append(btnPdf);
  el.append(aksi);

  // daftar point
  const tanda = (r) => (!r ? h('span', { class: 'muted small' }, 'belum') : r.status === 'selesai' ? h('span', { class: 'ok' }, '✓') : h('span', { class: 'muted small' }, 'mengisi'));
  el.append(
    h('h2', null, 'Hasil per point'),
    h(
      'div',
      { class: 'rekap-grid' },
      kdAda.map((kd) => {
        const k = cariKd(kd);
        return h(
          'section',
          { class: 'rekap-kd' },
          h('h3', null, `${k.kode}. ${k.judul}`),
          baris
            .filter((b) => b.point.kd === kd)
            .map((b) =>
              h(
                'a',
                { class: 'rekap-row', href: '#/hasil/' + b.sessionId },
                h('span', null, h('b', null, `${b.point.no}. `), b.point.judul, h('small', { class: 'muted', style: 'display:block' }, 'Penilai 1 ', tanda(b.r1), ' · Penilai 2 ', tanda(b.r2))),
                h('span', { style: 'text-align:right' }, chipStatus(b.hs.status), ' ', b.hs.lengkap && h('b', null, persen(b.hs.pct)))
              )
            )
        );
      })
    ),
    h('p', { class: 'muted small', style: 'margin-top:12px' }, final.length ? `${lulus} dari ${final.length} point final dinyatakan lulus. Ketuk point untuk rincian per butir.` : 'Ketuk point untuk rincian per butir.')
  );
  return { el, judul: 'Ringkasan penilaian' };
}

/* =========================================================== RIWAYAT */
export async function riwayat() {
  const sesi = await semuaSesi();
  const el = h('div', null, h('h1', null, 'Riwayat penilaian'));
  if (!sesi.length) {
    el.append(h('div', { class: 'kosong-state' }, h('b', null, 'Belum ada penilaian'), h('p', null, 'Penilaian yang Anda isi akan tersimpan di sini, juga saat tidak ada internet.'), h('a', { class: 'btn', href: '#/baru' }, 'Mulai penilaian')));
    return { el, judul: 'Riwayat' };
  }
  // satu baris per paket (beberapa point sekaligus) atau per sesi lama (satu point)
  const grup = new Map();
  for (const s of sesi) {
    const kode = kodePaket(s.id) || s.id;
    if (!grup.has(kode)) grup.set(kode, { kode, paket: !!kodePaket(s.id), sesi: [] });
    grup.get(kode).sesi.push(s);
  }
  const entri = [...grup.values()].map((g) => {
    const ref = (g.sesi.find((x) => !x.ref.remote) || g.sesi[0]).ref;
    const recs = g.sesi.flatMap((x) => x.recs);
    const final = g.sesi.filter((x) => x.hasil.lengkap);
    return { ...g, ref, recs, final, lulus: final.filter((x) => x.hasil.lulus).length, ids: urutkanPoint(g.sesi.map((x) => x.point.id)), updatedAt: Math.max(...g.sesi.map((x) => x.updatedAt)) };
  }).sort((a, b) => b.updatedAt - a.updatedAt);

  const cari = h('input', { type: 'search', placeholder: 'Cari nama kader, desa, atau posyandu', 'aria-label': 'Cari riwayat' });
  const list = h('ul', { class: 'daftar' });
  const gambar = () => {
    const q = norm(cari.value);
    list.replaceChildren();
    const f = entri.filter((e) => !q || norm([e.ref.kader.nama, e.ref.kader.desa, e.ref.kader.posyandu, ...e.sesi.map((x) => x.point.judul)].join(' ')).includes(q));
    if (!f.length) list.append(h('li', { class: 'kosong-state' }, 'Tidak ada yang cocok.'));
    f.forEach((e) => {
      const belumKirim = e.recs.some((r) => !r.remote && r.status === 'selesai' && !r.synced);
      const hapus = h('button', { class: 'btn bahaya kecil', type: 'button', 'aria-label': 'Hapus ' + e.kode }, 'Hapus');
      hapus.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!confirm(`Hapus penilaian ${e.kode} (${e.ref.kader.nama}, ${ringkasPoint(e.ids)}) dari perangkat ini?${belumKirim ? '\n\nPERHATIAN: sebagian data belum terkirim ke Google Sheets.' : ''}`)) return;
        for (const r of e.recs) await hapusRecord(r.key);
        hitungPending();
        entri.splice(entri.indexOf(e), 1);
        gambar();
      });
      const satu = !e.paket ? e.sesi[0] : null;
      const status = satu ? h('span', null, chipStatus(satu.hasil.status), ' ', satu.hasil.lengkap && h('b', null, persen(satu.hasil.pct))) : e.final.length === e.sesi.length ? h('span', null, chipStatus(e.lulus === e.sesi.length ? 'lulus' : 'tidak'), ' ', h('b', null, `${e.lulus}/${e.sesi.length} lulus`)) : h('span', null, chipStatus('menunggu'), ' ', h('small', null, `${e.final.length}/${e.sesi.length} final`));
      list.append(
        h(
          'li',
          null,
          h(
            'a',
            { class: 'item-sesi', href: e.paket ? '#/paket/' + e.kode : '#/hasil/' + e.kode },
            h('div', { class: 'kiri' }, h('strong', null, e.ref.kader.nama), h('small', null, satu ? `${satu.point.kdKode} Point ${satu.point.no} · ${satu.point.judul}` : `${ringkasPoint(e.ids)} (${e.ids.length} point)`), h('small', { style: 'display:block' }, `Desa ${e.ref.kader.desa} · ${e.ref.kader.posyandu} · ${tanggalIndo(e.ref.tanggal)} · Percobaan ke-${e.ref.attempt}`)),
            h('div', { class: 'kanan' }, status, h('small', null, belumKirim ? 'Belum terkirim' : e.recs.some((r) => !r.remote && r.status === 'selesai') ? 'Terkirim ✓' : 'Draf'), hapus)
          )
        )
      );
    });
  };
  cari.addEventListener('input', gambar);
  el.append(h('label', { class: 'f' }, h('span', { class: 'sr' }, 'Cari'), cari), list);
  gambar();
  return { el, judul: 'Riwayat' };
}

/* =========================================================== REKAP */
export async function rekap(kunci) {
  const sesi = await semuaSesi();
  const kaderMap = new Map();
  sesi.forEach((s) => kaderMap.set(kaderKey(s.ref.kader), s.ref.kader));
  const el = h('div', null, h('h1', null, 'Rekap kader'));
  if (!kaderMap.size) {
    el.append(h('div', { class: 'kosong-state' }, h('b', null, 'Belum ada data kader'), h('p', null, 'Rekap muncul setelah ada penilaian yang tersimpan.'), h('a', { class: 'btn', href: '#/baru' }, 'Mulai penilaian')));
    return { el, judul: 'Rekap' };
  }
  const kk = kunci ? decodeURIComponent(kunci) : '';
  const sel = h('select', { 'aria-label': 'Pilih kader' }, h('option', { value: '' }, 'Pilih kader…'), [...kaderMap.entries()].sort((a, b) => a[1].nama.localeCompare(b[1].nama)).map(([k, v]) => h('option', { value: k, selected: k === kk }, `${v.nama} · ${v.desa} · ${v.posyandu}`)));
  sel.addEventListener('change', () => pasang('#/rekap/' + (sel.value ? encodeURIComponent(sel.value) : '')));
  el.append(h('label', { class: 'f' }, 'Kader', sel));
  if (!kk || !kaderMap.has(kk)) return { el, judul: 'Rekap' };
  const kader = kaderMap.get(kk);
  const miliknya = sesi.filter((s) => kaderKey(s.ref.kader) === kk);
  const barisPdf = semuaPoint().map((p) => {
    const ss = miliknya.filter((s) => s.point.id === p.id).sort((a, b) => (b.ref.attempt || 0) - (a.ref.attempt || 0) || b.updatedAt - a.updatedAt);
    return { point: p, sesi: ss[0] ? { ref: ss[0].ref, hasil: ss[0].hasil, id: ss[0].id } : null, jumlah: ss.length };
  });
  const dinilai = barisPdf.filter((b) => b.sesi && b.sesi.hasil.lengkap);
  const lulus = dinilai.filter((b) => b.sesi.hasil.lulus).length;
  const hasilPer = new Map(barisPdf.filter((b) => b.sesi).map((b) => [b.point.id, b.sesi.hasil]));
  const stKd = new Map(TILIK.map((k) => [k.kd, statusKd(k.kd, hasilPer)]));
  const kdKompeten = [...stKd.values()].filter((x) => x.label === 'KOMPETEN').length;
  const btn = h('button', { class: 'btn', type: 'button' }, 'Cetak PDF rekap');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const bytes = await buatPdfRekap({ kader, baris: barisPdf, stKd });
      await unduhPdf(bytes, namaFileRekap(kader));
    } catch (e) {
      console.error(e);
      toast('PDF gagal dibuat: ' + (e.message || e));
    }
    btn.disabled = false;
  });
  el.append(
    h('div', { class: 'panel tint' }, h('b', null, kader.nama), h('div', { class: 'small muted' }, `Desa ${kader.desa} · Posyandu ${kader.posyandu}`), h('p', { style: 'margin:10px 0 12px' }, h('b', null, `${kdKompeten} dari ${TILIK.length} KD kompeten`), ` · ${lulus} dari ${barisPdf.length} point lulus · ${dinilai.length} point sudah final`), btn),
    h(
      'div',
      { class: 'rekap-grid' },
      TILIK.map((k) =>
        h(
          'section',
          { class: 'rekap-kd' },
          h('h3', { class: 'kd-judul' }, h('span', null, `${k.kode}. ${k.judul}`), h('span', { class: 'chip ' + stKd.get(k.kd).status }, stKd.get(k.kd).label)),
          barisPdf
            .filter((b) => b.point.kd === k.kd)
            .map((b) => {
              const isi = [h('span', null, h('b', null, `${b.point.no}. `), b.point.judul), b.sesi ? h('span', { style: 'text-align:right' }, chipStatus(b.sesi.hasil.status), ' ', b.sesi.hasil.lengkap && h('b', null, persen(b.sesi.hasil.pct))) : h('span', { class: 'muted small' }, 'Belum dinilai')];
              return b.sesi ? h('a', { class: 'rekap-row', href: '#/hasil/' + b.sesi.id }, isi) : h('div', { class: 'rekap-row' }, isi);
            })
        )
      )
    )
  );
  return { el, judul: 'Rekap' };
}

/* =========================================================== PENGATURAN */
export async function setelan(query) {
  const cfg = await ambilPengaturan();
  const el = h('div', null, h('h1', null, 'Pengaturan'));
  // tautan setelan dari pengelola: #/setelan?u=<alamat /exec>&k=<kunci>
  const dariTautan = query && query.get('u') && query.get('k') ? { syncUrl: query.get('u'), syncKey: query.get('k') } : null;
  if (dariTautan) {
    el.append(h('div', { class: 'note' }, h('b', null, 'Setelan Google Sheets dari tautan. '), 'Periksa alamat di bawah, lalu tekan Simpan.'));
    cfg.syncUrl = dariTautan.syncUrl;
    cfg.syncKey = dariTautan.syncKey;
  }
  const form = h('form', { novalidate: true });
  const status = h('div', { class: 'note', hidden: true, role: 'status' });
  form.append(
    h('fieldset', { class: 'blok' }, h('legend', null, 'Identitas penilai (diisi otomatis)'), h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Nama penilai', h('input', { type: 'text', name: 'pNama', value: cfg.penilai.nama, autocomplete: 'name' })), h('label', { class: 'f' }, 'Asal institusi', h('input', { type: 'text', name: 'pInst', value: cfg.penilai.institusi, autocomplete: 'organization' })))),
    h(
      'fieldset',
      { class: 'blok' },
      h('legend', null, 'Google Sheets'),
      h('p', { class: 'muted small' }, BAWAAN.syncUrl ? 'Sudah terisi otomatis dari setelan bawaan aplikasi, penilai tidak perlu mengubah apa pun. Ubah hanya bila ingin memakai spreadsheet lain di perangkat ini.' : 'Diisi sekali per perangkat. Cara termudah: buka "tautan setelan" yang dibagikan pengelola, lalu tekan Simpan.'),
      h('label', { class: 'f' }, 'Alamat Web App (Apps Script)', h('input', { type: 'url', name: 'syncUrl', value: cfg.syncUrl, placeholder: 'https://script.google.com/macros/s/.../exec', autocomplete: 'off' })),
      h('label', { class: 'f' }, 'Kunci rahasia', h('input', { type: 'text', name: 'syncKey', value: cfg.syncKey, autocomplete: 'off', autocapitalize: 'off' }))
    ),
    status,
    h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Simpan'), h('button', { class: 'btn alt', type: 'button', id: 'uji' }, 'Uji koneksi'), h('button', { class: 'btn alt', type: 'button', id: 'kirim' }, 'Kirim data sekarang')),
    h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn alt', type: 'button', id: 'bagi-setelan' }, 'Bagikan tautan setelan ke penilai lain'))
  );
  const tampil = (teks, cls = '') => {
    status.hidden = false;
    status.className = 'note ' + cls;
    status.textContent = teks;
  };
  const ambil = () => {
    const d = Object.fromEntries(new FormData(form));
    return { ...cfg, penilai: { nama: d.pNama.trim(), institusi: d.pInst.trim() }, syncUrl: d.syncUrl.trim(), syncKey: d.syncKey.trim() };
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await simpanPengaturan(ambil());
    hitungPending();
    tampil('Pengaturan tersimpan.');
    // buang kunci dari alamat browser setelah tersimpan
    if (dariTautan) history.replaceState(null, '', location.pathname + '#/setelan');
  });
  const panelBagi = h('div', { class: 'panel tint', hidden: true, style: 'margin-top:14px' });
  form.querySelector('#bagi-setelan').addEventListener('click', () => {
    const c = ambil();
    if (!c.syncUrl || !c.syncKey) return tampil('Isi alamat Web App dan kunci rahasia dulu.', 'warn');
    const link = baseUrl() + '#/setelan?u=' + encodeURIComponent(c.syncUrl) + '&k=' + encodeURIComponent(c.syncKey);
    const pesan = `Setelan e-Asesmen Kompetensi Kader (Google Sheets). Buka di HP Anda, lalu tekan Simpan:\n${link}\n\nTautan ini berisi kunci rahasia, jangan dibagikan di grup umum.`;
    const kotak = h('textarea', { readonly: true, rows: 3, class: 'tautan', style: 'width:100%;resize:none;font:inherit;font-size:.8rem', 'aria-label': 'Tautan setelan' });
    kotak.value = link;
    kotak.addEventListener('focus', () => kotak.select());
    const salin = h('button', { class: 'btn kecil', type: 'button' }, 'Salin tautan');
    salin.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        kotak.focus();
        kotak.select();
        if (!document.execCommand('copy')) return toast('Tidak bisa menyalin otomatis. Tahan tautan di atas lalu pilih Salin.');
      }
      salin.textContent = 'Tersalin ✓';
      toast('Tautan setelan disalin.');
      setTimeout(() => (salin.textContent = 'Salin tautan'), 2500);
    });
    const wa = h('a', { class: 'btn alt kecil', href: 'https://wa.me/?text=' + encodeURIComponent(pesan), target: '_blank', rel: 'noopener' }, 'Kirim lewat WhatsApp');
    const bagi = navigator.share ? h('button', { class: 'btn alt kecil', type: 'button', onclick: () => navigator.share({ title: 'Setelan e-Asesmen', text: pesan }).catch(() => {}) }, 'Bagikan…') : null;
    panelBagi.replaceChildren(
      h('h3', null, 'Tautan setelan untuk penilai lain'),
      h('p', { class: 'small', style: 'margin:0 0 8px' }, 'Kirim ke masing-masing penilai. Mereka cukup membuka tautan ini di HP-nya lalu menekan Simpan.'),
      kotak,
      h('div', { class: 'row', style: 'margin-top:8px' }, salin, wa, bagi),
      h('p', { class: 'small muted', style: 'margin:10px 0 0' }, 'Tautan berisi kunci rahasia. Kirim lewat japri, jangan di grup umum.')
    );
    panelBagi.hidden = false;
    panelBagi.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  form.querySelector('#uji').addEventListener('click', async () => {
    const c = ambil();
    if (!c.syncUrl || !c.syncKey) return tampil('Isi alamat Web App dan kunci rahasia dulu.', 'warn');
    tampil('Menguji koneksi...');
    const r = await ujiKoneksi(c.syncUrl, c.syncKey);
    if (r.ok) tampil('Terhubung ke Google Sheets' + (r.nama ? ` (${r.nama})` : '') + '.');
    else tampil('Gagal: ' + (r.error || 'tidak diketahui'), 'bad');
  });
  form.querySelector('#kirim').addEventListener('click', async () => {
    await simpanPengaturan(ambil());
    tampil('Mengirim...');
    const r = await kirimSemua();
    if (r.tanpaKonfigurasi) tampil('Alamat Google Sheets belum diisi.', 'warn');
    else if (r.offline) tampil('Tidak ada jaringan. Data akan dikirim otomatis nanti.', 'warn');
    else if (r.gagal) tampil(`${r.gagal} data gagal dikirim: ${syncState.error}`, 'bad');
    else tampil(r.dikirim ? `${r.dikirim} data terkirim.` : 'Semua data sudah terkirim.');
  });
  form.append(panelBagi);
  el.append(form);

  // cadangan
  const impor = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', id: 'impor' });
  const btnEks = h('button', { class: 'btn alt', type: 'button' }, 'Ekspor cadangan');
  btnEks.addEventListener('click', async () => {
    const data = { app: 'e-asesmen-kader', versi: 1, dibuat: new Date().toISOString(), records: await semuaRecord() };
    unduh(`cadangan_e-asesmen_${hariIni()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
  });
  impor.addEventListener('change', async () => {
    try {
      const d = JSON.parse(await impor.files[0].text());
      if (d.app !== 'e-asesmen-kader' || !Array.isArray(d.records)) throw new Error('Format file tidak dikenali');
      let n = 0;
      const lokal = await semuaRecord();
      for (const r of d.records) {
        const a = lokal.find((x) => x.key === r.key);
        if (!a || (a.updatedAt || 0) < (r.updatedAt || 0)) {
          await simpanRecord(r);
          n++;
        }
      }
      hitungPending();
      toast(`${n} catatan dipulihkan.`);
    } catch (e) {
      toast('Gagal memulihkan: ' + e.message);
    }
    impor.value = '';
  });
  const btnImp = h('label', { class: 'btn alt', for: 'impor', tabindex: '0' }, 'Pulihkan cadangan');
  btnImp.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), impor.click()));
  const btnHapus = h('button', { class: 'btn bahaya', type: 'button' }, 'Hapus semua data di perangkat ini');
  btnHapus.addEventListener('click', async () => {
    const p = await hitungPending();
    if (!confirm(`Hapus SEMUA penilaian di perangkat ini?${p ? `\n\nPERHATIAN: ${p} data belum terkirim ke Google Sheets dan akan hilang.` : ''}\n\nTindakan ini tidak bisa dibatalkan.`)) return;
    await kosongkanRecord();
    hitungPending();
    toast('Semua data dihapus.');
  });
  el.append(h('h2', { style: 'margin-top:30px' }, 'Cadangan data'), h('p', { class: 'muted small' }, 'Data penilaian hanya tersimpan di perangkat ini sampai terkirim ke Google Sheets. Buat cadangan secara berkala.'), h('div', { class: 'row' }, btnEks, btnImp, impor), h('h2', { style: 'margin-top:30px' }, 'Hapus data'), btnHapus);
  return { el, judul: 'Pengaturan' };
}

/* =========================================================== TENTANG */
export async function tentang() {
  const el = h(
    'div',
    null,
    h('h1', null, 'Tentang aplikasi'),
    h('p', null, 'e-Asesmen Kompetensi Kader membantu penilai mengisi daftar tilik kompetensi kader posyandu (KD I sampai KD V), menggabungkan nilai dua penilai, dan mencetak hasilnya ke PDF.'),
    h('h2', null, 'Aturan perhitungan'),
    h('ul', null, h('li', null, 'Setiap butir: Sesuai = 1, Tidak Sesuai = 0, untuk masing-masing penilai.'), h('li', null, 'Nilai final = (jumlah nilai Penilai 1 + Penilai 2) ÷ (jumlah butir × 2) × 100%.'), h('li', null, `Lulus bila nilai final minimal ${AMBANG}%; di bawahnya Tidak Lulus dan dapat mengulang.`), h('li', null, 'Kader dinyatakan KOMPETEN pada suatu KD bila semua point dalam KD itu lulus. Semua point dalam satu KD dinilai pada hari yang sama.'), h('li', null, 'KD II Point 3 (antropometri) memakai 72 butir. Kategori kepatuhan: Kurang (<41), Cukup (41-54), Baik (55-61), Sangat Baik (≥62) dari rata-rata skor kedua penilai.')),
    h('h2', null, 'Data dan privasi'),
    h('p', null, 'Penilaian disimpan di peramban perangkat ini. Data hanya dikirim ke Google Sheets milik institusi Anda bila alamat Web App diisi di Pengaturan. Tidak ada pelacak atau layanan pihak ketiga.'),
    h('p', { class: 'muted small' }, 'Versi 1.3 · Poltekkes Kemenkes Makassar')
  );
  return { el, judul: 'Tentang' };
}
