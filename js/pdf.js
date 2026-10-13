// Cetak hasil penilaian ke PDF langsung di perangkat (tanpa internet), memakai pdf-lib.

import { persen, tanggalIndo, waktuIndo, slug, unduh } from './util.js';
import { labelStatus } from './scoring.js';

const A4 = [595.28, 841.89];
const M = 40;
const LEBAR = A4[0] - 2 * M;

const san = (t) =>
  String(t ?? '')
    .replace(/≥/g, '>=')
    .replace(/→/g, '->')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E¡-ÿ–—‘’“”•…]/g, '?');

let logoCache;
async function logoBytes() {
  if (!logoCache) {
    const r = await fetch('assets/logo-poltekkes.png');
    logoCache = await r.arrayBuffer();
  }
  return logoCache;
}

class Pen {
  constructor(PDFLib, doc, fonts, logo, opsi) {
    this.L = PDFLib;
    this.doc = doc;
    this.f = fonts;
    this.logo = logo;
    this.opsi = opsi;
    this.rgb = PDFLib.rgb;
    this.c = {
      ink: this.rgb(0.02, 0.23, 0.22),
      teal: this.rgb(0.04, 0.42, 0.4),
      abu: this.rgb(0.45, 0.5, 0.5),
      garis: this.rgb(0.7, 0.78, 0.76),
      muda: this.rgb(0.92, 0.96, 0.95),
      merah: this.rgb(0.7, 0.18, 0.12),
      putih: this.rgb(1, 1, 1),
    };
    this.pages = [];
    this.baru();
  }

  baru() {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    const pertama = this.pages.length === 1;
    if (this.opsi.semu) {
      this.page.drawText('SEMENTARA', {
        x: 110,
        y: 250,
        size: 96,
        font: this.f.bold,
        color: this.rgb(0.9, 0.93, 0.92),
        rotate: this.L.degrees(40),
      });
    }
    if (pertama) {
      const w = 165;
      const h = (w * this.logo.height) / this.logo.width;
      this.page.drawImage(this.logo, { x: M, y: A4[1] - M - h + 6, width: w, height: h });
      this.teksKanan(this.opsi.judul, A4[0] - M, A4[1] - M - 8, 13, this.f.bold, this.c.ink);
      this.teksKanan(this.opsi.subjudul, A4[0] - M, A4[1] - M - 23, 9, this.f.reg, this.c.abu);
      if (this.opsi.catatanAtas) this.teksKanan(this.opsi.catatanAtas, A4[0] - M, A4[1] - M - 36, 8, this.f.bold, this.c.merah);
      this.y = A4[1] - M - h - 8;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 1.2, color: this.c.teal });
      this.y -= 14;
    } else {
      this.text(this.opsi.judul, M, A4[1] - M + 4, 9, this.f.bold, this.c.ink);
      this.teksKanan(this.opsi.ringkas || '', A4[0] - M, A4[1] - M + 4, 8, this.f.reg, this.c.abu);
      this.page.drawLine({ start: { x: M, y: A4[1] - M }, end: { x: A4[0] - M, y: A4[1] - M }, thickness: 0.6, color: this.c.garis });
      this.y = A4[1] - M - 14;
    }
    return this.page;
  }

  text(t, x, y, size = 9, font = this.f.reg, color = this.c.ink) {
    this.page.drawText(san(t), { x, y, size, font, color });
  }
  teksKanan(t, xr, y, size, font, color) {
    const s = san(t);
    this.page.drawText(s, { x: xr - font.widthOfTextAtSize(s, size), y, size, font, color });
  }
  teksTengah(t, xc, y, size, font, color) {
    const s = san(t);
    this.page.drawText(s, { x: xc - font.widthOfTextAtSize(s, size) / 2, y, size, font, color });
  }

  bungkus(t, lebar, size, font = this.f.reg) {
    const kata = san(t).split(' ');
    const baris = [];
    let cur = '';
    for (const k of kata) {
      const tes = cur ? cur + ' ' + k : k;
      if (font.widthOfTextAtSize(tes, size) <= lebar) cur = tes;
      else {
        if (cur) baris.push(cur);
        // kata sangat panjang dipotong
        let sisa = k;
        while (font.widthOfTextAtSize(sisa, size) > lebar) {
          let i = sisa.length;
          while (i > 1 && font.widthOfTextAtSize(sisa.slice(0, i), size) > lebar) i--;
          baris.push(sisa.slice(0, i));
          sisa = sisa.slice(i);
        }
        cur = sisa;
      }
    }
    if (cur) baris.push(cur);
    return baris.length ? baris : [''];
  }

  perlu(tinggi) {
    if (this.y - tinggi < 56) {
      this.baru();
      return true;
    }
    return false;
  }

  kotak(x, y, w, h, { isi, garis = this.c.garis, tebal = 0.5 } = {}) {
    this.page.drawRectangle({ x, y, width: w, height: h, color: isi, borderColor: garis, borderWidth: tebal });
  }

  centang(cx, cy, warna = this.c.ink) {
    const o = { thickness: 1.4, color: warna };
    this.page.drawLine({ start: { x: cx - 4, y: cy }, end: { x: cx - 1.5, y: cy - 3.5 }, ...o });
    this.page.drawLine({ start: { x: cx - 1.5, y: cy - 3.5 }, end: { x: cx + 4.5, y: cy + 4 }, ...o });
  }

  // blok identitas dua kolom
  identitas(pasang) {
    const lw = 92;
    const kolom = LEBAR / 2;
    const maks = kolom - lw - 14;
    const LH = 11; // tinggi satu baris teks
    const baris = [];
    for (let i = 0; i < pasang.length; i += 2) {
      const sel = [pasang[i], pasang[i + 1]];
      const bungkus = sel.map((x) => (x ? this.bungkus(x[1] || '-', maks, 8.5, this.f.bold) : []));
      baris.push({ sel, bungkus, n: Math.max(1, ...bungkus.map((b) => b.length)) });
    }
    const tinggi = baris.reduce((a, b) => a + b.n * LH + 4, 0) + 8;
    this.perlu(tinggi + 6);
    this.kotak(M, this.y - tinggi, LEBAR, tinggi, { isi: this.c.muda, garis: this.c.garis });
    let yy = this.y - 15;
    baris.forEach((b) => {
      b.sel.forEach((x, col) => {
        if (!x) return;
        const xx = M + 8 + col * kolom;
        this.text(x[0], xx, yy, 8.5, this.f.reg, this.c.abu);
        b.bungkus[col].forEach((t, k) => this.text(t, xx + lw, yy - k * LH, 8.5, this.f.bold, this.c.ink));
      });
      yy -= b.n * LH + 4;
    });
    this.y -= tinggi + 10;
  }
}

