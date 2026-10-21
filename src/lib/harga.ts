import { supabasePublik } from "@/lib/supabase/client";
import type { PriceSettings } from "@/lib/pricing";

export type Paket = {
  id: number;
  nama: string;
  jumlahEksemplarDefault: number;
  pakaiKlipDefault: boolean;
  lembarKonsulDefault: number;
  eksemplarDiisiCustomer: boolean;
};

// Harga terbaru dari tabel price_settings (tidak ditulis permanen di kode)
export async function getHarga(): Promise<PriceSettings> {
  const sekarang = new Date().toISOString();

  const { data, error } = await supabasePublik()
    .from("price_settings")
    .select("harga_cetak, harga_klip, harga_konsul")
    .lte("berlaku_sejak", sekarang)
    .order("berlaku_sejak", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("Gagal membaca harga dari database");
  }

  return {
    hargaCetak: data.harga_cetak,
    hargaKlip: data.harga_klip,
    hargaKonsul: data.harga_konsul,
  };
}

export async function getPaket(): Promise<Paket[]> {
  const { data, error } = await supabasePublik()
    .from("packages")
    .select("*")
    .eq("aktif", true)
    .order("urutan");
  if (error || !data) throw new Error("Gagal membaca paket");
  return data.map((p) => ({
    id: p.id,
    nama: p.nama,
    jumlahEksemplarDefault: p.jumlah_eksemplar_default,
    pakaiKlipDefault: p.pakai_klip_default,
    lembarKonsulDefault: p.lembar_konsul_default,
    eksemplarDiisiCustomer: p.eksemplar_diisi_customer,
  }));
}

export async function getKebijakan(): Promise<string> {
  const { data, error } = await supabasePublik()
    .from("shop_settings")
    .select("kebijakan")
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("Gagal membaca kebijakan toko");
  }

  return data.kebijakan ?? "";
}