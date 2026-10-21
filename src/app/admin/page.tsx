import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  AdminHeader,
  StatusPill,
  LABEL_BAYAR,
  rupiah,
  waktu,
} from "@/components/admin/ui";

type Order = {
  id: string;
  kode_order: string;
  nama: string;
  total: number;
  status: string;
  status_bayar: string;
  jumlah_halaman: number;
  jumlah_eksemplar: number;
  created_at: string;
};

const PERLU = ["menunggu_verifikasi", "menunggu_pembayaran"];
const DIKERJAKAN = ["diproses", "siap_diambil"];

function BarisOrder({ o }: { o: Order }) {
  return (
    <li>
      <Link
        href={`/admin/order/${o.id}`}
        className="flex flex-col gap-2 border-b border-[#e5e8dc] px-1 py-4 transition-colors hover:bg-[#f1f4ea] focus-visible:outline-2 focus-visible:outline-[#718b5c] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="font-bold">{o.kode_order}</p>
          <p className="truncate text-sm text-[#647367]">
            {o.nama}, {o.jumlah_halaman} halaman x {o.jumlah_eksemplar} eksemplar
          </p>
          <p className="text-xs text-[#718075]">{waktu(o.created_at)}</p>
        </div>
        <div className="flex items-center gap-3 sm:justify-end">
          <StatusPill status={o.status} />
          <span className="text-sm text-[#647367]">
            {LABEL_BAYAR[o.status_bayar] ?? o.status_bayar}
          </span>
          <span className="ml-auto font-bold tabular-nums sm:ml-0 sm:w-28 sm:text-right">
            {rupiah(o.total)}
          </span>
        </div>
      </Link>
    </li>
  );
}

function Kelompok({
  judul,
  kosong,
  daftar,
}: {
  judul: string;
  kosong: string;
  daftar: Order[];
}) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-[#28543b] pb-2">
        <h2 className="text-lg font-black">{judul}</h2>
        <span className="text-sm font-semibold text-[#647367]">
          {daftar.length} order
        </span>
      </div>
      {daftar.length === 0 ? (
        <p className="py-6 text-sm text-[#647367]">{kosong}</p>
      ) : (
        <ul>
          {daftar.map((o) => (
            <BarisOrder key={o.id} o={o} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function DaftarOrder() {
  await requireAdmin();

  const { data, error } = await supabaseAdmin()
    .from("orders")
    .select(
      "id, kode_order, nama, total, status, status_bayar, jumlah_halaman, jumlah_eksemplar, created_at"
    )
    .eq("idempotency_status", "completed")
    .order("created_at", { ascending: false })
    .limit(100);

  const semua = (data ?? []) as Order[];

  // Perlu dicek: verifikasi dulu, lalu yang paling lama menunggu
  const perlu = semua
    .filter((o) => PERLU.includes(o.status))
    .sort(
      (a, b) =>
        PERLU.indexOf(a.status) - PERLU.indexOf(b.status) ||
        a.created_at.localeCompare(b.created_at)
    );
  // Lagi dikerjakan: antrian, yang paling lama di atas
  const dikerjakan = semua.filter((o) => DIKERJAKAN.includes(o.status)).reverse();
  const riwayat = semua.filter(
    (o) => !PERLU.includes(o.status) && !DIKERJAKAN.includes(o.status)
  );

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-black tracking-tight">Order masuk</h1>
        <p className="mt-1 mb-8 text-[#647367]">
          Yang perlu dicek ada di paling atas.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            Order gagal dimuat. Muat ulang halaman.
          </div>
        )}

        <Kelompok
          judul="Perlu dicek"
          kosong="Belum ada order yang perlu dicek."
          daftar={perlu}
        />
        <Kelompok
          judul="Lagi dikerjakan"
          kosong="Belum ada order yang lagi dikerjakan."
          daftar={dikerjakan}
        />

        {riwayat.length > 0 && (
          <details className="mt-10">
            <summary className="cursor-pointer border-b-2 border-[#cbd8c0] pb-2 text-lg font-black focus-visible:outline-2 focus-visible:outline-[#718b5c]">
              Riwayat{" "}
              <span className="text-sm font-semibold text-[#647367]">
                {riwayat.length} order
              </span>
            </summary>
            <ul>
              {riwayat.map((o) => (
                <BarisOrder key={o.id} o={o} />
              ))}
            </ul>
          </details>
        )}
      </main>
    </>
  );
}

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#f8f7ef] text-[#20382c]">
      <Suspense fallback={<p className="p-6 text-[#647367]">Memuat...</p>}>
        <DaftarOrder />
      </Suspense>
    </div>
  );
}