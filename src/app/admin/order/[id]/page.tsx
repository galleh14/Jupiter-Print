import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  AdminHeader,
  StatusPill,
  LABEL_BAYAR,
  LABEL_STATUS,
  rupiah,
  waktu,
} from "@/components/admin/ui";
import { ubahStatus } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fokus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#718b5c]";

const kotak =
  "w-full rounded-xl border border-[#dce3d6] bg-white px-4 py-3 text-base text-[#20382c] outline-none focus:border-[#718b5c]";

function waLink(noWa: string) {
  const d = noWa.replace(/\D/g, "");
  const intl = d.startsWith("0") ? "62" + d.slice(1) : d.startsWith("62") ? d : "62" + d;
  return `https://wa.me/${intl}`;
}

function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#e5e8dc] py-3 text-sm">
      <dt className="text-[#647367]">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

function Aksi({
  id,
  status,
  statusBayar,
  label,
  utama,
}: {
  id: string;
  status: string;
  statusBayar: string;
  label: string;
  utama: boolean;
}) {
  return (
    <form action={ubahStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="status_bayar" value={statusBayar} />
      <button
        className={`w-full rounded-full px-6 py-3.5 font-bold ${fokus} ${
          utama
            ? "bg-[#28543b] text-white hover:bg-[#1d402c]"
            : "border border-[#e0b8b0] text-[#7d2f22] hover:bg-[#fbeeeb]"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

async function DetailOrder({ params }: { params: Promise<{ id: string }> }) {
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

  let langkah: { label: string; status: string; bayar: string; petunjuk: string } | null = null;
  if (order.status === "menunggu_pembayaran" || order.status === "menunggu_verifikasi") {
    langkah = {
      label: "Konfirmasi pembayaran",
      status: "diproses",
      bayar: "lunas",
      petunjuk: `Cek mutasi QRIS dulu. Nominal harus tepat ${rupiah(order.total)}.`,
    };
  } else if (order.status === "diproses") {
    langkah = {
      label: "Tandai siap diambil",
      status: "siap_diambil",
      bayar: order.status_bayar,
      petunjuk: "Setelah dicetak dan dijilid, kabari customer lewat WhatsApp.",
    };
  } else if (order.status === "siap_diambil") {
    langkah = {
      label: "Tandai selesai",
      status: "selesai",
      bayar: order.status_bayar,
      petunjuk: "Klik setelah pesanan diserahkan ke customer.",
    };
  }

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/admin"
          className={`text-sm font-semibold text-[#28543b] underline underline-offset-4 ${fokus}`}
        >
          Kembali ke daftar order
        </Link>

        <section className="mt-6">
          <p className="text-[#647367]">{order.nama}</p>
          <h1 className="text-3xl font-black tracking-tight">{order.kode_order}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusPill status={order.status} />
            <span className="text-sm text-[#647367]">
              {LABEL_BAYAR[order.status_bayar] ?? order.status_bayar}
            </span>
          </div>
          <p className="mt-4 text-4xl font-black tabular-nums">{rupiah(order.total)}</p>
          <a
            href={waLink(order.no_wa)}
            target="_blank"
            rel="noreferrer"
            className={`mt-4 inline-flex rounded-full border border-[#cbd8c0] px-5 py-2.5 text-sm font-semibold text-[#28543b] hover:bg-[#edf1e5] ${fokus}`}
          >
            Chat {order.no_wa} di WhatsApp
          </a>
        </section>

        <section className="mt-8 rounded-3xl bg-[#edf1e5] p-5 sm:p-6">
          <h2 className="text-lg font-black">Langkah berikutnya</h2>
          {langkah ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-[#647367]">{langkah.petunjuk}</p>
              <Aksi
                id={order.id}
                status={langkah.status}
                statusBayar={langkah.bayar}
                label={langkah.label}
                utama
              />
              <Aksi
                id={order.id}
                status="dibatalkan"
                statusBayar={order.status_bayar}
                label="Batalkan pesanan"
                utama={false}
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-[#647367]">
              Order ini {LABEL_STATUS[order.status]?.toLowerCase() ?? order.status}. Ubah
              manual di bawah kalau perlu.
            </p>
          )}

          <details className="mt-5">
            <summary className={`cursor-pointer text-sm font-semibold text-[#28543b] ${fokus}`}>
              Ubah status manual
            </summary>
            <form action={ubahStatus} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={order.id} />
              <div>
                <label htmlFor="status" className="mb-1 block text-sm font-semibold">
                  Status order
                </label>
                <select id="status" name="status" defaultValue={order.status} className={kotak}>
                  {Object.entries(LABEL_STATUS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="status_bayar" className="mb-1 block text-sm font-semibold">
                  Status bayar
                </label>
                <select
                  id="status_bayar"
                  name="status_bayar"
                  defaultValue={order.status_bayar}
                  className={kotak}
                >
                  {Object.entries(LABEL_BAYAR).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="catatan" className="mb-1 block text-sm font-semibold">
                  Catatan internal (opsional)
                </label>
                <input id="catatan" name="catatan" maxLength={500} className={kotak} />
              </div>
              <button
                className={`w-full rounded-full bg-[#28543b] px-6 py-3.5 font-bold text-white hover:bg-[#1d402c] ${fokus}`}
              >
                Simpan perubahan
              </button>
            </form>
          </details>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-black">File untuk dicetak</h2>
          <p className="mt-1 text-sm text-[#647367]">
            Link unduh berlaku 5 menit. Muat ulang halaman kalau sudah kedaluwarsa.
          </p>
          {daftarFile.length === 0 ? (
            <p className="py-4 text-sm text-[#647367]">Tidak ada file di order ini.</p>
          ) : (
            <ul className="mt-3">
              {daftarFile.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 border-b border-[#e5e8dc] py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{f.nama_asli}</p>
                    <p className="text-sm text-[#647367]">{f.halaman_sistem} halaman</p>
                  </div>
                  {f.url ? (
                    <a
                      href={f.url}
                      className={`shrink-0 rounded-full bg-[#28543b] px-5 py-2 text-sm font-bold text-white hover:bg-[#1d402c] ${fokus}`}
                    >
                      Unduh
                    </a>
                  ) : (
                    <span className="text-sm text-red-700">Link gagal dibuat</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-black">Rincian pesanan</h2>
          <dl className="mt-2">
            <Baris label="Paket">{order.paket ?? "Tanpa paket"}</Baris>
            <Baris label="Penerimaan">
              {order.ambil_kirim === "kirim" ? "Dikirim" : "Ambil sendiri"}
            </Baris>
            <Baris label="Jumlah halaman">{order.jumlah_halaman}</Baris>
            <Baris label="Jumlah eksemplar">{order.jumlah_eksemplar}</Baris>
            <Baris label="Klip">{order.pakai_klip ? "Pakai" : "Tidak"}</Baris>
            <Baris label="Lembar konsul">{order.jumlah_lembar_konsul}</Baris>
            <Baris label="Harga cetak per lembar">
              {rupiah(order.harga_cetak_saat_order)}
            </Baris>
            <Baris label="Dibuat">{waktu(order.created_at)}</Baris>
          </dl>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-black">Riwayat status</h2>
          <ol className="mt-3 space-y-4 border-l-2 border-[#cbd8c0] pl-4">
            {(logs ?? []).map((l) => (
              <li key={l.id} className="text-sm">
                <p className="font-semibold">{LABEL_STATUS[l.status_baru] ?? l.status_baru}</p>
                <p className="text-[#647367]">
                  {waktu(l.waktu)} oleh {l.oleh ?? "sistem"}
                  {l.catatan ? `, ${l.catatan}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="min-h-screen bg-[#f8f7ef] text-[#20382c]">
      <Suspense fallback={<p className="p-6 text-[#647367]">Memuat...</p>}>
        <DetailOrder params={params} />
      </Suspense>
    </div>
  );
}