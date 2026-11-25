"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { crearOrden, crearOrdenDesdeFalla, descartarFalla } from "./actions";
import type { AlertaEquipo } from "@/lib/equipos/mantenimiento";
import type { IndicadoresMantenimiento } from "@/lib/equipos/indicadores";
import { formatearCOP } from "@/lib/dinero/cop";

interface Falla { id: string; equipo: string; codigo: string | null; equipoId: string; descripcion: string; prioridad: string; detenido: boolean; fecha: string; reporto: string; fotos: string[] }
interface Abierta { id: string; equipo: string; codigo: string | null; grupo: string; equipoId: string; tipo: string; descripcion: string; estado: string; fecha: string | null; horasObjetivo: number | null; horometro: number | null; vencimiento: "vencido" | "proximo" | "al_dia"; dePlan: boolean }
interface Realizada { id: string; equipo: string; codigo: string | null; tipo: string; descripcion: string; fecha: string | null; quien: string; costo: number }

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" }) : "—");
const millones = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : formatearCOP(v));
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`);
const PRIO: Record<string, string> = { critica: "bg-red-600 text-white", alta: "bg-orange-500 text-white", media: "bg-amber-200 text-amber-900", baja: "bg-ranch-marron/10 text-ranch-marron" };
const VENC: Record<string, string> = { vencido: "bg-red-100 text-red-700", proximo: "bg-amber-100 text-amber-800", al_dia: "bg-green-100 text-green-800" };
const VENC_TXT: Record<string, string> = { vencido: "Vencido", proximo: "Próximo", al_dia: "Al día" };
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm";

export default function MantenimientoClient(p: {
  anio: number; hoy: string; alertas: AlertaEquipo[]; fallas: Falla[]; abiertas: Abierta[]; realizadas: Realizada[];
  equipos: { id: string; nombre: string; grupo: string }[]; ind: IndicadoresMantenimiento;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [descartando, setDescartando] = useState<{ id: string; motivo: string } | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "vencido" | "proximo" | "en_proceso" | "correctivo">("todas");
  const [nueva, setNueva] = useState({ equipo_id: "", tipo: "correctivo", descripcion: "", fecha_programada: p.hoy });
  const [verNueva, setVerNueva] = useState(false);

  const correr = async (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, exito: string, ir?: (id?: string) => string) => {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, t: exito }); if (ir) router.push(ir(r.id)); else router.refresh(); } else setMsg({ ok: false, t: r.error ?? "Error" });
    return r.ok;
  };

  const lista = useMemo(() => p.abiertas.filter((o) =>
    filtro === "todas" ? true : filtro === "en_proceso" ? o.estado === "en_proceso" : filtro === "correctivo" ? o.tipo === "correctivo" : o.vencimiento === filtro), [p.abiertas, filtro]);
  const n = {
    vencidos: p.abiertas.filter((o) => o.vencimiento === "vencido").length,
    proximos: p.abiertas.filter((o) => o.vencimiento === "proximo").length,
    proceso: p.abiertas.filter((o) => o.estado === "en_proceso").length,
    criticas: p.fallas.filter((f) => f.prioridad === "critica" || f.detenido).length,
  };

  return (
    <main className="mx-auto max-w-[96rem] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ranch-marron">Mantenimiento de equipos</h1>
          <p className="text-sm text-ranch-marron/60">Fallas reportadas, preventivos programados y órdenes de trabajo. Los preventivos se programan solos según los planes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/equipos/planes" className="rounded-full border border-ranch-marron/30 px-4 py-2 text-sm font-semibold text-ranch-marron hover:bg-ranch-marron/10">🗓️ Planes preventivos</Link>
          <button onClick={() => setVerNueva(!verNueva)} className="rounded-full bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema">＋ Nueva orden</button>
        </div>
      </div>

      {msg && <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {verNueva && (
        <section className={`${card} mb-4`}>
          <h2 className="mb-2 font-bold text-ranch-marron">Nueva orden de mantenimiento</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm lg:col-span-2"><span className="block text-ranch-marron/70">Equipo</span>
              <select id="nueva-equipo" value={nueva.equipo_id} onChange={(e) => setNueva({ ...nueva, equipo_id: e.target.value })} className="w-full rounded border px-2 py-1.5">
                <option value="">Selecciona…</option>
                {p.equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.grupo}</option>)}
              </select>
            </label>
            <label className="text-sm"><span className="block text-ranch-marron/70">Tipo</span>
              <select id="nueva-tipo" value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })} className="w-full rounded border px-2 py-1.5">
                <option value="correctivo">Correctivo (reparar)</option><option value="preventivo">Preventivo (revisión)</option>
              </select>
            </label>
            <label className="text-sm"><span className="block text-ranch-marron/70">Para el</span>
              <input id="nueva-fecha" type="date" value={nueva.fecha_programada} onChange={(e) => setNueva({ ...nueva, fecha_programada: e.target.value })} className="w-full rounded border px-2 py-1.5" />
            </label>
            <label className="text-sm sm:col-span-2 lg:col-span-4"><span className="block text-ranch-marron/70">Qué hay que hacer</span>
              <input id="nueva-desc" value={nueva.descripcion} onChange={(e) => setNueva({ ...nueva, descripcion: e.target.value })} placeholder="Ej.: revisar el sistema eléctrico" className="w-full rounded border px-2 py-1.5" />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button disabled={busy} onClick={() => correr(() => crearOrden(nueva), "Orden creada.", (id) => `/admin/equipos/mantenimiento/${id}`)} className="rounded-lg bg-ranch-marron px-5 py-2 font-semibold text-ranch-crema disabled:opacity-50">Crear orden</button>
          </div>
        </section>
      )}

      {/* KPI */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Fallas por atender", p.fallas.length, n.criticas ? `${n.criticas} críticas o con equipo detenido` : "ninguna crítica", n.criticas > 0],
          ["Vencidos", n.vencidos, "órdenes que ya debían hacerse", n.vencidos > 0],
          ["Próximos", n.proximos, "dentro del aviso del plan", false],
          ["En proceso", n.proceso, "equipos en el taller", false],
          [`Costo ${p.anio}`, millones(p.ind.costoTotal), `${p.ind.ordenes} órdenes · ${pct(p.ind.costoTotal ? p.ind.costoCorrectivo / p.ind.costoTotal : null)} correctivo`, false],
        ].map(([t, v, s, alerta]) => (
          <div key={String(t)} className={`rounded-2xl border-2 bg-white p-4 ${alerta ? "border-red-300" : "border-ranch-marron/15"}`}>
            <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{t}</p>
            <p className={`mt-1 text-2xl font-black tabular-nums ${alerta ? "text-red-600" : "text-ranch-marron"}`}>{v}</p>
            <p className="text-xs text-ranch-marron/50">{s}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-2">
        {/* Fallas */}
        <section id="fallas" className={card}>
          <h2 className="mb-2 font-bold text-ranch-marron">Fallas reportadas por atender</h2>
          {p.fallas.length === 0 ? <p className="text-sm text-ranch-marron/50">No hay fallas pendientes. Cualquier usuario puede reportar desde <Link href="/reportar-falla" className="underline">Reportar falla</Link>.</p> : (
            <ul className="space-y-2">
              {p.fallas.map((f) => (
                <li key={f.id} className="rounded-xl border border-ranch-marron/15 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${PRIO[f.prioridad]}`}>{f.prioridad === "critica" ? "CRÍTICA" : f.prioridad.toUpperCase()}</span>
                    {f.detenido && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Detenido</span>}
                    <Link href={`/admin/equipos/${f.equipoId}`} className="font-bold text-ranch-marron underline-offset-2 hover:underline">{f.equipo}{f.codigo ? ` (${f.codigo})` : ""}</Link>
                  </div>
                  <p className="mt-1 text-sm text-ranch-marron/80">{f.descripcion}</p>
                  <p className="text-xs text-ranch-marron/50">Reportó {f.reporto} · {new Date(f.fecha).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}</p>
                  {f.fotos.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {f.fotos.map((id) => (
                        <a key={id} href={`/admin/equipos/fotos/${id}`} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/admin/equipos/fotos/${id}`} alt="Foto de la falla" className="h-16 w-16 rounded-lg object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => correr(() => crearOrdenDesdeFalla(f.id), "Orden correctiva creada.", (id) => `/admin/equipos/mantenimiento/${id}`)} className="rounded-lg bg-ranch-marron px-3 py-1.5 text-sm font-semibold text-ranch-crema disabled:opacity-50">Crear orden correctiva</button>
                    {descartando?.id === f.id ? (
                      <span className="flex gap-1">
                        <input autoFocus value={descartando.motivo} onChange={(e) => setDescartando({ id: f.id, motivo: e.target.value })} placeholder="Motivo" className="w-40 rounded border px-2 py-1 text-sm" />
                        <button disabled={busy} onClick={async () => { if (await correr(() => descartarFalla(f.id, descartando.motivo), "Falla descartada.")) setDescartando(null); }} className="rounded bg-red-600 px-2 text-sm font-semibold text-white">Descartar</button>
                        <button onClick={() => setDescartando(null)} className="rounded border px-2 text-sm">✕</button>
                      </span>
                    ) : <button onClick={() => setDescartando({ id: f.id, motivo: "" })} className="rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-sm text-ranch-marron">Descartar</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Alertas */}
        <section className={card}>
          <h2 className="mb-2 font-bold text-ranch-marron">Alertas</h2>
          {p.alertas.filter((a) => a.tipo !== "falla").length === 0 ? <p className="text-sm text-ranch-marron/50">Todo al día: sin vencidos, equipos parados ni garantías por vencer.</p> : (
            <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto">
              {p.alertas.filter((a) => a.tipo !== "falla").map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className={`block rounded-lg border px-3 py-2 text-sm hover:shadow ${a.nivel === "alta" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                    <span className="font-semibold text-ranch-marron">{a.nivel === "alta" ? "⚠" : "•"} {a.titulo}</span>
                    <span className="block text-xs text-ranch-marron/60">{a.detalle}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Órdenes abiertas */}
      <section className={`${card} mb-5`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-ranch-marron">Órdenes abiertas ({p.abiertas.length})</h2>
          <div className="flex flex-wrap gap-1 text-sm">
            {([["todas", "Todas"], ["vencido", "Vencidas"], ["proximo", "Próximas"], ["en_proceso", "En proceso"], ["correctivo", "Correctivas"]] as const).map(([v, t]) => (
              <button key={v} onClick={() => setFiltro(v)} className={`rounded-full px-3 py-1 ${filtro === v ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/20 text-ranch-marron/70"}`}>{t}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ranch-marron/60"><th className="py-1">Estado</th><th>Equipo</th><th>Qué</th><th>Tipo</th><th>Programado</th><th></th></tr></thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id} className="border-t border-ranch-marron/10">
                  <td className="py-1.5 pr-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.estado === "en_proceso" ? "bg-blue-100 text-blue-800" : VENC[o.vencimiento]}`}>{o.estado === "en_proceso" ? "En proceso" : VENC_TXT[o.vencimiento]}</span></td>
                  <td className="pr-2"><Link href={`/admin/equipos/${o.equipoId}`} className="font-medium hover:underline">{o.equipo}{o.codigo ? ` (${o.codigo})` : ""}</Link><span className="block text-xs text-ranch-marron/50">{o.grupo}</span></td>
                  <td className="pr-2">{o.descripcion}</td>
                  <td className="pr-2 capitalize">{o.tipo}{o.dePlan ? <span className="block text-xs text-ranch-marron/40">por plan</span> : null}</td>
                  <td className="whitespace-nowrap pr-2">{o.fecha ? fecha(o.fecha) : ""}{o.horasObjetivo != null && <span className="block text-xs text-ranch-marron/60">a las {o.horasObjetivo} h (lleva {o.horometro ?? 0} h)</span>}</td>
                  <td className="text-right"><Link href={`/admin/equipos/mantenimiento/${o.id}`} className="rounded-lg border border-ranch-marron/30 px-3 py-1 text-sm font-semibold text-ranch-marron hover:bg-ranch-crema">Abrir</Link></td>
                </tr>
              ))}
              {lista.length === 0 && <tr><td colSpan={6} className="py-3 text-ranch-marron/40">{p.abiertas.length ? "Ninguna con este filtro." : "No hay órdenes abiertas. Crea planes preventivos para que se programen solas."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Realizadas */}
        <section className={card}>
          <h2 className="mb-2 font-bold text-ranch-marron">Últimas realizadas</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ranch-marron/60"><th className="py-1">Fecha</th><th>Equipo</th><th>Qué</th><th>Quién</th><th className="text-right">Costo</th></tr></thead>
              <tbody>
                {p.realizadas.map((o) => (
                  <tr key={o.id} className="border-t border-ranch-marron/10">
                    <td className="whitespace-nowrap py-1.5 pr-2">{fecha(o.fecha)}</td>
                    <td className="pr-2"><Link href={`/admin/equipos/mantenimiento/${o.id}`} className="hover:underline">{o.equipo}</Link></td>
                    <td className="pr-2">{o.descripcion}<span className="block text-xs capitalize text-ranch-marron/40">{o.tipo}</span></td>
                    <td className="pr-2">{o.quien}</td>
                    <td className="text-right tabular-nums">{o.costo ? formatearCOP(o.costo) : "—"}</td>
                  </tr>
                ))}
                {p.realizadas.length === 0 && <tr><td colSpan={5} className="py-3 text-ranch-marron/40">Aún no hay mantenimientos realizados.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Indicadores */}
        <section className={card}>
          <h2 className="mb-2 font-bold text-ranch-marron">Indicadores {p.anio}</h2>
          <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              ["Preventivos", `${p.ind.preventivos}`, millones(p.ind.costoPreventivo)],
              ["Correctivos", `${p.ind.correctivos}`, millones(p.ind.costoCorrectivo)],
              ["Cumplimiento", pct(p.ind.cumplimiento), "preventivos a tiempo"],
              ["Parada promedio", p.ind.horasParadoPromedio == null ? "—" : `${Math.round(p.ind.horasParadoPromedio)} h`, "por correctivo"],
            ].map(([t, v, s]) => (
              <div key={t} className="rounded-xl bg-ranch-crema/60 p-2"><p className="text-[11px] text-ranch-marron/60">{t}</p><p className="text-lg font-black tabular-nums text-ranch-marron">{v}</p><p className="text-[11px] text-ranch-marron/50">{s}</p></div>
            ))}
          </div>
          {p.ind.porGrupo.length > 0 ? (
            <>
              <p className="mb-1 text-xs font-semibold text-ranch-marron/60">Costo por grupo</p>
              <div className="mb-3 space-y-1">
                {p.ind.porGrupo.slice(0, 8).map((g) => (
                  <div key={g.grupo} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
                    <span className="truncate">{g.grupo}</span>
                    <span className="h-2.5 rounded bg-ranch-marron/5"><span className="block h-2.5 rounded bg-ranch-dorado" style={{ width: `${(g.costo / (p.ind.porGrupo[0].costo || 1)) * 100}%` }} /></span>
                    <span className="tabular-nums">{millones(g.costo)} · {g.ordenes}</span>
                  </div>
                ))}
              </div>
              <p className="mb-1 text-xs font-semibold text-ranch-marron/60">Equipos que más cuestan</p>
              <ol className="list-decimal space-y-0.5 pl-5 text-xs">
                {p.ind.topEquipos.slice(0, 5).map((e) => <li key={e.equipo}>{e.equipo}: <b>{millones(e.costo)}</b>{e.correctivos ? ` · ${e.correctivos} correctivo(s)` : ""}</li>)}
              </ol>
            </>
          ) : <p className="text-sm text-ranch-marron/50">Los indicadores aparecen cuando se cierren las primeras órdenes.</p>}
        </section>
      </div>
    </main>
  );
}
