"use client";

import { useActionState } from "react";
import { abrirTurno } from "./actions";
import { formatearMiles, parseCOP } from "@/lib/dinero/cop";
import { useState } from "react";

interface Caja {
  id: string;
  nombre: string;
  /** Quién la tiene abierta ahora; null = libre. Una caja ocupada no se puede elegir. */
  ocupadaPor: string | null;
}

export default function TurnoForm({ cajas }: { cajas: Caja[] }) {
  const [state, action, pending] = useActionState(abrirTurno, null);
  const [base, setBase] = useState("");

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-ranch-marron">Caja</label>
        <select
          name="caja_id"
          required
          defaultValue=""
          className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2"
        >
          <option value="" disabled>
            Selecciona una caja…
          </option>
          {cajas.map((c) => (
            <option key={c.id} value={c.id} disabled={!!c.ocupadaPor}>
              {c.ocupadaPor ? `${c.nombre} — abierta por ${c.ocupadaPor}` : c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-ranch-marron">Base inicial (efectivo)</label>
        <input
          name="base_inicial"
          inputMode="numeric"
          value={base ? formatearMiles(parseCOP(base)) : ""}
          onChange={(e) => setBase(e.target.value)}
          placeholder="0"
          className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2 text-right text-lg"
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-ranch-marron px-4 py-3 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro disabled:opacity-60"
      >
        {pending ? "Abriendo…" : "Abrir turno"}
      </button>
    </form>
  );
}
