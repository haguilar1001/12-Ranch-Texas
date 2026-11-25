"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { configurarHorometro, registrarLecturaHorometro } from "../mantenimiento/actions";
import { formatearMiles } from "@/lib/dinero/cop";

// Horómetro del equipo: activarlo y registrar lecturas (las horas no pueden bajar).
export default function HojaVidaAcciones({ equipoId, usaHorometro, horometro, equipoNombre }: { equipoId: string; usaHorometro: boolean; horometro: number | null; equipoNombre: string }) {
  const router = useRouter();
  const [horas, setHoras] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function correr(fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, t: exito }); setHoras(""); router.refresh(); } else setMsg({ ok: false, t: r.error ?? "Error" });
  }

  if (!usaHorometro) {
    return (
      <div className="text-sm text-ranch-marron/70">
        <p>{equipoNombre} no lleva horómetro. Actívalo si sus preventivos van por horas de uso (plantas, karts, motos, botes).</p>
        <button disabled={busy} onClick={() => correr(() => configurarHorometro(equipoId, true), "Horómetro activado.")} className="mt-2 rounded-lg bg-ranch-marron px-3 py-1.5 text-sm font-semibold text-ranch-crema disabled:opacity-50">Activar horómetro</button>
        {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.t}</p>}
      </div>
    );
  }
  return (
    <div className="text-sm">
      <p className="text-3xl font-black tabular-nums text-ranch-marron">{horometro != null ? `${formatearMiles(horometro)} h` : "Sin lectura"}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <input aria-label="Nueva lectura en horas" value={horas} onChange={(e) => setHoras(e.target.value)} inputMode="numeric" placeholder="Nueva lectura (h)" className="w-32 min-w-0 rounded border px-2 py-1.5" />
        <button disabled={busy || !horas} onClick={() => correr(() => registrarLecturaHorometro(equipoId, horas), "Lectura guardada.")} className="rounded-lg bg-ranch-marron px-3 py-1.5 font-semibold text-ranch-crema disabled:opacity-50">Guardar</button>
      </div>
      <button disabled={busy} onClick={() => correr(() => configurarHorometro(equipoId, false), "Horómetro desactivado.")} className="mt-2 text-xs text-ranch-marron/50 underline">No lleva horómetro</button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.t}</p>}
    </div>
  );
}
