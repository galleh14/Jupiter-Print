import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { hitungHarga, type PriceSettings } from "@/lib/pricing";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_PAGES = 10_000;
const BUCKET = "order-files";

type FilePdfValid = {
  file: File;
  halaman: number;
};

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function angkaBulat(
  value: FormDataEntryValue | null,
  nama: string,
  minimum: number,
  maksimum: number,
): number {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${nama} wajib diisi.`);
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < minimum || number > maksimum) {
    throw new Error(
      `${nama} harus berupa bilangan bulat ${minimum}–${maksimum}.`,
    );
  }

  return number;
}

function booleanForm(value: FormDataEntryValue | null, nama: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${nama} tidak valid.`);
}

function buatKodeOrder(): string {
  const waktu = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(2, 12);

  const acak = randomBytes(3).toString("hex").toUpperCase();
  return `JP-${waktu}-${acak}`;
}

async function bacaDanHitungPdf(file: File): Promise<FilePdfValid> {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error(`${file.name}: hanya file PDF yang diperbolehkan.`);
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    throw new Error(
      `${file.name}: ukuran file harus lebih dari 0 dan maksimal 20 MB.`,
    );
  }

  const bytes = await file.arrayBuffer();
  const awal = new TextDecoder().decode(
    bytes.slice(0, Math.min(bytes.byteLength, 1024)),
  );

  if (!awal.includes("%PDF-")) {
    throw new Error(`${file.name}: file tidak memiliki header PDF yang valid.`);
  }

  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
    });

    const halaman = pdf.getPageCount();

    if (!Number.isSafeInteger(halaman) || halaman < 1) {
      throw new Error("PDF tidak memiliki halaman yang valid.");
    }

    return { file, halaman };
  } catch {
    throw new Error(
      `${file.name}: PDF tidak dapat dibaca. Pastikan file tidak rusak atau terkunci kata sandi.`,
    );
  }
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  let orderId: string | null = null;
  const uploadedPaths: string[] = [];

  try {
    const formData = await request.formData();
    const idempotencyKeyValue = formData.get("idempotency_key");

    if (
      typeof idempotencyKeyValue !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idempotencyKeyValue,
      )
    ) {
      return errorResponse("Kunci pesanan tidak valid.");
    }

    const idempotencyKey = idempotencyKeyValue;

    const namaValue = formData.get("nama");
    const waValue = formData.get("no_wa");
    const ambilKirimValue = formData.get("ambil_kirim");

    if (typeof namaValue !== "string" || !namaValue.trim()) {
      return errorResponse("Nama pelanggan wajib diisi.");
    }

    if (typeof waValue !== "string" || !waValue.trim()) {
      return errorResponse("Nomor WhatsApp wajib diisi.");
    }

    const nama = namaValue.trim();
    const noWa = waValue.trim();

    if (nama.length > 100) {
      return errorResponse("Nama maksimal 100 karakter.");
    }

    if (!/^[+0-9()\-\s]{8,20}$/.test(noWa)) {
      return errorResponse("Format nomor WhatsApp tidak valid.");
    }

    if (ambilKirimValue !== "ambil" && ambilKirimValue !== "kirim") {
      return errorResponse("Metode penerimaan pesanan tidak valid.");
    }

    const pakaiKlip = booleanForm(formData.get("pakai_klip"), "Pilihan klip");
    const jumlahLembarKonsul = angkaBulat(
      formData.get("jumlah_lembar_konsul"),
      "Jumlah lembar konsultasi",
      0,
      100,
    );
    const jumlahEksemplar = angkaBulat(
      formData.get("jumlah_eksemplar"),
      "Jumlah eksemplar",
      1,
      100,
    );

    const paketIdValue = formData.get("paket_id");
    let paketId: number | null = null;

    if (paketIdValue !== null && paketIdValue !== "") {
      if (typeof paketIdValue !== "string" || !/^\d+$/.test(paketIdValue)) {
        return errorResponse("Pilihan paket tidak valid.");
      }

      paketId = Number(paketIdValue);

      if (!Number.isSafeInteger(paketId) || paketId < 1) {
        return errorResponse("Pilihan paket tidak valid.");
      }
    }

    const files = formData
      .getAll("dokumen")
      .filter((item): item is File => item instanceof File && item.size > 0);

    if (files.length < 1 || files.length > MAX_FILES) {
      return errorResponse(
        `Pilih minimal 1 dan maksimal ${MAX_FILES} file PDF.`,
      );
    }

    // Validasi dan penghitungan halaman dilakukan di server.
    const pdfValid: FilePdfValid[] = [];

    for (const file of files) {
      pdfValid.push(await bacaDanHitungPdf(file));
    }

    const jumlahHalaman = pdfValid.reduce(
      (total, item) => total + item.halaman,
      0,
    );

    if (jumlahHalaman > MAX_TOTAL_PAGES) {
      return errorResponse("Total halaman semua PDF maksimal 10.000.");
    }

    // Ambil harga terbaru dari database, bukan dari browser.
    const { data: dataHarga, error: errorHarga } = await supabase
      .from("price_settings")
      .select("harga_cetak, harga_klip, harga_konsul")
      .order("berlaku_sejak", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (errorHarga) {
      console.error("Gagal mengambil harga:", errorHarga.message);
      return errorResponse(
        "Harga belum dapat diambil. Silakan coba lagi.",
        500,
      );
    }

    if (!dataHarga) {
      return errorResponse("Harga cetak belum diatur oleh admin.", 503);
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
      return errorResponse("Konfigurasi harga di database tidak valid.", 500);
    }

    let namaPaket: string | null = null;

    if (paketId !== null) {
      const { data: dataPaket, error: errorPaket } = await supabase
        .from("packages")
        .select("id, nama, aktif")
        .eq("id", paketId)
        .eq("aktif", true)
        .maybeSingle();

      if (errorPaket) {
        console.error("Gagal memeriksa paket:", errorPaket.message);
        return errorResponse(
          "Paket tidak dapat diperiksa. Silakan coba lagi.",
          500,
        );
      }

      if (!dataPaket) {
        return errorResponse("Paket tidak ditemukan atau sudah tidak aktif.");
      }

      namaPaket = dataPaket.nama;
    }

    const hasil = hitungHarga(
      {
        jumlahHalaman,
        pakaiKlip,
        jumlahLembarKonsul,
        jumlahEksemplar,
      },
      harga,
    );

    const kodeOrder = buatKodeOrder();

    const { data: dataOrder, error: errorOrder } = await supabase
      .from("orders")
      .insert({
        idempotency_key: idempotencyKey,
        idempotency_status: "processing",

        kode_order: kodeOrder,
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
        ambil_kirim: ambilKirimValue,
        status: "menunggu_pembayaran",
        status_bayar: "belum",
      })
      .select("id, kode_order, total")
      .single();

    if (errorOrder || !dataOrder) {
      // 23505 = unique_violation; key ini mungkin sudah dipakai request sebelumnya.
      if (errorOrder?.code === "23505") {
        const { data: pesananLama, error: errorPesananLama } = await supabase
          .from("orders")
          .select("kode_order, total, idempotency_status")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (errorPesananLama) {
          console.error(
            "Gagal memeriksa pesanan duplikat:",
            errorPesananLama.message,
          );
          return errorResponse("Gagal memeriksa status pesanan.", 500);
        }

        if (pesananLama?.idempotency_status === "completed") {
          return errorResponse(
            "Pesanan dengan kunci ini sudah selesai diproses. Jangan kirim ulang pesanan.",
            409,
          );
        }

        return errorResponse(
          "Pesanan dengan permintaan ini sedang diproses. Periksa status pesanan sebelum mencoba lagi.",
          409,
        );
      }

      console.error("Gagal menyimpan pesanan:", errorOrder?.message);
      return errorResponse("Pesanan gagal disimpan. Silakan coba lagi.", 500);
    }

    orderId = dataOrder.id;

    // Unggah setiap PDF ke bucket privat dan simpan jumlah halamannya.
    const barisFile: {
      order_id: string;
      nama_asli: string;
      path_storage: string;
      halaman_sistem: number;
    }[] = [];

    for (let index = 0; index < pdfValid.length; index++) {
      const item = pdfValid[index];
      const ekstensiAman = `${randomBytes(12).toString("hex")}.pdf`;
      const pathStorage = `${dataOrder.id}/${index + 1}-${ekstensiAman}`;

      const { error: errorUpload } = await supabase.storage
        .from(BUCKET)
        .upload(pathStorage, item.file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (errorUpload) {
        console.error("Gagal mengunggah PDF:", errorUpload.message);
        throw new Error("File PDF gagal disimpan. Silakan coba lagi.");
      }

      uploadedPaths.push(pathStorage);

      barisFile.push({
        order_id: dataOrder.id,
        nama_asli: item.file.name,
        path_storage: pathStorage,
        halaman_sistem: item.halaman,
      });
    }

    const { error: errorSimpanFile } = await supabase
      .from("order_files")
      .insert(barisFile);

    if (errorSimpanFile) {
      console.error("Gagal menyimpan metadata file:", errorSimpanFile.message);
      throw new Error("Data file pesanan gagal disimpan. Silakan coba lagi.");
    }

    const { error: errorLog } = await supabase
      .from("order_status_logs")
      .insert({
        order_id: dataOrder.id,
        status_lama: null,
        status_baru: "menunggu_pembayaran",
        oleh: "sistem",
        catatan: "Pesanan dibuat dan menunggu pembayaran.",
      });

    // Tandai idempotency selesai setelah file dan metadata berhasil disimpan.
    const { error: errorUpdateStatus } = await supabase
      .from("orders")
      .update({ idempotency_status: "completed" })
      .eq("id", dataOrder.id)
      .eq("idempotency_key", idempotencyKey);

    if (errorUpdateStatus) {
      console.error(
        "Gagal memperbarui status idempotency:",
        errorUpdateStatus.message,
      );
      throw new Error(
        "Pesanan tersimpan, tetapi status pemrosesan gagal diperbarui.",
      );
    }

    if (errorLog) {
      // Pesanan tetap valid walau pencatatan log gagal.
      console.error("Gagal mencatat log status:", errorLog.message);
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

    // Upayakan membersihkan file dan data pesanan bila proses belum selesai.
    if (uploadedPaths.length > 0) {
      const { error: errorHapusStorage } = await supabase.storage
        .from(BUCKET)
        .remove(uploadedPaths);

      if (errorHapusStorage) {
        console.error("Gagal membersihkan file:", errorHapusStorage.message);
      }
    }

    if (orderId) {
      const { error: errorHapusLog } = await supabase
        .from("order_status_logs")
        .delete()
        .eq("order_id", orderId);

      if (errorHapusLog) {
        console.error("Gagal membersihkan log status:", errorHapusLog.message);
      }

      const { error: errorHapusMetadata } = await supabase
        .from("order_files")
        .delete()
        .eq("order_id", orderId);

      if (errorHapusMetadata) {
        console.error(
          "Gagal membersihkan metadata file:",
          errorHapusMetadata.message,
        );
      }

      const { error: errorHapusOrder } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId);

      if (errorHapusOrder) {
        console.error("Gagal membersihkan pesanan:", errorHapusOrder.message);
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat membuat pesanan.";

    return errorResponse(message, 400);
  }
}
