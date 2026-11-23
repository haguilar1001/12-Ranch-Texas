"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { anularVentaOtra, registrarVentaOtra } from "./actions";
import FormularioFiltros from "../reportes/FormularioFiltros";
import { formatearCOP, formatearMiles, parseCOP } from "@/lib/dinero/cop";

interface FilaVentaOtra {
  id: string; fecha: string; linea: string; valor: number; descripcion: string;
  estado: "activa" | "anulada"; creadoPor: string; motivoAnulacion: string | null; anuladaPor: string | null;
}

const NOMBRE_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default function VentasOtrasClient({
  hoy, mes, lineas, ventas,
}: {
  hoy: string; mes: string; lineas: string[]; ventas: FilaVentaOtra[];
}) {
  const router = useRouter();
  const [f, setF] = useState({ fecha: hoy, linea: "", valor: "", descripcion: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [anulando, setAnulando] = useState<{ id: string; motivo: string } | null>(null);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const activas = ventas.filter((v) => v.estado === "activa");
  const porLinea = useMemo(() => {
    const acc = new Map<string, number>();
    for (const v of activas) acc.set(v.linea, (acc.get(v.linea) ?? 0) + v.valor);
    return [...acc.entries()].sort((a, b) => b[1] - a[1]);
  }, [activas]);
  const totalMes = porLinea.reduce((s, [, v]) => s + v, 0);
  const [anioSel, mesSel] = mes.split("-").map(Number);

  async function guardar() {
    setMsg(null);
    setEnviando(true);
    const r = await registrarVentaOtra({ fecha: f.fecha, linea: f.linea, valor: parseCOP(f.valor), descripcion: f.descripcion });
    setEnviando(false);
    if (r.ok) {
      setMsg({ ok: true, t: "Venta registrada." });
      setF((p) => ({ ...p, valor: "", descripcion: "" }));
      router.refresh();
    } else setMsg({ ok: false, t: r.error ?? "Error" });
  }

  async function confirmarAnulacion() {
    if (!anulando) return;
    const r = await anularVentaOtra(anulando.id, anulando.motivo);
    if (r.ok) {
      setAnulando(null);
      router.refresh();
    } else setMsg({ ok: false, t: r.error ?? "Error" });
  }

  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Ventas que no pasan por taquilla</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">
        Arriendos, chucherías y otros ingresos. Se suman al comparativo año vs año. Las entradas y los eventos no se cargan aquí: salen de la taquilla.
      </p>

      <section className="mb-6 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Registrar venta</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm"><span className="block text-ranch-marron/70">Fecha</span>
            <input type="date" value={f.fecha} max={hoy} onChange={(e) => set("fecha", e.target.value)} className="w-full rounded border px-2 py-1" />
          </label>
          <label className="text-sm"><span className="block text-ranch-marron/70">Línea</span>
            <input list="lineas-ventas-otras" value={f.linea} onChange={(e) => set("linea", e.target.value.toUpperCase())} placeholder="ARRIENDOS" className="w-full rounded border px-2 py-1" />
            <datalist id="lineas-ventas-otras">
              {lineas.map((l) => <option key={l} value={l} />)}
            </datalist>
          </label>
          <label className="text-sm"><span className="block text-ranch-marron/70">Valor</span>
            <input value={f.valor ? formatearMiles(parseCOP(f.valor)) : ""} onChange={(e) => set("valor", e.target.value)} inputMode="numeric" placeholder="0" className="w-full rounded border px-2 py-1 text-right" />
          </label>
          <label className="text-sm"><span className="block text-ranch-marron/70">Descripción</span>
            <input value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Arriendo local de comidas — noviembre" className="w-full rounded border px-2 py-1" />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={guardar} disabled={enviando} className="rounded-lg bg-ranch-marron px-5 py-2 font-semibold text-ranch-crema disabled:opacity-50">
            {enviando ? "Guardando…" : "Registrar venta"}
          </button>
        </div>
        {msg && <p className={`mt-2 rounded px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
      </section>

      <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-ranch-marron">Ventas de {NOMBRE_MES[mesSel - 1]} {anioSel}</h2>
          <FormularioFiltros className="text-sm">
            <input type="month" name="mes" defaultValue={mes} className="rounded border px-2 py-1" />
          </FormularioFiltros>
        </div>

        {porLinea.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            {porLinea.map(([l, v]) => (
              <span key={l} className="rounded-lg bg-ranch-crema px-3 py-1"><span className="text-ranch-marron/60">{l}</span> <strong className="text-ranch-marron">{formatearCOP(v)}</strong></span>
            ))}
            <span className="rounded-lg bg-ranch-marron px-3 py-1 text-ranch-crema">Total <strong>{formatearCOP(totalMes)}</strong></span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ranch-marron/60">
              <th className="py-1">Fecha</th><th>Línea</th><th>Descripción</th><th className="text-right">Valor</th><th>Cargó</th><th></th>
            </tr></thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id} className={`border-t border-ranch-marron/10 ${v.estado === "anulada" ? "text-ranch-marron/40 line-through" : ""}`}>
                  <td className="py-1">{v.fecha}</td>
                  <td>{v.linea}</td>
                  <td>
                    {v.descripcion}
                    {v.estado === "anulada" && <span className="block text-xs no-underline">Anulada por {v.anuladaPor}: {v.motivoAnulacion}</span>}
                  </td>
                  <td className="text-right">{formatearCOP(v.valor)}</td>
                  <td className="text-ranch-marron/70">{v.creadoPor}</td>
                  <td className="text-right">
                    {v.estado === "activa" && (anulando?.id === v.id ? (
                      <span className="flex justify-end gap-1">
                        <input autoFocus value={anulando.motivo} onChange={(e) => setAnulando({ id: v.id, motivo: e.target.value })} placeholder="Motivo" className="w-32 rounded border px-1 py-0.5 text-xs" />
                        <button onClick={confirmarAnulacion} className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Anular</button>
                        <button onClick={() => setAnulando(null)} className="rounded border px-2 py-0.5 text-xs">✕</button>
                      </span>
                    ) : (
                      <button onClick={() => setAnulando({ id: v.id, motivo: "" })} className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600">Anular</button>
                    ))}
                  </td>
                </tr>
              ))}
              {ventas.length === 0 && <tr><td colSpan={6} className="py-2 text-ranch-marron/40">Sin ventas cargadas este mes.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
