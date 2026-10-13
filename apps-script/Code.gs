/**
 * e-Asesmen Kompetensi Kader - penerima data Google Sheets
 *
 * Cara pasang (sekali saja):
 * 1. Buat Google Sheets baru, lalu menu Extensions > Apps Script.
 * 2. Hapus isi Code.gs bawaan, tempel seluruh isi berkas ini, simpan.
 * 3. Project Settings (ikon roda gigi) > Script properties > Add script property:
 *      Property: KUNCI    Value: kata sandi bebas (mis. 16 huruf/angka acak)
 * 4. Deploy > New deployment > jenis "Web app"
 *      Execute as: Me
 *      Who has access: Anyone
 *    Salin URL yang berakhiran /exec.
 * 5. Di aplikasi: Setelan > isi "Alamat Web App" dengan URL itu dan "Kunci rahasia" dengan kata sandi yang sama,
 *    Simpan, lalu "Bagikan tautan setelan" ke HP penilai lain lewat WhatsApp.
 *
 * Panduan lengkap: docs/PANDUAN-GOOGLE-SHEETS.md
 *
 * Setiap kali kode ini diubah, buat "New deployment" lagi (atau Manage deployments > Edit > New version).
 *
 * Sheet yang dibuat otomatis:
 *   Data_Penilaian : satu baris per penilai per point (data mentah)
 *   Hasil_Final    : satu baris per sesi dan point, nilai gabungan dua penilai
 *   Rekap_Kader    : status terbaru tiap kader pada setiap point
 */

var LULUS = 80; // persen
var KATEGORI_ANTROPOMETRI = [[41, 'Kurang'], [55, 'Cukup'], [62, 'Baik'], [999, 'Sangat Baik']]; // KD II Point 3

var HEAD_DATA = ['key', 'kode_sesi', 'point_id', 'point_judul', 'peran', 'percobaan', 'tanggal', 'kader_nama', 'kader_desa', 'kader_posyandu',
  'penilai_nama', 'penilai_institusi', 'jumlah_butir', 'skor', 'status', 'jawaban_json', 'diubah_ms', 'diterima'];
var HEAD_FINAL = ['kode_sesi', 'point_id', 'point_judul', 'percobaan', 'tanggal', 'kader_nama', 'kader_desa', 'kader_posyandu',
  'penilai_1', 'institusi_1', 'penilai_2', 'institusi_2', 'jumlah_butir', 'skor_1', 'skor_2', 'pembagi', 'nilai_persen', 'status', 'kategori', 'diperbarui'];
var POINT_IDS = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.1', '3.2', '3.3',
  '4.1', '4.2', '4.3', '4.4', '4.5', '5.1', '5.2', '5.3', '5.4'];

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function kunci_() { return String(PropertiesService.getScriptProperties().getProperty('KUNCI') || ''); }
function benar_(k) { var s = kunci_(); return s !== '' && String(k || '') === s; }

function sheet_(nama, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#0b6b66').setFontColor('#ffffff');
  }
  return sh;
}

/** Teks yang diawali = + - @ diberi tanda kutip agar tidak dibaca sebagai rumus. */
function aman_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function skor_(answers) {
  var s = 0;
  for (var i = 0; i < (answers || []).length; i++) if (answers[i] === 1) s++;
  return s;
}

