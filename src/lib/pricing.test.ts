import { describe, it, expect } from "vitest";
import { hitungHarga, type PriceSettings } from "./pricing";

const harga: PriceSettings = { hargaCetak: 350, hargaKlip: 750, hargaKonsul: 350 };

describe("hitungHarga", () => {
  it("contoh PRD 1: 25 halaman, klip, 1 konsul, 1 eksemplar = 9.850", () => {
    const r = hitungHarga(
      { jumlahHalaman: 25, pakaiKlip: true, jumlahLembarKonsul: 1, jumlahEksemplar: 1 },
      harga
    );
    expect(r.total).toBe(9850);
  });

  it("contoh PRD 2: 40 halaman tanpa tambahan = 14.000", () => {
    const r = hitungHarga(
      { jumlahHalaman: 40, pakaiKlip: false, jumlahLembarKonsul: 0, jumlahEksemplar: 1 },
      harga
    );
    expect(r.total).toBe(14000);
  });

  it("contoh PRD 3: 40 halaman, klip, 1 konsul, 2 eksemplar = 30.200", () => {
    const r = hitungHarga(
      { jumlahHalaman: 40, pakaiKlip: true, jumlahLembarKonsul: 1, jumlahEksemplar: 2 },
      harga
    );
    expect(r.hargaPerEksemplar).toBe(15100);
    expect(r.total).toBe(30200);
  });

  it("1 halaman = 350", () => {
    const r = hitungHarga(
      { jumlahHalaman: 1, pakaiKlip: false, jumlahLembarKonsul: 0, jumlahEksemplar: 1 },
      harga
    );
    expect(r.total).toBe(350);
  });

  it("rentang halaman 1-20 dihitung 20 halaman = 7.000", () => {
    const r = hitungHarga(
      { jumlahHalaman: 20, pakaiKlip: false, jumlahLembarKonsul: 0, jumlahEksemplar: 1 },
      harga
    );
    expect(r.total).toBe(7000);
  });

  it("ikut harga baru kalau harga diubah admin", () => {
    const r = hitungHarga(
      { jumlahHalaman: 10, pakaiKlip: false, jumlahLembarKonsul: 0, jumlahEksemplar: 1 },
      { hargaCetak: 400, hargaKlip: 750, hargaKonsul: 350 }
    );
    expect(r.total).toBe(4000);
  });

  it("menolak eksemplar 0", () => {
    expect(() =>
      hitungHarga(
        { jumlahHalaman: 5, pakaiKlip: false, jumlahLembarKonsul: 0, jumlahEksemplar: 0 },
        harga
      )
    ).toThrow();
  });
});