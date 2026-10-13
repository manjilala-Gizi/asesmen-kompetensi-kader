# Panduan menghubungkan Google Sheets

Google Sheets dipakai untuk mengumpulkan nilai dari HP Penilai 1 dan Penilai 2 di satu tempat, lalu menggabungkannya menjadi nilai final. Tanpa Google Sheets aplikasi tetap jalan dan menyimpan data di HP, tetapi nilai gabungan dari dua HP tidak bisa terbentuk.

Pemasangan dilakukan **sekali saja oleh pengelola**, sekitar 10 menit, di komputer.

## Akun yang dipakai

| Bagian | Akun |
|---|---|
| Aplikasi (GitHub Pages) | GitHub **manjilala-Gizi** → https://manjilala-gizi.github.io/asesmen-kompetensi-kader/ |
| Google Sheets + Apps Script | Akun Google institusi, disarankan **manjilala@poltekkes-mks.ac.id** |

Spreadsheet dan Apps Script akan menjadi milik akun Google yang dipakai saat membuatnya, jadi pastikan sudah login dengan akun yang benar (cek foto profil di pojok kanan atas Google Drive).

## A. Pasang penerima data (Apps Script)

1. Buka **drive.google.com** dengan akun di atas, lalu **Baru > Google Spreadsheet**. Beri nama `e-Asesmen Kompetensi Kader`.
2. Di spreadsheet itu pilih menu **Ekstensi > Apps Script**.
3. Hapus kode bawaan di `Code.gs`, lalu tempel **seluruh** isi berkas [`apps-script/Code.gs`](../apps-script/Code.gs). Klik ikon **Simpan** (disket).
4. Di menu kiri, klik ikon roda gigi **Setelan Proyek**. Gulir ke bawah ke **Properti skrip > Tambahkan properti skrip**:
   - Properti: `KUNCI`
   - Nilai: kata sandi bebas, misalnya 16 huruf dan angka acak (contoh pola: `Gz7kQm2Pw9Lx4Ta8`). **Catat**, nanti dimasukkan ke aplikasi.
   - Klik **Simpan properti skrip**.
5. Klik tombol biru **Terapkan > Deployment baru**. Klik ikon roda gigi di sebelah "Pilih jenis", pilih **Aplikasi web**, lalu isi:
   - Deskripsi: `v1`
   - Jalankan sebagai: **Saya** (email Anda)
   - Yang memiliki akses: **Siapa saja**
6. Klik **Terapkan**. Google akan meminta izin:
   - Klik **Izinkan akses**, pilih akun Anda.
   - Bila muncul layar "Google belum memverifikasi aplikasi ini", klik **Lanjutan** lalu **Buka e-Asesmen... (tidak aman)**. Ini wajar karena skripnya buatan sendiri.
   - Klik **Izinkan**.
7. **Salin URL Aplikasi web** yang berakhiran `/exec`.

Cek cepat: tempel URL itu di browser dengan tambahan `?action=ping&key=KUNCI-ANDA` di belakangnya. Bila muncul `{"ok":true,...}`, penerima data sudah siap.

> Bila `Code.gs` diubah di kemudian hari: **Terapkan > Kelola deployment > ikon pensil > Versi: Versi baru > Terapkan**. Dengan cara ini URL `/exec` tetap sama, jadi HP penilai tidak perlu diatur ulang.

## B. Sambungkan aplikasi

**Cara utama (sudah dipakai):** URL `/exec` dan kunci ditulis di [`js/config.js`](../js/config.js). Semua HP yang membuka https://manjilala-gizi.github.io/asesmen-kompetensi-kader/ otomatis tersambung, penilai tidak perlu membuka Setelan. Bila URL atau kunci berganti, ubah `js/config.js` lalu naikkan `VERSI` di `sw.js`.

Catatan: karena repositori GitHub bersifat publik, kunci di `js/config.js` ikut terlihat publik. Data di Sheets tetap tidak bisa didaftar dari luar (untuk membaca satu sesi harus tahu kode sesinya), tetapi orang yang iseng bisa mengirim data palsu. Bila ini menjadi masalah, kosongkan `js/config.js` dan pakai cara alternatif di bawah.

**Cara alternatif (kunci tidak ditaruh di GitHub):**

1. Buka aplikasi di HP, menu **Setelan**.
2. **Alamat Web App**: tempel URL `/exec`. **Kunci rahasia**: isi nilai `KUNCI` yang sama.
3. Tekan **Simpan**, lalu **Uji koneksi**. Bila berhasil muncul "Terhubung ke Google Sheets (e-Asesmen Kompetensi Kader)", dan indikator kanan atas berubah dari "Mode lokal" menjadi "Tersinkron".
4. Tekan **Bagikan tautan setelan ke penilai lain** dan kirim lewat WhatsApp ke **masing-masing** penilai (japri, bukan grup umum, karena tautan berisi kunci).
5. Penilai cukup membuka tautan itu di HP-nya lalu menekan **Simpan**. Selesai.

URL dan kunci hanya tersimpan di HP masing-masing, tidak ada di repositori GitHub.

## C. Cara kerja sehari-hari

- Penilai mengisi di HP masing-masing. Data tersimpan di HP lebih dulu.
- Saat **Selesai**, data dikirim ke Sheets. Bila tidak ada sinyal, data masuk antrean ("Offline · 1 antre") dan terkirim otomatis begitu ada jaringan, selama aplikasi dibuka.
- Di halaman hasil, **Ambil nilai penilai lain** menarik nilai penilai satunya dari Sheets, sehingga nilai final tampil dan PDF final bisa dicetak.

## D. Sheet yang terbentuk otomatis

| Sheet | Isi |
|---|---|
| `Data_Penilaian` | Satu baris per penilai per point (data mentah, termasuk jawaban per butir) |
| `Hasil_Final` | Satu baris per sesi dan point: skor Penilai 1 dan 2, pembagi, nilai %, status (LULUS, TIDAK LULUS, atau MENUNGGU), dan kategori untuk KD II Point 3 |
| `Rekap_Kader` | Per kader: hasil terbaru pada tiap point, jumlah point lulus dan point dinilai |

Nilai final = (skor Penilai 1 + skor Penilai 2) ÷ (jumlah butir × 2) × 100%, dipotong ke 1 desimal. Lulus bila minimal 80%.

## E. Keamanan dan data pribadi

- Sheet berisi nama kader, desa, posyandu, dan nama penilai. Atur **Bagikan** pada spreadsheet hanya untuk pengelola.
- Alamat `/exec` terbuka untuk siapa saja yang tahu, tetapi tidak bisa dipakai tanpa kunci. Jangan sebar URL dan kunci di tempat umum. Bila bocor, ganti nilai `KUNCI` di Properti skrip, lalu bagikan tautan setelan yang baru.
- Isian yang diawali `=`, `+`, `-`, atau `@` otomatis diberi tanda kutip agar tidak terbaca sebagai rumus.

## F. Bila ada masalah

| Pesan | Penyebab dan solusi |
|---|---|
| Kunci salah atau belum diatur | Nilai `KUNCI` di Properti skrip berbeda dengan di Setelan, atau belum dibuat |
| Tidak dapat terhubung | Alamat bukan yang berakhiran `/exec`, "Yang memiliki akses" bukan **Siapa saja**, atau tidak ada jaringan |
| Perubahan Code.gs tidak berlaku | Belum membuat versi baru di **Kelola deployment** |
| Server sedang sibuk | Banyak penilai mengirim bersamaan; data tetap di antrean dan dikirim ulang otomatis |
