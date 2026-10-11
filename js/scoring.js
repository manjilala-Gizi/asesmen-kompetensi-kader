// Aturan penilaian: nilai 1 (Sesuai) / 0 (Tidak Sesuai), dua penilai digabung,
// nilai final = (jumlah nilai penilai 1 + 2) / (jumlah butir x 2) x 100, lulus bila >= 80%.

import { TILIK, META } from './data/tilik.js';

export const AMBANG = META.ambang; // 80

export const semuaPoint = () => TILIK.flatMap((k) => k.points.map((p) => ({ ...p, kdJudul: k.judul, kdKode: k.kode })));
export const cariPoint = (id) => semuaPoint().find((p) => p.id === id);
export const cariKd = (kd) => TILIK.find((k) => k.kd === Number(kd));

export function skorRecord(rec, point) {
  const n = point.items.length;
  const a = rec && rec.answers ? rec.answers : [];
  let skor = 0;
  let terisi = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === 1) skor++;
    if (a[i] === 1 || a[i] === 0) terisi++;
  }
  return { skor, terisi, n, lengkap: terisi === n };
}

// skor per bagian (khusus KD II Point 3)
export function skorBagian(rec, point) {
  if (!point.bagian) return null;
  const a = rec && rec.answers ? rec.answers : [];
  return point.bagian.map((g) => {
    let skor = 0;
    let n = 0;
    point.items.forEach((it, i) => {
      if (it.g === g) {
        n++;
        if (a[i] === 1) skor++;
      }
    });
    return { bagian: g, skor, n };
  });
}

export function kategoriAntropometri(rataRata) {
  for (const k of META.kategori_antropometri) if (rataRata < k.maks) return k.label;
  return META.kategori_antropometri.at(-1).label;
}

// Gabungan dua penilai
export function hitungFinal(point, r1, r2) {
  const n = point.items.length;
  const s1 = skorRecord(r1, point);
  const s2 = skorRecord(r2, point);
  const selesai1 = !!r1 && r1.status === 'selesai' && s1.lengkap;
  const selesai2 = !!r2 && r2.status === 'selesai' && s2.lengkap;
  const lengkap = selesai1 && selesai2;
  const total = s1.skor + s2.skor;
  const maks = n * 2;
  const pct = (total / maks) * 100;
  const ada = (r1 ? 1 : 0) + (r2 ? 1 : 0);
  const pctSem = ada ? (total / (n * ada)) * 100 : 0; // nilai sementara: hanya dari penilai yang sudah ada
  const lulus = total * 100 >= AMBANG * maks;
  const kurang = [];
  for (let i = 0; i < n; i++) {
    const v1 = r1 && r1.answers ? r1.answers[i] : null;
    const v2 = r2 && r2.answers ? r2.answers[i] : null;
    const jumlah = (v1 === 1 ? 1 : 0) + (v2 === 1 ? 1 : 0);
    if (jumlah < 2) kurang.push({ idx: i, p1: v1, p2: v2, jumlah });
  }
  const out = { n, maks, s1, s2, selesai1, selesai2, lengkap, total, pct, pctSem, penilaiAda: ada, lulus, kurang, status: 'menunggu' };
  if (lengkap) out.status = lulus ? 'lulus' : 'tidak';
  if (point.khusus === 'antropometri') {
    const rata = total / 2;
    out.rataRata = rata;
    out.kategori = kategoriAntropometri(rata);
    out.bagian1 = skorBagian(r1, point);
    out.bagian2 = skorBagian(r2, point);
  }
  return out;
}

export const labelStatus = { lulus: 'LULUS', tidak: 'TIDAK LULUS', menunggu: 'MENUNGGU' };

export function ringkasanSesi(point, recs) {
  const r1 = recs.find((r) => r.role === 1);
  const r2 = recs.find((r) => r.role === 2);
  return { r1, r2, hasil: hitungFinal(point, r1, r2) };
}
