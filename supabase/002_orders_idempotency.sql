-- Migrasi 002: kolom tambahan di tabel orders
-- (jumlah halaman dari server + anti klik dobel). Aman dijalankan ulang.

alter table public.orders
  add column if not exists jumlah_halaman integer not null default 1,
  add column if not exists idempotency_key text,
  add column if not exists idempotency_status text not null default 'processing';

create unique index if not exists orders_idempotency_key_unique
  on public.orders (idempotency_key)
  where idempotency_key is not null;