function infoSesi(rec1, rec2) {
  const ref = rec1 || rec2;
  return ref;
}

export async function buatPdfPoint({ point, r1, r2, hasil }) {
  const L = window.PDFLib;
  const doc = await L.PDFDocument.create();
  doc.setTitle(`Hasil Asesmen Kompetensi Kader - ${point.id}`);
  doc.setAuthor('e-Asesmen Kompetensi Kader, Poltekkes Kemenkes Makassar');
  const fonts = { reg: await doc.embedFont(L.StandardFonts.Helvetica), bold: await doc.embedFont(L.StandardFonts.HelveticaBold) };
  const logo = await doc.embedPng(await logoBytes());
  const ref = infoSesi(r1, r2);
  const semu = !hasil.lengkap;
  const pen = new Pen(L, doc, fonts, logo, {
    judul: 'HASIL ASESMEN KOMPETENSI KADER',
    subjudul: 'Poltekkes Kemenkes Makassar',
    catatanAtas: semu ? 'SEMENTARA - belum final (menunggu penilaian lengkap)' : '',
    ringkas: `${point.kdKode} Point ${point.no} - ${ref.kader.nama}`,
    semu,
  });
  const { c, f } = pen;

  const nm = (r) => (r ? `${r.penilai.nama}${r.penilai.institusi ? ' (' + r.penilai.institusi + ')' : ''}` : '(belum ada)');
  pen.identitas([
    ['Nama kader', ref.kader.nama],
    ['Asal desa', ref.kader.desa],
    ['Posyandu', ref.kader.posyandu],
    ['Tanggal penilaian', tanggalIndo(ref.tanggal)],
    ['Kompetensi', `${point.kdKode} - ${point.kdJudul}`],
    ['Point', `${point.no}. ${point.judul}`],
    ['Penilai 1', nm(r1)],
    ['Penilai 2', nm(r2)],
    ['Percobaan ke-', String(ref.attempt || 1)],
    ['Kode sesi', ref.sessionId],
  ]);

  // ---- tabel butir
  const W = { no: 26, c: 35 };
  W.t = LEBAR - W.no - 4 * W.c;
  const X = { no: M, t: M + W.no, a: M + W.no + W.t };
  const kolX = (i) => X.a + i * W.c; // 0..3

  const kepala = () => {
    const h = 28;
    pen.perlu(h + 30);
    const top = pen.y;
    pen.kotak(M, top - h, W.no, h, { isi: c.teal, garis: c.teal });
    pen.kotak(X.t, top - h, W.t, h, { isi: c.teal, garis: c.teal });
    pen.kotak(kolX(0), top - h / 2, 2 * W.c, h / 2, { isi: c.teal, garis: c.putih });
    pen.kotak(kolX(2), top - h / 2, 2 * W.c, h / 2, { isi: c.teal, garis: c.putih });
    for (let i = 0; i < 4; i++) pen.kotak(kolX(i), top - h, W.c, h / 2, { isi: c.teal, garis: c.putih });
    pen.teksTengah('No', M + W.no / 2, top - 17, 8.5, f.bold, c.putih);
    pen.text('Keterampilan', X.t + 6, top - 17, 8.5, f.bold, c.putih);
    pen.teksTengah('Penilai 1', kolX(0) + W.c, top - 10, 8, f.bold, c.putih);
    pen.teksTengah('Penilai 2', kolX(2) + W.c, top - 10, 8, f.bold, c.putih);
    ['Sesuai', 'Tidak', 'Sesuai', 'Tidak'].forEach((s, i) => pen.teksTengah(s, kolX(i) + W.c / 2, top - 24, 6.6, f.bold, c.putih));
    pen.y = top - h;
  };

  const barisGabung = (teks, h, isi, font = f.bold, size = 8.5) => {
    pen.kotak(M, pen.y - h, LEBAR, h, { isi });
    pen.text(teks, M + 6, pen.y - h + (h - size) / 2 + 1.5, size, font, c.ink);
    pen.y -= h;
  };

  kepala();
  let gAktif = null;
  let sAktif = null;
  const subtotal = (g) => {
    const b1 = hasil.bagian1.find((x) => x.bagian === g);
    const b2 = hasil.bagian2.find((x) => x.bagian === g);
    const h = 16;
    if (pen.perlu(h)) kepala();
    pen.kotak(M, pen.y - h, W.no + W.t, h, { isi: c.muda });
    pen.teksKanan('Skor bagian ' + g.slice(0, 1), X.a - 6, pen.y - h + 5, 8, f.bold, c.ink);
    pen.kotak(kolX(0), pen.y - h, 2 * W.c, h, { isi: c.muda });
    pen.kotak(kolX(2), pen.y - h, 2 * W.c, h, { isi: c.muda });
    pen.teksTengah(`${b1.skor} / ${b1.n}`, kolX(0) + W.c, pen.y - h + 5, 8.5, f.bold, c.ink);
    pen.teksTengah(`${b2.skor} / ${b2.n}`, kolX(2) + W.c, pen.y - h + 5, 8.5, f.bold, c.ink);
    pen.y -= h;
  };

  point.items.forEach((it, i) => {
    if (it.g && it.g !== gAktif) {
      if (gAktif) subtotal(gAktif);
      if (pen.perlu(16 + 26)) kepala();
      barisGabung(it.g, 16, c.muda);
      gAktif = it.g;
      sAktif = null;
    }
    if (it.s && it.s !== sAktif) {
      if (pen.perlu(14 + 26)) kepala();
      barisGabung(it.s, 14, pen.rgb(0.97, 0.99, 0.98), f.reg, 8);
      sAktif = it.s;
    }
    const baris = pen.bungkus(it.t, W.t - 12, 8.5);
    const h = Math.max(baris.length * 10.5 + 8, 20);
    if (pen.perlu(h)) kepala();
    const top = pen.y;
    pen.kotak(M, top - h, W.no, h);
    pen.kotak(X.t, top - h, W.t, h);
    for (let k = 0; k < 4; k++) pen.kotak(kolX(k), top - h, W.c, h);
    pen.teksTengah(String(i + 1), M + W.no / 2, top - 13, 8.5, f.reg, c.ink);
    baris.forEach((b, j) => pen.text(b, X.t + 6, top - 13 - j * 10.5, 8.5, f.reg, c.ink));
    const a1 = r1 && r1.answers ? r1.answers[i] : null;
    const a2 = r2 && r2.answers ? r2.answers[i] : null;
    const cy = top - h / 2 - 1;
    if (a1 === 1) pen.centang(kolX(0) + W.c / 2, cy);
    if (a1 === 0) pen.centang(kolX(1) + W.c / 2, cy, c.merah);
    if (a2 === 1) pen.centang(kolX(2) + W.c / 2, cy);
    if (a2 === 0) pen.centang(kolX(3) + W.c / 2, cy, c.merah);
    pen.y -= h;
  });
  if (gAktif) subtotal(gAktif);

  // baris TOTAL
  {
    const h = 20;
    if (pen.perlu(h)) kepala();
    pen.kotak(M, pen.y - h, W.no + W.t, h, { isi: c.muda });
    pen.teksKanan('TOTAL', X.a - 6, pen.y - h + 6, 9, f.bold, c.ink);
    pen.kotak(kolX(0), pen.y - h, 2 * W.c, h, { isi: c.muda });
    pen.kotak(kolX(2), pen.y - h, 2 * W.c, h, { isi: c.muda });
    pen.teksTengah(`${hasil.s1.skor} / ${hasil.n}`, kolX(0) + W.c, pen.y - h + 6, 9, f.bold, c.ink);
    pen.teksTengah(`${hasil.s2.skor} / ${hasil.n}`, kolX(2) + W.c, pen.y - h + 6, 9, f.bold, c.ink);
    pen.y -= h + 12;
  }

  // ---- hasil
  const tinggiHasil = point.khusus ? 92 : 78;
  pen.perlu(tinggiHasil + 6);
  {
    const top = pen.y;
    const lw = LEBAR * 0.62;
    pen.kotak(M, top - tinggiHasil, lw, tinggiHasil, { isi: pen.rgb(1, 1, 1) });
    let yy = top - 15;
    const baris = (k, v, tebal) => {
      pen.text(k, M + 8, yy, 8.5, f.reg, c.abu);
      pen.text(v, M + 150, yy, 8.5, tebal ? f.bold : f.reg, c.ink);
      yy -= 13;
    };
    baris('Nilai Penilai 1', `${hasil.s1.skor} dari ${hasil.n} butir`);
    baris('Nilai Penilai 2', `${hasil.s2.skor} dari ${hasil.n} butir`);
    baris('Gabungan', `${hasil.total} dari ${hasil.maks}  (pembagi ${hasil.n} x 2 = ${hasil.maks})`);
    baris('NILAI FINAL', persen(semu ? hasil.pctSem : hasil.pct) + (semu ? '  (sementara)' : ''), true);
    if (point.khusus) baris('Kategori kepatuhan', `${hasil.kategori} (rata-rata skor ${hasil.rataRata.toLocaleString('id-ID')} dari ${hasil.n})`, true);
    const bx = M + lw + 10;
    const bw = LEBAR - lw - 10;
    const warna = hasil.status === 'lulus' ? c.teal : hasil.status === 'tidak' ? c.merah : c.abu;
    pen.kotak(bx, top - tinggiHasil, bw, tinggiHasil, { isi: warna, garis: warna });
    pen.teksTengah('STATUS', bx + bw / 2, top - 22, 8.5, f.reg, c.putih);
    pen.teksTengah(labelStatus[hasil.status], bx + bw / 2, top - 46, hasil.status === 'tidak' ? 15 : 17, f.bold, c.putih);
    pen.teksTengah('Batas lulus 80%', bx + bw / 2, top - tinggiHasil + 10, 8, f.reg, c.putih);
    pen.y = top - tinggiHasil - 12;
  }

  // ---- butir yang perlu diperbaiki
  if (hasil.lengkap && hasil.kurang.length) {
    pen.perlu(40);
    pen.text('Butir yang belum sesuai (dapat diulang pada pengamatan berikutnya)', M, pen.y - 4, 9, f.bold, c.ink);
    pen.y -= 16;
    for (const k of hasil.kurang) {
      const it = point.items[k.idx];
      const bar = pen.bungkus(`${k.idx + 1}. ${it.t}`, LEBAR - 118, 8.5);
      if (pen.perlu(bar.length * 10.5 + 4)) {
        /* halaman baru */
      }
      bar.forEach((b, j) => pen.text(b, M + 4, pen.y - 9 - j * 10.5, 8.5, f.reg, c.ink));
      const ket = k.jumlah === 0 ? 'kedua penilai: tidak sesuai' : k.p1 === 1 ? 'penilai 2: tidak sesuai' : 'penilai 1: tidak sesuai';
      pen.teksKanan(ket, A4[0] - M, pen.y - 9, 7.5, f.reg, c.abu);
      pen.y -= bar.length * 10.5 + 4;
    }
    pen.y -= 8;
  }

  // ---- catatan dan tanda tangan
  pen.perlu(135);
  pen.text('Catatan penilai:', M, pen.y - 4, 8.5, f.bold, c.ink);
  pen.y -= 12;
  for (let i = 0; i < 2; i++) {
    pen.page.drawLine({ start: { x: M, y: pen.y - 12 }, end: { x: A4[0] - M, y: pen.y - 12 }, thickness: 0.5, color: c.garis });
    pen.y -= 16;
  }
  pen.y -= 8;
  const kw = LEBAR / 3;
  const ttd = [
    ['Penilai 1', r1 ? r1.penilai.nama : '', r1 ? r1.penilai.institusi : ''],
    ['Penilai 2', r2 ? r2.penilai.nama : '', r2 ? r2.penilai.institusi : ''],
    ['Kader', ref.kader.nama, 'Posyandu ' + (ref.kader.posyandu || '-')],
  ];
  ttd.forEach(([peran, nama, ket], i) => {
    const x = M + i * kw;
    pen.teksTengah(peran, x + kw / 2, pen.y - 6, 8.5, f.bold, c.ink);
    pen.page.drawLine({ start: { x: x + 14, y: pen.y - 58 }, end: { x: x + kw - 14, y: pen.y - 58 }, thickness: 0.6, color: c.ink });
    const n = pen.bungkus(nama || '(.........................)', kw - 24, 8.5, f.bold)[0];
    pen.teksTengah(n, x + kw / 2, pen.y - 69, 8.5, f.bold, c.ink);
    const k = pen.bungkus(ket || '', kw - 24, 7.5, f.reg)[0];
    pen.teksTengah(k, x + kw / 2, pen.y - 80, 7.5, f.reg, c.abu);
  });
  pen.y -= 90;

  return finalisasi(pen, doc, `Kode sesi ${ref.sessionId}`);
}

