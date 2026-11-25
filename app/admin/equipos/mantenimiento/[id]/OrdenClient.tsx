"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { iniciarOrden, cerrarOrden, cancelarOrden, reprogramarOrden, type RepuestoEntrada } from "../actions";
import FotosEvidencia from "@/components/FotosEvidencia";
import { formatearCOP, formatearMiles, parseCOP } from "@/lib/dinero/cop";

interface Orden {
  id: string; tipo: string; descripcion: string; estado: string; fechaProgramada: string | null; fechaInicio: string | null; fechaRealizada: string | null;
  horasObjetivo: number | null; vencimiento: "vencido" | "proximo" | "al_dia" | null; ejecutor: string | null; quien: string | null; trabajos: string | null; observaciones: string | null;
  repuestos: { descripcion: string; cantidad: number; unidad: string | null; precio: number; subtotal: number }[];
  repuestosTotal: number; manoObra: number; costo: number; factura: string | null; horasFuera: number | null; horometro: number | null;
  gasto: { id: string; estado: string } | null; motivoCancelacion: string | null; fotos: { id: string; tipo: string }[];
}
interface Equipo { id: string; nombre: string; codigo: string | null; grupo: string; ubicacion: string | null; estado: string; usaHorometro: boolean; horometro: number | null; garantia: string | null }

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" }) : "—");
const ESTADO: Record<string, [string, string]> = {
  programado: ["Programada", "bg-amber-100 text-amber-800"], en_proceso: ["En proceso", "bg-blue-100 text-blue-800"],
  realizado: ["Realizada", "bg-green-100 text-green-800"], cancelado: ["Cancelada", "bg-ranch-marron/10 text-ranch-marron/60"],
};
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white p-4";
const nuevoRepuesto = (): RepuestoEntrada => ({ descripcion: "", cantidad: "1", unidad: "", precio_unitario: "" });

