import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hitungHarga } from "@/lib/pricing";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB per file
const MAX_FILES = 5;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function teks(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function kodeOrder(): string {
  const tanggal = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const acak = randomBytes(3).toString("hex").toUpperCase();
  return `JP-${tanggal}-${acak}`;
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  let orderId: string | null = null;
  const uploadedPaths: string[] = [];

  try {
    const form = await request.formData();

    const nama = teks(form.get("nama"));
    const noWa = teks(form.get("no_wa")).replace(/[^\d+]/g, "");
    const halaman = Number(teks(form.get("jumlah_halaman")));
    const eksemplar = Number(teks(form.get("jumlah_eksemplar")));
    const lembarKonsul = Number(teks(form.get("jumlah_lembar_konsul")));
    const pakaiKlip = teks(form.get("pakai_klip")) === "true";
    const paketIdText = teks(form.get("paket_id"));
    const catatan = teks(form.get("catatan"));
    const ambilKirim = teks(form.get("ambil_kirim")) || "ambil";

    if (nama.length < 2 || nama.length > 120) {
      return NextResponse.json(
        { error: "Nama harus terdiri dari 2–120 karakter." },
        { status: 400 },
      );
    }

    if (!/^\+?\d{9,16}$/.test(noWa)) {
      return NextResponse.json(
        { error: "Nomor WhatsApp tidak valid." },
        { status: 400 },
      );
    }

    if (
      !Number.isSafeInteger(halaman) ||
      halaman < 1 ||
      halaman > 10000 ||
      !Number.isSafeInteger(eksemplar) ||
      eksemplar < 1 ||
      eksemplar > 1000 ||
      !Number.isSafeInteger(lembarKonsul) ||
      lembarKonsul < 0 ||
      lembarKonsul > 10000
    ) {
      return NextResponse.json(
        { error: "Jumlah halaman, eksemplar, atau konsultasi tidak valid." },
        { status: 400 },
      );
    }

    if (!["ambil", "kirim"].includes(ambilKirim)) {
      return NextResponse.json(
        { error: "Pilihan pengambilan tidak valid." },
        { status: 400 },
      );
    }

    const files = form
      .getAll("dokumen")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (files.length < 1 || files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Unggah 1–${MAX_FILES} dokumen.` },
        { status: 400 },
      );
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `${file.name} melebihi batas 20 MB per file.` },
          { status: 400 },
        );
      }

      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json(
          { error: `${file.name}: hanya PDF, DOC, atau DOCX yang diizinkan.` },
          { status: 400 },
        );
      }
    }

    // Harga dan paket diambil ulang dari database; data harga browser tidak dipercaya.
    const { data: price, error: priceError } = await supabase
      .from("price_settings")
      .select("harga_cetak, harga_klip, harga_konsul")
      .lte("berlaku_sejak", new Date().toISOString())
      .order("berlaku_sejak", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (priceError || !price) {
      throw new Error("Harga belum tersedia di database.");
    }

    let namaPaket: string | null = null;

    if (paketIdText) {
      const paketId = Number(paketIdText);

      if (!Number.isSafeInteger(paketId) || paketId < 1) {
        return NextResponse.json(
          { error: "Paket yang dipilih tidak valid." },
          { status: 400 },
        );
      }

      const { data: paket, error: paketError } = await supabase
        .from("packages")
        .select("id, nama, aktif")
        .eq("id", paketId)
        .eq("aktif", true)
        .maybeSingle();

      if (paketError || !paket) {
        return NextResponse.json(
          { error: "Paket tidak tersedia. Silakan pilih paket lain." },
          { status: 400 },
        );
      }

      namaPaket = paket.nama;
    }

    const hasil = hitungHarga(
      {
        jumlahHalaman: halaman,
        pakaiKlip,
        jumlahLembarKonsul: lembarKonsul,
        jumlahEksemplar: eksemplar,
      },
      {
        hargaCetak: price.harga_cetak,
        hargaKlip: price.harga_klip,
        hargaKonsul: price.harga_konsul,
      },
    );

    if (!Number.isSafeInteger(hasil.total)) {
      return NextResponse.json(
        { error: "Total pesanan melebihi batas perhitungan yang didukung." },
        { status: 400 },
      );
    }

    // Buat order dahulu agar file memiliki order_id yang valid.
    let order: { id: string; kode_order: string } | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const kode = kodeOrder();

      const { data, error } = await supabase
        .from("orders")
        .insert({
          kode_order: kode,
          nama,
          no_wa: noWa,
          paket: namaPaket,
          jumlah_halaman: halaman,
          jumlah_eksemplar: eksemplar,
          pakai_klip: pakaiKlip,
          jumlah_lembar_konsul: lembarKonsul,
          harga_cetak_saat_order: price.harga_cetak,
          harga_klip_saat_order: price.harga_klip,
          harga_konsul_saat_order: price.harga_konsul,
          total: hasil.total,
          status: "menunggu_pembayaran",
          status_bayar: "belum",
          ambil_kirim: ambilKirim,
        })
        .select("id, kode_order")
        .single();

      if (!error && data) {
        order = data;
        orderId = data.id;
        break;
      }

      // Kode order unik; coba ulang hanya jika terjadi benturan kode.
      if (error?.code !== "23505") {
        throw new Error("Pesanan gagal disimpan.");
      }
    }

    if (!order) {
      throw new Error("Kode pesanan gagal dibuat. Silakan coba lagi.");
    }

    for (const file of files) {
      const namaAman = file.name
        .normalize("NFKC")
        .replace(/[^\w.\-() ]/g, "_")
        .slice(-120) || "dokumen";

      const path = `${order.id}/${randomBytes(16).toString("hex")}-${namaAman}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("order-files")
        .upload(path, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error("Upload dokumen gagal.");
      }

      uploadedPaths.push(path);

      const { error: fileRecordError } = await supabase
        .from("order_files")
        .insert({
          order_id: order.id,
          nama_asli: file.name.slice(0, 255),
          path_storage: path,
        });

      if (fileRecordError) {
        throw new Error("Pencatatan dokumen gagal.");
      }
    }

    // Status awal dan riwayatnya dicatat bersama-sama secara logis.
    const { error: logError } = await supabase
      .from("order_status_logs")
      .insert({
        order_id: order.id,
        status_lama: null,
        status_baru: "menunggu_pembayaran",
        oleh: "sistem",
        catatan: "Pesanan dibuat melalui website.",
      });

    if (logError) {
      throw new Error("Riwayat pesanan gagal disimpan.");
    }

    return NextResponse.json(
      {
        success: true,
        kodeOrder: order.kode_order,
        total: hasil.total,
        jumlahEksemplar: eksemplar,
        nama,
        noWa,
        paket: namaPaket,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/pesanan gagal:", error);

    // Bersihkan file yang sudah terunggah jika proses belum selesai.
    if (orderId) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("order-files").remove(uploadedPaths);
      }

      await supabase.from("orders").delete().eq("id", orderId);
    }

    return NextResponse.json(
      { error: "Pesanan belum berhasil disimpan. Periksa data dan coba lagi." },
      { status: 500 },
    );
  }
}