// Halaman-halaman aplikasi. Setiap fungsi mengembalikan { el, fokus?, judul? }.

import { h, toast, kodeSesi, hariIni, tanggalIndo, waktuIndo, norm, kaderKey, persen, b64encode, b64decode, unduh, debounce } from './util.js';
import { TILIK } from './data/tilik.js';
import { cariPoint, cariKd, semuaPoint, ringkasanSesi, hitungFinal, skorRecord, labelStatus, AMBANG } from './scoring.js';
import { semuaRecord, ambilRecord, simpanRecord, hapusRecord, kosongkanRecord, ambilPengaturan, simpanPengaturan, sesiRecords } from './db.js';
import { kirimSemua, ambilSesi, ujiKoneksi, hitungPending, state as syncState } from './sync.js';
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
      h('li', null, h('b', null, 'Isi identitas'), h('span', null, 'Nama, desa, dan posyandu kader, serta nama dan institusi penilai.')),
      h('li', null, h('b', null, 'Nilai per butir'), h('span', null, 'Setiap penilai memilih Sesuai atau Tidak Sesuai di perangkatnya sendiri.')),
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
  let terpilih = query.get('point') || '';

  const f = (name, label, opts = {}) =>
    h('label', { class: 'f' }, label, h('input', { type: opts.type || 'text', name, required: opts.req !== false, autocomplete: opts.ac || 'off', list: opts.list, value: opts.val || '', placeholder: opts.ph || '' }));

  const dl = h('datalist', { id: 'dl-kader' }, [...kaderUnik.values()].map((k) => h('option', { value: k.nama })));
  const form = h('form', { novalidate: true });
  const galat = h('div', { class: 'note bad', hidden: true, role: 'alert' });

  const daftarPoint = TILIK.map((k) =>
    h(
      'details',
      { class: 'kdp', open: kdBuka === k.kd || (!kdBuka && k.kd === 1) },
      h('summary', null, lencana(k.kd), h('span', null, `${k.kode}. ${k.judul}`)),
      h(
        'div',
        { class: 'pilih-point' },
        k.points.map((p) =>
          h(
            'label',
            null,
            h('input', { type: 'radio', name: 'point', value: p.id, checked: terpilih === p.id }),
            h('span', null, `${p.no}. ${p.judul}`, h('small', null, `${p.items.length} butir`))
          )
        )
      )
    )
  );

  const inputAttempt = h('input', { type: 'number', name: 'attempt', min: 1, max: 20, value: 1, required: true, inputmode: 'numeric' });

  form.append(
    dl,
    h('fieldset', { class: 'blok' }, h('legend', null, 'Kader yang dinilai'), h('div', { class: 'grid3' }, f('kNama', 'Nama kader', { list: 'dl-kader', ac: 'off' }), f('kDesa', 'Asal desa'), f('kPos', 'Posyandu'))),
    h('fieldset', { class: 'blok' }, h('legend', null, 'Penilai 1 (Anda)'), h('div', { class: 'grid2' }, f('pNama', 'Nama penilai', { val: cfg.penilai.nama, ac: 'name' }), f('pInst', 'Asal institusi', { val: cfg.penilai.institusi, ac: 'organization' }))),
    h('fieldset', { class: 'blok' }, h('legend', null, 'Waktu'), h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Tanggal penilaian', h('input', { type: 'date', name: 'tanggal', value: hariIni(), required: true })), h('label', { class: 'f' }, 'Percobaan ke-', inputAttempt))),
    h('fieldset', { class: 'blok' }, h('legend', null, 'Point yang dinilai'), daftarPoint),
    galat,
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn' }, 'Mulai menilai'), h('a', { class: 'btn alt', href: '#/' }, 'Batal'))
  );

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
  const hitungPercobaan = async () => {
    const pt = form.elements.point.value;
    const kader = { nama: form.elements.kNama.value, desa: form.elements.kDesa.value, posyandu: form.elements.kPos.value };
    if (!pt || !kader.nama) return;
    const sesi = new Set(all.filter((r) => r.pointId === pt && kaderKey(r.kader) === kaderKey(kader)).map((r) => r.sessionId));
    inputAttempt.value = sesi.size + 1;
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'point' || e.target.name === 'kDesa' || e.target.name === 'kPos') hitungPercobaan();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const kurang = [];
    if (!d.kNama?.trim()) kurang.push('nama kader');
    if (!d.kDesa?.trim()) kurang.push('asal desa');
    if (!d.kPos?.trim()) kurang.push('posyandu');
    if (!d.pNama?.trim()) kurang.push('nama penilai');
    if (!d.pInst?.trim()) kurang.push('asal institusi penilai');
    if (!d.point) kurang.push('point yang dinilai');
    if (kurang.length) {
      galat.hidden = false;
      galat.textContent = 'Lengkapi dulu: ' + kurang.join(', ') + '.';
      galat.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const point = cariPoint(d.point);
    const rec = buatRecord({
      sessionId: kodeSesi(),
      role: 1,
      point,
      attempt: Math.max(1, Number(d.attempt) || 1),
      tanggal: d.tanggal,
      kader: { nama: d.kNama.trim(), desa: d.kDesa.trim(), posyandu: d.kPos.trim() },
      penilai: { nama: d.pNama.trim(), institusi: d.pInst.trim() },
    });
    await simpanRecord(rec);
    await simpanPengaturan({ ...cfg, penilai: rec.penilai });
    pasang(`#/nilai/${rec.key}`);
  });

  const el = h('div', null, h('h1', null, 'Penilaian baru'), h('p', { class: 'muted' }, 'Isi identitas, pilih point, lalu mulai menilai. Penilai 2 bergabung lewat tautan atau kode sesi setelah ini.'), form);
  return { el, judul: 'Penilaian baru' };
}

