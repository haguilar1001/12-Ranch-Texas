"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearPlan, editarPlan, cambiarEstadoPlan, type EntradaPlan } from "../mantenimiento/actions";
import { formatearCOP, formatearMiles, parseCOP } from "@/lib/dinero/cop";

interface Plan {
  id: string; nombre: string; instrucciones: string; activo: boolean; alcance: string; categoria_id: string; equipo_id: string; aplicaA: string;
  frecuencia_dias: number | null; frecuencia_horas: number | null; aviso_dias: number; costo_estimado: number | null; pendientes: number; proxima: string | null;
}

const vacio: EntradaPlan = { nombre: "", instrucciones: "", alcance: "grupo", categoria_id: "", equipo_id: "", frecuencia_dias: "", frecuencia_horas: "", aviso_dias: "7", costo_estimado: "" };
const FRECUENCIAS = [["7", "Semanal"], ["15", "Quincenal"], ["30", "Mensual"], ["90", "Trimestral"], ["180", "Semestral"], ["365", "Anual"]];
const frecuenciaTxt = (p: Plan) => [p.frecuencia_dias ? (FRECUENCIAS.find(([d]) => +d === p.frecuencia_dias)?.[1] ?? `cada ${p.frecuencia_dias} días`) : null, p.frecuencia_horas ? `cada ${formatearMiles(p.frecuencia_horas)} h de uso` : null].filter(Boolean).join(" o ");

