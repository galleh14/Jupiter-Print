"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { hitungHarga, type PriceSettings } from "@/lib/pricing";
import { hitungHalamanPdf, type HasilHitungPdf } from "@/lib/pdf";

type Paket = {
  id: number;
  nama: string;
  jumlahEksemplarDefault: number;
  pakaiKlipDefault: boolean;
  lembarKonsulDefault: number;
  eksemplarDiisiCustomer: boolean;
  aktif: boolean;
  urutan: number;
};

type HargaApi = {
  harga?: {
    hargaCetak?: number;
    hargaKlip?: number;
    hargaKonsul?: number;
    harga_cetak?: number;
    harga_klip?: number;
    harga_konsul?: number;
  };
  paket?: Record<string, unknown>[];
};

type PesananBerhasil = {
  success: boolean;
  kodeOrder: string;
  total: number;
  jumlahHalaman: number;
  jumlahEksemplar: number;
  nama: string;
  noWa: string;
  paket: string | null;
};

const HARGA_DEMO: PriceSettings = {
  hargaCetak: 350,
  hargaKlip: 750,
  hargaKonsul: 350,
};

const NOMOR_WA_ADMIN = "6281268321914";
const BATAS_FILE = 5;
const BATAS_UKURAN = 20 * 1024 * 1024;

function rupiah(nominal: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(nominal);
}

function normalisasiPaket(item: Record<string, unknown>): Paket {
  return {
    id: Number(item.id),
    nama: String(item.nama ?? "Paket"),
    jumlahEksemplarDefault: Number(
      item.jumlahEksemplarDefault ?? item.jumlah_eksemplar_default ?? 1,
    ),
    pakaiKlipDefault: Boolean(
      item.pakaiKlipDefault ?? item.pakai_klip_default ?? false,
    ),
    lembarKonsulDefault: Number(
      item.lembarKonsulDefault ?? item.lembar_konsul_default ?? 0,
    ),
    eksemplarDiisiCustomer: Boolean(
      item.eksemplarDiisiCustomer ?? item.eksemplar_diisi_customer ?? false,
    ),
    aktif: item.aktif !== false,
    urutan: Number(item.urutan ?? 0),
  };
}

