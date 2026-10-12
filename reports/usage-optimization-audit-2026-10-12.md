# Audit dan optimasi pemakaian Supabase/Vercel

Tanggal audit: 12 Oktober 2026

## Temuan yang terukur

- Tangkapan layar Supabase menunjukkan PostgREST egress 0,86 GB dari 5 GB dan puncak 192,568 MB pada 8 Oktober. Cached egress tercatat 0 GB.
- Tangkapan layar Vercel menunjukkan 54 ribu function invocations, 31 ribu CDN requests, Fast Origin Transfer 563,42 MB, Fast Data Transfer 432,98 MB, dan deployment storage 58,19 MB.
- Sumber data Supabase yang dikonfigurasi berisi 166 proyek dan 14.719 baris `project_expenses`. Tabel `attendance_records` berisi 0 baris saat diperiksa.
- Pembacaan audit atas kolom metadata pengeluaran yang dipakai form menghasilkan 5.000.723 byte JSON (sekitar 4,77 MB) untuk 14.719 baris. Query aplikasi memakai halaman 1.000 baris, sehingga satu pembacaan penuh memerlukan 15 permintaan PostgREST.
- Dari baris tersebut, peta saran yang dikirim untuk form hanya sekitar 191.852 byte (0,18 MiB): 5.321 nama pengaju unik dan 7.631 keterangan unik yang tersebar di 165 proyek. Nilai nama/keterangan tidak disalin ke laporan ini.

Pembacaan penuh sebesar 4,77 MB itu dilakukan sekali untuk audit dan ikut menambah egress Supabase sekitar 4,77 MB. Puncak 192,568 MB setara kira-kira 39–40 pembacaan metadata seperti ini. Angka itu membuat jalur form menjadi penyebab yang masuk akal, tetapi tidak membuktikan bahwa seluruh egress berasal dari jalur tersebut.

## Jalur yang boros

Saat modal input biaya dibuka, `getExpenseCreateModalDataAction` meminta saran nama/keterangan dan preset HOK. Sumber Supabase sebelumnya memuat semua metadata 14.719 transaksi. Hasil mentah terlalu besar untuk Next Data Cache 2 MB, jadi hanya dimemoisasi dalam satu permintaan. Peta saran dan preset HOK dihitung ulang saat permintaan form berikutnya; cache preset sebelumnya juga hanya 60 detik dan ikut dibatalkan setiap transaksi berubah.

Untuk Vercel, navigasi dashboard menetapkan `prefetch` aktif untuk lima tautan halaman dinamis. Daftar proyek dan rekap transaksi juga merender tautan ke URL unik per proyek/transaksi. Prefetch yang tidak diklik dapat menjalankan permintaan RSC/server tambahan. Tautan modal memakai navigasi client-side dan tidak memerlukan prefetch halaman.

Audit aset `public/` hanya menemukan SVG kecil dengan jumlah sekitar 4,2 KB; gambar statis bukan sumber utama transfer. Build juga memberi peringatan bahwa akses filesystem dinamis di `attendance-worker-presets.ts`, `excel-db.ts`, dan `firebase.ts` membuat tracing bundle mencakup seluruh proyek. Ini berdampak pada ukuran/deployment, bukan bukti pemakaian egress harian.

## Perubahan

1. Hasil turunan untuk saran pengaju, saran keterangan, dan preset HOK sekarang disusun bersama dan disimpan di Next Data Cache selama enam jam. Cache dibatalkan saat katalog proyek berubah. Riwayat transaksi dan laporan keuangan tetap menggunakan jalur data aslinya; hanya nilai bantuan form yang boleh tertinggal paling lama enam jam.
2. Prefetch dimatikan untuk tautan navigasi dinamis, tautan modal, serta tautan edit per proyek/transaksi. Saat diklik, tautan tetap melakukan navigasi normal atau membuka modal seperti sebelumnya.

Cache enam jam memberi batas teoritis empat pengisian ulang per hari per lokasi cache jika tidak ada invalidasi atau deployment. Penghematan riil bergantung pada pola akses, lokasi cache, dan perubahan proyek; angka pemakaian Vercel/Supabase setelah deployment tetap perlu dipantau.

## Pemeriksaan

- `npm run build`: berhasil; TypeScript selesai. Build masih menampilkan empat peringatan tracing filesystem dinamis yang disebut di atas.
- Playwright dengan Chromium: halaman login merespons 200, kolom username/password tampil, `/projects` tanpa sesi diarahkan ke login, dan tidak ada uncaught page error.
- Pemeriksaan Playwright belum melewati autentikasi; karena itu halaman dashboard dan cache modal biaya tidak diuji end-to-end melalui browser. Tidak ada kredensial yang dipakai.
- Database hanya dibaca. Tidak ada perubahan data atau schema.

## Audit lanjutan: pencarian rincian semua project

Pemeriksaan baca-saja pada 12 Oktober menemukan 14.720 transaksi. Pencarian layar mengambil satu halaman saja; uji RPC yang diminta 100 baris menerima batas aktif 50 baris dan respons JSON 16.647 byte. Fungsi SQL tetap menghitung total atas seluruh hasil cocok setiap permintaan. Ekspor tanpa filter dapat memerlukan 295 RPC pada batas lama, karena semua baris diambil bertahap dan ringkasan dihitung ulang per halaman.

Optimasi lanjutan menaikkan jeda pencarian menjadi 1 detik dan menyiapkan batch ekspor 500 baris dengan fallback aman ke batas lama. Migration Supabase belum diterapkan karena akses audit tetap baca-saja; sebelum migration diterapkan, jumlah RPC ekspor tetap mengikuti batas lama. Rincian temuan ada di [audit pencarian rincian](usage-detail-search-audit-2026-10-12.md).