function finalisasi(pen, doc, kiri) {
  const n = pen.pages.length;
  const cetak = waktuIndo(Date.now());
  pen.pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 40 }, end: { x: A4[0] - M, y: 40 }, thickness: 0.5, color: pen.c.garis });
    p.drawText(san(`e-Asesmen Kompetensi Kader - Poltekkes Kemenkes Makassar  |  ${kiri}  |  Dicetak ${cetak}`), { x: M, y: 28, size: 7, font: pen.f.reg, color: pen.c.abu });
    const s = `Halaman ${i + 1} dari ${n}`;
    p.drawText(s, { x: A4[0] - M - pen.f.reg.widthOfTextAtSize(s, 7), y: 28, size: 7, font: pen.f.reg, color: pen.c.abu });
  });
  return doc.save();
}

// ---------- Rekap per kader
export async function buatPdfRekap({ kader, baris, stKd = new Map(), tingkat = null }) {
  // baris: [{ point, sesi:{ref, hasil} | null }]
  const L = window.PDFLib;
  const doc = await L.PDFDocument.create();
  doc.setTitle('Rekap Asesmen Kompetensi Kader - ' + kader.nama);
  const fonts = { reg: await doc.embedFont(L.StandardFonts.Helvetica), bold: await doc.embedFont(L.StandardFonts.HelveticaBold) };
  const logo = await doc.embedPng(await logoBytes());
  const pen = new Pen(L, doc, fonts, logo, {
    judul: 'REKAP ASESMEN KOMPETENSI KADER',
    subjudul: 'Poltekkes Kemenkes Makassar',
    ringkas: 'Rekap - ' + kader.nama,
    semu: false,
  });
  const { c, f } = pen;
  const dinilai = baris.filter((b) => b.sesi && b.sesi.hasil.lengkap);
  const lulus = dinilai.filter((b) => b.sesi.hasil.lulus).length;
  pen.identitas([
    ['Nama kader', kader.nama],
    ['Asal desa', kader.desa],
    ['Posyandu', kader.posyandu],
    ['Tanggal cetak', tanggalIndo(new Date().toISOString())],
    ['Tingkatan kader', tingkat ? tingkat.nama : '-'],
    ['KD kompeten', `${[...stKd.values()].filter((x) => x.label === 'KOMPETEN').length} dari ${new Set(baris.map((b) => b.point.kd)).size}`],
    ['TKK diperoleh', `${lulus} dari ${baris.length} keterampilan`],
    ['Sudah dinilai lengkap', `${dinilai.length} dari ${baris.length}`],
  ]);

  const W = [34, 250, 52, 78, 40, 61];
  const X = [];
  W.reduce((a, w, i) => ((X[i] = M + a), a + w), 0);
  const kepala = () => {
    const h = 20;
    pen.perlu(h + 30);
    const top = pen.y;
    ['Point', 'Kompetensi', 'Nilai', 'Status', 'Perc.', 'Tanggal'].forEach((t, i) => {
      pen.kotak(X[i], top - h, W[i], h, { isi: c.teal, garis: c.teal });
      pen.text(t, X[i] + 5, top - 13, 8.5, f.bold, c.putih);
    });
    pen.y = top - h;
  };
  kepala();
  let kdAktif = 0;
  for (const b of baris) {
    if (b.point.kd !== kdAktif) {
      kdAktif = b.point.kd;
      if (pen.perlu(16 + 24)) kepala();
      pen.kotak(M, pen.y - 16, LEBAR, 16, { isi: c.muda });
      pen.text(`${b.point.kdKode} - ${b.point.kdJudul}`, M + 6, pen.y - 11.5, 8.5, f.bold, c.ink);
      const st = stKd.get(b.point.kd);
      if (st) {
        const teks = st.label + (st.final === st.total ? ` (${st.lulus}/${st.total} point lulus)` : '');
        const warna = st.status === 'lulus' ? c.teal : st.status === 'tidak' ? c.merah : c.abu;
        pen.text(teks, M + LEBAR - 6 - f.bold.widthOfTextAtSize(teks, 8.5), pen.y - 11.5, 8.5, f.bold, warna);
      }
      pen.y -= 16;
    }
    const lines = pen.bungkus(b.point.judul, W[1] - 10, 8.5);
    const h = Math.max(lines.length * 10.5 + 7, 19);
    if (pen.perlu(h)) kepala();
    const top = pen.y;
    W.forEach((w, i) => pen.kotak(X[i], top - h, w, h));
    pen.text(b.point.id, X[0] + 5, top - 12.5, 8.5, f.reg, c.ink);
    lines.forEach((l, j) => pen.text(l, X[1] + 5, top - 12.5 - j * 10.5, 8.5, f.reg, c.ink));
    if (b.sesi) {
      const hs = b.sesi.hasil;
      pen.text((hs.lengkap ? persen(hs.pct) : persen(hs.pctSem) + '*'), X[2] + 5, top - 12.5, 8.5, f.bold, c.ink);
      const warna = hs.status === 'lulus' ? c.teal : hs.status === 'tidak' ? c.merah : c.abu;
      pen.text(labelStatus[hs.status], X[3] + 5, top - 12.5, 8.5, f.bold, warna);
      pen.text(String(b.sesi.ref.attempt || 1), X[4] + 5, top - 12.5, 8.5, f.reg, c.ink);
      pen.text(tanggalIndo(b.sesi.ref.tanggal).replace(/ (\d{4})$/, ' $1'), X[5] + 5, top - 12.5, 7.2, f.reg, c.ink);
    } else {
      pen.text('Belum dinilai', X[2] + 4, top - 12.5, 7.2, f.reg, c.abu);
    }
    pen.y -= h;
  }
  pen.y -= 8;
  const lines = pen.bungkus('Nilai dan status diambil dari percobaan terakhir untuk setiap point. Lulus bila nilai gabungan dua penilai minimal 80% (point lulus = Tanda Kecakapan Kader/TKK). Tanda * = nilai sementara (menunggu penilai lain). Tingkatan: Purwa = KD II dan KD V ditambah 1 KD pilihan; Madya = 4 KD; Utama = 5 KD (Buku Panduan Keterampilan Dasar Kader Bidang Kesehatan, Kemenkes RI 2024).', LEBAR, 8);
  pen.perlu(lines.length * 10 + 6);
  lines.forEach((l, j) => pen.text(l, M, pen.y - 8 - j * 10, 8, f.reg, c.abu));
  return finalisasi(pen, doc, 'Rekap kader');
}

