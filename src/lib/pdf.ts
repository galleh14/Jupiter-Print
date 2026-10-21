
import { PDFDocument } from "pdf-lib";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_TOTAL_PAGES = 10_000;

export type HasilHitungPdf = {
  nama: string;
  halaman: number;
};

export async function hitungHalamanPdf(
  files: File[],
): Promise<HasilHitungPdf[]> {
  if (files.length < 1 || files.length > MAX_FILES) {
    throw new Error("Pilih minimal 1 dan maksimal 5 file PDF.");
  }

  const hasil: HasilHitungPdf[] = [];
  let totalHalaman = 0;

  for (const file of files) {
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      throw new Error(
        `${file.name}: ukuran file harus lebih dari 0 dan maksimal 20 MB.`,
      );
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      throw new Error(`${file.name}: hanya file PDF yang diizinkan.`);
    }

    try {
      const bytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes, {
        ignoreEncryption: false,
      });

      const halaman = pdf.getPageCount();

      if (halaman < 1) {
        throw new Error("PDF tidak memiliki halaman.");
      }

      totalHalaman += halaman;

      if (totalHalaman > MAX_TOTAL_PAGES) {
        throw new Error("Total halaman semua PDF maksimal 10.000.");
      }

      hasil.push({
        nama: file.name,
        halaman,
      });
    } catch {
      throw new Error(
        `${file.name}: PDF tidak dapat dibaca. Pastikan file tidak rusak atau terkunci kata sandi.`,
      );
    }
  }

  return hasil;
}
