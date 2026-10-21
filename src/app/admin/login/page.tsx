"use client";

import { useActionState } from "react";
import { login } from "./actions";

const kotak =
  "w-full rounded-xl border border-[#dce3d6] bg-white px-4 py-3 text-base text-[#20382c] outline-none focus:border-[#718b5c] focus-visible:ring-2 focus-visible:ring-[#718b5c]/30";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f7ef] px-4 text-[#20382c]">
      <div className="w-full max-w-sm">
        <p className="text-2xl font-black tracking-tight text-[#28543b]">
          JupiterPrint<span className="text-[#a6bd82]">.</span>
        </p>
        <h1 className="mt-6 text-3xl font-black tracking-tight">Masuk admin</h1>
        <p className="mt-2 text-[#647367]">
          Khusus pemilik dan admin Jupiter Print.
        </p>

        <form action={formAction} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-semibold">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={kotak}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-semibold">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={kotak}
            />
          </div>

          {state?.error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {state.error} Cek lagi lalu coba masuk.
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-[#28543b] px-6 py-4 font-bold text-white transition hover:bg-[#1d402c] disabled:cursor-not-allowed disabled:bg-[#a7b5a7]"
          >
            {pending ? "Memeriksa..." : "Masuk"}
          </button>
        </form>
      </div>
    </main>
  );
}