// ---------- Surat keterangan tingkatan kader (Purwa/Madya/Utama)
export async function buatPdfSurat({ kader, baris, stKd, tingkat }) {
  const L = window.PDFLib;
  const doc = await L.PDFDocument.create();
  doc.setTitle('Surat Keterangan Tingkatan Kader - ' + kader.nama);
  const fonts = { reg: await doc.embedFont(L.StandardFonts.Helvetica), bold: await doc.embedFont(L.StandardFonts.HelveticaBold), miring: await doc.embedFont(L.StandardFonts.HelveticaOblique) };
  const logo = await doc.embedPng(await logoBytes());
  const pen = new Pen(L, doc, fonts, logo, {
    judul: 'SURAT KETERANGAN TINGKATAN KADER',
    subjudul: 'Keterampilan Dasar Kader Bidang Kesehatan',
    ringkas: 'Surat keterangan - ' + kader.nama,
    semu: false,
  });
  const { c, f } = pen;
  const paragraf = (t, size = 9.5, font = f.reg, warna = c.ink, jarak = 13.5) => {
    const ls = pen.bungkus(t, LEBAR, size, font);
    pen.perlu(ls.length * jarak + 4);
    ls.forEach((l, i) => pen.text(l, M, pen.y - 10 - i * jarak, size, font, warna));
    pen.y -= ls.length * jarak + 6;
  };
  const tkk = baris.filter((b) => b.sesi && b.sesi.hasil.lengkap && b.sesi.hasil.lulus);
  const tglTerakhir = tkk.map((b) => b.sesi.ref.tanggal).sort().at(-1);

  pen.teksTengah('Nomor: ............................................................', A4[0] / 2, pen.y - 8, 9.5, f.reg, c.ink);
  pen.y -= 22;
  paragraf('Berdasarkan hasil penilaian keterampilan dasar kader bidang kesehatan menggunakan daftar tilik oleh dua penilai, dengan ini menerangkan bahwa:');
  pen.identitas([
    ['Nama kader', kader.nama],
    ['Asal desa', kader.desa],
    ['Posyandu', kader.posyandu],
    ['Penilaian terakhir', tglTerakhir ? tanggalIndo(tglTerakhir) : '-'],
  ]);
  paragraf(`telah memperoleh Tanda Kecakapan Kader (TKK) sebanyak ${tkk.length} dari ${baris.length} keterampilan dasar dan dinyatakan sebagai:`);

  // tingkatan, ditonjolkan
  pen.perlu(60);
  const tb = 48;
  pen.kotak(M + 60, pen.y - tb, LEBAR - 120, tb, { isi: c.muda, garis: c.teal, tebal: 1.2 });
  pen.teksTengah(tingkat.nama.toUpperCase(), A4[0] / 2, pen.y - 25, 20, f.bold, tingkat.kode ? c.teal : c.abu);
  pen.teksTengah('Kelompok keterampilan yang dikuasai: ' + (tingkat.kompeten.length ? tingkat.kompeten.map((k) => 'KD ' + ['', 'I', 'II', 'III', 'IV', 'V'][k]).join(', ') : '-'), A4[0] / 2, pen.y - 39, 8, f.reg, c.ink);
  pen.y -= tb + 12;

  // ringkasan per KD
  const W = [300, 70, LEBAR - 370];
  const X = [M, M + W[0], M + W[0] + W[1]];
  const hk = 15.5;
  pen.perlu(hk * 7);
  ['Kelompok keterampilan', 'TKK', 'Status'].forEach((t, i) => {
    pen.kotak(X[i], pen.y - hk, W[i], hk, { isi: c.teal, garis: c.teal });
    pen.text(t, X[i] + 6, pen.y - 11, 8.5, f.bold, c.putih);
  });
  pen.y -= hk;
  const kdList = [...new Set(baris.map((b) => b.point.kd))];
  for (const kd of kdList) {
    const bs = baris.filter((b) => b.point.kd === kd);
    const st = stKd.get(kd);
    const judul = `${bs[0].point.kdKode}. ${bs[0].point.kdJudul}` + (kd === 2 || kd === 5 ? ' (wajib Purwa)' : '');
    W.forEach((w, i) => pen.kotak(X[i], pen.y - hk, w, hk));
    pen.text(judul, X[0] + 6, pen.y - 11, 8.5, f.reg, c.ink);
    pen.text(`${bs.filter((b) => b.sesi && b.sesi.hasil.lengkap && b.sesi.hasil.lulus).length} / ${bs.length}`, X[1] + 6, pen.y - 11, 8.5, f.bold, c.ink);
    pen.text(st.label === 'KOMPETEN' ? 'Dikuasai' : 'Belum dikuasai', X[2] + 6, pen.y - 11, 8.5, f.bold, st.label === 'KOMPETEN' ? c.teal : c.abu);
    pen.y -= hk;
  }
  pen.y -= 10;

  // daftar TKK
  pen.perlu(40);
  pen.text('Daftar Tanda Kecakapan Kader (TKK) yang diperoleh', M, pen.y - 8, 9.5, f.bold, c.ink);
  pen.y -= 15;
  for (const b of tkk) {
    const ket = `${persen(b.sesi.hasil.pct)} · ${tanggalIndo(b.sesi.ref.tanggal)}`;
    const lebarKet = f.reg.widthOfTextAtSize(san(ket), 8);
    const ls = pen.bungkus(`${b.point.id}  ${b.point.judul}`, LEBAR - lebarKet - 30, 8);
    const hh = ls.length * 9.2 + 1.2;
    pen.perlu(hh);
    pen.centang(M + 5, pen.y - 5, c.teal);
    ls.forEach((l, i) => pen.text(l, M + 14, pen.y - 8 - i * 9.2, 8, f.reg, c.ink));
    pen.teksKanan(ket, A4[0] - M, pen.y - 8, 7.5, f.reg, c.abu);
    pen.y -= hh;
  }
  pen.y -= 6;
  paragraf('Purwa = KD V dan KD II + 1 KD pilihan; Madya = 4 KD; Utama = 5 KD; KD dikuasai bila semua keterampilannya lulus (nilai gabungan dua penilai >= 80%). Buku Panduan Keterampilan Dasar Kader Bidang Kesehatan, Kemenkes RI 2024. Dapat digunakan sebagai lampiran pengajuan sertifikat dan pin tingkatan kader.', 7.2, f.miring, c.abu, 9);

  // tanda tangan
  pen.perlu(84);
  const kiri = M + 20;
  const kanan = A4[0] / 2 + 30;
  const y0 = pen.y - 6;
  pen.text(`............................., ${tanggalIndo(new Date().toISOString())}`, kanan, y0, 9, f.reg, c.ink);
  pen.text('Penilai,', kiri, y0 - 13, 9, f.reg, c.ink);
  pen.text('Mengetahui,', kanan, y0 - 13, 9, f.reg, c.ink);
  pen.text('Kepala Puskesmas ......................................', kanan, y0 - 25, 9, f.reg, c.ink);
  pen.text('(.............................................)', kiri, y0 - 68, 9, f.reg, c.ink);
  pen.text('(.............................................)', kanan, y0 - 68, 9, f.reg, c.ink);
  pen.text('NIP. ..........................................', kanan, y0 - 79, 8.5, f.reg, c.ink);
  pen.y = y0 - 84;
  return finalisasi(pen, doc, 'Surat keterangan tingkatan kader');
}

export async function unduhPdf(bytes, nama) {
  unduh(nama + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
}

export const namaFilePoint = (point, kader, sessionId) => `Asesmen_${slug(kader.nama)}_${point.kdKode.replace(' ', '')}-P${point.no}_${sessionId}`;
export const namaFileRekap = (kader) => `Rekap_Asesmen_${slug(kader.nama)}`;
export const namaFileSurat = (kader) => `Surat_Keterangan_Tingkatan_${slug(kader.nama)}`;
