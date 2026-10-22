import { connection, NextResponse } from "next/server";
import { getHarga, getPaket, getKebijakan } from "@/lib/harga";

export async function GET() {
  // Wajib: baca database tiap request, jangan dibekukan saat build.
  await connection();

  try {
    const [harga, paket, kebijakan] = await Promise.all([
      getHarga(),
      getPaket(),
      getKebijakan(),
    ]);
    return NextResponse.json(
      { harga, paket, kebijakan },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("Gagal memuat harga:", e);
    return NextResponse.json({ error: "Harga belum bisa dimuat." }, { status: 500 });
  }
}