"use client";

import { useActionState } from "react";
import { login } from "@/lib/auth/actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        action={action}
        className="w-full max-w-sm rounded-2xl border-4 border-ranch-marron bg-white p-8 shadow-lg"
      >
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Ranch Texas" className="mx-auto mb-2 h-20 w-auto" />
          <p className="text-sm text-ranch-marron/60">Ingreso al sistema</p>
        </div>

        <label className="block text-sm font-semibold text-ranch-marron">Usuario</label>
        <input
          name="usuario"
          autoFocus
          autoComplete="username"
          className="sin-mayusculas mt-1 mb-4 w-full rounded-lg border border-ranch-marron/30 px-3 py-2 outline-none focus:border-ranch-dorado"
        />

        <label className="block text-sm font-semibold text-ranch-marron">Contraseña</label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className="mt-1 mb-4 w-full rounded-lg border border-ranch-marron/30 px-3 py-2 outline-none focus:border-ranch-dorado"
        />

        {state?.error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-ranch-marron px-4 py-3 font-semibold text-ranch-crema transition hover:bg-ranch-marron-oscuro disabled:opacity-60"
        >
          {pending ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
