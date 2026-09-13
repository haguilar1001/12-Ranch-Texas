"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cambiarFormaPago } from "./acciones";
import { formatearCOP, formatearMiles, parseCOP } from "@/lib/dinero/cop";

interface Medio { id: string; nombre: string }
interface Fila { key: number; medio_pago_id: string; monto: string }

/**
 * Arreglar con qué se pagó una venta, sin tocar nada más: el cajero marcó "Efectivo"
 * cuando fue Nequi. La venta conserva su número, sus líneas y sus manillas.
 *
 * El total no se puede mover desde aquí: para eso está corregir la venta.
 */
export default function FormaPago({
  ventaId, totalCobrado, medios, pagosActuales,
}: {
  ventaId: string;
  totalCobrado: number;
  medios: Medio[];
  pagosActuales: { medio: string; medio_pago_id: string; monto: number }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [filas, setFilas] = useState<Fila[]>(() =>
    pagosActuales.map((p, i) => ({ key: i, medio_pago_id: p.medio_pago_id, monto: String(p.monto) })),
  );

  const suma = filas.reduce((a, f) => a + parseCOP(f.monto), 0);
  const diferencia = totalCobrado - suma;

  const actualizar = (key: number, campo: "medio_pago_id" | "monto", valor: string) =>
    setFilas((prev) => prev.map((f) => (f.key === key ? { ...f, [campo]: valor } : f)));

  async function guardar() {
    setBusy(true);
    setMsg(null);
    const r = await cambiarFormaPago(
      ventaId,
      filas.map((f) => ({ medio_pago_id: f.medio_pago_id, monto: parseCOP(f.monto) })),
      motivo,
    );
    setBusy(false);
    setMsg({ ok: r.ok, t: r.ok ? "Forma de pago actualizada." : r.error ?? "Error" });
    if (r.ok) {
      setAbierto(false);
      router.refresh();
    }
  }

  if (!abierto) {
    return (
      <div className="mt-2">
        <button
          onClick={() => setAbierto(true)}
          className="rounded border border-ranch-marron/25 px-3 py-1 text-sm font-semibold text-ranch-marron hover:bg-ranch-crema/60"
        >
          💳 Cambiar forma de pago
        </button>
        {msg?.ok && <p className="mt-1 text-xs text-green-700">{msg.t}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border-2 border-ranch-dorado bg-ranch-dorado/5 p-3">
      <p className="mb-1 text-sm font-bold text-ranch-marron">Cambiar forma de pago</p>
      <p className="mb-2 text-xs text-ranch-marron/60">
        Solo con qué se pagó. La venta, las manillas y el total de {formatearCOP(totalCobrado)} no se tocan.
      </p>

      <div className="space-y-2">
        {filas.map((f) => (
          <div key={f.key} className="flex gap-2">
            <select
              value={f.medio_pago_id}
              onChange={(e) => actualizar(f.key, "medio_pago_id", e.target.value)}
              className="w-1/2 rounded border border-ranch-marron/25 px-2 py-1 text-sm"
            >
              {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <input
              value={f.monto ? formatearMiles(parseCOP(f.monto)) : ""}
              onChange={(e) => actualizar(f.key, "monto", e.target.value)}
              inputMode="numeric"
              className="w-1/2 rounded border border-ranch-marron/25 px-2 py-1 text-right text-sm"
            />
            {filas.length > 1 && (
              <button onClick={() => setFilas((p) => p.filter((x) => x.key !== f.key))} className="px-1 text-red-600">✕</button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => setFilas((p) => [...p, { key: Math.max(0, ...p.map((x) => x.key)) + 1, medio_pago_id: medios[0]?.id ?? "", monto: diferencia > 0 ? String(diferencia) : "" }])}
        className="mt-1 text-xs font-semibold text-ranch-marron/60 hover:text-ranch-marron"
      >
        + Otro medio
      </button>

      <p className={`mt-2 text-sm ${diferencia === 0 ? "text-ranch-verde" : "text-amber-700"}`}>
        {diferencia === 0
          ? "Cuadra ✓"
          : diferencia > 0
            ? `Faltan ${formatearCOP(diferencia)} para llegar al total de la venta.`
            : `Sobran ${formatearCOP(-diferencia)} sobre el total de la venta.`}
      </p>

      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo del cambio (obligatorio)"
        className="mt-2 w-full rounded border border-ranch-marron/25 px-2 py-1 text-sm"
      />

      {msg && !msg.ok && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{msg.t}</p>}

      <div className="mt-2 flex gap-2">
        <button
          onClick={guardar}
          disabled={busy || diferencia !== 0 || !motivo.trim()}
          className="rounded bg-ranch-marron px-3 py-1 text-sm font-semibold text-ranch-crema disabled:opacity-40"
        >
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <button onClick={() => { setAbierto(false); setMsg(null); }} className="rounded border border-ranch-marron/25 px-3 py-1 text-sm text-ranch-marron">
          Cancelar
        </button>
      </div>
    </div>
  );
}