export default function OrdenClient({ hoy, orden: o, equipo: e, plan, falla, empleados, proveedores }: {
  hoy: string; orden: Orden; equipo: Equipo;
  plan: { nombre: string; instrucciones: string | null; frecuenciaDias: number | null; frecuenciaHoras: number | null; costoEstimado: number | null } | null;
  falla: { descripcion: string; prioridad: string; detenido: boolean; fecha: string; reporto: string; fotos: string[] } | null;
  empleados: { id: string; nombre: string }[]; proveedores: string[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState<string | null>(null);
  const [cierre, setCierre] = useState({
    fecha_realizada: hoy, ejecutor: "interno", empleado_id: "", proveedor_nombre: "",
    trabajos_realizados: plan?.instrucciones ? plan.instrucciones.split("\n").filter(Boolean).map((l) => `✓ ${l.trim()}`).join("\n") : "",
    mano_obra: "", numero_factura: "", horometro: e.horometro != null ? String(e.horometro) : "", observaciones: "",
  });
  const [repuestos, setRepuestos] = useState<RepuestoEntrada[]>([nuevoRepuesto()]);
  const [fotos, setFotos] = useState<File[]>([]);

  const abierta = o.estado === "programado" || o.estado === "en_proceso";
  const totalRep = repuestos.reduce((t, r) => t + Math.round((Number(r.cantidad.replace(",", ".")) || 0) * parseCOP(r.precio_unitario)), 0);
  const total = totalRep + parseCOP(cierre.mano_obra);
  const set = (k: keyof typeof cierre, v: string) => setCierre((c) => ({ ...c, [k]: v }));
  const setRep = (i: number, k: keyof RepuestoEntrada, v: string) => setRepuestos((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function correr(fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, exito: string) {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, t: `${exito}${r.aviso ? ` ${r.aviso}` : ""}` }); router.refresh(); } else setMsg({ ok: false, t: r.error ?? "Error" });
    return r.ok;
  }
  function cerrar() {
    const fd = new FormData();
    Object.entries(cierre).forEach(([k, v]) => fd.set(k, v));
    fd.set("mano_obra", String(parseCOP(cierre.mano_obra)));
    fd.set("repuestos", JSON.stringify(repuestos.map((r) => ({ ...r, precio_unitario: String(parseCOP(r.precio_unitario)) }))));
    fotos.forEach((f) => fd.append("fotos", f));
    return correr(() => cerrarOrden(o.id, fd), "Orden cerrada.");
  }

  const [estadoTxt, estadoCls] = ESTADO[o.estado] ?? [o.estado, ""];

  return (
    <div className="mt-2 space-y-4">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${estadoCls}`}>{estadoTxt}</span>
          {o.vencimiento === "vencido" && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Vencida</span>}
          {o.vencimiento === "proximo" && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Próxima</span>}
          <span className="text-xs uppercase tracking-wide text-ranch-marron/50">{o.tipo === "preventivo" ? "Preventivo" : "Correctivo"}</span>
        </div>
        <h1 className="mt-1 text-2xl font-black text-ranch-marron">{o.descripcion}</h1>
        <p className="text-sm text-ranch-marron/70">
          <Link href={`/admin/equipos/${e.id}`} className="font-semibold underline">{e.nombre}{e.codigo ? ` (${e.codigo})` : ""}</Link> · {e.grupo}{e.ubicacion ? ` · ${e.ubicacion}` : ""} · equipo {e.estado.replace("_", " ")}
        </p>
        <p className="text-sm text-ranch-marron/60">
          {o.fechaProgramada && <>Programada para el {fecha(o.fechaProgramada)}. </>}
          {o.horasObjetivo != null && <>Toca a las {formatearMiles(o.horasObjetivo)} h de uso (lleva {formatearMiles(e.horometro ?? 0)} h). </>}
          {o.fechaInicio && o.estado !== "realizado" && <>Iniciada el {fecha(o.fechaInicio)}. </>}
        </p>
      </header>

      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {falla && (
        <section className={`${card} border-amber-200 bg-amber-50/50`}>
          <h2 className="font-bold text-ranch-marron">Falla reportada</h2>
          <p className="text-sm text-ranch-marron/80">{falla.descripcion}</p>
          <p className="text-xs text-ranch-marron/50">Prioridad {falla.prioridad}{falla.detenido ? " · equipo detenido" : ""} · reportó {falla.reporto} el {fecha(falla.fecha)}</p>
          {falla.fotos.length > 0 && <div className="mt-2 flex gap-2">{falla.fotos.map((id) => <Foto key={id} id={id} />)}</div>}
        </section>
      )}

      {plan && (
        <section className={card}>
          <h2 className="font-bold text-ranch-marron">Plan: {plan.nombre}</h2>
          <p className="text-xs text-ranch-marron/60">
            {[plan.frecuenciaDias ? `cada ${plan.frecuenciaDias} días` : null, plan.frecuenciaHoras ? `cada ${plan.frecuenciaHoras} horas de uso` : null].filter(Boolean).join(" o ")}
            {plan.costoEstimado ? ` · costo estimado ${formatearCOP(plan.costoEstimado)}` : ""}
          </p>
          {plan.instrucciones && <ul className="mt-2 list-disc pl-5 text-sm text-ranch-marron/80">{plan.instrucciones.split("\n").filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </section>
      )}

      {/* ---------------- Acciones de una orden abierta ---------------- */}
      {abierta && (
        <section className={card}>
          <div className="flex flex-wrap gap-2">
            {o.estado === "programado" && <button disabled={busy} onClick={() => correr(() => iniciarOrden(o.id), "Orden iniciada: el equipo quedó en mantenimiento.")} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">▶ Iniciar trabajo</button>}
            {o.estado === "programado" && (nuevaFecha == null
              ? <button onClick={() => setNuevaFecha(o.fechaProgramada?.slice(0, 10) ?? hoy)} className="rounded-lg border border-ranch-marron/30 px-4 py-2 text-sm text-ranch-marron">Reprogramar</button>
              : <span className="flex gap-1"><input type="date" value={nuevaFecha} onChange={(ev) => setNuevaFecha(ev.target.value)} className="rounded border px-2 text-sm" /><button disabled={busy} onClick={async () => { if (await correr(() => reprogramarOrden(o.id, nuevaFecha), "Orden reprogramada.")) setNuevaFecha(null); }} className="rounded bg-ranch-marron px-3 text-sm text-ranch-crema">Guardar</button><button onClick={() => setNuevaFecha(null)} className="rounded border px-2 text-sm">✕</button></span>)}
            {cancelando == null
              ? <button onClick={() => setCancelando("")} className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600">Cancelar orden</button>
              : <span className="flex gap-1"><input autoFocus value={cancelando} onChange={(ev) => setCancelando(ev.target.value)} placeholder="Motivo" className="w-48 rounded border px-2 text-sm" /><button disabled={busy} onClick={() => correr(() => cancelarOrden(o.id, cancelando), "Orden cancelada.")} className="rounded bg-red-600 px-3 text-sm text-white">Cancelar</button><button onClick={() => setCancelando(null)} className="rounded border px-2 text-sm">✕</button></span>}
          </div>
        </section>
      )}

      {abierta && (
        <section className={card}>
          <h2 className="mb-3 font-bold text-ranch-marron">Cerrar la orden: qué se hizo</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="block text-ranch-marron/70">Fecha en que se hizo</span>
              <input id="c-fecha" type="date" max={hoy} value={cierre.fecha_realizada} onChange={(ev) => set("fecha_realizada", ev.target.value)} className="w-full rounded border px-2 py-1.5" />
            </label>
            <fieldset className="text-sm"><legend className="text-ranch-marron/70">¿Quién lo hizo?</legend>
              <div className="mt-1 flex gap-2">
                {[["interno", "Personal del parque"], ["externo", "Proveedor / técnico"]].map(([v, t]) => (
                  <button key={v} type="button" onClick={() => set("ejecutor", v)} aria-pressed={cierre.ejecutor === v} className={`flex-1 rounded-lg border-2 px-2 py-1.5 ${cierre.ejecutor === v ? "border-ranch-marron bg-ranch-crema/60 font-semibold" : "border-ranch-marron/15"}`}>{t}</button>
                ))}
              </div>
            </fieldset>
            {cierre.ejecutor === "interno" ? (
              <label className="text-sm sm:col-span-2"><span className="block text-ranch-marron/70">Empleado</span>
                <select id="c-empleado" value={cierre.empleado_id} onChange={(ev) => set("empleado_id", ev.target.value)} className="w-full rounded border px-2 py-1.5">
                  <option value="">Selecciona…</option>{empleados.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </label>
            ) : (
              <>
                <label className="text-sm"><span className="block text-ranch-marron/70">Proveedor o técnico</span>
                  <input id="c-proveedor" list="proveedores-mant" value={cierre.proveedor_nombre} onChange={(ev) => set("proveedor_nombre", ev.target.value)} className="w-full rounded border px-2 py-1.5" />
                  <datalist id="proveedores-mant">{proveedores.map((p) => <option key={p} value={p} />)}</datalist>
                </label>
                <label className="text-sm"><span className="block text-ranch-marron/70">N.º de factura</span>
                  <input id="c-factura" value={cierre.numero_factura} onChange={(ev) => set("numero_factura", ev.target.value)} className="w-full rounded border px-2 py-1.5" />
                </label>
              </>
            )}
            <label className="text-sm sm:col-span-2"><span className="block text-ranch-marron/70">Qué se le hizo</span>
              <textarea id="c-trabajos" rows={4} value={cierre.trabajos_realizados} onChange={(ev) => set("trabajos_realizados", ev.target.value)} placeholder="Ej.: se cambió la correa y se ajustó el carburador" className="w-full rounded border px-2 py-1.5" />
            </label>
          </div>

          <h3 className="mb-1 mt-4 text-sm font-bold text-ranch-marron">Repuestos e insumos</h3>
          <div className="space-y-2">
            {repuestos.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_4.5rem_5rem_7rem_auto] items-center gap-1.5 text-sm">
                <input aria-label="Repuesto" value={r.descripcion} onChange={(ev) => setRep(i, "descripcion", ev.target.value)} placeholder="Repuesto" className="min-w-0 rounded border px-2 py-1" />
                <input aria-label="Cantidad" value={r.cantidad} onChange={(ev) => setRep(i, "cantidad", ev.target.value)} inputMode="decimal" className="rounded border px-2 py-1 text-right" />
                <input aria-label="Unidad" value={r.unidad} onChange={(ev) => setRep(i, "unidad", ev.target.value)} placeholder="und" className="rounded border px-2 py-1" />
                <input aria-label="Precio unitario" value={r.precio_unitario ? formatearMiles(parseCOP(r.precio_unitario)) : ""} onChange={(ev) => setRep(i, "precio_unitario", ev.target.value)} inputMode="numeric" placeholder="$ c/u" className="rounded border px-2 py-1 text-right" />
                <button type="button" onClick={() => setRepuestos((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [nuevoRepuesto()]))} aria-label="Quitar repuesto" className="rounded border px-2 py-1 text-xs">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setRepuestos((rs) => [...rs, nuevoRepuesto()])} className="text-sm text-ranch-marron underline">＋ Agregar repuesto</button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm"><span className="block text-ranch-marron/70">Mano de obra</span>
              <input id="c-mano" value={cierre.mano_obra ? formatearMiles(parseCOP(cierre.mano_obra)) : ""} onChange={(ev) => set("mano_obra", ev.target.value)} inputMode="numeric" placeholder="0" className="w-full rounded border px-2 py-1.5 text-right" />
            </label>
            {e.usaHorometro && (
              <label className="text-sm"><span className="block text-ranch-marron/70">Horómetro al cerrar (h)</span>
                <input id="c-horometro" value={cierre.horometro} onChange={(ev) => set("horometro", ev.target.value)} inputMode="numeric" className="w-full rounded border px-2 py-1.5 text-right" />
              </label>
            )}
            <div className="rounded-xl bg-ranch-crema/60 p-2 text-sm">
              <p className="text-xs text-ranch-marron/60">Costo total</p>
              <p className="text-xl font-black tabular-nums text-ranch-marron">{formatearCOP(total)}</p>
              <p className="text-[11px] text-ranch-marron/50">{total > 0 ? "Se crea como gasto pendiente de pago" : "Sin costo: no crea gasto"}</p>
            </div>
            <label className="text-sm sm:col-span-3"><span className="block text-ranch-marron/70">Observaciones (opcional)</span>
              <input id="c-obs" value={cierre.observaciones} onChange={(ev) => set("observaciones", ev.target.value)} placeholder="Ej.: quedó pendiente cambiar la llanta trasera" className="w-full rounded border px-2 py-1.5" />
            </label>
          </div>
          <div className="mt-3"><FotosEvidencia onCambio={setFotos} etiqueta="Fotos del trabajo o de la factura (opcional)" /></div>
          <div className="mt-4 flex justify-end">
            <button disabled={busy} onClick={cerrar} className="rounded-lg bg-ranch-verde px-6 py-2.5 font-bold text-white disabled:opacity-50">✓ Cerrar orden</button>
          </div>
        </section>
      )}

      {/* ---------------- Orden cerrada ---------------- */}
      {o.estado === "realizado" && (
        <section className={card}>
          <h2 className="mb-2 font-bold text-ranch-marron">Trabajo realizado el {fecha(o.fechaRealizada)}</h2>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-ranch-marron/60">Lo hizo: </dt><dd className="inline font-semibold">{o.quien ?? "—"} {o.ejecutor ? <span className="font-normal text-ranch-marron/50">({o.ejecutor === "interno" ? "personal del parque" : "proveedor"})</span> : null}</dd></div>
            {o.factura && <div><dt className="inline text-ranch-marron/60">Factura: </dt><dd className="inline">{o.factura}</dd></div>}
            {o.horasFuera != null && <div><dt className="inline text-ranch-marron/60">Tiempo parado: </dt><dd className="inline">{o.horasFuera} h</dd></div>}
            {o.horometro != null && <div><dt className="inline text-ranch-marron/60">Horómetro: </dt><dd className="inline">{formatearMiles(o.horometro)} h</dd></div>}
          </dl>
          {o.trabajos && <p className="mt-2 whitespace-pre-line text-sm text-ranch-marron/90">{o.trabajos}</p>}
          {o.observaciones && <p className="mt-1 text-sm text-ranch-marron/60">Observaciones: {o.observaciones}</p>}
          {o.repuestos.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-left text-xs text-ranch-marron/60"><th className="py-1">Repuesto</th><th className="text-right">Cantidad</th><th className="text-right">Precio</th><th className="text-right">Subtotal</th></tr></thead>
              <tbody>{o.repuestos.map((r, i) => <tr key={i} className="border-t border-ranch-marron/10"><td className="py-1">{r.descripcion}</td><td className="text-right">{r.cantidad.toLocaleString("es-CO")} {r.unidad ?? ""}</td><td className="text-right tabular-nums">{formatearCOP(r.precio)}</td><td className="text-right tabular-nums">{formatearCOP(r.subtotal)}</td></tr>)}</tbody>
            </table>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span>Repuestos <b className="tabular-nums">{formatearCOP(o.repuestosTotal)}</b></span>
            <span>Mano de obra <b className="tabular-nums">{formatearCOP(o.manoObra)}</b></span>
            <span>Total <b className="tabular-nums">{formatearCOP(o.costo)}</b></span>
            {o.gasto && <Link href="/admin/gastos" className="text-ranch-marron underline">Gasto {o.gasto.estado === "pagado" ? "pagado" : "pendiente de pago"}</Link>}
          </div>
          {o.fotos.length > 0 && <div className="mt-3 flex gap-2">{o.fotos.map((f) => <Foto key={f.id} id={f.id} />)}</div>}
        </section>
      )}
      {o.estado === "cancelado" && <p className={`${card} text-sm text-ranch-marron/70`}>Orden cancelada{o.motivoCancelacion ? `: ${o.motivoCancelacion}` : ""}.</p>}
    </div>
  );
}

function Foto({ id }: { id: string }) {
  return (
    <a href={`/admin/equipos/fotos/${id}`} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/admin/equipos/fotos/${id}`} alt="Foto de evidencia" className="h-20 w-20 rounded-lg object-cover" />
    </a>
  );
}
