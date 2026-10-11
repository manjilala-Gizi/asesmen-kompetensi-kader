# e-Asesmen Kompetensi Kader

Aplikasi web (PWA) untuk menilai kompetensi kader posyandu dengan daftar tilik KD I sampai KD V. Dikembangkan untuk **Poltekkes Kemenkes Makassar**.

- 2 penilai mengisi di perangkat masing-masing, nilai digabung menjadi satu **nilai final**
- 5 kelompok kompetensi, 25 point, 209 butir
- Cetak **PDF** per point dan rekap per kader
- Bisa dipakai **tanpa internet**, data terkirim ke Google Sheets saat jaringan tersedia
- Bisa dipasang di layar utama HP (Android, iPhone, komputer)

## Aturan penilaian

| Hal | Aturan |
|---|---|
| Pengisian | Tiap butir: Sesuai = 1, Tidak Sesuai = 0 |
| Nilai final | (skor Penilai 1 + skor Penilai 2) ÷ (jumlah butir × 2) × 100% |
| Lulus | Nilai final minimal 80% |
| Pembagi | Dihitung otomatis dari jumlah butir, tidak diketik manual |
| Percobaan ulang | Setiap percobaan tersimpan di riwayat |
| KD II Point 3 | 72 butir dalam 6 bagian, ditambah kategori kepatuhan (Kurang, Cukup, Baik, Sangat Baik) dari rata-rata skor kedua penilai |

Perubahan teks butir dibanding dokumen asli (ejaan, penomoran) ada di [`PERUBAHAN-TEKS.md`](PERUBAHAN-TEKS.md).

## Memasang di GitHub Pages

1. Unggah seluruh isi folder ini ke repositori GitHub (cabang `main`).
2. Di repositori: **Settings > Pages > Build and deployment**, Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`. Simpan.
3. Setelah beberapa menit, aplikasi tersedia di `https://<akun>.github.io/<nama-repo>/`.
4. Buka alamat itu di HP, lalu pilih **Pasang di layar utama** (atau menu browser > Tambahkan ke layar utama).

Berkas `.nojekyll` sudah ada, dan semua alamat berkas bersifat relatif sehingga aplikasi berjalan di subfolder GitHub Pages.

**Memperbarui aplikasi:** setelah mengubah berkas, naikkan `VERSI` di `sw.js` (misalnya `v1.0.1` menjadi `v1.0.2`) supaya perangkat mengambil versi baru.

## Menghubungkan Google Sheets

Lihat [`docs/PANDUAN-GOOGLE-SHEETS.md`](docs/PANDUAN-GOOGLE-SHEETS.md). Kode penerima data ada di [`apps-script/Code.gs`](apps-script/Code.gs).

## Alur pemakaian

1. **Penilai 1:** Menilai > isi identitas kader (nama, asal desa, posyandu) dan identitas penilai (nama, asal institusi) > pilih point > isi checklist > Selesai.
2. **Penilai 1** membagikan tautan sesi (WhatsApp atau salin). Tautan berisi data kader, jadi Penilai 2 bisa membukanya tanpa internet.
3. **Penilai 2:** membuka tautan > lengkapi identitas sendiri > isi checklist > Selesai.
4. Setelah kedua data terkirim, tekan **Ambil nilai penilai lain** untuk melihat nilai final, lalu **Cetak PDF**.

## Struktur berkas

```
index.html              halaman utama (satu halaman, rute dengan #)
manifest.webmanifest    pengaturan PWA
sw.js                   service worker (mode offline)
css/styles.css          tampilan
js/app.js               pintu masuk, rute, status sinkron
js/views.js             semua halaman
js/scoring.js           aturan nilai dan penggabungan dua penilai
js/db.js                penyimpanan di perangkat (IndexedDB)
js/sync.js              antrean kirim ke Google Sheets
js/pdf.js               pembuat PDF
js/data/tilik.js        isi 25 daftar tilik (209 butir)
vendor/                 pdf-lib dan font (disertakan agar bisa offline)
apps-script/Code.gs     penerima data Google Sheets
docs/                   panduan
```

Tidak ada proses build. Untuk mencoba di komputer: jalankan server statis di folder ini, misalnya `python3 -m http.server 8000`, lalu buka `http://localhost:8000`. Service worker dan PWA membutuhkan `http://localhost` atau HTTPS, tidak bisa dari `file://`.

## Menambah atau mengubah butir

Edit [`js/data/tilik.js`](js/data/tilik.js). Pembagi dan batas lulus dihitung ulang otomatis. Jika jumlah point berubah, perbarui juga daftar `POINT_IDS` di `apps-script/Code.gs` agar `Rekap_Kader` ikut.

## Catatan

- Data tersimpan di browser perangkat (IndexedDB). Membersihkan data situs akan menghapusnya. Gunakan **Setelan > ekspor** untuk cadangan.
- Pengiriman otomatis ke Google Sheets berjalan saat aplikasi terbuka dan ada jaringan.
