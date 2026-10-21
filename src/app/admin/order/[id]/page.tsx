import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ubahStatus } from "./actions";


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rupiah = (n: number) => "Rp" + new Intl.NumberFormat("id-ID").format(n);

const LABEL_STATUS: Record<string, string> = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  menunggu_verifikasi: "Menunggu Verifikasi",
  diproses: "Diproses",
  siap_diambil: "Siap Diambil/Dikirim",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
  kedaluwarsa: "Kedaluwarsa",
};

function waLink(noWa: string) {
  const d = noWa.replace(/\D/g, "");
  const intl = d.startsWith("0") ? "62" + d.slice(1) : d.startsWith("62") ? d : "62" + d;
  return `https://wa.me/${intl}`;
}

const waktu = (s: string) =>
  new Date(s).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const db = supabaseAdmin();
  const { data: order } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order) notFound();

  const { data: files } = await db
    .from("order_files")
    .select("id, nama_asli, path_storage, halaman_sistem")
    .eq("order_id", id);

  const { data: logs } = await db
    .from("order_status_logs")
    .select("id, status_lama, status_baru, oleh, waktu, catatan")
    .eq("order_id", id)
    .order("waktu", { ascending: false });

  // Link unduh sementara (5 menit), dibuat di server
  const daftarFile = await Promise.all(
    (files ?? []).map(async (f) => {
      const { data } = await db.storage
        .from("order-files")
        .createSignedUrl(f.path_storage, 300, { download: f.nama_asli });
      return { ...f, url: data?.signedUrl ?? null };
    })
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4">
      <Link href="/admin" className="text-sm underline">
        ← Kembali
      </Link>

      <section className="space-y-1">
        <h1 className="text-2xl font-bold">{order.kode_order}</h1>
        <p>
          {order.nama} ·{" "}
          <a href={waLink(order.no_wa)} target="_blank" rel="noreferrer" className="text-blue-500 underline">
            {order.no_wa}
          </a>
        </p>
        <p className="text-sm opacity-70">{waktu(order.created_at)}</p>
        <p>Paket: {order.paket ?? "-"} · {order.ambil_kirim}</p>
        <p>
          {order.jumlah_halaman} halaman × {order.jumlah_eksemplar} eksemplar · klip:{" "}
          {order.pakai_klip ? "ya" : "tidak"} · lembar konsul: {order.jumlah_lembar_konsul}
        </p>
        <p className="text-xl font-bold">{rupiah(order.total)}</p>
        <p>
          Status: <b>{LABEL_STATUS[order.status] ?? order.status}</b> · bayar: <b>{order.status_bayar}</b>
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">File</h2>
        <ul className="space-y-2">
          {daftarFile.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-400 p-3 text-sm">
              <span className="truncate">
                {f.nama_asli} ({f.halaman_sistem} hlm)
              </span>
              {f.url ? (
                <a href={f.url} className="shrink-0 rounded bg-blue-600 px-3 py-1 text-white">
                  Unduh
                </a>
              ) : (
                <span className="text-red-500">Link gagal</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Ubah status</h2>
        <form action={ubahStatus} className="space-y-3">
          <input type="hidden" name="id" value={order.id} />
          <select
            name="status"
            defaultValue={order.status}
            className="w-full rounded-lg border border-gray-400 bg-transparent p-3"
          >
            {Object.entries(LABEL_STATUS).map(([v, l]) => (
              <option key={v} value={v} className="text-black">
                {l}
              </option>
            ))}
          </select>
          <select
            name="status_bayar"
            defaultValue={order.status_bayar}
            className="w-full rounded-lg border border-gray-400 bg-transparent p-3"
          >
            <option value="belum" className="text-black">Belum bayar</option>
            <option value="dp" className="text-black">DP</option>
            <option value="lunas" className="text-black">Lunas</option>
          </select>
          <input
            name="catatan"
            maxLength={500}
            placeholder="Catatan internal (opsional)"
            className="w-full rounded-lg border border-gray-400 bg-transparent p-3"
          />
          <button className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white">
            Simpan
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Riwayat</h2>
        <ul className="space-y-1 text-sm">
          {logs?.map((l) => (
            <li key={l.id}>
              {waktu(l.waktu)}: {LABEL_STATUS[l.status_baru] ?? l.status_baru} oleh {l.oleh ?? "-"}
              {l.catatan ? ` (${l.catatan})` : ""}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}