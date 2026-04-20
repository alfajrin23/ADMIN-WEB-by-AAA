-- ============================================================
-- SEED: system_updates table
-- Jalankan script ini di Supabase SQL Editor untuk mengisi
-- data Info Sistem / Notifikasi agar tampil di dropdown notifikasi.
--
-- Buat tabel terlebih dahulu jika belum ada:
-- ============================================================

CREATE TABLE IF NOT EXISTS system_updates (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type        TEXT NOT NULL DEFAULT 'update' CHECK (type IN ('update', 'announcement')),
  version     TEXT NOT NULL,
  features    TEXT[] NOT NULL DEFAULT '{}',
  release_date DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE system_updates ENABLE ROW LEVEL SECURITY;

-- Policy: semua orang bisa baca (untuk notifikasi)
DROP POLICY IF EXISTS "system_updates_read_all" ON system_updates;
CREATE POLICY "system_updates_read_all"
  ON system_updates FOR SELECT
  USING (true);

-- Policy: hanya authenticated yang bisa insert/update/delete
-- (sesuaikan dengan role management aplikasi Anda)
DROP POLICY IF EXISTS "system_updates_write_auth" ON system_updates;
CREATE POLICY "system_updates_write_auth"
  ON system_updates FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- SEED DATA — semua riwayat update aplikasi Admin Web
-- ============================================================

INSERT INTO system_updates (id, type, version, features, release_date, created_at)
VALUES
  (
    'sys-v1-4-0',
    'update',
    'v1.4.0',
    ARRAY[
      'Mode Continue pada Input Biaya: input banyak entry berurutan, tekan Enter/Tambah Entry untuk menumpuk entry, simpan semua ke database sekaligus.',
      'Tombol Hapus per baris di modal Cari Rincian biaya (dengan konfirmasi).',
      'Perbaikan logika Info Sistem: fallback hanya aktif saat error DB, bukan saat data kosong.',
      'Seed SQL untuk tabel system_updates agar data update masuk ke database.',
      'Edit bulan/tahun massal (Bulk Edit Month/Year) pada modal Cari Rincian.'
    ],
    '2026-04-20',
    '2026-04-20T07:00:00.000Z'
  ),
  (
    'sys-v1-3-0',
    'update',
    'v1.3.0',
    ARRAY[
      'Memperbaiki Z-Index Dropdown Notifikasi agar tampil paling depan (tidak tertutup elemen lain).',
      'Menambahkan fitur Sembunyikan/Tampilkan Sidebar Dinamis dengan tombol panah.',
      'Implementasi AI fallback injection pada getSystemUpdates di level server.',
      'Perbaikan fetch notifikasi sistem menggunakan cache React untuk efisiensi.'
    ],
    '2026-04-17',
    '2026-04-17T06:00:00.000Z'
  ),
  (
    'sys-v1-2-0',
    'update',
    'v1.2.0',
    ARRAY[
      'Fitur Dropdown Notifikasi Update bergaya media sosial di sidebar.',
      'Badge unread count dengan animasi pulse.',
      'Debounce 500ms pada semua input pencarian untuk performa optimal.',
      'Modal edit expense tunggal dari halaman Cari Rincian tanpa navigasi keluar.',
      'Perapihan estetika halaman dan arsitektur database Supabase.'
    ],
    '2026-04-16',
    '2026-04-16T06:00:00.000Z'
  ),
  (
    'sys-v1-1-0',
    'update',
    'v1.1.0',
    ARRAY[
      'Sistem roles & permission berbasis matrix (can_view, can_create, can_edit, can_delete, can_import).',
      'Role custom yang dapat dibuat dan dihapus oleh admin.',
      'Rate limiting pada login dan registrasi (mencegah brute force).',
      'Activity log untuk semua aksi penting (create, update, delete, login).',
      'Perbaikan middleware autentikasi dan validasi session.'
    ],
    '2026-04-16',
    '2026-04-16T00:00:00.000Z'
  ),
  (
    'sys-v1-0-0',
    'update',
    'v1.0.0',
    ARRAY[
      'Rilis pertama Admin Web Rekap Proyek.',
      'Manajemen proyek dan input biaya (kategori, nominal, keterangan, vendor).',
      'Absensi harian tukang, laden, dan tim spesialis.',
      'Rekap upah dan payroll per project.',
      'Login, register, dan sistem autentikasi berbasis session cookie.',
      'Dashboard ringkasan dengan chart dan statistik biaya.'
    ],
    '2026-04-02',
    '2026-04-02T00:00:00.000Z'
  )
ON CONFLICT (id) DO UPDATE SET
  type         = EXCLUDED.type,
  version      = EXCLUDED.version,
  features     = EXCLUDED.features,
  release_date = EXCLUDED.release_date,
  updated_at   = NOW();

-- Verifikasi hasil
SELECT id, type, version, release_date, array_length(features, 1) AS feature_count
FROM system_updates
ORDER BY release_date DESC;
