"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { crearGasto, marcarPagado, type EntradaGasto } from "./actions";
import { totalGasto } from "@/lib/gastos/calculo";
import { formatearCOP, formatearMiles, parseCOP } from "@/lib/dinero/cop";

interface GastoFila {
  id: string; fecha: string; rubro: string; proveedor: string; descripcion: string; total: number; estado: string;
  area: string | null; solicitante: string | null;
}

export default function GastosClient({
  fechaHoy, rubros, medios, gastos, areas, empleados,
}: {
  fechaHoy: string; rubros: { id: string; path: string }[]; medios: { id: string; nombre: string }[]; gastos: GastoFila[];
  areas: { id: string; nombre: string }[]; empleados: { id: string; nombre: string; area_id: string | null }[];
}) {
  const router = useRouter();
  const [f, setF] = useState({
    rubro_gasto_id: "", proveedor_nombre: "", proveedor_nit: "", descripcion: "", fecha_gasto: fechaHoy,
    base: "", iva: "", retefuente: "", reteica: "", otras: "", medio_pago_id: "", estado: "pendiente" as "pendiente" | "pagado", soporte: "",
    area_id: "", solicitante_id: "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pagoMedio, setPagoMedio] = useState<Record<string, string>>({});

  const total = useMemo(
    () => totalGasto({ base_gravable: parseCOP(f.base), iva: parseCOP(f.iva), retefuente: parseCOP(f.retefuente), reteica: parseCOP(f.reteica), otras_retenciones: parseCOP(f.otras) }),
    [f.base, f.iva, f.retefuente, f.reteica, f.otras],
  );

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function guardar() {
    setMsg(null);
    setEnviando(true);
    const entrada: EntradaGasto = {
      rubro_gasto_id: f.rubro_gasto_id, proveedor_nombre: f.proveedor_nombre, proveedor_nit: f.proveedor_nit,
      descripcion: f.descripcion, fecha_gasto: f.fecha_gasto,
      base_gravable: parseCOP(f.base), iva: parseCOP(f.iva), retefuente: parseCOP(f.retefuente), reteica: parseCOP(f.reteica), otras_retenciones: parseCOP(f.otras),
      medio_pago_id: f.medio_pago_id || null, estado: f.estado, soporte_archivo: f.soporte,
      area_id: f.area_id || null, solicitante_id: f.solicitante_id || null,
    };
    const r = await crearGasto(entrada);
    setEnviando(false);
    if (r.ok) {
      setMsg({ ok: true, t: "Gasto registrado." });
      setF((p) => ({ ...p, descripcion: "", base: "", iva: "", retefuente: "", reteica: "", otras: "", proveedor_nombre: "", proveedor_nit: "", soporte: "", area_id: "", solicitante_id: "" }));
      router.refresh();
    } else setMsg({ ok: false, t: r.error ?? "Error" });
  }

  async function pagar(id: string) {
    const medio = pagoMedio[id] || medios[0]?.id;
    if (!medio) return;
    const r = await marcarPagado(id, medio);
    if (r.ok) router.refresh();
  }

  const Money = ({ k, campo }: { k: string; campo: "base" | "iva" | "retefuente" | "reteica" | "otras" }) => (
    <label className="text-sm">
      <span className="block text-ranch-marron/70">{k}</span>
      <input value={f[campo] ? formatearMiles(parseCOP(f[campo])) : ""} onChange={(e) => set(campo, e.target.value)} inputMode="numeric" placeholder="0" className="w-full rounded border px-2 py-1 text-right" />
    </label>
  );

  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="mb-4 text-2xl font-black text-ranch-marron">Gastos</h1>

      <section className="mb-6 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Registrar gasto</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="block text-ranch-marron/70">Rubro</span>
            <select value={f.rubro_gasto_id} onChange={(e) => set("rubro_gasto_id", e.target.value)} className="w-full rounded border px-2 py-1">
              <option value="">Selecciona…</option>
              {rubros.map((r) => <option key={r.id} value={r.id}>{r.path}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="block text-ranch-marron/70">Fecha</span>
            <input type="date" value={f.fecha_gasto} onChange={(e) => set("fecha_gasto", e.target.value)} className="w-full rounded border px-2 py-1" />
          </label>
          <label className="text-sm"><span className="block text-ranch-marron/70">Descripción</span>
            <input value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} className="w-full rounded border px-2 py-1" />
          </label>
          <label className="text-sm"><span className="block text-ranch-marron/70">¿Quién lo pidió?</span>
            <select
              value={f.solicitante_id}
              onChange={(e) => {
                const emp = empleados.find((x) => x.id === e.target.value);
                // El área se llena sola con la del empleado; se puede cambiar si el gasto es de otra área.
                setF((p) => ({ ...p, solicitante_id: e.target.value, area_id: emp?.area_id ?? p.area_id }));
              }}
              className="w-full rounded border px-2 py-1"
            >
              <option value="">Selecciona…</option>
              {empleados.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="block text-ranch-marron/70">¿Dónde se consume? (área)</span>
            <select value={f.area_id} onChange={(e) => set("area_id", e.target.value)} className="w-full rounded border px-2 py-1">
              <option value="">Selecciona…</option>
              {areas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="block text-ranch-marron/70">Proveedor</span>
            <input value={f.proveedor_nombre} onChange={(e) => set("proveedor_nombre", e.target.value)} placeholder="Nombre" className="w-full rounded border px-2 py-1" />
          </label>
          <label className="text-sm"><span className="block text-ranch-marron/70">NIT / Cédula</span>
            <input value={f.proveedor_nit} onChange={(e) => set("proveedor_nit", e.target.value)} className="w-full rounded border px-2 py-1" />
          </label>
          <Money k="Base gravable" campo="base" />
          <Money k="IVA" campo="iva" />
          <Money k="Retefuente" campo="retefuente" />
          <Money k="ReteICA" campo="reteica" />
          <Money k="Otras retenciones" campo="otras" />
          <label className="text-sm"><span className="block text-ranch-marron/70">Soporte (URL de la factura)</span>
            <input value={f.soporte} onChange={(e) => set("soporte", e.target.value)} placeholder="https://…" className="w-full rounded border px-2 py-1" />
          </label>
          <label className="text-sm"><span className="block text-ranch-marron/70">Estado</span>
            <select value={f.estado} onChange={(e) => set("estado", e.target.value)} className="w-full rounded border px-2 py-1">
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
            </select>
          </label>
          {f.estado === "pagado" && (
            <label className="text-sm"><span className="block text-ranch-marron/70">Medio de pago</span>
              <select value={f.medio_pago_id} onChange={(e) => set("medio_pago_id", e.target.value)} className="w-full rounded border px-2 py-1">
                <option value="">Selecciona…</option>
                {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-ranch-marron/70">Total: <strong className="text-lg text-ranch-marron">{formatearCOP(total)}</strong></span>
          <button onClick={guardar} disabled={enviando} className="rounded-lg bg-ranch-marron px-5 py-2 font-semibold text-ranch-crema disabled:opacity-50">
            {enviando ? "Guardando…" : "Registrar gasto"}
          </button>
        </div>
        {msg && <p className={`mt-2 rounded px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
      </section>

      <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Últimos gastos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ranch-marron/60">
              <th className="py-1">Fecha</th><th>Rubro</th><th>Proveedor</th><th>Área · pidió</th><th className="text-right">Total</th><th>Estado</th><th></th>
            </tr></thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id} className="border-t border-ranch-marron/10">
                  <td className="py-1">{g.fecha}</td>
                  <td>{g.rubro}</td>
                  <td>{g.proveedor}</td>
                  <td className="text-ranch-marron/70">
                    {g.area ?? "—"}
                    {g.solicitante && <span className="block text-xs text-ranch-marron/50">{g.solicitante}</span>}
                  </td>
                  <td className="text-right">{formatearCOP(g.total)}</td>
                  <td><span className={g.estado === "pagado" ? "text-ranch-verde" : g.estado === "anulado" ? "text-red-600" : "text-ranch-dorado"}>{g.estado}</span></td>
                  <td className="text-right">
                    {g.estado === "pendiente" && (
                      <span className="flex justify-end gap-1">
                        <select value={pagoMedio[g.id] ?? ""} onChange={(e) => setPagoMedio((p) => ({ ...p, [g.id]: e.target.value }))} className="rounded border px-1 py-0.5 text-xs">
                          <option value="">medio…</option>
                          {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                        <button onClick={() => pagar(g.id)} className="rounded bg-ranch-verde px-2 py-0.5 text-xs font-semibold text-white">Pagar</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {gastos.length === 0 && <tr><td colSpan={7}className="py-2 text-ranch-marron/40">Sin gastos aún.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
