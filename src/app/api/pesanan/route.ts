import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { hitungHarga, type PriceSettings } from "@/lib/pricing";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_PAGES = 10_000;
const BUCKET = "order-files";
const UUID_PDF_PATH = /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;

type FileInput = {
  path: string;
  nama_asli: string;
};

type ValidatedFile = FileInput & {
  halaman: number;
};

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function angkaBulat(value: unknown, nama: string, minimum: number, maksimum: number) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maksimum
  ) {
    throw new Error(`${nama} harus berupa bilangan bulat ${minimum}–${maksimum}.`);
  }
  return value;
}

function booleanJson(value: unknown, nama: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${nama} tidak valid.`);
  }
  return value;
}

function buatKodeOrder(): string {
  const waktu = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(2, 12);
  return `JP-${waktu}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function bacaDanHitungPdf(
  supabase: ReturnType<typeof supabaseAdmin>,
  file: FileInput,
): Promise<ValidatedFile> {
  const { data, error } = await supabase.storage.from(BUCKET).download(file.path);

  if (error || !data) {
    throw new Error(`${file.nama_asli}: file tidak dapat dibaca dari storage.`);
  }

  const bytes = await data.arrayBuffer();
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_FILE_SIZE) {
    throw new Error(`${file.nama_asli}: ukuran file maksimal 20 MB.`);
  }

  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== "%PDF-") {
    throw new Error(`${file.nama_asli}: file tidak memiliki header PDF yang valid.`);
  }

  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
    const halaman = pdf.getPageCount();

    if (!Number.isSafeInteger(halaman) || halaman < 1) {
      throw new Error("PDF tidak memiliki halaman yang valid.");
    }

    return { ...file, halaman };
  } catch {
    throw new Error(
      `${file.nama_asli}: PDF tidak dapat dibaca. Pastikan file tidak rusak atau terkunci kata sandi.`,
    );
  }
}

