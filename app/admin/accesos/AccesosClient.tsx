"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearAtraccion, editarAtraccion, cambiarEstadoAtraccion,
  crearPunto, editarPunto, cambiarEstadoPunto,
} from "./actions";

export interface AtraccionVista {
  id: string;
  nombre: string;
  descripcion: string | null;
  edad_minima: number | null;
  estatura_minima: number | null;
  requiere_consentimiento: boolean;
  activa: boolean;
  puntos: number;
  entradasHoy: number;
  consentimientos: number;
}

export interface PuntoVista {
  id: string;
  nombre: string;
  atraccion_id: string | null;
  atraccion: string | null;
  tipo_regla: string;
  aforo_maximo: number | null;
  edad_minima: number | null;
  estatura_minima: number | null;
  requiere_consentimiento: boolean;
  activo: boolean;
  entradasHoy: number;
}

interface Props {
  puedeEditar: boolean;
  kpis: { entradasParque: number; aforoParque: number; aforoMaximo: number | null; atracciones: number; conConsentimiento: number };
  atracciones: AtraccionVista[];
  puntos: PuntoVista[];
}

const REGLA_TEXTO: Record<string, string> = {
  un_ingreso: "Un solo ingreso",
  reingreso: "Reingreso libre",
  entrada_salida: "Entrada y salida",
};

const input = "rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm";
const boton = "rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50";
const botonSec = "rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60";
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white";
const th = "px-3 py-2 text-xs uppercase text-ranch-marron/60";

type FormAtraccion = {
  nombre: string; descripcion: string; edad_minima: string; estatura_minima: string;
  requiere_consentimiento: boolean; tipo_regla: string;
};
const ATRACCION_VACIA: FormAtraccion = {
  nombre: "", descripcion: "", edad_minima: "", estatura_minima: "",
  requiere_consentimiento: true, tipo_regla: "reingreso",
};

type FormPunto = {
  nombre: string; atraccion_id: string; tipo_regla: string; aforo_maximo: string;
  edad_minima: string; estatura_minima: string; requiere_consentimiento: boolean;
};
const PUNTO_VACIO: FormPunto = {
  nombre: "", atraccion_id: "", tipo_regla: "entrada_salida", aforo_maximo: "",
  edad_minima: "", estatura_minima: "", requiere_consentimiento: false,
};

