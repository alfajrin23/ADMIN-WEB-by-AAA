# Administrasi Web Proyek (Next.js + Supabase)

Aplikasi administrasi proyek untuk:
- Rekap pengeluaran biaya per project
- Absensi + gaji harian tukang per project
- Rekap gaji pekerja berdasarkan jumlah hari kerja
- Rekap total gaji yang harus dibayar
- Download rekap gaji ke PDF

## Sumber Data

Default aplikasi sekarang menggunakan **Supabase** agar aman untuk deployment Vercel.

Didukung juga mode **Excel** (`.xlsx`) dan **Firebase (Firestore)**.

## Setup Cepat (Mode Supabase - Rekomendasi)

1. Install dependency:

```bash
npm install
```

2. Copy env:

```bash
cp .env.example .env.local
```

3. Isi `.env.local`:

```bash
DATA_SOURCE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. Jalankan SQL schema di Supabase SQL Editor:

`supabase/schema.sql`

5. Jalankan local:

```bash
npm run dev
```

Catatan:
- Kategori biaya sekarang dinamis. User bisa menambah kategori dari form project/biaya dan otomatis tersimpan ke tabel `expense_categories`.
- Export PDF/Excel rekap biaya otomatis mengikuti kategori terbaru tersebut.

## Setup Excel (Opsional)

Jika ingin memakai file Excel lokal:

```bash
DATA_SOURCE=excel
EXCEL_DB_PATH=D:\\Google Drive\\admin-web\\admin-web.xlsx
EXCEL_TEMPLATE_PATH=D:\\ADMINISTRASI WEB\\admin-web\\data\\admin-web-template.xlsx
```

## Setup Firebase (Firestore)

Gunakan salah satu cara credential di `.env.local`:

```bash
DATA_SOURCE=firebase
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-firebase-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n\"
FIREBASE_DATABASE_ID=(default)
```

Atau memakai file service account:

```bash
DATA_SOURCE=firebase
FIREBASE_DATABASE_ID=(default)
FIREBASE_SERVICE_ACCOUNT_PATH=C:\\path\\to\\service-account.json
```

Jika muncul error `5 NOT_FOUND`, biasanya database Firestore belum dibuat atau `FIREBASE_DATABASE_ID` tidak sesuai.

Inisialisasi database Firestore via script:

```bash
npm run firebase:init -- --location=asia-southeast1
```

Catatan:
- `--location` wajib saat database belum ada (irreversible setelah dibuat).
- Untuk cek saja tanpa create: jalankan `npm run firebase:init` (tanpa `--location`).

## Migrasi ke Firebase (Firestore)

1. Install dependency terbaru:

```bash
npm install
```

2. Isi env Firebase (service account) di `.env.local`:

```bash
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-firebase-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=\"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n\"
```

3. Jalankan migrasi dari Excel aktif:

```bash
npm run migrate:firebase
```

4. Opsi tambahan:

```bash
# pakai file sumber khusus
npm run migrate:firebase -- --source=\"D:\\Google Drive\\admin-web\\admin-web.xlsx\"

# hapus isi koleksi dulu sebelum tulis ulang
npm run migrate:firebase -- --clear
```

Script akan membuat/memperbarui koleksi:
- `projects`
- `project_expenses`
- `attendance_records`
- `payroll_resets`

Setelah migrasi selesai, aktifkan Firebase:

```bash
DATA_SOURCE=firebase
```

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