function dataPesananSukses(order: {
  kode_order: string;
  total: number;
  jumlah_halaman: number;
  jumlah_eksemplar: number;
  nama: string;
  no_wa: string;
  paket: string | null;
}) {
  return {
    success: true,
    kodeOrder: order.kode_order,
    total: order.total,
    jumlahHalaman: order.jumlah_halaman,
    jumlahEksemplar: order.jumlah_eksemplar,
    nama: order.nama,
    noWa: order.no_wa,
    paket: order.paket,
  };
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  let orderId: string | null = null;
  let pathsToDelete: string[] = [];

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse("Data pesanan tidak valid.");
    }

    if (typeof body !== "object" || body === null) {
      return errorResponse("Data pesanan tidak valid.");
    }

    const data = body as Record<string, unknown>;
    const idempotencyKey = data.idempotency_key;
    if (
      typeof idempotencyKey !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idempotencyKey,
      )
    ) {
      return errorResponse("Kunci pesanan tidak valid.");
    }

    const nama = typeof data.nama === "string" ? data.nama.trim() : "";
    const noWa = typeof data.no_wa === "string" ? data.no_wa.trim() : "";
    if (!nama || nama.length > 100) {
      return errorResponse("Nama pelanggan wajib diisi dan maksimal 100 karakter.");
    }
    if (!/^[+0-9()\-\s]{8,20}$/.test(noWa)) {
      return errorResponse("Format nomor WhatsApp tidak valid.");
    }

    if (data.ambil_kirim !== "ambil" && data.ambil_kirim !== "kirim") {
      return errorResponse("Metode penerimaan pesanan tidak valid.");
    }
    const ambilKirim: "ambil" | "kirim" =
      data.ambil_kirim === "ambil" ? "ambil" : "kirim";

    const pakaiKlip = booleanJson(data.pakai_klip, "Pilihan klip");
    const jumlahLembarKonsul = angkaBulat(
      data.jumlah_lembar_konsul,
      "Jumlah lembar konsultasi",
      0,
      100,
    );
    const jumlahEksemplar = angkaBulat(
      data.jumlah_eksemplar,
      "Jumlah eksemplar",
      1,
      100,
    );

    let paketId: number | null = null;
    if (data.paket_id !== null && data.paket_id !== undefined) {
      paketId = angkaBulat(data.paket_id, "Pilihan paket", 1, Number.MAX_SAFE_INTEGER);
    }

    const filesValue = data.files;
    if (!Array.isArray(filesValue) || filesValue.length < 1 || filesValue.length > MAX_FILES) {
      return errorResponse(`Pilih minimal 1 dan maksimal ${MAX_FILES} file PDF.`);
    }

    const files: FileInput[] = filesValue.map((item) => {
      const file = item as Record<string, unknown>;
      if (
        typeof item !== "object" ||
        item === null ||
        typeof file.path !== "string" ||
        typeof file.nama_asli !== "string" ||
        !file.nama_asli.trim()
      ) {
        throw new Error("Data file pesanan tidak valid.");
      }
      return { path: file.path, nama_asli: file.nama_asli.trim() };
    });

    const paths = files.map((file) => file.path);
    if (
      paths.some((path) => !UUID_PDF_PATH.test(path)) ||
      new Set(paths).size !== paths.length
    ) {
      return errorResponse("Path file PDF tidak valid atau duplikat.");
    }
    pathsToDelete = paths;

    const { data: existingOrder, error: existingError } = await supabase
      .from("orders")
      .select("kode_order, total, jumlah_halaman, jumlah_eksemplar, nama, no_wa, paket, idempotency_status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingError) {
      console.error("Gagal memeriksa idempotency:", existingError.message);
      return errorResponse("Gagal memeriksa status pesanan.", 500);
    }
    if (existingOrder) {
      if (existingOrder.idempotency_status === "completed") {
        return NextResponse.json(dataPesananSukses(existingOrder));
      }
      return errorResponse("Pesanan dengan permintaan ini sedang diproses.", 409);
    }

    const pdfValid: ValidatedFile[] = [];
    for (const file of files) {
      pdfValid.push(await bacaDanHitungPdf(supabase, file));
    }

    const jumlahHalaman = pdfValid.reduce((total, file) => total + file.halaman, 0);
    if (jumlahHalaman > MAX_TOTAL_PAGES) {
      throw new Error("Total halaman semua PDF maksimal 10.000.");
    }

    const { data: dataHarga, error: errorHarga } = await supabase
      .from("price_settings")
      .select("harga_cetak, harga_klip, harga_konsul")
      .order("berlaku_sejak", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (errorHarga) {
      console.error("Gagal mengambil harga:", errorHarga.message);
      throw new Error("Harga belum dapat diambil. Silakan coba lagi.");
    }
    if (!dataHarga) {
      throw new Error("Harga cetak belum diatur oleh admin.");
    }

    const harga: PriceSettings = {
      hargaCetak: Number(dataHarga.harga_cetak),
      hargaKlip: Number(dataHarga.harga_klip),
      hargaKonsul: Number(dataHarga.harga_konsul),
    };
    if (
      !Number.isSafeInteger(harga.hargaCetak) ||
      !Number.isSafeInteger(harga.hargaKlip) ||
      !Number.isSafeInteger(harga.hargaKonsul) ||
      harga.hargaCetak < 0 ||
      harga.hargaKlip < 0 ||
      harga.hargaKonsul < 0
    ) {
      throw new Error("Konfigurasi harga di database tidak valid.");
    }

    let namaPaket: string | null = null;
    if (paketId !== null) {
      const { data: paket, error: errorPaket } = await supabase
        .from("packages")
        .select("id, nama, aktif")
        .eq("id", paketId)
        .eq("aktif", true)
        .maybeSingle();

      if (errorPaket) {
        console.error("Gagal memeriksa paket:", errorPaket.message);
        throw new Error("Paket tidak dapat diperiksa. Silakan coba lagi.");
      }
      if (!paket) {
        throw new Error("Paket tidak ditemukan atau sudah tidak aktif.");
      }
      namaPaket = paket.nama;
    }

    const hasil = hitungHarga(
      { jumlahHalaman, pakaiKlip, jumlahLembarKonsul, jumlahEksemplar },
      harga,
    );

    const { data: dataOrder, error: errorOrder } = await supabase
      .from("orders")
      .insert({
        idempotency_key: idempotencyKey,
        idempotency_status: "processing",
        kode_order: buatKodeOrder(),
        nama,
        no_wa: noWa,
        paket: namaPaket,
        jumlah_halaman: jumlahHalaman,
        jumlah_eksemplar: jumlahEksemplar,
        pakai_klip: pakaiKlip,
        jumlah_lembar_konsul: jumlahLembarKonsul,
        harga_cetak_saat_order: harga.hargaCetak,
        harga_klip_saat_order: harga.hargaKlip,
        harga_konsul_saat_order: harga.hargaKonsul,
        total: hasil.total,
        ambil_kirim: ambilKirim,
        status: "menunggu_pembayaran",
        status_bayar: "belum",
      })
      .select("id, kode_order, total")
      .single();

    if (errorOrder || !dataOrder) {
      if (errorOrder?.code === "23505") {
        const { data: duplicate } = await supabase
          .from("orders")
          .select("kode_order, total, jumlah_halaman, jumlah_eksemplar, nama, no_wa, paket, idempotency_status")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (duplicate?.idempotency_status === "completed") {
          return NextResponse.json(dataPesananSukses(duplicate));
        }
        return errorResponse("Pesanan dengan permintaan ini sedang diproses.", 409);
      }
      console.error("Gagal menyimpan pesanan:", errorOrder?.message);
      throw new Error("Pesanan gagal disimpan. Silakan coba lagi.");
    }

    orderId = dataOrder.id;

    const { error: errorSimpanFile } = await supabase.from("order_files").insert(
      pdfValid.map((file) => ({
        order_id: orderId,
        nama_asli: file.nama_asli,
        path_storage: file.path,
        halaman_sistem: file.halaman,
      })),
    );
    if (errorSimpanFile) {
      console.error("Gagal menyimpan metadata file:", errorSimpanFile.message);
      throw new Error("Data file pesanan gagal disimpan. Silakan coba lagi.");
    }

    const { error: errorLog } = await supabase.from("order_status_logs").insert({
      order_id: orderId,
      status_lama: null,
      status_baru: "menunggu_pembayaran",
      oleh: "sistem",
      catatan: "Pesanan dibuat dan menunggu pembayaran.",
    });
    if (errorLog) {
      console.error("Gagal mencatat log status:", errorLog.message);
    }

    const { error: errorUpdateStatus } = await supabase
      .from("orders")
      .update({ idempotency_status: "completed" })
      .eq("id", orderId)
      .eq("idempotency_key", idempotencyKey);
    if (errorUpdateStatus) {
      console.error("Gagal memperbarui status idempotency:", errorUpdateStatus.message);
      throw new Error("Pesanan tersimpan, tetapi status pemrosesan gagal diperbarui.");
    }

    return NextResponse.json({
      success: true,
      kodeOrder: dataOrder.kode_order,
      total: hasil.total,
      jumlahHalaman,
      jumlahEksemplar,
      nama,
      noWa,
      paket: namaPaket,
    });
  } catch (error) {
    console.error("Kesalahan saat membuat pesanan:", error);

    if (pathsToDelete.length > 0) {
      const { error: errorHapusStorage } = await supabase.storage
        .from(BUCKET)
        .remove(pathsToDelete);
      if (errorHapusStorage) {
        console.error("Gagal membersihkan file:", errorHapusStorage.message);
      }
    }

    if (orderId) {
      const { error: errorHapusLog } = await supabase
        .from("order_status_logs")
        .delete()
        .eq("order_id", orderId);
      if (errorHapusLog) console.error("Gagal membersihkan log:", errorHapusLog.message);

      const { error: errorHapusMetadata } = await supabase
        .from("order_files")
        .delete()
        .eq("order_id", orderId);
      if (errorHapusMetadata) console.error("Gagal membersihkan metadata file:", errorHapusMetadata.message);

      const { error: errorHapusOrder } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId);
      if (errorHapusOrder) console.error("Gagal membersihkan pesanan:", errorHapusOrder.message);
    }

    return errorResponse(
      error instanceof Error ? error.message : "Terjadi kesalahan saat membuat pesanan.",
      400,
    );
  }
}