function lengkapSelesai_(row) {
  // row: baris Data_Penilaian. Lengkap bila status selesai dan semua butir terisi (0/1).
  if (!row || String(row[14]) !== 'selesai') return false;
  var a = [];
  try { a = JSON.parse(row[15] || '[]'); } catch (e) { return false; }
  var n = Number(row[12]);
  if (a.length !== n) return false;
  for (var i = 0; i < n; i++) if (a[i] !== 0 && a[i] !== 1) return false;
  return true;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!benar_(p.key)) return out_({ ok: false, error: 'Kunci salah atau belum diatur di Script properties' });
  if (p.action === 'ping') return out_({ ok: true, nama: SpreadsheetApp.getActiveSpreadsheet().getName() });
  if (p.action === 'session') {
    var v = sheet_('Data_Penilaian', HEAD_DATA).getDataRange().getValues(), recs = [];
    for (var i = 1; i < v.length; i++) {
      if (String(v[i][1]) !== String(p.id)) continue;
      var ans = [];
      try { ans = JSON.parse(v[i][15] || '[]'); } catch (err) { ans = []; }
      recs.push({
        key: String(v[i][0]), sessionId: String(v[i][1]), pointId: String(v[i][2]), pointJudul: String(v[i][3]),
        role: Number(v[i][4]), attempt: Number(v[i][5]), tanggal: String(v[i][6]),
        kader: { nama: String(v[i][7]), desa: String(v[i][8]), posyandu: String(v[i][9]) },
        penilai: { nama: String(v[i][10]), institusi: String(v[i][11]) },
        nItems: Number(v[i][12]), answers: ans, status: String(v[i][14]), updatedAt: Number(v[i][16])
      });
    }
    return out_({ ok: true, records: recs });
  }
  return out_({ ok: false, error: 'Aksi tidak dikenal' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return out_({ ok: false, error: 'Server sedang sibuk, coba lagi' });
  try {
    var b = JSON.parse(e.postData.contents);
    if (!benar_(b.key)) return out_({ ok: false, error: 'Kunci salah atau belum diatur di Script properties' });
    if (b.action !== 'upsert' || !b.record) return out_({ ok: false, error: 'Aksi tidak dikenal' });
    var r = b.record;
    if (!r.key || !r.sessionId || !r.pointId || (r.role !== 1 && r.role !== 2) || !r.kader || !r.penilai || !Array.isArray(r.answers)) {
      return out_({ ok: false, error: 'Data tidak lengkap' });
    }
    var sh = sheet_('Data_Penilaian', HEAD_DATA), v = sh.getDataRange().getValues(), baris = 0;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === String(r.key)) { baris = i + 1; break; }
    // jangan timpa data yang lebih baru (pengiriman ulang yang datang terlambat)
    if (baris && Number(v[baris - 1][16]) > Number(r.updatedAt || 0)) return out_({ ok: true, dilewati: true });
    var row = [r.key, r.sessionId, r.pointId, aman_(r.pointJudul || ''), r.role, r.attempt || 1, r.tanggal || '',
      aman_(r.kader.nama || ''), aman_(r.kader.desa || ''), aman_(r.kader.posyandu || ''),
      aman_(r.penilai.nama || ''), aman_(r.penilai.institusi || ''), Number(r.nItems) || r.answers.length, skor_(r.answers),
      r.status || 'draft', JSON.stringify(r.answers), Number(r.updatedAt) || Date.now(), new Date()];
    if (baris) sh.getRange(baris, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
    hitungFinal_(r.sessionId, r.pointId);
    rekap_();
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Gabungkan nilai Penilai 1 dan 2 untuk satu sesi dan point menjadi satu baris di Hasil_Final. */
function hitungFinal_(kode, pointId) {
  var data = sheet_('Data_Penilaian', HEAD_DATA).getDataRange().getValues(), a = null, c = null;
  for (var j = 1; j < data.length; j++) {
    if (String(data[j][1]) !== String(kode) || String(data[j][2]) !== String(pointId)) continue;
    if (Number(data[j][4]) === 1) a = data[j]; else if (Number(data[j][4]) === 2) c = data[j];
  }
  var ref = a || c;
  if (!ref) return;
  var n = Number(ref[12]), s1 = a ? Number(a[13]) : '', s2 = c ? Number(c[13]) : '';
  var lengkap = lengkapSelesai_(a) && lengkapSelesai_(c);
  var jumlah = (a ? s1 : 0) + (c ? s2 : 0), pembagi = n * 2;
  var persen = Math.floor(jumlah / pembagi * 1000 + 1e-9) / 10; // dipotong 1 desimal, sama dengan aplikasi (79,96 tidak jadi 80,0)
  var status = !lengkap ? 'MENUNGGU' : (jumlah * 100 >= LULUS * pembagi ? 'LULUS' : 'TIDAK LULUS');
  var kategori = '';
  if (lengkap && String(pointId) === '2.3') {
    var rata = jumlah / 2;
    for (var k = 0; k < KATEGORI_ANTROPOMETRI.length; k++) if (rata < KATEGORI_ANTROPOMETRI[k][0]) { kategori = KATEGORI_ANTROPOMETRI[k][1]; break; }
  }
  var rowF = [ref[1], ref[2], ref[3], ref[5], ref[6], ref[7], ref[8], ref[9],
    a ? a[10] : '', a ? a[11] : '', c ? c[10] : '', c ? c[11] : '', n, s1, s2, pembagi, persen, status, kategori, new Date()];
  var fin = sheet_('Hasil_Final', HEAD_FINAL), fv = fin.getDataRange().getValues(), baris = 0;
  for (var i = 1; i < fv.length; i++) if (String(fv[i][0]) === String(kode) && String(fv[i][1]) === String(pointId)) { baris = i + 1; break; }
  if (baris) fin.getRange(baris, 1, 1, rowF.length).setValues([rowF]); else fin.appendRow(rowF);
}

/** Rekap_Kader: untuk setiap kader, hasil terbaru (percobaan tertinggi) pada tiap point. */
function rekap_() {
  var fv = sheet_('Hasil_Final', HEAD_FINAL).getDataRange().getValues(), terbaru = {}, kader = {};
  for (var i = 1; i < fv.length; i++) {
    var kk = [fv[i][5], fv[i][6], fv[i][7]].join('|').toLowerCase().replace(/\s+/g, ' ');
    var key = kk + '#' + fv[i][1], pc = Number(fv[i][3]) || 1, t = new Date(fv[i][19]).getTime();
    var L = terbaru[key];
    if (!L || pc > L.pc || (pc === L.pc && t >= L.t)) terbaru[key] = { pc: pc, t: t, persen: fv[i][16], status: fv[i][17] };
    kader[kk] = [fv[i][5], fv[i][6], fv[i][7]];
  }
  var head = ['kader', 'desa', 'posyandu'].concat(POINT_IDS, ['point_lulus', 'point_dinilai']);
  var rows = [head];
  Object.keys(kader).forEach(function (kk) {
    var row = kader[kk].slice(), lulus = 0, dinilai = 0;
    POINT_IDS.forEach(function (pid) {
      var L = terbaru[kk + '#' + pid];
      if (!L) { row.push(''); return; }
      dinilai++;
      if (L.status === 'LULUS') lulus++;
      row.push(L.persen + '% ' + L.status);
    });
    row.push(lulus, dinilai);
    rows.push(row);
  });
  // ditulis sekaligus (bukan baris per baris) agar tetap cepat saat kader sudah banyak
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Rekap_Kader') || ss.insertSheet('Rekap_Kader');
  sh.clear();
  sh.getRange(1, 1, rows.length, head.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#0b6b66').setFontColor('#ffffff');
}
