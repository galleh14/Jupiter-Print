import Link from "next/link";
import { logout } from "@/app/admin/login/actions";

export const LABEL_STATUS: Record<string, string> = {
  menunggu_pembayaran: "Menunggu pembayaran",
  menunggu_verifikasi: "Menunggu verifikasi",
  diproses: "Diproses",
  siap_diambil: "Siap diambil/dikirim",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
  kedaluwarsa: "Kedaluwarsa",
};

export const LABEL_BAYAR: Record<string, string> = {
  belum: "Belum bayar",
  dp: "DP",
  lunas: "Lunas",
};

const GAYA_STATUS: Record<string, string> = {
  menunggu_pembayaran: "bg-[#eceee6] text-[#5b6a5e]",
  menunggu_verifikasi: "bg-[#fbe9c0] text-[#7a4d00]",
  diproses: "bg-[#d5e8c9] text-[#1f4a31]",
  siap_diambil: "bg-[#cde3f1] text-[#1d4766]",
  selesai: "bg-[#e6eadf] text-[#5b6a5e]",
  dibatalkan: "bg-[#f3d9d4] text-[#7d2f22]",
  kedaluwarsa: "bg-[#f3d9d4] text-[#7d2f22]",
};

export const rupiah = (n: number) =>
  "Rp" + new Intl.NumberFormat("id-ID").format(n);

export const waktu = (s: string) =>
  new Date(s).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        GAYA_STATUS[status] ?? "bg-gray-200 text-gray-800"
      }`}
    >
      {LABEL_STATUS[status] ?? status}
    </span>
  );
}

export function AdminHeader() {
  return (
    <header className="border-b border-[#dfe6d9] bg-[#fffef9]">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <Link
          href="/admin"
          className="text-xl font-black tracking-tight text-[#28543b]"
        >
          JupiterPrint<span className="text-[#a6bd82]">.</span>
          <span className="ml-2 text-sm font-semibold text-[#647367]">Admin</span>
        </Link>
        <form action={logout}>
          <button className="rounded-full border border-[#cbd8c0] px-4 py-2 text-sm font-semibold text-[#28543b] hover:bg-[#edf1e5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#718b5c]">
            Keluar
          </button>
        </form>
      </div>
    </header>
  );
}