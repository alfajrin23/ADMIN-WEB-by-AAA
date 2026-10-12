# Audit pencarian rincian semua project

Tanggal pemeriksaan: 12 Oktober 2026

## Ringkasan

Pencarian layar **tidak mengirim seluruh tabel ke browser**. Jalur Supabase meminta halaman 20 transaksi dan menerima data ringkasan untuk seluruh hasil cocok. Namun, fungsi database tetap menjalankan pencocokan substring dan menghitung jumlah, jumlah project, serta total nominal atas semua hasil cocok pada setiap permintaan.

Ekspor Excel seluruh hasil memang mengambil seluruh baris yang cocok. Sebelum perubahan, ekspor meminta halaman 50 baris. Untuk seluruh 14.720 transaksi yang ada saat pemeriksaan, ekspor tanpa filter dapat memerlukan hingga 295 panggilan RPC; tiap panggilan menghitung ulang ringkasan pencarian.

## Pemeriksaan baca-saja

- Tabel `project_expenses`: 14.720 baris.
- Proyek dengan transaksi pada uji pencarian: 165.
- Uji fungsi `search_expense_details_page` meminta 100 baris tanpa filter; database mengembalikan 50 baris dan melaporkan 14.720 hasil. Ini mengonfirmasi batas 50 baris masih aktif pada fungsi Supabase yang saat itu terpasang.
- Respons JSON uji tersebut berukuran 16.647 byte tanpa kompresi. Ini hanya respons satu halaman, bukan ukuran seluruh hasil.
- Tidak ada isi transaksi, nama orang, URL database, atau kredensial yang disalin ke laporan.

## Jalur yang diperiksa

1. Modal **Cari Rincian Semua Project** memanggil `getExpenseDetailSearchModalDataAction`; halaman biasa meminta 20 baris. Cache hasil di browser mencegah permintaan ulang untuk kombinasi filter dan halaman yang sama selama halaman tetap terbuka.
2. Fungsi SQL `search_expense_details_page` menghitung total data, jumlah project, dan total nominal dari semua baris cocok, meskipun hanya mengembalikan halaman yang diminta. Pencarian tanpa tanggal atau project dapat memeriksa cakupan transaksi yang luas.
3. `/api/expense-details/export` mengambil seluruh hasil dengan memanggil fungsi tersebut untuk setiap halaman 50 baris, lalu mengirim file hasil ke browser. Karena semua baris memang dimasukkan ke Excel, byte data hasil ekspor tetap harus ditransfer; pengulangan pencarian/rekap per halaman yang dapat dikurangi.

Setiap pencarian yang dikirim dari browser memerlukan permintaan server action, sehingga terlalu banyak pencarian saat mengetik dapat menambah invokasi Vercel. Ekspor ditangani satu invokasi route, tetapi responsnya memuat seluruh hasil; transfer Vercel keluar tetap mengikuti ukuran file/JSON hasil.

## Optimasi yang dibuat

- Jeda pencarian otomatis dinaikkan dari 650 ms menjadi 1.000 ms untuk mengurangi permintaan saat pengguna masih mengetik.
- Batas halaman pencarian diperluas menjadi 500 pada aplikasi dan ditambahkan migration `202610120001_optimize_expense_detail_export.sql`. Dengan batas baru, ekspor 14.720 baris membutuhkan sekitar 30 halaman, turun dari 295 (sekitar 90% lebih sedikit panggilan RPC dan penghitungan ulang ringkasan).
- Aplikasi mendeteksi fungsi database lama yang masih membatasi 50 baris, lalu memakai ukuran halaman 50 agar ekspor tetap lengkap dan tidak melewatkan transaksi.
- Permintaan halaman ekspor dibatasi maksimal tiga panggilan paralel pada ukuran 500 baris untuk mengendalikan lonjakan beban database.

Migration belum dijalankan pada database karena pemeriksaan ini menggunakan akses baca saja. Sebelum migration diterapkan, ekspor tetap lengkap, tetapi masih menggunakan batas 50 baris dan belum mendapat pengurangan panggilan tersebut. Setelah diterapkan, 14.720 baris memerlukan sekitar 30 panggilan RPC, dengan maksimal tiga panggilan paralel, bukan 295. Perubahan ini mengurangi jumlah query/pemindaian berulang; tidak menghilangkan transfer seluruh isi ketika pengguna memang mengekspor semua transaksi.

## Batas kesimpulan

Puncak Supabase egress sebelumnya adalah 192,568 MB pada 8 Oktober dan PostgREST egress 0,86 GB pada tangkapan layar. Angka itu tidak memuat rincian egress per endpoint, jadi audit ini tidak dapat menyatakan pencarian rincian sebagai penyebab utama. Pencarian satu halaman memiliki respons kecil dibandingkan pengambilan penuh metadata transaksi yang tercatat pada audit sebelumnya (sekitar 4,77 MB per pengambilan). Ekspor semua hasil tetap berpotensi mengirim beberapa MB per kali, tergantung panjang deskripsi transaksi.
