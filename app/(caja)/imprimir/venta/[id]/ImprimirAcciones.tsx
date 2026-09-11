"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { imprimirZpl } from "@/lib/impresion/browserPrint";
import { marcarImpreso, reimprimirVenta, anularVenta } from "./acciones";

export default function ImprimirAcciones({
  ventaId, puedeSupervisar, anulada, zpls,
}: {
  ventaId: string; puedeSupervisar: boolean; anulada: boolean; zpls: string[];
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [zebra, setZebra] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function imprimir() {
    await marcarImpreso(ventaId);
    window.print();
  }

  async function imprimirZebra() {
    setBusy(true); setZebra(null);
    const r = await imprimirZpl(zpls);
    if (r.ok) await marcarImpreso(ventaId);
    setBusy(false);
    setZebra({ ok: r.ok, t: r.ok ? `Enviadas ${zpls.length} manilla(s) a la Zebra.` : r.error ?? "Error" });
  }

  async function reimprimir() {
    setBusy(true); setMsg(null);
    const r = await reimprimirVenta(ventaId, motivo);
    setBusy(false);
    if (r.ok) { setMsg("Reimpresión registrada."); setMotivo(""); window.print(); }
    else setMsg(r.error ?? "Error");
  }

  async function anular() {
    if (!confirm("¿Anular esta venta y todas sus manillas? No se puede deshacer.")) return;
    setBusy(true); setMsg(null);
    const r = await anularVenta(ventaId, motivo);
    setBusy(false);
    if (r.ok) { setMsg("Venta anulada."); router.refresh(); }
    else setMsg(r.error ?? "Error");
  }

  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap gap-2">
        <button onClick={imprimirZebra} disabled={anulada || busy || zpls.length === 0} className="rounded-lg bg-ranch-marron px-5 py-2 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro disabled:opacity-40">
          🏷️ Imprimir manilla (Zebra)
        </button>
        <button onClick={imprimir} disabled={anulada} className="rounded-lg border border-ranch-marron/30 px-5 py-2 font-semibold text-ranch-marron hover:bg-white">
          🖨️ Imprimir por navegador
        </button>
        <a href="/taquilla" className="rounded-lg border border-ranch-marron/30 px-5 py-2 font-semibold text-ranch-marron hover:bg-white">
          ← Volver a taquilla
        </a>
      </div>

      {zebra && (
        <p className={`rounded px-3 py-2 text-sm ${zebra.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
          {zebra.t}
        </p>
      )}

      {puedeSupervisar && !anulada && (
        <div className="rounded-lg border border-ranch-marron/20 bg-white p-3">
          <p className="mb-2 text-sm font-semibold text-ranch-marron">Supervisor</p>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (reimpresión o anulación)"
            className="mb-2 w-full rounded border border-ranch-marron/30 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={reimprimir} disabled={busy} className="rounded bg-ranch-dorado px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
              Reimprimir con motivo
            </button>
            <button onClick={anular} disabled={busy} className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50">
              Anular venta
            </button>
          </div>
          {/* Corregir es anular + rehacer: se hace en taquilla con la venta ya cargada. */}
          <a
            href={`/taquilla?corrige=${ventaId}`}
            className="mt-2 inline-block rounded border border-ranch-marron/25 px-3 py-1 text-sm font-semibold text-ranch-marron hover:bg-ranch-crema/60"
          >
            ✏️ Corregir venta
          </a>
        </div>
      )}

      {msg && <p className="rounded bg-ranch-crema px-3 py-2 text-sm text-ranch-marron">{msg}</p>}
    </div>
  );
}
