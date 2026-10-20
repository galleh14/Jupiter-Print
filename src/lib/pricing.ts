// Hitung harga order sesuai rumus PRD bagian 4.2.
// Harga dikirim sebagai parameter (nanti diambil dari tabel price_settings),
// jadi tidak ditulis permanen di kode.

export type PriceSettings = {
  hargaCetak: number; // per lembar
  hargaKlip: number; // per eksemplar
  hargaKonsul: number; // per lembar konsul
};

export type OrderInput = {
  jumlahHalaman: number;
  pakaiKlip: boolean;
  jumlahLembarKonsul: number;
  jumlahEksemplar: number;
};

export type PriceResult = {
  hargaPerEksemplar: number;
  total: number;
};

export function hitungHarga(input: OrderInput, harga: PriceSettings): PriceResult {
  const { jumlahHalaman, pakaiKlip, jumlahLembarKonsul, jumlahEksemplar } = input;

  const bulat = (n: number) => Number.isInteger(n);
  if (!bulat(jumlahHalaman) || jumlahHalaman < 1) {
    throw new Error("Jumlah halaman minimal 1");
  }
  if (!bulat(jumlahEksemplar) || jumlahEksemplar < 1) {
    throw new Error("Jumlah eksemplar minimal 1");
  }
  if (!bulat(jumlahLembarKonsul) || jumlahLembarKonsul < 0) {
    throw new Error("Jumlah lembar konsul tidak valid");
  }

  const hargaPerEksemplar =
    jumlahHalaman * harga.hargaCetak +
    (pakaiKlip ? harga.hargaKlip : 0) +
    jumlahLembarKonsul * harga.hargaKonsul;

  return {
    hargaPerEksemplar,
    total: hargaPerEksemplar * jumlahEksemplar,
  };
}