/* =========================================================== GABUNG */
export async function gabung(payloadStr) {
  const cfg = await ambilPengaturan();
  let info = null;
  if (payloadStr) {
    const p = b64decode(payloadStr);
    if (p && p.s && cariPoint(p.p)) info = { sessionId: p.s, pointId: p.p, attempt: p.a || 1, tanggal: p.t || hariIni(), kader: { nama: p.k[0], desa: p.k[1], posyandu: p.k[2] }, penilai1: p.o ? { nama: p.o[0], institusi: p.o[1] } : null };
  }
  const el = h('div', null, h('h1', null, 'Gabung sesi penilai'));
  const isi = h('div');
  el.append(isi);

  const manual = { sessionId: '' };

  const tampilForm = (inf, bolehUbah) => {
    isi.replaceChildren();
    const ada = inf.penilai1 ? `Penilai 1: ${inf.penilai1.nama}${inf.penilai1.institusi ? ' (' + inf.penilai1.institusi + ')' : ''}` : '';
    const form = h('form', { novalidate: true });
    const g = h('div', { class: 'note bad', hidden: true, role: 'alert' });
    const pointSel = h('select', { name: 'point', required: true, disabled: !bolehUbah }, TILIK.map((k) => h('optgroup', { label: `${k.kode}. ${k.judul}` }, k.points.map((p) => h('option', { value: p.id, selected: p.id === inf.pointId }, `${p.no}. ${p.judul}`)))));
    const inp = (name, label, val, ro) => h('label', { class: 'f' }, label, h('input', { type: 'text', name, value: val || '', required: true, readonly: ro, autocomplete: 'off' }));
    form.append(
      h('div', { class: 'panel tint' }, h('p', { style: 'margin:0' }, h('b', null, 'Kode sesi '), h('span', { class: 'kode' }, inf.sessionId)), ada && h('p', { class: 'small muted', style: 'margin:6px 0 0' }, ada)),
      h('fieldset', { class: 'blok' }, h('legend', null, 'Kader yang dinilai'), h('div', { class: 'grid3' }, inp('kNama', 'Nama kader', inf.kader.nama, !bolehUbah), inp('kDesa', 'Asal desa', inf.kader.desa, !bolehUbah), inp('kPos', 'Posyandu', inf.kader.posyandu, !bolehUbah))),
      h('fieldset', { class: 'blok' }, h('legend', null, 'Point'), h('label', { class: 'f' }, 'Point yang dinilai', pointSel), h('div', { class: 'grid2' }, h('label', { class: 'f' }, 'Tanggal', h('input', { type: 'date', name: 'tanggal', value: inf.tanggal, required: true })), h('label', { class: 'f' }, 'Percobaan ke-', h('input', { type: 'number', name: 'attempt', min: 1, max: 20, value: inf.attempt, required: true })))),
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
      const key = `${inf.sessionId}-2`;
      const ada2 = await ambilRecord(key);
      if (ada2 && !ada2.remote) {
        pasang(`#/nilai/${key}`);
        return;
      }
      const point = cariPoint(bolehUbah ? d.point : inf.pointId);
      const rec = buatRecord({
        sessionId: inf.sessionId,
        role: 2,
        point,
        attempt: Math.max(1, Number(d.attempt) || 1),
        tanggal: d.tanggal,
        kader: { nama: d.kNama.trim(), desa: d.kDesa.trim(), posyandu: d.kPos.trim() },
        penilai: { nama: d.pNama.trim(), institusi: d.pInst.trim() },
      });
      await simpanRecord(rec);
      await simpanPengaturan({ ...cfg, penilai: rec.penilai });
      pasang(`#/nilai/${rec.key}`);
    });
    isi.append(form);
  };

  if (info) {
    tampilForm(info, false);
    el.prepend(h('p', { class: 'muted' }, 'Periksa data kader di bawah, lengkapi identitas Anda, lalu mulai menilai.'));
    return { el, judul: 'Gabung sesi' };
  }

  // belum ada data: tempel tautan atau ketik kode
  const input = h('input', { type: 'text', name: 'kode', placeholder: 'Tempel tautan atau ketik kode sesi', autocomplete: 'off', autocapitalize: 'characters' });
  const pesan = h('div', { class: 'note', hidden: true, role: 'status' });
  const cari = h('form', { novalidate: true }, h('label', { class: 'f' }, 'Tautan atau kode sesi dari Penilai 1', input), h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, 'Lanjut'), h('a', { class: 'btn alt', href: '#/' }, 'Batal')), pesan);
  isi.append(h('p', { class: 'muted' }, 'Minta Penilai 1 membagikan tautan sesi. Membuka tautan itu akan mengisi data kader otomatis, bahkan tanpa internet.'), cari);
  cari.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    pesan.hidden = false;
    pesan.className = 'note';
    const m = v.match(/#\/gabung\/([A-Za-z0-9_-]+)/);
    if (m) {
      pasang('#/gabung/' + m[1]);
      return;
    }
    const kode = v.toUpperCase().replace(/\s/g, '');
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(kode)) {
      pesan.classList.add('bad');
      pesan.textContent = 'Kode sesi terdiri dari 6 huruf/angka. Periksa kembali, atau tempel seluruh tautan.';
      return;
    }
    pesan.textContent = 'Mencari sesi...';
    const r = await ambilSesi(kode);
    const r1 = r.ok ? r.records.find((x) => x.role === 1) : null;
    if (r1 && cariPoint(r1.pointId)) {
      tampilForm({ sessionId: kode, pointId: r1.pointId, attempt: r1.attempt, tanggal: r1.tanggal, kader: r1.kader, penilai1: r1.penilai }, false);
      return;
    }
    pesan.classList.add('warn');
    pesan.textContent = (r.ok ? 'Sesi belum ditemukan di Google Sheets (Penilai 1 mungkin belum selesai atau belum terkirim).' : r.alasan) + ' Anda tetap bisa memasukkan data kader secara manual di bawah ini.';
    const lanjut = h('button', { class: 'btn alt kecil', type: 'button', style: 'margin-top:10px' }, 'Isi data kader manual');
    lanjut.addEventListener('click', () => tampilForm({ sessionId: kode, pointId: TILIK[0].points[0].id, attempt: 1, tanggal: hariIni(), kader: { nama: '', desa: '', posyandu: '' }, penilai1: null }, true));
    pesan.append(h('br'), lanjut);
  });
  void manual;
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
  const btnSelesai = h('button', { type: 'button', class: 'btn' }, 'Selesai');
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
    pasang('#/hasil/' + rec.sessionId);
  });

  const el = h(
    'div',
    null,
    h(
      'div',
      { class: 'kepala-nilai' },
      h('h1', { style: 'font-size:1.35rem' }, `${point.kdKode} Point ${point.no}. ${point.judul}`),
      h('div', { class: 'meta' }, h('span', null, 'Kader: ', h('b', null, rec.kader.nama)), h('span', null, 'Desa: ', h('b', null, rec.kader.desa)), h('span', null, 'Posyandu: ', h('b', null, rec.kader.posyandu))),
      h('div', { class: 'meta', style: 'margin-bottom:10px' }, h('span', null, 'Anda: ', h('b', null, `Penilai ${rec.role} (${rec.penilai.nama})`)), h('span', null, 'Kode sesi: ', h('b', null, rec.sessionId)), h('span', null, `Percobaan ke-${rec.attempt}`)),
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
  const el = h('div');

  el.append(
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

  // ajakan Penilai 2
  if (r1 && !r1.remote && !r2) {
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
      const r = await ambilSesi(sessionId);
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

/* =========================================================== RIWAYAT */
export async function riwayat() {
  const sesi = await semuaSesi();
  const el = h('div', null, h('h1', null, 'Riwayat penilaian'));
  if (!sesi.length) {
    el.append(h('div', { class: 'kosong-state' }, h('b', null, 'Belum ada penilaian'), h('p', null, 'Penilaian yang Anda isi akan tersimpan di sini, juga saat tidak ada internet.'), h('a', { class: 'btn', href: '#/baru' }, 'Mulai penilaian')));
    return { el, judul: 'Riwayat' };
  }
  const cari = h('input', { type: 'search', placeholder: 'Cari nama kader, desa, atau posyandu', 'aria-label': 'Cari riwayat' });
  const list = h('ul', { class: 'daftar' });
  const gambar = () => {
    const q = norm(cari.value);
    list.replaceChildren();
    const f = sesi.filter((s) => !q || norm([s.ref.kader.nama, s.ref.kader.desa, s.ref.kader.posyandu, s.point.judul].join(' ')).includes(q));
    if (!f.length) list.append(h('li', { class: 'kosong-state' }, 'Tidak ada yang cocok.'));
    f.forEach((s) => {
      const belumKirim = s.recs.some((r) => !r.remote && r.status === 'selesai' && !r.synced);
      const hapus = h('button', { class: 'btn bahaya kecil', type: 'button', 'aria-label': 'Hapus sesi ' + s.id }, 'Hapus');
      hapus.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Hapus sesi ${s.id} (${s.ref.kader.nama}, ${s.point.kdKode} Point ${s.point.no}) dari perangkat ini?${belumKirim ? '\n\nPERHATIAN: sebagian data belum terkirim ke Google Sheets.' : ''}`)) return;
        for (const r of s.recs) await hapusRecord(r.key);
        hitungPending();
        const idx = sesi.indexOf(s);
        sesi.splice(idx, 1);
        gambar();
      });
      list.append(
        h(
          'li',
          null,
          h(
            'a',
            { class: 'item-sesi', href: '#/hasil/' + s.id },
            h('div', { class: 'kiri' }, h('strong', null, s.ref.kader.nama), h('small', null, `${s.point.kdKode} Point ${s.point.no} · ${s.point.judul}`), h('small', { style: 'display:block' }, `Desa ${s.ref.kader.desa} · ${s.ref.kader.posyandu} · ${tanggalIndo(s.ref.tanggal)} · Percobaan ke-${s.ref.attempt}`)),
            h('div', { class: 'kanan' }, chipStatus(s.hasil.status), s.hasil.lengkap && h('b', null, persen(s.hasil.pct)), h('small', null, belumKirim ? 'Belum terkirim' : s.recs.some((r) => !r.remote && r.status === 'selesai') ? 'Terkirim ✓' : 'Draf'), hapus)
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
  const btn = h('button', { class: 'btn', type: 'button' }, 'Cetak PDF rekap');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const bytes = await buatPdfRekap({ kader, baris: barisPdf });
      await unduhPdf(bytes, namaFileRekap(kader));
    } catch (e) {
      console.error(e);
      toast('PDF gagal dibuat: ' + (e.message || e));
    }
    btn.disabled = false;
  });
  el.append(
    h('div', { class: 'panel tint' }, h('b', null, kader.nama), h('div', { class: 'small muted' }, `Desa ${kader.desa} · Posyandu ${kader.posyandu}`), h('p', { style: 'margin:10px 0 12px' }, h('b', null, `${lulus} dari ${barisPdf.length} point lulus`), ` · ${dinilai.length} sudah dinilai lengkap`), btn),
    h(
      'div',
      { class: 'rekap-grid' },
      TILIK.map((k) =>
        h(
          'section',
          { class: 'rekap-kd' },
          h('h3', null, `${k.kode}. ${k.judul}`),
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
      h('p', { class: 'muted small' }, 'Diisi sekali per perangkat. Cara termudah: buka "tautan setelan" yang dibagikan pengelola, lalu tekan Simpan. Kosongkan bila hanya ingin menyimpan di perangkat ini.'),
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
    h('ul', null, h('li', null, 'Setiap butir: Sesuai = 1, Tidak Sesuai = 0, untuk masing-masing penilai.'), h('li', null, 'Nilai final = (jumlah nilai Penilai 1 + Penilai 2) ÷ (jumlah butir × 2) × 100%.'), h('li', null, `Lulus bila nilai final minimal ${AMBANG}%; di bawahnya Tidak Lulus dan dapat mengulang.`), h('li', null, 'KD II Point 3 (antropometri) memakai 72 butir. Kategori kepatuhan: Kurang (<41), Cukup (41-54), Baik (55-61), Sangat Baik (≥62) dari rata-rata skor kedua penilai.')),
    h('h2', null, 'Data dan privasi'),
    h('p', null, 'Penilaian disimpan di peramban perangkat ini. Data hanya dikirim ke Google Sheets milik institusi Anda bila alamat Web App diisi di Pengaturan. Tidak ada pelacak atau layanan pihak ketiga.'),
    h('p', { class: 'muted small' }, 'Versi 1.1.1 · Poltekkes Kemenkes Makassar')
  );
  return { el, judul: 'Tentang' };
}
