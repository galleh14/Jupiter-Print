import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logout } from "./login/actions";


const rupiah = (n: number) => "Rp" + new Intl.NumberFormat("id-ID").format(n);

export const LABEL_STATUS: Record<string, string> = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  menunggu_verifikasi: "Menunggu Verifikasi",
  diproses: "Diproses",
  siap_diambil: "Siap Diambil/Dikirim",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
  kedaluwarsa: "Kedaluwarsa",
};

export default async function AdminPage() {
  await requireAdmin();

  const { data: orders, error } = await supabaseAdmin()
    .from("orders")
    .select("id, kode_order, nama, total, status, status_bayar, jumlah_halaman, created_at")
    .eq("idempotency_status", "completed")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Order</h1>
        <form action={logout}>
          <button className="text-sm underline">Keluar</button>
        </form>
      </div>

      {error && <p className="text-red-500">Gagal memuat order.</p>}
      {orders?.length === 0 && <p className="opacity-70">Belum ada order.</p>}

      <ul className="space-y-2">
        {orders?.map((o) => (
          <li key={o.id}>
            <Link
              href={`/admin/order/${o.id}`}
              className="block rounded-xl border border-gray-400 p-4 hover:bg-gray-500/10"
            >
              <div className="flex justify-between gap-2">
                <b>{o.kode_order}</b>
                <span className="font-semibold">{rupiah(o.total)}</span>
              </div>
              <div className="mt-1 text-sm">
                {o.nama} · {o.jumlah_halaman} hlm
              </div>
              <div className="mt-1 text-xs opacity-70">
                {LABEL_STATUS[o.status] ?? o.status} · bayar: {o.status_bayar} ·{" "}
                {new Date(o.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}