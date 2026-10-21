import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Data upload tidak valid." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("ext" in body) ||
    body.ext !== "pdf"
  ) {
    return NextResponse.json(
      { success: false, error: "Format file harus PDF." },
      { status: 400 },
    );
  }

  const path = `uploads/${randomUUID()}.pdf`;
  const { data, error } = await supabaseAdmin()
    .storage
    .from("order-files")
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("Gagal membuat URL upload:", error?.message);
    return NextResponse.json(
      { success: false, error: "URL upload tidak dapat dibuat." },
      { status: 500 },
    );
  }

  return NextResponse.json({ path, token: data.token });
}
