import { NextResponse } from "next/server";
import { getHarga, getPaket } from "@/lib/harga";

export async function GET() {
  try {
    const [harga, paket] = await Promise.all([
      getHarga(),
      getPaket(),
    ]);

    return NextResponse.json({ harga, paket });
  } catch (error) {
    console.error("GET /api/harga gagal:", error);

    return NextResponse.json(
      { error: "Gagal mengambil data harga dan paket" },
      { status: 500 }
    );
  }
}