export default function Home() {
  const [harga, setHarga] = useState<PriceSettings>(HARGA_DEMO);
  const [sumberHarga, setSumberHarga] = useState<
    "memuat" | "database" | "demo"
  >("memuat");
  const [paketList, setPaketList] = useState<Paket[]>([]);
  const [paketTerpilih, setPaketTerpilih] = useState<number | null>(null);

  const [nama, setNama] = useState("");
  const [noWa, setNoWa] = useState("");
  const [ambilKirim, setAmbilKirim] = useState<"ambil" | "kirim">("ambil");
  const [dokumen, setDokumen] = useState<File[]>([]);
  const [hasilPdf, setHasilPdf] = useState<HasilHitungPdf[]>([]);
  const [sedangHitung, setSedangHitung] = useState(false);

  const [pakaiKlip, setPakaiKlip] = useState(true);
  const [jumlahLembarKonsul, setJumlahLembarKonsul] = useState(1);
  const [jumlahEksemplar, setJumlahEksemplar] = useState(1);

  const [loading, setLoading] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [errorPesanan, setErrorPesanan] = useState("");
  const [orderSukses, setOrderSukses] = useState<PesananBerhasil | null>(null);

  const jumlahHalaman = hasilPdf.reduce(
    (total, file) => total + file.halaman,
    0,
  );

  const paketAktif =
    paketList.find((item) => item.id === paketTerpilih) ?? null;

  const hasilHarga = useMemo(() => {
    if (jumlahHalaman < 1) {
      return { hargaPerEksemplar: 0, total: 0 };
    }

    try {
      return hitungHarga(
        {
          jumlahHalaman,
          pakaiKlip,
          jumlahLembarKonsul,
          jumlahEksemplar,
        },
        harga,
      );
    } catch {
      return { hargaPerEksemplar: 0, total: 0 };
    }
  }, [jumlahHalaman, pakaiKlip, jumlahLembarKonsul, jumlahEksemplar, harga]);

  useEffect(() => {
    let aktif = true;

    async function muatHarga() {
      try {
        const response = await fetch("/api/harga", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Harga belum tersedia.");
        }

        const data = (await response.json()) as HargaApi;

        const hargaApi = data.harga;
        const hargaCetak = Number(
          hargaApi?.hargaCetak ?? hargaApi?.harga_cetak,
        );
        const hargaKlip = Number(hargaApi?.hargaKlip ?? hargaApi?.harga_klip);
        const hargaKonsul = Number(
          hargaApi?.hargaKonsul ?? hargaApi?.harga_konsul,
        );

        if (
          !hargaApi ||
          !Number.isFinite(hargaCetak) ||
          !Number.isFinite(hargaKlip) ||
          !Number.isFinite(hargaKonsul)
        ) {
          throw new Error("Format harga tidak sesuai.");
        }

        const paket = Array.isArray(data.paket)
          ? data.paket.map((item) =>
              normalisasiPaket(item as Record<string, unknown>),
            )
          : [];

        if (!aktif) return;

        setHarga({
          hargaCetak,
          hargaKlip,
          hargaKonsul,
        });
        setPaketList(paket);
        setSumberHarga("database");

        if (paket.length > 0) {
          const pertama = [...paket].sort((a, b) => a.urutan - b.urutan)[0];

          setPaketTerpilih(pertama.id);
          setPakaiKlip(pertama.pakaiKlipDefault);
          setJumlahLembarKonsul(pertama.lembarKonsulDefault);
          setJumlahEksemplar(pertama.jumlahEksemplarDefault);
        }
      } catch {
        if (!aktif) return;
        setSumberHarga("demo");
      }
    }

    void muatHarga();

    return () => {
      aktif = false;
    };
  }, []);

  async function pilihDokumen(files: FileList | null) {
    setErrorPesanan("");
    setOrderSukses(null);
    setHasilPdf([]);

    const daftar = Array.from(files ?? []);

    if (daftar.length === 0) {
      setDokumen([]);
      return;
    }

    if (daftar.length > BATAS_FILE) {
      setDokumen([]);
      setErrorPesanan(`Maksimal ${BATAS_FILE} file PDF dalam satu pesanan.`);
      return;
    }

    for (const file of daftar) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setDokumen([]);
        setErrorPesanan(`${file.name}: hanya file PDF yang diperbolehkan.`);
        return;
      }

      if (file.size <= 0 || file.size > BATAS_UKURAN) {
        setDokumen([]);
        setErrorPesanan(`${file.name}: ukuran file maksimal 20 MB.`);
        return;
      }
    }

    setDokumen(daftar);
    setSedangHitung(true);

    try {
      const hasil = await hitungHalamanPdf(daftar);
      setHasilPdf(hasil);
    } catch (error) {
      setDokumen([]);
      setHasilPdf([]);
      setErrorPesanan(
        error instanceof Error
          ? error.message
          : "Tidak dapat membaca file PDF.",
      );
    } finally {
      setSedangHitung(false);
    }
  }

  function pilihPaket(id: number) {
    const paket = paketList.find((item) => item.id === id);
    if (!paket) return;

    setPaketTerpilih(id);
    setPakaiKlip(paket.pakaiKlipDefault);
    setJumlahLembarKonsul(paket.lembarKonsulDefault);
    setJumlahEksemplar(paket.jumlahEksemplarDefault);
  }

  async function kirimPesanan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorPesanan("");

    if (!nama.trim()) {
      setErrorPesanan("Nama pelanggan wajib diisi.");
      return;
    }

    if (!noWa.trim()) {
      setErrorPesanan("Nomor WhatsApp wajib diisi.");
      return;
    }

    if (dokumen.length < 1 || hasilPdf.length !== dokumen.length) {
      setErrorPesanan(
        "Pilih PDF yang valid dan tunggu penghitungan halaman selesai.",
      );
      return;
    }

    if (sedangHitung || loading) return;

    setLoading(true);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    try {
      const formData = new FormData();
      formData.set("idempotency_key", idempotencyKeyRef.current!);
      formData.set("nama", nama.trim());
      formData.set("no_wa", noWa.trim());
      formData.set("ambil_kirim", ambilKirim);
      formData.set("pakai_klip", String(pakaiKlip));
      formData.set("jumlah_lembar_konsul", String(jumlahLembarKonsul));
      formData.set("jumlah_eksemplar", String(jumlahEksemplar));

      if (paketTerpilih !== null) {
        formData.set("paket_id", String(paketTerpilih));
      }

      // Jumlah halaman dari browser sengaja tidak dikirim sebagai sumber harga.
      // Server menghitungnya ulang dari file PDF yang diterima.
      for (const file of dokumen) {
        formData.append("dokumen", file);
      }

      const response = await fetch("/api/pesanan", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Pesanan gagal disimpan.");
      }

      setOrderSukses(data as PesananBerhasil);
      idempotencyKeyRef.current = null;
    } catch (error) {
      setErrorPesanan(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat mengirim pesanan.",
      );
    } finally {
      setLoading(false);
    }
  }

  function konfirmasiWhatsApp() {
    if (!orderSukses) return;

    const pesan = [
      "Halo JupiterPrint, saya ingin mengonfirmasi pesanan.",
      "",
      `Kode pesanan: ${orderSukses.kodeOrder}`,
      `Nama: ${orderSukses.nama}`,
      `Jumlah halaman: ${orderSukses.jumlahHalaman}`,
      `Jumlah eksemplar: ${orderSukses.jumlahEksemplar}`,
      `Total pembayaran: ${rupiah(orderSukses.total)}`,
      "",
      "Saya akan mengirimkan bukti pembayaran QRIS.",
    ].join("\n");

    window.open(
      `https://wa.me/${NOMOR_WA_ADMIN}?text=${encodeURIComponent(pesan)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f7ef] text-[#20382c]">
      <header className="border-b border-[#dfe6d9] bg-[#fffef9]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <a
            href="#"
            className="text-2xl font-black tracking-tight text-[#28543b]"
          >
            JupiterPrint<span className="text-[#a6bd82]">.</span>
          </a>
          <a
            href="#pesan"
            className="rounded-full bg-[#28543b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d402c]"
          >
            Pesan Sekarang
          </a>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div>
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.2em] text-[#718b5c]">
            Cetak dokumen lebih praktis
          </p>
          <h1 className="max-w-xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
            Cetak tugasmu.
            <br />
            <span className="text-[#718b5c]">Biar kami urus.</span>
          </h1>
          <p className="mt-6 max-w-lg leading-7 text-[#647367]">
            Unggah PDF, cek jumlah halaman secara otomatis, lihat estimasi
            harga, lalu selesaikan pesanan dengan pembayaran QRIS.
          </p>
          <a
            href="#pesan"
            className="mt-8 inline-flex rounded-full bg-[#28543b] px-7 py-3.5 font-bold text-white transition hover:bg-[#1d402c]"
          >
            Mulai Pesanan
          </a>
        </div>

        <div className="rounded-[2rem] border border-[#e0e7d9] bg-[#edf1e5] p-7 md:p-10">
          <p className="text-sm font-semibold text-[#718b5c]">ESTIMASI CETAK</p>
          <p className="mt-3 text-4xl font-black">{rupiah(hasilHarga.total)}</p>
          <p className="mt-2 text-sm text-[#647367]">
            {jumlahHalaman > 0
              ? `${jumlahHalaman} halaman dari PDF yang kamu pilih`
              : "Pilih PDF untuk menghitung halaman dan harga"}
          </p>
          <div className="mt-7 space-y-3 border-t border-[#d5dfca] pt-5 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-[#647367]">Harga cetak per halaman</span>
              <strong>{rupiah(harga.hargaCetak)}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#647367]">Jumlah eksemplar</span>
              <strong>{jumlahEksemplar}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#647367]">Harga</span>
              <strong>
                {sumberHarga === "database" ? "Dari database" : "Harga demo"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section id="pesan" className="scroll-mt-8 bg-[#fffef9] py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#718b5c]">
              Formulir pesanan
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              Hitung dan pesan cetakanmu
            </h2>
            <p className="mt-4 leading-7 text-[#647367]">
              Jumlah halaman diambil langsung dari PDF. Kamu tidak perlu
              memasukkannya secara manual.
            </p>
          </div>

          <div className="grid items-start gap-8 lg:grid-cols-[1.35fr_0.85fr]">
            <form
              onSubmit={kirimPesanan}
              className="space-y-8 rounded-3xl border border-[#e5e8dc] bg-white p-6 md:p-8"
            >
              <div>
                <h3 className="text-lg font-bold">1. Unggah dokumen PDF</h3>
                <p className="mt-2 text-sm leading-6 text-[#718075]">
                  Maksimal 5 file, masing-masing maksimal 20 MB. PDF yang rusak
                  atau terkunci kata sandi tidak dapat diproses.
                </p>

                <label
                  htmlFor="dokumen"
                  className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#cbd8c0] bg-[#f8f9f3] px-5 py-8 text-center transition hover:border-[#718b5c]"
                >
                  <span className="text-3xl" aria-hidden="true">
                    ↑
                  </span>
                  <span className="mt-2 font-bold">
                    Klik untuk memilih file PDF
                  </span>
                  <span className="mt-1 text-sm text-[#718075]">
                    Bisa memilih beberapa file sekaligus
                  </span>

                  <input
                    id="dokumen"
                    name="dokumen"
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      void pilihDokumen(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>

                {sedangHitung && (
                  <p className="mt-4 text-sm font-semibold text-[#718b5c]">
                    Sedang membaca PDF dan menghitung halaman...
                  </p>
                )}

                {hasilPdf.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-[#e2e8dc]">
                    {hasilPdf.map((file, index) => (
                      <div
                        key={`${file.nama}-${index}`}
                        className="flex items-center justify-between gap-4 border-b border-[#e9ede4] px-4 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {file.nama}
                          </p>
                          <p className="mt-1 text-xs text-[#718075]">
                            PDF {index + 1}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#edf1e5] px-3 py-1 text-sm font-bold text-[#28543b]">
                          {file.halaman} halaman
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-4 bg-[#edf1e5] px-4 py-4">
                      <span className="font-bold">Total halaman</span>
                      <span className="text-lg font-black">
                        {jumlahHalaman} halaman
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDokumen([]);
                        setHasilPdf([]);
                        setErrorPesanan("");
                        setOrderSukses(null);
                      }}
                      className="w-full border-t border-[#e2e8dc] px-4 py-3 text-sm font-semibold text-[#7b4b42] hover:bg-[#fff8f5]"
                    >
                      Hapus semua file
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-[#edf0e8] pt-7">
                <h3 className="text-lg font-bold">2. Pilih kebutuhan cetak</h3>

                {paketList.length > 0 && (
                  <div className="mt-4">
                    <label
                      htmlFor="paket"
                      className="mb-2 block text-sm font-semibold"
                    >
                      Paket cetak
                    </label>
                    <select
                      id="paket"
                      value={paketTerpilih ?? ""}
                      onChange={(event) =>
                        pilihPaket(Number(event.target.value))
                      }
                      className="w-full rounded-xl border border-[#dce3d6] bg-white px-4 py-3 outline-none focus:border-[#718b5c]"
                    >
                      {paketList.map((paket) => (
                        <option key={paket.id} value={paket.id}>
                          {paket.nama}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-[#f8f9f3] p-4">
                  <input
                    type="checkbox"
                    checked={pakaiKlip}
                    onChange={(event) => setPakaiKlip(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[#28543b]"
                  />
                  <span>
                    <span className="block font-semibold">Gunakan klip</span>
                    <span className="mt-1 block text-sm text-[#718075]">
                      Tambahan {rupiah(harga.hargaKlip)} per eksemplar
                    </span>
                  </span>
                </label>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="konsul"
                      className="mb-2 block text-sm font-semibold"
                    >
                      Lembar konsultasi
                    </label>
                    <input
                      id="konsul"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={jumlahLembarKonsul}
                      onChange={(event) =>
                        setJumlahLembarKonsul(
                          Math.max(
                            0,
                            Math.min(100, Number(event.target.value)),
                          ),
                        )
                      }
                      className="w-full rounded-xl border border-[#dce3d6] px-4 py-3 outline-none focus:border-[#718b5c]"
                    />
                    <p className="mt-2 text-xs text-[#718075]">
                      {rupiah(harga.hargaKonsul)} per lembar per eksemplar
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="eksemplar"
                      className="mb-2 block text-sm font-semibold"
                    >
                      Jumlah eksemplar
                    </label>
                    <input
                      id="eksemplar"
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={jumlahEksemplar}
                      onChange={(event) =>
                        setJumlahEksemplar(
                          Math.max(
                            1,
                            Math.min(100, Number(event.target.value)),
                          ),
                        )
                      }
                      className="w-full rounded-xl border border-[#dce3d6] px-4 py-3 outline-none focus:border-[#718b5c]"
                    />
                  </div>
                </div>
                {paketAktif && !paketAktif.eksemplarDiisiCustomer && (
                  <p className="mt-3 text-xs text-[#718075]">
                    Jumlah eksemplar dapat disesuaikan dengan kebutuhanmu.
                  </p>
                )}
              </div>

              <div className="border-t border-[#edf0e8] pt-7">
                <h3 className="text-lg font-bold">3. Data pelanggan</h3>

                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="nama"
                      className="mb-2 block text-sm font-semibold"
                    >
                      Nama lengkap
                    </label>
                    <input
                      id="nama"
                      name="nama"
                      autoComplete="name"
                      required
                      maxLength={100}
                      value={nama}
                      onChange={(event) => setNama(event.target.value)}
                      placeholder="Nama kamu"
                      className="w-full rounded-xl border border-[#dce3d6] px-4 py-3 outline-none focus:border-[#718b5c]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="no_wa"
                      className="mb-2 block text-sm font-semibold"
                    >
                      Nomor WhatsApp
                    </label>
                    <input
                      id="no_wa"
                      name="no_wa"
                      type="tel"
                      autoComplete="tel"
                      required
                      maxLength={20}
                      value={noWa}
                      onChange={(event) => setNoWa(event.target.value)}
                      placeholder="08xxxxxxxxxx"
                      className="w-full rounded-xl border border-[#dce3d6] px-4 py-3 outline-none focus:border-[#718b5c]"
                    />
                  </div>
                </div>

                <fieldset className="mt-5">
                  <legend className="mb-3 text-sm font-semibold">
                    Metode penerimaan
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#dce3d6] p-4">
                      <input
                        type="radio"
                        name="ambil_kirim"
                        value="ambil"
                        checked={ambilKirim === "ambil"}
                        onChange={() => setAmbilKirim("ambil")}
                        className="accent-[#28543b]"
                      />
                      <span className="text-sm font-semibold">
                        Ambil sendiri
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#dce3d6] p-4">
                      <input
                        type="radio"
                        name="ambil_kirim"
                        value="kirim"
                        checked={ambilKirim === "kirim"}
                        onChange={() => setAmbilKirim("kirim")}
                        className="accent-[#28543b]"
                      />
                      <span className="text-sm font-semibold">Dikirim</span>
                    </label>
                  </div>
                </fieldset>
              </div>

              {errorPesanan && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                  {errorPesanan}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  loading ||
                  sedangHitung ||
                  dokumen.length === 0 ||
                  hasilPdf.length !== dokumen.length ||
                  sumberHarga === "memuat" ||
                  sumberHarga === "demo"
                }
                className="w-full rounded-full bg-[#28543b] px-6 py-4 font-bold text-white transition hover:bg-[#1d402c] disabled:cursor-not-allowed disabled:bg-[#a7b5a7]"
              >
                {loading
                  ? "Menyimpan pesanan..."
                  : sedangHitung
                    ? "Menghitung halaman..."
                    : "Buat Pesanan"}
              </button>

              {sumberHarga === "demo" && (
                <p className="text-sm text-amber-700">
                  Harga database belum berhasil dimuat. Pengiriman pesanan
                  dinonaktifkan agar tidak menggunakan harga demo.
                </p>
              )}
            </form>

            <aside className="space-y-6">
              <div className="rounded-3xl bg-[#edf1e5] p-6 md:p-8">
                <h3 className="text-lg font-bold">Ringkasan biaya</h3>
                <div className="mt-5 space-y-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-[#647367]">Jumlah halaman PDF</span>
                    <strong>{jumlahHalaman}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#647367]">Cetak per eksemplar</span>
                    <strong>{rupiah(jumlahHalaman * harga.hargaCetak)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#647367]">Klip</span>
                    <strong>{rupiah(pakaiKlip ? harga.hargaKlip : 0)}</strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#647367]">Lembar konsultasi</span>
                    <strong>
                      {rupiah(jumlahLembarKonsul * harga.hargaKonsul)}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[#647367]">Eksemplar</span>
                    <strong>{jumlahEksemplar}</strong>
                  </div>
                  <div className="border-t border-[#d5dfca] pt-4">
                    <p className="text-sm text-[#647367]">Estimasi total</p>
                    <p className="mt-1 text-3xl font-black">
                      {rupiah(hasilHarga.total)}
                    </p>
                  </div>
                </div>
                <p className="mt-5 text-xs leading-5 text-[#718075]">
                  Estimasi dihitung dari harga yang tersedia. Total final
                  dihitung ulang oleh server saat pesanan dibuat.
                </p>
              </div>

              <div className="rounded-3xl border border-[#e5e8dc] bg-white p-6">
                <h3 className="font-bold">Sebelum memesan</h3>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-[#647367]">
                  <li>• Pastikan semua dokumen berbentuk PDF.</li>
                  <li>
                    • Periksa jumlah halaman setiap file sebelum mengirim.
                  </li>
                  <li>
                    • Simpan kode pesanan setelah pesanan berhasil dibuat.
                  </li>
                  <li>• Pembayaran dikonfirmasi melalui WhatsApp.</li>
                </ul>
              </div>
            </aside>
          </div>

          {orderSukses && (
            <section
              aria-live="polite"
              className="mt-10 rounded-3xl border border-[#cbd8c0] bg-[#edf1e5] p-6 md:p-10"
            >
              <p className="text-sm font-bold uppercase tracking-[0.15em] text-[#718b5c]">
                Pesanan berhasil disimpan
              </p>
              <h3 className="mt-3 text-2xl font-black">
                Pesanan {orderSukses.kodeOrder}
              </h3>
              <p className="mt-3 leading-7 text-[#647367]">
                Simpan kode pesanan ini. Lanjutkan pembayaran sesuai nominal
                yang ditampilkan, lalu konfirmasi melalui WhatsApp.
              </p>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl bg-white p-5">
                  <p className="text-sm text-[#647367]">Total pembayaran</p>
                  <p className="mt-2 text-3xl font-black">
                    {rupiah(orderSukses.total)}
                  </p>
                  <div className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-[#647367]">Nama</span>
                      <strong className="text-right">{orderSukses.nama}</strong>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[#647367]">Total halaman</span>
                      <strong>{orderSukses.jumlahHalaman}</strong>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-[#647367]">Eksemplar</span>
                      <strong>{orderSukses.jumlahEksemplar}</strong>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-5 text-center">
                  <h4 className="font-bold">Bayar menggunakan QRIS</h4>
                  <img
                    src="/qris.png"
                    alt="QRIS pembayaran JupiterPrint"
                    className="mx-auto mt-4 max-h-80 w-full max-w-72 object-contain"
                  />
                  <p className="mt-3 text-sm leading-6 text-[#647367]">
                    Pindai QRIS di atas dan masukkan nominal tepat{" "}
                    <strong>{rupiah(orderSukses.total)}</strong>. Pastikan
                    nominal benar sebelum membayar.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={konfirmasiWhatsApp}
                className="mt-6 w-full rounded-full bg-[#28543b] px-6 py-4 font-bold text-white transition hover:bg-[#1d402c] md:w-auto"
              >
                Konfirmasi via WhatsApp
              </button>
              <p className="mt-3 text-xs leading-5 text-[#647367]">
                Status pembayaran belum otomatis berubah setelah QRIS dipindai.
                Admin perlu memverifikasi pembayaranmu.
              </p>
            </section>
          )}
        </div>
      </section>

      <footer className="border-t border-[#dfe6d9] bg-[#fffef9] px-5 py-7 text-center text-sm text-[#718075]">
        © 2026 JupiterPrint. Cetak dokumen lebih praktis.
      </footer>
    </main>
  );
}
