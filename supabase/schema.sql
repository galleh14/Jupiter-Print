create extension if not exists "pgcrypto";

create table public.price_settings (
  id uuid primary key default gen_random_uuid(),
  harga_cetak integer not null check (harga_cetak >= 0),
  harga_klip integer not null check (harga_klip >= 0),
  harga_konsul integer not null check (harga_konsul >= 0),
  berlaku_sejak timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.price_settings is 'Riwayat harga layanan cetak Jupiter Print dalam rupiah.';

create function public.prevent_price_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Riwayat harga hanya dapat ditambah, bukan diubah atau dihapus';
end;
$$;

create trigger price_settings_append_only
before update or delete on public.price_settings
for each row execute function public.prevent_price_history_mutation();

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  jumlah_eksemplar_default integer not null check (jumlah_eksemplar_default > 0),
  pakai_klip_default boolean not null default false,
  jumlah_lembar_konsul_default integer not null default 0 check (jumlah_lembar_konsul_default >= 0),
  catatan text,
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.packages is 'Paket cetak siap pakai beserta isian defaultnya.';

create table public.shop_settings (
  id uuid primary key default gen_random_uuid(),
  nama_toko text not null,
  nomor_whatsapp text not null,
  alamat text,
  kapasitas_cetak_per_jam integer not null default 50 check (kapasitas_cetak_per_jam > 0),
  jam_buka time not null default '08:00',
  jam_tutup time not null default '20:00',
  hari_libur jsonb not null default '[]'::jsonb,
  kebijakan text,
  template_pesan jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shop_settings is 'Pengaturan toko, operasional, kebijakan, dan template pesan.';

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  kode_order text not null unique,
  nama_pelanggan text not null,
  nomor_whatsapp text not null,
  package_id uuid references public.packages(id) on delete set null,
  jumlah_eksemplar integer not null check (jumlah_eksemplar > 0),
  pakai_klip boolean not null default false,
  jumlah_lembar_konsul integer not null default 0 check (jumlah_lembar_konsul >= 0),
  metode_penerimaan text not null default 'ambil_di_toko'
    check (metode_penerimaan in ('ambil_di_toko', 'dikirim')),
  alamat_pengiriman text,
  harga_cetak integer not null check (harga_cetak >= 0),
  harga_klip integer not null check (harga_klip >= 0),
  harga_konsul integer not null check (harga_konsul >= 0),
  total integer not null check (total >= 0),
  status text not null default 'menunggu_pembayaran'
    check (status in (
      'menunggu_pembayaran',
      'menunggu_verifikasi',
      'diproses',
      'siap_diambil',
      'selesai',
      'dibatalkan',
      'kedaluwarsa'
    )),
  status_bayar text not null default 'belum'
    check (status_bayar in ('belum', 'DP', 'lunas')),
  estimasi_selesai timestamptz,
  catatan_pelanggan text,
  catatan_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.orders is 'Order cetak beserta opsi, snapshot harga, total, dan statusnya.';

create table public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  nama_asli text not null,
  path_storage text not null unique,
  mime_type text,
  ukuran_bytes bigint not null check (ukuran_bytes > 0 and ukuran_bytes <= 52428800),
  halaman_sistem integer check (halaman_sistem is null or halaman_sistem > 0),
  halaman_koreksi integer check (halaman_koreksi is null or halaman_koreksi > 0),
  ukuran_kertas text not null default 'A4',
  peringatan jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.order_files is 'Metadata file order dan hasil pembacaan jumlah halaman.';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  nominal integer not null check (nominal > 0),
  kode_unik integer not null check (kode_unik between 0 and 999),
  bukti_bayar_path text,
  status_verifikasi text not null default 'menunggu'
    check (status_verifikasi in ('menunggu', 'diterima', 'ditolak', 'kurang_bayar')),
  alasan_penolakan text,
  diverifikasi_oleh uuid references auth.users(id) on delete set null,
  diverifikasi_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payments is 'Catatan pembayaran, bukti transfer, dan hasil verifikasi admin.';

create table public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status_lama text,
  status_baru text not null,
  dilakukan_oleh uuid references auth.users(id) on delete set null,
  catatan text,
  created_at timestamptz not null default now()
);

comment on table public.order_status_logs is 'Riwayat perubahan status order dan catatan pelakunya.';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  jenis text not null,
  kanal text not null check (kanal in ('whatsapp', 'email', 'halaman')),
  status_pengiriman text not null default 'menunggu'
    check (status_pengiriman in ('menunggu', 'terkirim', 'gagal')),
  isi_pesan text,
  terkirim_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'Notifikasi order dan status pengirimannya kepada pelanggan atau admin.';

alter table public.price_settings enable row level security;
alter table public.packages enable row level security;
alter table public.shop_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_files enable row level security;
alter table public.payments enable row level security;
alter table public.order_status_logs enable row level security;
alter table public.notifications enable row level security;

create policy "Publik dapat melihat riwayat harga"
  on public.price_settings for select
  to anon
  using (true);

create policy "Publik dapat melihat paket aktif"
  on public.packages for select
  to anon
  using (aktif = true);

create policy "Publik dapat melihat pengaturan toko"
  on public.shop_settings for select
  to anon
  using (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('order-files', 'order-files', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

insert into public.price_settings (harga_cetak, harga_klip, harga_konsul, berlaku_sejak)
values (350, 750, 350, now());

insert into public.packages (
  nama,
  jumlah_eksemplar_default,
  pakai_klip_default,
  jumlah_lembar_konsul_default,
  catatan
)
values
  ('Cetak Biasa', 1, false, 0, 'Tugas, makalah, modul'),
  ('Bimbingan', 1, true, 1, 'Draf skripsi atau proposal untuk dosen pembimbing'),
  ('Laporan PKL / Praktikum', 2, true, 1, 'Laporan untuk instansi dan dosen'),
  ('Ujian / Sidang', 1, true, 0, 'Jumlah eksemplar dapat diubah sesuai kebutuhan');

insert into public.shop_settings (
  nama_toko,
  nomor_whatsapp,
  alamat,
  kapasitas_cetak_per_jam,
  jam_buka,
  jam_tutup,
  hari_libur,
  kebijakan,
  template_pesan
)
values (
  'Jupiter Print',
  '6281234567890',
  'Contoh alamat Jupiter Print',
  50,
  '08:00',
  '20:00',
  '["Minggu"]'::jsonb,
  'Order yang belum dibayar kedaluwarsa setelah 24 jam.',
  '{}'::jsonb
);
