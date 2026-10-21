"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

const STATUS = [
  "menunggu_pembayaran",
  "menunggu_verifikasi",
  "diproses",
  "siap_diambil",
  "selesai",
  "dibatalkan",
  "kedaluwarsa",
];
const STATUS_BAYAR = ["belum", "dp", "lunas"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ubahStatus(formData: FormData) {
  // Server action bisa dipanggil siapa saja: wajib cek admin di sini juga.
  const admin = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const statusBaru = String(formData.get("status") ?? "");
  const statusBayar = String(formData.get("status_bayar") ?? "");
  const catatan = String(formData.get("catatan") ?? "").trim().slice(0, 500);

  if (!UUID.test(id) || !STATUS.includes(statusBaru) || !STATUS_BAYAR.includes(statusBayar)) {
    return;
  }

  const db = supabaseAdmin();
  const { data: lama } = await db.from("orders").select("status").eq("id", id).maybeSingle();
  if (!lama) return;

  const { error } = await db
    .from("orders")
    .update({ status: statusBaru, status_bayar: statusBayar })
    .eq("id", id);
  if (error) {
    console.error("Gagal ubah status:", error.message);
    return;
  }

  await db.from("order_status_logs").insert({
    order_id: id,
    status_lama: lama.status,
    status_baru: statusBaru,
    oleh: admin.email,
    catatan: catatan || null,
  });

  revalidatePath(`/admin/order/${id}`);
  revalidatePath("/admin");
}