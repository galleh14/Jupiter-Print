import { NextResponse } from "next/server";
import { getHarga, getKebijakan, getPaket } from "@/lib/harga";

export async function GET() {
  try {
    const [harga, paket, kebijakan] = await Promise.all([
      getHarga(),
      getPaket(),
      getKebijakan(),
    ]);

    return NextResponse.json({ harga, paket, kebijakan: kebijakan });
  } catch (error) {
    console.error("GET /api/harga gagal:", error);

    return NextResponse.json(
      { error: "Gagal mengambil data harga dan paket" },
      { status: 500 }
    );
  }
}