export default function PlanesClient({ planes, grupos, equipos }: { planes: Plan[]; grupos: { id: string; nombre: string; equipos: number }[]; equipos: { id: string; nombre: string; grupo: string; horometro: boolean }[] }) {
  const router = useRouter();
  const [f, setF] = useState<EntradaPlan>(vacio);
  const [editando, setEditando] = useState<string | null>(null);
  const [verForm, setVerForm] = useState(planes.length === 0);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof EntradaPlan, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function guardar() {
    setBusy(true); setMsg(null);
    const datos = { ...f, costo_estimado: f.costo_estimado ? String(parseCOP(f.costo_estimado)) : "" };
    const r = editando ? await editarPlan(editando, datos) : await crearPlan(datos);
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, t: editando ? "Plan actualizado." : `Plan creado. ${r.aviso ?? ""}` }); setF(vacio); setEditando(null); setVerForm(false); router.refresh(); }
    else setMsg({ ok: false, t: r.error ?? "Error" });
  }
  function editar(p: Plan) {
    setEditando(p.id); setVerForm(true);
    setF({ nombre: p.nombre, instrucciones: p.instrucciones, alcance: p.alcance as "grupo", categoria_id: p.categoria_id, equipo_id: p.equipo_id, frecuencia_dias: p.frecuencia_dias ? String(p.frecuencia_dias) : "", frecuencia_horas: p.frecuencia_horas ? String(p.frecuencia_horas) : "", aviso_dias: String(p.aviso_dias), costo_estimado: p.costo_estimado ? String(p.costo_estimado) : "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function activar(p: Plan) {
    setBusy(true);
    const r = await cambiarEstadoPlan(p.id, !p.activo);
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: p.activo ? "Plan desactivado: se cancelaron sus órdenes programadas." : "Plan activado." } : { ok: false, t: r.error ?? "Error" });
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link href="/admin/equipos/mantenimiento" className="text-sm text-ranch-marron/60 hover:underline">← Mantenimiento</Link>
      <div className="mb-4 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ranch-marron">Planes de mantenimiento preventivo</h1>
          <p className="text-sm text-ranch-marron/60">Qué se le hace a cada equipo y cada cuánto. Con cada plan, la app programa sola la siguiente orden de cada equipo.</p>
        </div>
        {!verForm && <button onClick={() => { setVerForm(true); setEditando(null); setF(vacio); }} className="rounded-full bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema">＋ Nuevo plan</button>}
      </div>
      {msg && <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {verForm && (
        <section className="mb-5 rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
          <h2 className="mb-3 font-bold text-ranch-marron">{editando ? "Editar plan" : "Nuevo plan"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2"><span className="block text-ranch-marron/70">Qué se hace</span>
              <input id="p-nombre" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej.: Cambio de aceite y revisión de frenos" className="w-full rounded border px-2 py-1.5" />
            </label>
            <fieldset className="text-sm"><legend className="text-ranch-marron/70">Aplica a</legend>
              <div className="mt-1 flex gap-2">
                {[["grupo", "Todo un grupo"], ["equipo", "Un equipo"]].map(([v, t]) => (
                  <button key={v} type="button" onClick={() => set("alcance", v)} aria-pressed={f.alcance === v} className={`flex-1 rounded-lg border-2 px-2 py-1.5 ${f.alcance === v ? "border-ranch-marron bg-ranch-crema/60 font-semibold" : "border-ranch-marron/15"}`}>{t}</button>
                ))}
              </div>
            </fieldset>
            {f.alcance === "grupo" ? (
              <label className="text-sm"><span className="block text-ranch-marron/70">Grupo</span>
                <select id="p-grupo" value={f.categoria_id} onChange={(e) => set("categoria_id", e.target.value)} className="w-full rounded border px-2 py-1.5">
                  <option value="">Selecciona…</option>{grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre} ({g.equipos})</option>)}
                </select>
              </label>
            ) : (
              <label className="text-sm"><span className="block text-ranch-marron/70">Equipo</span>
                <select id="p-equipo" value={f.equipo_id} onChange={(e) => set("equipo_id", e.target.value)} className="w-full rounded border px-2 py-1.5">
                  <option value="">Selecciona…</option>{equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.grupo}{e.horometro ? " · con horómetro" : ""}</option>)}
                </select>
              </label>
            )}
            <label className="text-sm"><span className="block text-ranch-marron/70">Cada cuántos días</span>
              <div className="flex gap-1">
                <input id="p-dias" value={f.frecuencia_dias} onChange={(e) => set("frecuencia_dias", e.target.value)} inputMode="numeric" placeholder="días" className="w-24 rounded border px-2 py-1.5 text-right" />
                <select aria-label="Frecuencia rápida" value="" onChange={(e) => e.target.value && set("frecuencia_dias", e.target.value)} className="flex-1 rounded border px-2 py-1.5 text-ranch-marron/70">
                  <option value="">o escoge…</option>{FRECUENCIAS.map(([d, t]) => <option key={d} value={d}>{t}</option>)}
                </select>
              </div>
            </label>
            <label className="text-sm"><span className="block text-ranch-marron/70">Y/o cada cuántas horas de uso</span>
              <input id="p-horas" value={f.frecuencia_horas} onChange={(e) => set("frecuencia_horas", e.target.value)} inputMode="numeric" placeholder="Solo equipos con horómetro (ej. 100)" className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="text-sm"><span className="block text-ranch-marron/70">Avisar con cuántos días de anticipación</span>
              <input id="p-aviso" value={f.aviso_dias} onChange={(e) => set("aviso_dias", e.target.value)} inputMode="numeric" className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="text-sm"><span className="block text-ranch-marron/70">Costo estimado por vez (opcional)</span>
              <input id="p-costo" value={f.costo_estimado ? formatearMiles(parseCOP(f.costo_estimado)) : ""} onChange={(e) => set("costo_estimado", e.target.value)} inputMode="numeric" className="w-full rounded border px-2 py-1.5 text-right" />
            </label>
            <label className="text-sm sm:col-span-2"><span className="block text-ranch-marron/70">Lista de chequeo (una tarea por renglón)</span>
              <textarea id="p-instr" rows={4} value={f.instrucciones} onChange={(e) => set("instrucciones", e.target.value)} placeholder={"Revisar nivel de aceite\nAjustar cadena\nProbar frenos"} className="w-full rounded border px-2 py-1.5" />
            </label>
          </div>
          <p className="mt-2 text-xs text-ranch-marron/50">Si pones días y horas, la orden vence con lo que llegue primero. Las horas solo aplican a los equipos que llevan horómetro (se activa en la hoja de vida del equipo).</p>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => { setVerForm(false); setEditando(null); setF(vacio); }} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
            <button disabled={busy} onClick={guardar} className="rounded-lg bg-ranch-marron px-5 py-2 font-semibold text-ranch-crema disabled:opacity-50">{editando ? "Guardar cambios" : "Crear plan"}</button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ranch-marron/60"><th className="py-1">Plan</th><th>Aplica a</th><th>Frecuencia</th><th>Próxima</th><th className="text-right">Costo est.</th><th></th></tr></thead>
            <tbody>
              {planes.map((p) => (
                <tr key={p.id} className={`border-t border-ranch-marron/10 ${p.activo ? "" : "text-ranch-marron/40"}`}>
                  <td className="py-2 pr-2 font-semibold">{p.nombre}{!p.activo && <span className="ml-1 text-xs font-normal">(inactivo)</span>}</td>
                  <td className="pr-2">{p.aplicaA}</td>
                  <td className="pr-2">{frecuenciaTxt(p)}<span className="block text-xs text-ranch-marron/40">avisa {p.aviso_dias} días antes</span></td>
                  <td className="whitespace-nowrap pr-2">{p.proxima ? new Date(p.proxima).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" }) : "—"}<span className="block text-xs text-ranch-marron/40">{p.pendientes} orden(es) abiertas</span></td>
                  <td className="text-right tabular-nums">{p.costo_estimado ? formatearCOP(p.costo_estimado) : "—"}</td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => editar(p)} className="mr-1 rounded border border-ranch-marron/30 px-2 py-0.5 text-xs">Editar</button>
                    <button disabled={busy} onClick={() => activar(p)} className={`rounded border px-2 py-0.5 text-xs ${p.activo ? "border-red-300 text-red-600" : "border-green-300 text-green-700"}`}>{p.activo ? "Desactivar" : "Activar"}</button>
                  </td>
                </tr>
              ))}
              {planes.length === 0 && <tr><td colSpan={6} className="py-3 text-ranch-marron/50">Aún no hay planes. Empieza por los equipos que más se usan: karts, motos, plantas eléctricas, botes.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