export default function AccesosClient({ puedeEditar, kpis, atracciones, puntos }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"atracciones" | "puntos">("atracciones");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [nuevaAtr, setNuevaAtr] = useState<FormAtraccion>(ATRACCION_VACIA);
  const [abrirAtr, setAbrirAtr] = useState(false);
  const [edicionAtr, setEdicionAtr] = useState<(FormAtraccion & { id: string }) | null>(null);

  const [nuevoPunto, setNuevoPunto] = useState<FormPunto>(PUNTO_VACIO);
  const [abrirPunto, setAbrirPunto] = useState(false);
  const [edicionPunto, setEdicionPunto] = useState<(FormPunto & { id: string }) | null>(null);

  async function correr(fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, exito: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg({ ok: r.ok, t: r.ok ? [exito, r.aviso].filter(Boolean).join(" ") : r.error ?? "Error" });
    if (r.ok) router.refresh();
    return r.ok;
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ranch-marron">Accesos y atracciones</h1>
        <p className="text-sm text-ranch-marron/60">Catálogo, condiciones de ingreso, consentimiento y conteo del día</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Entradas parque hoy" valor={String(kpis.entradasParque)} />
        <Kpi label="Aforo actual" valor={String(kpis.aforoParque)} sub={kpis.aforoMaximo ? `de ${kpis.aforoMaximo}` : undefined} />
        <Kpi label="Atracciones activas" valor={String(kpis.atracciones)} />
        <Kpi label="Con consentimiento" valor={String(kpis.conConsentimiento)} />
      </div>

      <nav className="mb-4 flex flex-wrap gap-2">
        {([["atracciones", "Atracciones"], ["puntos", "Puntos de control"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === id ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/25 text-ranch-marron hover:bg-ranch-crema/60"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {/* ------------------------------------------------------- ATRACCIONES */}
      {tab === "atracciones" && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-ranch-marron">Atracciones ({atracciones.length})</h2>
            {puedeEditar && (
              <button onClick={() => setAbrirAtr(!abrirAtr)} className={botonSec}>{abrirAtr ? "Cerrar" : "+ Nueva atracción"}</button>
            )}
          </div>

          {abrirAtr && puedeEditar && (
            <section className={`mb-4 ${card} p-4`}>
              <div className="grid gap-3 sm:grid-cols-3">
                <input className={input} placeholder="Nombre (p. ej. Karts Fórmula 1)" value={nuevaAtr.nombre} onChange={(e) => setNuevaAtr({ ...nuevaAtr, nombre: e.target.value })} />
                <input className={input} placeholder="Edad mínima (años)" inputMode="numeric" value={nuevaAtr.edad_minima} onChange={(e) => setNuevaAtr({ ...nuevaAtr, edad_minima: e.target.value })} />
                <input className={input} placeholder="Estatura mínima (cm)" inputMode="numeric" value={nuevaAtr.estatura_minima} onChange={(e) => setNuevaAtr({ ...nuevaAtr, estatura_minima: e.target.value })} />
                <input className={`${input} sm:col-span-2`} placeholder="Descripción (opcional)" value={nuevaAtr.descripcion} onChange={(e) => setNuevaAtr({ ...nuevaAtr, descripcion: e.target.value })} />
                <select className={input} value={nuevaAtr.tipo_regla} onChange={(e) => setNuevaAtr({ ...nuevaAtr, tipo_regla: e.target.value })}>
                  {Object.entries(REGLA_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-ranch-marron">
                <input type="checkbox" className="h-4 w-4" checked={nuevaAtr.requiere_consentimiento} onChange={(e) => setNuevaAtr({ ...nuevaAtr, requiere_consentimiento: e.target.checked })} />
                Exige consentimiento firmado
              </label>
              <p className="mt-1 text-xs text-ranch-marron/50">
                Se crea también su punto de control (el lector de la atracción), sin el cual no hay dónde escanear.
              </p>
              <button
                className={`${boton} mt-3`} disabled={busy}
                onClick={async () => { if (await correr(() => crearAtraccion(nuevaAtr), "Atracción creada.")) setNuevaAtr(ATRACCION_VACIA); }}
              >Crear atracción</button>
            </section>
          )}

          <div className={`overflow-x-auto ${card}`}>
            <table className="w-full text-left text-sm">
              <thead className="bg-ranch-crema/60">
                <tr>
                  <th className={th}>Atracción</th>
                  <th className={`${th} text-center`}>Edad mín.</th>
                  <th className={`${th} text-center`}>Estatura mín.</th>
                  <th className={`${th} text-center`}>Consentimiento</th>
                  <th className={`${th} text-center`}>Lectores</th>
                  <th className={`${th} text-right`}>Entradas hoy</th>
                  {puedeEditar && <th className={th}></th>}
                </tr>
              </thead>
              <tbody>
                {atracciones.map((a) => {
                  const ed = edicionAtr?.id === a.id ? edicionAtr : null;
                  return (
                    <tr key={a.id} className={`border-t border-ranch-marron/10 ${a.activa ? "" : "opacity-50"}`}>
                      <td className="px-3 py-2 font-semibold text-ranch-marron">
                        {ed ? (
                          <input className={`${input} w-44`} value={ed.nombre} onChange={(e) => setEdicionAtr({ ...ed, nombre: e.target.value })} />
                        ) : (
                          <>
                            {a.nombre}
                            {a.descripcion && <span className="block text-xs font-normal text-ranch-marron/50">{a.descripcion}</span>}
                            {a.consentimientos > 0 && <span className="block text-[10px] text-ranch-marron/40">{a.consentimientos} firmas</span>}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-ranch-marron/70">
                        {ed ? (
                          <input className={`${input} w-16 text-center`} inputMode="numeric" value={ed.edad_minima} onChange={(e) => setEdicionAtr({ ...ed, edad_minima: e.target.value })} />
                        ) : (a.edad_minima != null ? `${a.edad_minima} años` : "—")}
                      </td>
                      <td className="px-3 py-2 text-center text-ranch-marron/70">
                        {ed ? (
                          <input className={`${input} w-16 text-center`} inputMode="numeric" value={ed.estatura_minima} onChange={(e) => setEdicionAtr({ ...ed, estatura_minima: e.target.value })} />
                        ) : (a.estatura_minima != null ? `${a.estatura_minima} cm` : "—")}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ed ? (
                          <input type="checkbox" className="h-4 w-4" checked={ed.requiere_consentimiento} onChange={(e) => setEdicionAtr({ ...ed, requiere_consentimiento: e.target.checked })} />
                        ) : a.requiere_consentimiento ? (
                          <span className="rounded-full bg-ranch-dorado/20 px-2 py-0.5 text-xs font-semibold text-ranch-marron">Requiere firma</span>
                        ) : (
                          <span className="text-xs text-ranch-marron/40">No</span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-center ${a.puntos === 0 ? "text-amber-600" : "text-ranch-marron/70"}`}>
                        {a.puntos || "sin lector"}
                      </td>
                      <td className="px-3 py-2 text-right font-black text-ranch-marron">{a.entradasHoy}</td>
                      {puedeEditar && (
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap justify-end gap-1">
                            {ed ? (
                              <>
                                <button className={botonSec} disabled={busy} onClick={async () => { if (await correr(() => editarAtraccion(a.id, ed), "Atracción actualizada.")) setEdicionAtr(null); }}>Guardar</button>
                                <button className={botonSec} onClick={() => setEdicionAtr(null)}>Cancelar</button>
                              </>
                            ) : (
                              <>
                                <button
                                  className={botonSec}
                                  onClick={() => setEdicionAtr({
                                    id: a.id, nombre: a.nombre, descripcion: a.descripcion ?? "",
                                    edad_minima: a.edad_minima === null ? "" : String(a.edad_minima),
                                    estatura_minima: a.estatura_minima === null ? "" : String(a.estatura_minima),
                                    requiere_consentimiento: a.requiere_consentimiento, tipo_regla: "reingreso",
                                  })}
                                >✏️ Editar</button>
                                <button className={botonSec} disabled={busy} onClick={() => correr(() => cambiarEstadoAtraccion(a.id, !a.activa), a.activa ? "Atracción desactivada." : "Atracción activada.")}>
                                  {a.activa ? "Activa" : "Inactiva"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {atracciones.length === 0 && (
                  <tr><td colSpan={puedeEditar ? 7 : 6} className="px-3 py-6 text-center text-ranch-marron/50">No hay atracciones. Crea la primera arriba.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ------------------------------------------------------- PUNTOS DE CONTROL */}
      {tab === "puntos" && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-ranch-marron">Puntos de control ({puntos.length})</h2>
            {puedeEditar && (
              <button onClick={() => setAbrirPunto(!abrirPunto)} className={botonSec}>{abrirPunto ? "Cerrar" : "+ Nuevo punto"}</button>
            )}
          </div>

          <p className="mb-3 text-xs text-ranch-marron/55">
            Cada punto es un lector. Los que no están atados a una atracción son entradas al parque y
            son los que miden el aforo.
          </p>

          {abrirPunto && puedeEditar && (
            <section className={`mb-4 ${card} p-4`}>
              <div className="grid gap-3 sm:grid-cols-3">
                <input className={input} placeholder="Nombre (p. ej. Entrada Norte)" value={nuevoPunto.nombre} onChange={(e) => setNuevoPunto({ ...nuevoPunto, nombre: e.target.value })} />
                <select className={input} value={nuevoPunto.atraccion_id} onChange={(e) => setNuevoPunto({ ...nuevoPunto, atraccion_id: e.target.value })}>
                  <option value="">Entrada al parque (sin atracción)</option>
                  {atracciones.filter((a) => a.activa).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
                <select className={input} value={nuevoPunto.tipo_regla} onChange={(e) => setNuevoPunto({ ...nuevoPunto, tipo_regla: e.target.value })}>
                  {Object.entries(REGLA_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                <input className={input} placeholder="Aforo máximo (opcional)" inputMode="numeric" value={nuevoPunto.aforo_maximo} onChange={(e) => setNuevoPunto({ ...nuevoPunto, aforo_maximo: e.target.value })} />
                <input className={input} placeholder="Edad mínima" inputMode="numeric" value={nuevoPunto.edad_minima} onChange={(e) => setNuevoPunto({ ...nuevoPunto, edad_minima: e.target.value })} />
                <input className={input} placeholder="Estatura mínima (cm)" inputMode="numeric" value={nuevoPunto.estatura_minima} onChange={(e) => setNuevoPunto({ ...nuevoPunto, estatura_minima: e.target.value })} />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-ranch-marron">
                <input type="checkbox" className="h-4 w-4" checked={nuevoPunto.requiere_consentimiento} onChange={(e) => setNuevoPunto({ ...nuevoPunto, requiere_consentimiento: e.target.checked })} />
                Exige consentimiento firmado para dejar pasar
              </label>
              <button
                className={`${boton} mt-3`} disabled={busy}
                onClick={async () => { if (await correr(() => crearPunto(nuevoPunto), "Punto de control creado.")) setNuevoPunto(PUNTO_VACIO); }}
              >Crear punto</button>
            </section>
          )}

          <div className={`overflow-x-auto ${card}`}>
            <table className="w-full text-left text-sm">
              <thead className="bg-ranch-crema/60">
                <tr>
                  <th className={th}>Punto</th>
                  <th className={th}>Atracción</th>
                  <th className={th}>Regla</th>
                  <th className={`${th} text-center`}>Aforo</th>
                  <th className={`${th} text-center`}>Consent.</th>
                  <th className={`${th} text-right`}>Entradas hoy</th>
                  {puedeEditar && <th className={th}></th>}
                </tr>
              </thead>
              <tbody>
                {puntos.map((p) => {
                  const ed = edicionPunto?.id === p.id ? edicionPunto : null;
                  return (
                    <tr key={p.id} className={`border-t border-ranch-marron/10 ${p.activo ? "" : "opacity-50"}`}>
                      <td className="px-3 py-2 font-semibold text-ranch-marron">
                        {ed ? <input className={`${input} w-40`} value={ed.nombre} onChange={(e) => setEdicionPunto({ ...ed, nombre: e.target.value })} /> : p.nombre}
                      </td>
                      <td className="px-3 py-2 text-ranch-marron/70">
                        {ed ? (
                          <select className={input} value={ed.atraccion_id} onChange={(e) => setEdicionPunto({ ...ed, atraccion_id: e.target.value })}>
                            <option value="">Entrada al parque</option>
                            {atracciones.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                          </select>
                        ) : (p.atraccion ?? <span className="text-xs text-ranch-marron/45">Entrada al parque</span>)}
                      </td>
                      <td className="px-3 py-2 text-ranch-marron/70">
                        {ed ? (
                          <select className={input} value={ed.tipo_regla} onChange={(e) => setEdicionPunto({ ...ed, tipo_regla: e.target.value })}>
                            {Object.entries(REGLA_TEXTO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                          </select>
                        ) : (REGLA_TEXTO[p.tipo_regla] ?? p.tipo_regla)}
                      </td>
                      <td className="px-3 py-2 text-center text-ranch-marron/70">
                        {ed ? (
                          <input className={`${input} w-20 text-center`} inputMode="numeric" value={ed.aforo_maximo} onChange={(e) => setEdicionPunto({ ...ed, aforo_maximo: e.target.value })} />
                        ) : (p.aforo_maximo ?? "—")}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ed ? (
                          <input type="checkbox" className="h-4 w-4" checked={ed.requiere_consentimiento} onChange={(e) => setEdicionPunto({ ...ed, requiere_consentimiento: e.target.checked })} />
                        ) : p.requiere_consentimiento ? "Sí" : <span className="text-xs text-ranch-marron/40">No</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-black text-ranch-marron">{p.entradasHoy}</td>
                      {puedeEditar && (
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap justify-end gap-1">
                            {ed ? (
                              <>
                                <button className={botonSec} disabled={busy} onClick={async () => { if (await correr(() => editarPunto(p.id, ed), "Punto actualizado.")) setEdicionPunto(null); }}>Guardar</button>
                                <button className={botonSec} onClick={() => setEdicionPunto(null)}>Cancelar</button>
                              </>
                            ) : (
                              <>
                                <button
                                  className={botonSec}
                                  onClick={() => setEdicionPunto({
                                    id: p.id, nombre: p.nombre, atraccion_id: p.atraccion_id ?? "", tipo_regla: p.tipo_regla,
                                    aforo_maximo: p.aforo_maximo === null ? "" : String(p.aforo_maximo),
                                    edad_minima: p.edad_minima === null ? "" : String(p.edad_minima),
                                    estatura_minima: p.estatura_minima === null ? "" : String(p.estatura_minima),
                                    requiere_consentimiento: p.requiere_consentimiento,
                                  })}
                                >✏️ Editar</button>
                                <button className={botonSec} disabled={busy} onClick={() => correr(() => cambiarEstadoPunto(p.id, !p.activo), p.activo ? "Punto desactivado." : "Punto activado.")}>
                                  {p.activo ? "Activo" : "Inactivo"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {puntos.length === 0 && (
                  <tr><td colSpan={puedeEditar ? 7 : 6} className="px-3 py-6 text-center text-ranch-marron/50">No hay puntos de control.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-3 text-xs text-ranch-marron/50">
        El conteo de entradas del día sale de los escaneos del lector. Nada se borra: para retirar una
        atracción, desactívala — sus consentimientos firmados y sus accesos quedan en el histórico.
      </p>
    </main>
  );
}

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-black text-ranch-marron">{valor}</p>
      <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{label}</p>
      {sub && <p className="text-[10px] text-ranch-marron/40">{sub}</p>}
    </div>
  );
}
