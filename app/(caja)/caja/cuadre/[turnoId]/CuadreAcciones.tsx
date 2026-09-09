"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reabrirTurno } from "../../turno/actions";

export default function CuadreAcciones({ turnoId, esAdmin, cerrado }: { turnoId: string; esAdmin: boolean; cerrado: boolean }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function reabrir() {
    if (!confirm("¿Reabrir este turno cerrado?")) return;
    const r = await reabrirTurno(turnoId, motivo);
    if (r.ok) { setMsg("Turno reabierto."); router.refresh(); }
    else setMsg(r.error ?? "Error");
  }

  return (
    <div className="no-print mb-4 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => window.print()} className="rounded-lg bg-ranch-marron px-4 py-2 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro">🖨️ Imprimir / PDF</button>
        <a href={`/caja/cuadre/${turnoId}/xlsx`} className="rounded-lg bg-ranch-verde px-4 py-2 font-semibold text-white">⬇️ Excel</a>
        <a href={`/caja/cuadre/${turnoId}/csv`} className="rounded-lg border border-ranch-marron/30 px-4 py-2 text-sm font-semibold text-ranch-marron hover:bg-white">CSV</a>
        <a href="/caja/turno" className="rounded-lg border border-ranch-marron/30 px-4 py-2 font-semibold text-ranch-marron">← Volver</a>
      </div>
      {esAdmin && cerrado && (
        <div className="rounded-lg border border-ranch-marron/20 bg-white p-2">
          <p className="mb-1 text-xs font-semibold text-ranch-marron">Administrador — reapertura</p>
          <div className="flex gap-2">
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" className="flex-1 rounded border px-2 py-1 text-sm" />
            <button onClick={reabrir} className="rounded bg-ranch-dorado px-3 py-1 text-sm font-semibold text-white">Reabrir</button>
          </div>
        </div>
      )}
      {msg && <p className="text-sm text-ranch-marron">{msg}</p>}
    </div>
  );
}
