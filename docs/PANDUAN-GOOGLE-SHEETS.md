# Panduan menghubungkan Google Sheets

Google Sheets dipakai untuk mengumpulkan nilai dari HP Penilai 1 dan Penilai 2 di satu tempat, dan menggabungkannya menjadi nilai final. Tanpa Google Sheets, aplikasi tetap berjalan dan menyimpan data di perangkat, tetapi nilai gabungan dua perangkat tidak bisa terbentuk.

Pemasangan dilakukan sekali oleh pengelola, sekitar 10 menit.

## A. Pasang penerima data (Apps Script)

1. Buka Google Drive dengan akun institusi, lalu buat **Google Sheets baru**. Beri nama, misalnya `e-Asesmen Kompetensi Kader`.
2. Di spreadsheet itu pilih menu **Ekstensi > Apps Script** (Extensions > Apps Script).
3. Hapus kode bawaan di `Code.gs`, lalu tempel seluruh isi berkas [`apps-script/Code.gs`](../apps-script/Code.gs). Klik **Simpan**.
4. Klik ikon roda gigi **Setelan Proyek** (Project Settings), bagian **Properti skrip** (Script properties), lalu **Tambah properti**:
   - Properti: `KUNCI`
   - Nilai: kata sandi bebas, misalnya 16 huruf dan angka acak. Catat, karena akan dimasukkan ke aplikasi.
5. Klik **Terapkan > Penerapan baru** (Deploy > New deployment), pilih jenis **Aplikasi web** (Web app):
   - Jalankan sebagai: **Saya** (Me)
   - Yang memiliki akses: **Siapa saja** (Anyone)
6. Klik **Terapkan**, setujui izin yang diminta, lalu **salin URL** yang berakhiran `/exec`.

> Bila kode `Code.gs` diubah di kemudian hari, buat **Penerapan baru** lagi (atau Kelola penerapan > Edit > Versi baru) agar perubahan berlaku.

## B. Isi di aplikasi (di setiap HP penilai)

1. Buka aplikasi, menu **Setelan**.
2. **Alamat Web App**: tempel URL `/exec` tadi.
3. **Kunci rahasia**: isi dengan nilai `KUNCI` yang sama.
4. Tekan **Simpan**, lalu **Uji koneksi**. Bila berhasil, indikator di kanan atas berubah dari "Mode lokal" menjadi "Tersinkron".

URL dan kunci disimpan di perangkat masing-masing, tidak ada di repositori GitHub.

## C. Cara kerja sehari-hari

- Penilai mengisi di HP masing-masing. Data tersimpan di HP lebih dulu.
- Saat **Selesai**, data dikirim ke Sheets. Bila tidak ada sinyal, data masuk antrean ("Offline · 1 antre") dan terkirim otomatis begitu ada jaringan. Pengiriman otomatis berjalan saat aplikasi terbuka.
- Di halaman hasil, tombol **Ambil nilai penilai lain** menarik nilai penilai satunya dari Sheets, sehingga nilai final tampil dan PDF final bisa dicetak.

## D. Sheet yang terbentuk otomatis

| Sheet | Isi |
|---|---|
| `Data_Penilaian` | Satu baris per penilai per point (data mentah, termasuk jawaban per butir) |
| `Hasil_Final` | Satu baris per sesi dan point: skor Penilai 1 dan 2, pembagi, nilai %, status (LULUS, TIDAK LULUS, atau MENUNGGU), dan kategori untuk KD II Point 3 |
| `Rekap_Kader` | Per kader: hasil terbaru pada tiap point |

Nilai final = (skor Penilai 1 + skor Penilai 2) ÷ (jumlah butir × 2) × 100%, dipotong ke 1 desimal. Lulus bila minimal 80%.

## E. Keamanan dan data pribadi

- Sheet berisi nama kader, desa, posyandu, dan nama penilai. Atur **Bagikan** pada spreadsheet hanya untuk pengelola.
- Alamat `/exec` bersifat "siapa saja dengan tautan", dan dilindungi oleh kunci rahasia. Jangan menyebarkan URL dan kunci di tempat umum. Bila bocor, ganti nilai `KUNCI` di Properti skrip, lalu perbarui di Setelan setiap HP.
- Sel yang berawalan `=`, `+`, `-`, atau `@` diberi tanda kutip otomatis agar tidak dibaca sebagai rumus.
