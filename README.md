# Administrasi Web Proyek (Next.js + Excel Drive)

Aplikasi administrasi proyek untuk:
- Rekap pengeluaran biaya per project
- Absensi + gaji harian tukang per project
- Rekap gaji pekerja berdasarkan jumlah hari kerja
- Rekap total gaji yang harus dibayar
- Download rekap gaji ke PDF

## Sumber Data

Default aplikasi sekarang menggunakan **Excel** (`.xlsx`), cocok untuk file yang disimpan di Drive.

Didukung juga mode **Supabase** (opsional) jika diperlukan.

## Setup Cepat (Mode Excel)

1. Install dependency:

```bash
npm install
```

2. Copy env:

```bash
cp .env.example .env.local
```

3. Isi `.env.local` (contoh):

```bash
DATA_SOURCE=excel
EXCEL_DB_PATH=D:\\Google Drive\\admin-web\\admin-web.xlsx
EXCEL_TEMPLATE_PATH=D:\\ADMINISTRASI WEB\\admin-web\\data\\admin-web-template.xlsx
```

4. Jalankan local:

```bash
npm run dev
```

Catatan:
- Jika file Excel belum ada, aplikasi otomatis membuat file baru dengan sheet:
  - `projects`
  - `project_expenses`
  - `attendance_records`
- Anda bisa salin file template Excel ke `data/admin-web-template.xlsx`, lalu klik tombol
  **Import dari Excel Template** di halaman `/projects` untuk membuat database awal
  (project + biaya) dari format file tersebut.

## Setup Supabase (Opsional)

Jika ingin kembali ke Supabase:

```bash
DATA_SOURCE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Lalu jalankan SQL schema pada:

`supabase/schema.sql`

## Halaman

- `/` : Ringkasan proyek dan biaya.
- `/projects` : Manajemen project dengan mode tampilan terpisah (`Daftar Project` / `Rekap Biaya`), pencarian realtime, import template, dan export PDF semua / project terpilih.
- `/projects/new` : Window terpisah untuk buat project baru.
- `/projects/expenses/new` : Window terpisah untuk input biaya (pilih project).
- `/projects/expenses/edit?id=...` : Edit / hapus baris biaya rekap.
- `/attendance` : Absensi, input hari kerja, gaji harian, kasbon, serta rekap pekerja (gabung / pisah per project).
- `/api/reports/wages?from=YYYY-MM-DD&to=YYYY-MM-DD` : Download PDF rekap gaji.
- `/api/reports/expenses/all` : Download PDF total biaya lintas project.
  - Gunakan `?project=<id>&project=<id2>` untuk PDF project terpilih.
