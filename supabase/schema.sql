-- Jupiter Print: skema database Fase 1
-- Semua uang dalam rupiah (integer).

-- Riwayat harga: tiap perubahan harga = baris baru
create table public.price_settings (
  id bigint generated always as identity primary key,
  harga_cetak integer not null check (harga_cetak >= 0),
  harga_klip integer not null check (harga_klip >= 0),
  harga_konsul integer not null check (harga_konsul >= 0),
  berlaku_sejak timestamptz not null default now()
);

-- Paket siap pakai untuk mahasiswa
create table public.packages (
  id bigint generated always as identity primary key,
  nama text not null,
  jumlah_eksemplar_default integer not null default 1,
  pakai_klip_default boolean not null default false,
  lembar_konsul_default integer not null default 0,
  eksemplar_diisi_customer boolean not null default false,
  aktif boolean not null default true,
  urutan integer not null default 0
);

-- Pengaturan toko: kapasitas, jam operasional, kebijakan
create table public.shop_settings (
  id bigint generated always as identity primary key,
  kecepatan_cetak_per_jam integer not null default 200,
  jam_buka time not null default '08:00',
  jam_tutup time not null default '17:00',
  buffer_menit integer not null default 30,
  hari_libur jsonb not null default '[]',
  kebijakan text not null default '',
  template_pesan jsonb not null default '{}'
);

-- Order customer (harga disalin saat order dibuat)
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  kode_order text not null unique,
  nama text not null,
  no_wa text not null,
  paket text,
  jumlah_eksemplar integer not null default 1 check (jumlah_eksemplar >= 1),
  pakai_klip boolean not null default false,
  jumlah_lembar_konsul integer not null default 0 check (jumlah_lembar_konsul >= 0),
  harga_cetak_saat_order integer not null,
  harga_klip_saat_order integer not null,
  harga_konsul_saat_order integer not null,
  total integer not null check (total >= 0),
  status text not null default 'menunggu_pembayaran'
    check (status in ('menunggu_pembayaran','menunggu_verifikasi','diproses',
                      'siap_diambil','selesai','dibatalkan','kedaluwarsa')),
  status_bayar text not null default 'belum'
    check (status_bayar in ('belum','dp','lunas')),
  ambil_kirim text not null default 'ambil',
  estimasi_selesai timestamptz,
  created_at timestamptz not null default now()
);

-- File yang diupload per order
create table public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  nama_asli text not null,
  path_storage text not null,
  halaman_sistem integer,
  halaman_koreksi_admin integer,
  ukuran_kertas text,
  peringatan jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Pembayaran dan bukti bayar
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  nominal integer not null,
  kode_unik integer,
  bukti_bayar_path text,
  status_verifikasi text not null default 'menunggu'
    check (status_verifikasi in ('menunggu','dikonfirmasi','ditolak')),
  admin text,
  waktu timestamptz not null default now()
);

-- Riwayat perubahan status order
create table public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status_lama text,
  status_baru text not null,
  oleh text,
  waktu timestamptz not null default now(),
  catatan text
);

-- Catatan notifikasi ke customer
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  jenis text not null,
  kanal text not null,
  status_kirim text not null default 'terkirim'
    check (status_kirim in ('terkirim','gagal'))
);

-- Index untuk pencarian cepat
create index on public.order_files (order_id);
create index on public.payments (order_id);
create index on public.order_status_logs (order_id);
create index on public.notifications (order_id);

-- RLS: aktif di semua tabel
alter table public.price_settings enable row level security;
alter table public.packages enable row level security;
alter table public.shop_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_files enable row level security;
alter table public.payments enable row level security;
alter table public.order_status_logs enable row level security;
alter table public.notifications enable row level security;

-- Policy publik: hanya baca harga, paket aktif, dan pengaturan toko
create policy "publik baca harga" on public.price_settings
  for select to anon, authenticated using (true);
create policy "publik baca paket aktif" on public.packages
  for select to anon, authenticated using (aktif);
create policy "publik baca pengaturan toko" on public.shop_settings
  for select to anon, authenticated using (true);

-- Storage privat untuk file customer (maks 50 MB)
insert into storage.buckets (id, name, public, file_size_limit)
values ('order-files', 'order-files', false, 52428800)
on conflict (id) do nothing;

-- Data awal
insert into public.price_settings (harga_cetak, harga_klip, harga_konsul)
values (350, 750, 350);

insert into public.packages
  (nama, jumlah_eksemplar_default, pakai_klip_default, lembar_konsul_default,
   eksemplar_diisi_customer, urutan)
values
  ('Cetak Biasa', 1, false, 0, false, 1),
  ('Bimbingan', 1, true, 1, false, 2),
  ('Laporan PKL / Praktikum', 2, true, 1, false, 3),
  ('Ujian / Sidang', 5, true, 0, true, 4);

insert into public.shop_settings (kebijakan)
values ('Revisi file gratis selama status belum Diproses. Pembatalan boleh sebelum Diproses.');