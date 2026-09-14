"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP } from "@/lib/dinero/cop";
import {
  crearRecinto, editarRecinto, cambiarEstadoRecinto,
  crearAnimal, editarAnimal, trasladarAnimal, cambiarEstadoAnimal,
  crearAlimento, editarAlimento, cambiarEstadoAlimento, registrarMovimientoAlimento,
  crearRacion, editarRacion, cambiarEstadoRacion,
  registrarAlimentacion, anularAlimentacion,
} from "./actions";

// ------------------------------------------------------------------ tipos

interface Traslado { fecha: string; origen: string | null; destino: string; cantidad: number; motivo: string | null }

export interface AnimalVista {
  id: string; nombre: string; codigo: string | null; categoria_id: string; categoria: string;
  recinto_id: string | null; recinto: string | null; ubicacion: string | null; cantidad: number;
  especie: string | null; raza: string | null; sexo: string; estado: string; observaciones: string | null;
  raciones: number; historial: Traslado[];
}

export interface RecintoVista {
  id: string; nombre: string; tipo: string | null; ubicacion: string | null; capacidad: number | null;
  descripcion: string | null; activo: boolean; ocupacion: number; grupos: number;
}

export interface AlimentoVista {
  id: string; nombre: string; tipo: string | null; unidad_medida: string; costo_unitario: number | null;
  equivalencia_g: number | null; existencia_base: number | null; existenciaTexto: string | null;
  valorExistencia: number | null; consumoDiarioTexto: string | null; costoDiario: number | null;
  autonomiaDias: number | null; convertible: boolean; activo: boolean;
}

export interface RacionVista {
  id: string; destino: string; esGrupo: boolean; destino_id: string; alimento_id: string; alimento: string;
  cantidad: number; unidad: string; modo: string; frecuencia: string; horario: string | null;
  observaciones: string | null; activo: boolean; cabezas: number; resumen: string;
  diarioTexto: string | null; sugerido: { cantidad: string; unidad: string } | null;
  costoDiario: number | null; costoMensual: number | null;
}

export interface BitacoraVista {
  id: string; fecha: string; destino: string; recinto: string | null; alimento: string;
  entregadaTexto: string; planeadaTexto: string | null; cumple: boolean | null; costo: number | null;
  estado: string; motivo: string | null; observaciones: string | null; anulado: boolean; motivo_anulacion: string | null;
  automatico: boolean; franja: string | null;
}

interface Props {
  esAdmin: boolean;
  esSupervisor: boolean;
  kpis: {
    cabezas: number; grupos: number; sinUbicacion: number; recintos: number;
    costoDiario: number; costoMensual: number; entregasHoy: number; costoHoy: number;
    racionesDiariasActivas: number;
  };
  animales: AnimalVista[];
  categorias: { id: string; nombre: string }[];
  recintos: RecintoVista[];
  alimentos: AlimentoVista[];
  raciones: RacionVista[];
  bitacora: BitacoraVista[];
  empleados: { id: string; nombre: string }[];
}

type Pestana = "inventario" | "ubicacion" | "alimentos" | "dieta" | "bitacora";

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "inventario", label: "Inventario" },
  { id: "ubicacion", label: "Ubicación" },
  { id: "alimentos", label: "Alimentos" },
  { id: "dieta", label: "Dieta" },
  { id: "bitacora", label: "Bitácora" },
];

const UNIDADES = ["g", "kg", "lb", "ml", "litro", "bulto", "unidad"];
const ESTADO_COLOR: Record<string, string> = {
  activo: "bg-ranch-verde/15 text-ranch-verde",
  enfermo: "bg-amber-100 text-amber-700",
  cuarentena: "bg-orange-100 text-orange-700",
  fallecido: "bg-red-100 text-red-700",
  trasladado: "bg-ranch-marron/10 text-ranch-marron/60",
};

const input = "rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm";
const boton = "rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50";
const botonSec = "rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60";
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white";
const th = "px-3 py-2 text-xs uppercase text-ranch-marron/60";

// ------------------------------------------------------------------ componente

export default function AnimalesClient(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Pestana>("inventario");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function correr(fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, exito: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg({ ok: r.ok, t: r.ok ? [exito, r.aviso].filter(Boolean).join(" ") : r.error ?? "Error" });
    if (r.ok) router.refresh();
    return r.ok;
  }

  const comun = { busy, correr, esAdmin: p.esAdmin, esSupervisor: p.esSupervisor };

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ranch-marron">Animales</h1>
        <p className="text-sm text-ranch-marron/60">Inventario, ubicación, dieta y bitácora de alimentación</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Cabezas" valor={p.kpis.cabezas.toLocaleString("es-CO")} />
        <Kpi label="Grupos" valor={String(p.kpis.grupos)} />
        <Kpi label="Recintos" valor={String(p.kpis.recintos)} />
        <Kpi label="Sin ubicar" valor={String(p.kpis.sinUbicacion)} alerta={p.kpis.sinUbicacion > 0} />
        <Kpi label="Alimento / día" valor={formatearCOP(p.kpis.costoDiario)} />
        <Kpi label="Alimento / mes" valor={formatearCOP(p.kpis.costoMensual)} />
      </div>

      <nav className="mb-4 flex flex-wrap gap-2">
        {PESTANAS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === x.id ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/25 text-ranch-marron hover:bg-ranch-crema/60"}`}
          >
            {x.label}
          </button>
        ))}
      </nav>

      {msg && (
        <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>
      )}

      {tab === "inventario" && <Inventario {...comun} animales={p.animales} categorias={p.categorias} recintos={p.recintos} />}
      {tab === "ubicacion" && <Ubicacion {...comun} recintos={p.recintos} animales={p.animales} />}
      {tab === "alimentos" && <Alimentos {...comun} alimentos={p.alimentos} />}
      {tab === "dieta" && <Dieta {...comun} raciones={p.raciones} animales={p.animales} categorias={p.categorias} alimentos={p.alimentos} />}
      {tab === "bitacora" && (
        <Bitacora {...comun} bitacora={p.bitacora} raciones={p.raciones} animales={p.animales} alimentos={p.alimentos} empleados={p.empleados} kpis={p.kpis} />
      )}
    </main>
  );
}

interface Comun {
  busy: boolean;
  esAdmin: boolean;
  /** Los maestros (recintos, alimentos, dieta) son de supervisor; granja solo opera. */
  esSupervisor: boolean;
  correr: (fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, exito: string) => Promise<boolean>;
}

// ------------------------------------------------------------------ INVENTARIO

function Inventario({ busy, correr, animales, categorias, recintos }: Comun & { animales: AnimalVista[]; categorias: { id: string; nombre: string }[]; recintos: RecintoVista[] }) {
  const [nuevo, setNuevo] = useState({ nombre: "", categoria_id: "", recinto_id: "", cantidad: "1", especie: "", observaciones: "" });
  const [abierto, setAbierto] = useState(false);
  const [traslado, setTraslado] = useState<{ id: string; recinto_id: string; motivo: string } | null>(null);
  const [edicion, setEdicion] = useState<{ id: string; nombre: string; cantidad: string; estado: string } | null>(null);
  const [historial, setHistorial] = useState<string | null>(null);
  const activos = recintos.filter((r) => r.activo);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-ranch-marron">Inventario ({animales.length} grupos)</h2>
        <button onClick={() => setAbierto(!abierto)} className={botonSec}>{abierto ? "Cerrar" : "+ Nuevo grupo"}</button>
      </div>

      {abierto && (
        <section className={`mb-4 ${card} p-4`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <input className={input} placeholder="Nombre del grupo (p. ej. Gallinas ponedoras)" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            <select className={input} value={nuevo.categoria_id} onChange={(e) => setNuevo({ ...nuevo, categoria_id: e.target.value })}>
              <option value="">Categoría…</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <input className={input} placeholder="Cabezas" inputMode="numeric" value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} />
            <select className={input} value={nuevo.recinto_id} onChange={(e) => setNuevo({ ...nuevo, recinto_id: e.target.value })}>
              <option value="">Sin ubicación…</option>
              {activos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
            <input className={input} placeholder="Especie (opcional)" value={nuevo.especie} onChange={(e) => setNuevo({ ...nuevo, especie: e.target.value })} />
            <input className={input} placeholder="Observación (opcional)" value={nuevo.observaciones} onChange={(e) => setNuevo({ ...nuevo, observaciones: e.target.value })} />
          </div>
          <button
            className={`${boton} mt-3`}
            disabled={busy}
            onClick={async () => {
              const ok = await correr(() => crearAnimal(nuevo), "Grupo creado.");
              if (ok) setNuevo({ nombre: "", categoria_id: "", recinto_id: "", cantidad: "1", especie: "", observaciones: "" });
            }}
          >
            Crear grupo
          </button>
        </section>
      )}

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60">
            <tr>
              <th className={th}>Grupo</th>
              <th className={`${th} text-right`}>Cabezas</th>
              <th className={th}>Categoría</th>
              <th className={th}>Ubicación</th>
              <th className={`${th} text-center`}>Raciones</th>
              <th className={th}>Estado</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {animales.map((a) => (
              <FilaAnimal
                key={a.id} a={a} busy={busy} correr={correr} recintos={activos}
                traslado={traslado} setTraslado={setTraslado}
                edicion={edicion} setEdicion={setEdicion}
                historial={historial} setHistorial={setHistorial}
              />
            ))}
            {animales.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-ranch-marron/50">Aún no hay animales cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FilaAnimal({
  a, busy, correr, recintos, traslado, setTraslado, edicion, setEdicion, historial, setHistorial,
}: {
  a: AnimalVista; busy: boolean; recintos: RecintoVista[];
  correr: Comun["correr"];
  traslado: { id: string; recinto_id: string; motivo: string } | null;
  setTraslado: (v: { id: string; recinto_id: string; motivo: string } | null) => void;
  edicion: { id: string; nombre: string; cantidad: string; estado: string } | null;
  setEdicion: (v: { id: string; nombre: string; cantidad: string; estado: string } | null) => void;
  historial: string | null;
  setHistorial: (v: string | null) => void;
}) {
  const editando = edicion?.id === a.id;
  const trasladando = traslado?.id === a.id;

  return (
    <>
      <tr className="border-t border-ranch-marron/10 align-top">
        <td className="px-3 py-2 font-semibold text-ranch-marron">
          {editando ? (
            <input className={`${input} w-40`} value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} />
          ) : (
            <>
              {a.nombre}
              {a.especie && <span className="block text-xs font-normal text-ranch-marron/50">{a.especie}</span>}
            </>
          )}
        </td>
        <td className="px-3 py-2 text-right font-bold text-ranch-marron">
          {editando ? (
            <input className={`${input} w-20 text-right`} inputMode="numeric" value={edicion.cantidad} onChange={(e) => setEdicion({ ...edicion, cantidad: e.target.value })} />
          ) : (
            a.cantidad.toLocaleString("es-CO")
          )}
        </td>
        <td className="px-3 py-2 text-ranch-marron/70">{a.categoria}</td>
        <td className="px-3 py-2 text-ranch-marron/70">
          {a.recinto ? (
            <>
              {a.recinto}
              {a.ubicacion && <span className="block text-xs text-ranch-marron/45">{a.ubicacion}</span>}
            </>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">sin ubicar</span>
          )}
        </td>
        <td className="px-3 py-2 text-center text-ranch-marron/70">{a.raciones || "—"}</td>
        <td className="px-3 py-2">
          {editando ? (
            <select className={input} value={edicion.estado} onChange={(e) => setEdicion({ ...edicion, estado: e.target.value })}>
              {["activo", "enfermo", "cuarentena", "fallecido", "trasladado"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          ) : (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_COLOR[a.estado] ?? ""}`}>{a.estado}</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap justify-end gap-1">
            {editando ? (
              <>
                <button
                  className={botonSec} disabled={busy}
                  onClick={async () => {
                    const ok = await correr(() => editarAnimal(a.id, { nombre: edicion.nombre, cantidad: edicion.cantidad, estado: edicion.estado }), "Grupo actualizado.");
                    if (ok) setEdicion(null);
                  }}
                >Guardar</button>
                <button className={botonSec} onClick={() => setEdicion(null)}>Cancelar</button>
              </>
            ) : (
              <>
                <button className={botonSec} onClick={() => setEdicion({ id: a.id, nombre: a.nombre, cantidad: String(a.cantidad), estado: a.estado })}>Editar</button>
                <button className={botonSec} onClick={() => setTraslado(trasladando ? null : { id: a.id, recinto_id: "", motivo: "" })}>Trasladar</button>
                <button className={botonSec} onClick={() => setHistorial(historial === a.id ? null : a.id)}>Historial</button>
                <button className={botonSec} disabled={busy} onClick={() => correr(() => cambiarEstadoAnimal(a.id, false), "Grupo dado de baja.")}>Baja</button>
              </>
            )}
          </div>
        </td>
      </tr>

      {trasladando && (
        <tr className="border-t border-ranch-marron/5 bg-ranch-crema/30">
          <td colSpan={7} className="px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ranch-marron">Trasladar {a.nombre} ({a.cantidad} cabezas) a:</span>
              <select className={input} value={traslado.recinto_id} onChange={(e) => setTraslado({ ...traslado, recinto_id: e.target.value })}>
                <option value="">Recinto destino…</option>
                {recintos.filter((r) => r.id !== a.recinto_id).map((r) => <option key={r.id} value={r.id}>{r.nombre}{r.capacidad ? ` (${r.ocupacion}/${r.capacidad})` : ""}</option>)}
              </select>
              <input className={`${input} flex-1`} placeholder="Motivo (opcional)" value={traslado.motivo} onChange={(e) => setTraslado({ ...traslado, motivo: e.target.value })} />
              <button
                className={boton} disabled={busy}
                onClick={async () => {
                  const ok = await correr(() => trasladarAnimal(a.id, traslado.recinto_id, { motivo: traslado.motivo }), "Traslado registrado.");
                  if (ok) setTraslado(null);
                }}
              >Trasladar</button>
            </div>
            {recintos.length === 0 && <p className="mt-2 text-xs text-amber-700">No hay recintos creados. Créalos en la pestaña Ubicación.</p>}
          </td>
        </tr>
      )}

      {historial === a.id && (
        <tr className="border-t border-ranch-marron/5 bg-ranch-crema/20">
          <td colSpan={7} className="px-3 py-3">
            <p className="mb-2 text-xs font-bold uppercase text-ranch-marron/60">Historial de ubicación</p>
            {a.historial.length === 0 ? (
              <p className="text-sm text-ranch-marron/50">Sin movimientos registrados.</p>
            ) : (
              <ul className="space-y-1 text-sm text-ranch-marron/75">
                {a.historial.map((h, i) => (
                  <li key={i}>
                    <span className="text-ranch-marron/50">{h.fecha}</span> · {h.origen ?? "sin ubicación"} → <strong>{h.destino}</strong> ({h.cantidad} cabezas)
                    {h.motivo && <span className="text-ranch-marron/50"> · {h.motivo}</span>}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ------------------------------------------------------------------ UBICACIÓN

function Ubicacion({ busy, correr, esSupervisor, recintos, animales }: Comun & { recintos: RecintoVista[]; animales: AnimalVista[] }) {
  const [nuevo, setNuevo] = useState({ nombre: "", tipo: "", ubicacion: "", capacidad: "", descripcion: "" });
  const [edicion, setEdicion] = useState<{ id: string; nombre: string; tipo: string; ubicacion: string; capacidad: string; descripcion: string } | null>(null);
  const sinUbicar = animales.filter((a) => !a.recinto_id);

  return (
    <>
      {esSupervisor && (
      <section className={`mb-4 ${card} p-4`}>
        <h2 className="mb-3 font-bold text-ranch-marron">Nuevo recinto</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className={input} placeholder="Nombre (p. ej. Corral de las cabras)" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <input className={input} placeholder="Tipo (corral, establo, aviario, estanque…)" value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })} />
          <input className={input} placeholder="Zona del parque (granja, lago…)" value={nuevo.ubicacion} onChange={(e) => setNuevo({ ...nuevo, ubicacion: e.target.value })} />
          <input className={input} placeholder="Capacidad en cabezas (opcional)" inputMode="numeric" value={nuevo.capacidad} onChange={(e) => setNuevo({ ...nuevo, capacidad: e.target.value })} />
          <input className={`${input} sm:col-span-2`} placeholder="Descripción (opcional)" value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} />
        </div>
        <button
          className={`${boton} mt-3`} disabled={busy}
          onClick={async () => {
            const ok = await correr(() => crearRecinto(nuevo), "Recinto creado.");
            if (ok) setNuevo({ nombre: "", tipo: "", ubicacion: "", capacidad: "", descripcion: "" });
          }}
        >Crear recinto</button>
      </section>
      )}

      {sinUbicar.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {sinUbicar.length} grupo(s) sin ubicación: {sinUbicar.slice(0, 6).map((a) => a.nombre).join(", ")}
          {sinUbicar.length > 6 ? "…" : ""}. Asígnalos con el botón <strong>Trasladar</strong> del inventario.
        </p>
      )}

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60">
            <tr>
              <th className={th}>Recinto</th>
              <th className={th}>Tipo</th>
              <th className={th}>Zona</th>
              <th className={`${th} text-right`}>Ocupación</th>
              <th className={`${th} text-center`}>Grupos</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {recintos.map((r) => {
              const editando = edicion?.id === r.id;
              const lleno = r.capacidad !== null && r.ocupacion > r.capacidad;
              return (
                <tr key={r.id} className={`border-t border-ranch-marron/10 ${r.activo ? "" : "opacity-50"}`}>
                  <td className="px-3 py-2 font-semibold text-ranch-marron">
                    {editando ? <input className={`${input} w-44`} value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} /> : r.nombre}
                  </td>
                  <td className="px-3 py-2 text-ranch-marron/70">
                    {editando ? <input className={`${input} w-32`} value={edicion.tipo} onChange={(e) => setEdicion({ ...edicion, tipo: e.target.value })} /> : r.tipo ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-ranch-marron/70">
                    {editando ? <input className={`${input} w-32`} value={edicion.ubicacion} onChange={(e) => setEdicion({ ...edicion, ubicacion: e.target.value })} /> : r.ubicacion ?? "—"}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${lleno ? "text-red-600" : "text-ranch-marron"}`}>
                    {editando ? (
                      <input className={`${input} w-24 text-right`} inputMode="numeric" value={edicion.capacidad} onChange={(e) => setEdicion({ ...edicion, capacidad: e.target.value })} />
                    ) : (
                      <>{r.ocupacion.toLocaleString("es-CO")}{r.capacidad !== null && <span className="font-normal text-ranch-marron/50"> / {r.capacidad.toLocaleString("es-CO")}</span>}</>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-ranch-marron/70">{r.grupos || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      {editando ? (
                        <>
                          <button
                            className={botonSec} disabled={busy}
                            onClick={async () => {
                              const ok = await correr(() => editarRecinto(r.id, edicion), "Recinto actualizado.");
                              if (ok) setEdicion(null);
                            }}
                          >Guardar</button>
                          <button className={botonSec} onClick={() => setEdicion(null)}>Cancelar</button>
                        </>
                      ) : (
                        esSupervisor && (
                        <>
                          <button className={botonSec} onClick={() => setEdicion({ id: r.id, nombre: r.nombre, tipo: r.tipo ?? "", ubicacion: r.ubicacion ?? "", capacidad: r.capacidad === null ? "" : String(r.capacidad), descripcion: r.descripcion ?? "" })}>Editar</button>
                          <button className={botonSec} disabled={busy} onClick={() => correr(() => cambiarEstadoRecinto(r.id, !r.activo), r.activo ? "Recinto desactivado." : "Recinto activado.")}>
                            {r.activo ? "Desactivar" : "Activar"}
                          </button>
                        </>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {recintos.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-ranch-marron/50">Todavía no hay recintos. Crea el primero arriba.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ ALIMENTOS

function Alimentos({ busy, correr, esSupervisor, alimentos }: Comun & { alimentos: AlimentoVista[] }) {
  const [nuevo, setNuevo] = useState({ nombre: "", tipo: "", unidad_medida: "bulto", costo_unitario: "", equivalencia_g: "" });
  const [edicion, setEdicion] = useState<{ id: string; nombre: string; tipo: string; unidad_medida: string; costo_unitario: string; equivalencia_g: string } | null>(null);
  const [mov, setMov] = useState<{ id: string; tipo: string; cantidad: string; unidad: string; motivo: string; costo: string } | null>(null);
  const sinEquivalencia = alimentos.filter((a) => a.activo && !a.convertible);

  return (
    <>
      {esSupervisor && (
      <section className={`mb-4 ${card} p-4`}>
        <h2 className="mb-1 font-bold text-ranch-marron">Nuevo alimento</h2>
        <p className="mb-3 text-xs text-ranch-marron/55">
          La <strong>equivalencia</strong> son los gramos (o ml) que trae una unidad de compra: un bulto de 40 kg = 40000.
          Sin ella no se puede calcular consumo ni costo de raciones en kg o gramos.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className={input} placeholder="Nombre (p. ej. Prepico Dorado)" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <input className={input} placeholder="Tipo (concentrado, forraje…)" value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })} />
          <input className={input} placeholder="Unidad de compra (bulto, kg…)" value={nuevo.unidad_medida} onChange={(e) => setNuevo({ ...nuevo, unidad_medida: e.target.value })} />
          <input className={input} placeholder="Costo por unidad (COP)" inputMode="numeric" value={nuevo.costo_unitario} onChange={(e) => setNuevo({ ...nuevo, costo_unitario: e.target.value })} />
          <input className={input} placeholder="Equivalencia en gramos (40000)" inputMode="numeric" value={nuevo.equivalencia_g} onChange={(e) => setNuevo({ ...nuevo, equivalencia_g: e.target.value })} />
        </div>
        <button
          className={`${boton} mt-3`} disabled={busy}
          onClick={async () => {
            const ok = await correr(() => crearAlimento(nuevo), "Alimento creado.");
            if (ok) setNuevo({ nombre: "", tipo: "", unidad_medida: "bulto", costo_unitario: "", equivalencia_g: "" });
          }}
        >Crear alimento</button>
      </section>
      )}

      {sinEquivalencia.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sin equivalencia declarada: {sinEquivalencia.map((a) => a.nombre).join(", ")}. Sus raciones no calculan consumo ni costo.
        </p>
      )}

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60">
            <tr>
              <th className={th}>Alimento</th>
              <th className={th}>Unidad</th>
              <th className={`${th} text-right`}>Costo</th>
              <th className={`${th} text-right`}>Existencia</th>
              <th className={`${th} text-right`}>Consumo/día</th>
              <th className={`${th} text-right`}>Autonomía</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {alimentos.map((a) => {
              const editando = edicion?.id === a.id;
              const moviendo = mov?.id === a.id;
              return (
                <FilaAlimento
                  key={a.id} a={a} busy={busy} correr={correr} esSupervisor={esSupervisor}
                  editando={editando} edicion={edicion} setEdicion={setEdicion}
                  moviendo={moviendo} mov={mov} setMov={setMov}
                />
              );
            })}
            {alimentos.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-ranch-marron/50">No hay alimentos cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FilaAlimento({
  a, busy, correr, esSupervisor, editando, edicion, setEdicion, moviendo, mov, setMov,
}: {
  a: AlimentoVista; busy: boolean; correr: Comun["correr"]; esSupervisor: boolean;
  editando: boolean;
  edicion: { id: string; nombre: string; tipo: string; unidad_medida: string; costo_unitario: string; equivalencia_g: string } | null;
  setEdicion: (v: { id: string; nombre: string; tipo: string; unidad_medida: string; costo_unitario: string; equivalencia_g: string } | null) => void;
  moviendo: boolean;
  mov: { id: string; tipo: string; cantidad: string; unidad: string; motivo: string; costo: string } | null;
  setMov: (v: { id: string; tipo: string; cantidad: string; unidad: string; motivo: string; costo: string } | null) => void;
}) {
  return (
    <>
      <tr className={`border-t border-ranch-marron/10 ${a.activo ? "" : "opacity-50"}`}>
        <td className="px-3 py-2 font-semibold text-ranch-marron">
          {editando && edicion ? <input className={`${input} w-40`} value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} /> : (
            <>{a.nombre}{a.tipo && <span className="block text-xs font-normal text-ranch-marron/50">{a.tipo}</span>}</>
          )}
        </td>
        <td className="px-3 py-2 text-ranch-marron/70">
          {editando && edicion ? <input className={`${input} w-24`} value={edicion.unidad_medida} onChange={(e) => setEdicion({ ...edicion, unidad_medida: e.target.value })} /> : (
            <>{a.unidad_medida}{a.equivalencia_g && <span className="block text-xs text-ranch-marron/45">{(a.equivalencia_g / 1000).toLocaleString("es-CO")} kg</span>}</>
          )}
        </td>
        <td className="px-3 py-2 text-right text-ranch-marron/70">
          {editando && edicion ? <input className={`${input} w-28 text-right`} inputMode="numeric" value={edicion.costo_unitario} onChange={(e) => setEdicion({ ...edicion, costo_unitario: e.target.value })} /> : (a.costo_unitario !== null ? formatearCOP(a.costo_unitario) : "—")}
        </td>
        <td className="px-3 py-2 text-right text-ranch-marron/70">
          {editando && edicion ? (
            <input className={`${input} w-28 text-right`} inputMode="numeric" placeholder="equiv. g" value={edicion.equivalencia_g} onChange={(e) => setEdicion({ ...edicion, equivalencia_g: e.target.value })} />
          ) : (
            <>
              {a.existenciaTexto ?? "—"}
              {a.valorExistencia !== null && <span className="block text-xs text-ranch-marron/45">{formatearCOP(a.valorExistencia)}</span>}
            </>
          )}
        </td>
        <td className="px-3 py-2 text-right text-ranch-marron/70">
          {a.consumoDiarioTexto ?? "—"}
          {a.costoDiario !== null && <span className="block text-xs text-ranch-marron/45">{formatearCOP(a.costoDiario)}/día</span>}
        </td>
        <td className={`px-3 py-2 text-right font-semibold ${a.autonomiaDias !== null && a.autonomiaDias < 7 ? "text-red-600" : "text-ranch-marron/70"}`}>
          {a.autonomiaDias !== null ? `${a.autonomiaDias} días` : "—"}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap justify-end gap-1">
            {editando && edicion ? (
              <>
                <button className={botonSec} disabled={busy} onClick={async () => { if (await correr(() => editarAlimento(a.id, edicion), "Alimento actualizado.")) setEdicion(null); }}>Guardar</button>
                <button className={botonSec} onClick={() => setEdicion(null)}>Cancelar</button>
              </>
            ) : (
              <>
                {esSupervisor && <button className={botonSec} onClick={() => setEdicion({ id: a.id, nombre: a.nombre, tipo: a.tipo ?? "", unidad_medida: a.unidad_medida, costo_unitario: a.costo_unitario === null ? "" : String(a.costo_unitario), equivalencia_g: a.equivalencia_g === null ? "" : String(a.equivalencia_g) })}>Editar</button>}
                <button className={botonSec} onClick={() => setMov(moviendo ? null : { id: a.id, tipo: "entrada", cantidad: "", unidad: a.unidad_medida, motivo: "", costo: "" })}>Movimiento</button>
                {esSupervisor && <button className={botonSec} disabled={busy} onClick={() => correr(() => cambiarEstadoAlimento(a.id, !a.activo), a.activo ? "Alimento desactivado." : "Alimento activado.")}>{a.activo ? "Desactivar" : "Activar"}</button>}
              </>
            )}
          </div>
        </td>
      </tr>

      {moviendo && mov && (
        <tr className="border-t border-ranch-marron/5 bg-ranch-crema/30">
          <td colSpan={7} className="px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <select className={input} value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })}>
                <option value="entrada">Entrada (compra)</option>
                <option value="salida">Salida (merma)</option>
                <option value="ajuste">Ajuste por conteo físico</option>
              </select>
              <input className={`${input} w-28`} placeholder="Cantidad" inputMode="decimal" value={mov.cantidad} onChange={(e) => setMov({ ...mov, cantidad: e.target.value })} />
              <select className={input} value={mov.unidad} onChange={(e) => setMov({ ...mov, unidad: e.target.value })}>
                {Array.from(new Set([a.unidad_medida, ...UNIDADES])).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <input className={`${input} w-32`} placeholder="Costo COP" inputMode="numeric" value={mov.costo} onChange={(e) => setMov({ ...mov, costo: e.target.value })} />
              <input className={`${input} flex-1`} placeholder="Motivo" value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} />
              <button
                className={boton} disabled={busy}
                onClick={async () => {
                  const ok = await correr(() => registrarMovimientoAlimento({ alimento_id: a.id, tipo: mov.tipo, cantidad: mov.cantidad, unidad: mov.unidad, motivo: mov.motivo, costo: mov.costo }), "Movimiento registrado.");
                  if (ok) setMov(null);
                }}
              >Registrar</button>
            </div>
            <p className="mt-2 text-xs text-ranch-marron/50">
              El <strong>ajuste</strong> fija el saldo al valor contado; la existencia siempre se recalcula desde estos movimientos.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

// ------------------------------------------------------------------ DIETA

function Dieta({
  busy, correr, esSupervisor, raciones, animales, categorias, alimentos,
}: Comun & { raciones: RacionVista[]; animales: AnimalVista[]; categorias: { id: string; nombre: string }[]; alimentos: AlimentoVista[] }) {
  const [nueva, setNueva] = useState({ destino: "animal" as "animal" | "categoria", destino_id: "", alimento_id: "", cantidad: "", unidad: "kg", modo: "grupal", frecuencia: "diaria", horario: "", observaciones: "" });
  const [abierto, setAbierto] = useState(false);
  const [edicion, setEdicion] = useState<{ id: string; cantidad: string; unidad: string; modo: string; frecuencia: string; horario: string } | null>(null);
  const activos = alimentos.filter((a) => a.activo);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-ranch-marron">Dieta ({raciones.filter((r) => r.activo).length} raciones activas)</h2>
        {esSupervisor && <button onClick={() => setAbierto(!abierto)} className={botonSec}>{abierto ? "Cerrar" : "+ Nueva ración"}</button>}
      </div>

      {abierto && esSupervisor && (
        <section className={`mb-4 ${card} p-4`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <select className={input} value={nueva.destino} onChange={(e) => setNueva({ ...nueva, destino: e.target.value as "animal" | "categoria", destino_id: "" })}>
              <option value="animal">Para un grupo</option>
              <option value="categoria">Para toda una categoría</option>
            </select>
            <select className={input} value={nueva.destino_id} onChange={(e) => setNueva({ ...nueva, destino_id: e.target.value })}>
              <option value="">{nueva.destino === "animal" ? "Grupo…" : "Categoría…"}</option>
              {(nueva.destino === "animal" ? animales.map((a) => ({ id: a.id, nombre: `${a.nombre} (${a.cantidad})` })) : categorias).map((x) => (
                <option key={x.id} value={x.id}>{x.nombre}</option>
              ))}
            </select>
            <select className={input} value={nueva.alimento_id} onChange={(e) => setNueva({ ...nueva, alimento_id: e.target.value })}>
              <option value="">Alimento…</option>
              {activos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>

            <input className={input} placeholder="Cantidad (p. ej. 800)" inputMode="decimal" value={nueva.cantidad} onChange={(e) => setNueva({ ...nueva, cantidad: e.target.value })} />
            <select className={input} value={nueva.unidad} onChange={(e) => setNueva({ ...nueva, unidad: e.target.value })}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select className={input} value={nueva.modo} onChange={(e) => setNueva({ ...nueva, modo: e.target.value })}>
              <option value="grupal">Grupal — total para el lote</option>
              <option value="individual">Individual — por cabeza</option>
            </select>

            <select className={input} value={nueva.frecuencia} onChange={(e) => setNueva({ ...nueva, frecuencia: e.target.value })}>
              {["diaria", "semanal", "quincenal", "mensual"].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <input className={input} placeholder="Horario (6:00 a.m. y 4:00 p.m.)" value={nueva.horario} onChange={(e) => setNueva({ ...nueva, horario: e.target.value })} />
            <input className={input} placeholder="Observaciones" value={nueva.observaciones} onChange={(e) => setNueva({ ...nueva, observaciones: e.target.value })} />
          </div>
          <p className="mt-2 text-xs text-ranch-marron/55">
            <strong>Individual</strong> multiplica la cantidad por las cabezas del grupo (800 g × 10 perros = 8 kg/día).
            <strong> Grupal</strong> es el total que se sirve, sin importar cuántos sean.
          </p>
          <button
            className={`${boton} mt-3`} disabled={busy}
            onClick={async () => {
              const ok = await correr(() => crearRacion(nueva), "Ración creada.");
              if (ok) setNueva({ ...nueva, destino_id: "", alimento_id: "", cantidad: "", horario: "", observaciones: "" });
            }}
          >Crear ración</button>
        </section>
      )}

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60">
            <tr>
              <th className={th}>Destino</th>
              <th className={th}>Alimento</th>
              <th className={th}>Ración</th>
              <th className={th}>Modo</th>
              <th className={`${th} text-right`}>Consumo/día</th>
              <th className={`${th} text-right`}>Costo/mes</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {raciones.map((r) => {
              const editando = edicion?.id === r.id;
              return (
                <tr key={r.id} className={`border-t border-ranch-marron/10 ${r.activo ? "" : "opacity-50"}`}>
                  <td className="px-3 py-2 font-semibold text-ranch-marron">
                    {r.destino}
                    <span className="block text-xs font-normal text-ranch-marron/50">{r.esGrupo ? "grupo" : "categoría"} · {r.cabezas} cabezas</span>
                  </td>
                  <td className="px-3 py-2 text-ranch-marron/70">{r.alimento}</td>
                  <td className="px-3 py-2 text-ranch-marron/70">
                    {editando && edicion ? (
                      <span className="flex gap-1">
                        <input className={`${input} w-20`} inputMode="decimal" value={edicion.cantidad} onChange={(e) => setEdicion({ ...edicion, cantidad: e.target.value })} />
                        <select className={input} value={edicion.unidad} onChange={(e) => setEdicion({ ...edicion, unidad: e.target.value })}>
                          {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <select className={input} value={edicion.frecuencia} onChange={(e) => setEdicion({ ...edicion, frecuencia: e.target.value })}>
                          {["diaria", "semanal", "quincenal", "mensual"].map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </span>
                    ) : (
                      <>
                        {r.cantidad.toLocaleString("es-CO")} {r.unidad} · {r.frecuencia}
                        {r.horario && <span className="block text-xs text-ranch-marron/45">{r.horario}</span>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editando && edicion ? (
                      <select className={input} value={edicion.modo} onChange={(e) => setEdicion({ ...edicion, modo: e.target.value })}>
                        <option value="grupal">grupal</option>
                        <option value="individual">individual</option>
                      </select>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.modo === "individual" ? "bg-ranch-marron/10 text-ranch-marron" : "bg-ranch-verde/15 text-ranch-verde"}`}>
                        {r.modo === "individual" ? "por cabeza" : "al lote"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-ranch-marron/70">
                    {r.diarioTexto ?? <span className="text-amber-600">falta equivalencia</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-ranch-marron">
                    {r.costoMensual !== null ? formatearCOP(r.costoMensual) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      {editando && edicion ? (
                        <>
                          <button className={botonSec} disabled={busy} onClick={async () => { if (await correr(() => editarRacion(r.id, edicion), "Ración actualizada.")) setEdicion(null); }}>Guardar</button>
                          <button className={botonSec} onClick={() => setEdicion(null)}>Cancelar</button>
                        </>
                      ) : (
                        esSupervisor && (
                        <>
                          <button className={botonSec} onClick={() => setEdicion({ id: r.id, cantidad: String(r.cantidad), unidad: r.unidad, modo: r.modo, frecuencia: r.frecuencia, horario: r.horario ?? "" })}>Editar</button>
                          <button className={botonSec} disabled={busy} onClick={() => correr(() => cambiarEstadoRacion(r.id, !r.activo), r.activo ? "Ración desactivada." : "Ración activada.")}>{r.activo ? "Desactivar" : "Activar"}</button>
                        </>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {raciones.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-ranch-marron/50">No hay raciones definidas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ BITÁCORA

function Bitacora({
  busy, correr, esAdmin, bitacora, raciones, animales, alimentos, empleados, kpis,
}: Comun & {
  bitacora: BitacoraVista[]; raciones: RacionVista[]; animales: AnimalVista[];
  alimentos: AlimentoVista[]; empleados: { id: string; nombre: string }[];
  kpis: { entregasHoy: number; costoHoy: number; racionesDiariasActivas: number };
}) {
  const activas = useMemo(() => raciones.filter((r) => r.activo), [raciones]);
  const [form, setForm] = useState({ racion_id: "", animal_id: "", alimento_id: "", cantidad: "", unidad: "kg", estado: "realizada", motivo: "", empleado_id: "", observaciones: "" });
  const [anulando, setAnulando] = useState<{ id: string; motivo: string } | null>(null);

  const racionSel = activas.find((r) => r.id === form.racion_id) ?? null;

  function elegirRacion(id: string) {
    const r = activas.find((x) => x.id === id);
    // Se propone lo que toca HOY (la ración mensual ya viene prorrateada al día).
    setForm({
      ...form,
      racion_id: id,
      animal_id: "",
      alimento_id: "",
      unidad: r?.sugerido?.unidad ?? "kg",
      cantidad: r?.sugerido?.cantidad ?? "",
    });
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi label="Entregas hoy" valor={String(kpis.entregasHoy)} />
        <Kpi label="Raciones diarias" valor={String(kpis.racionesDiariasActivas)} />
        <Kpi label="Costo de hoy" valor={formatearCOP(kpis.costoHoy)} />
      </div>

      <section className={`mb-4 ${card} p-4`}>
        <h2 className="mb-3 font-bold text-ranch-marron">Registrar alimentación</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <select className={`${input} sm:col-span-2`} value={form.racion_id} onChange={(e) => elegirRacion(e.target.value)}>
            <option value="">Entrega extraordinaria (sin ración)</option>
            {activas.map((r) => (
              <option key={r.id} value={r.id}>{r.destino} · {r.alimento} · {r.resumen}</option>
            ))}
          </select>
          <select className={input} value={form.empleado_id} onChange={(e) => setForm({ ...form, empleado_id: e.target.value })}>
            <option value="">¿Quién alimentó? (opcional)</option>
            {empleados.map((e2) => <option key={e2.id} value={e2.id}>{e2.nombre}</option>)}
          </select>

          {!racionSel && (
            <>
              <select className={input} value={form.animal_id} onChange={(e) => setForm({ ...form, animal_id: e.target.value })}>
                <option value="">Grupo…</option>
                {animales.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.cantidad})</option>)}
              </select>
              <select className={input} value={form.alimento_id} onChange={(e) => setForm({ ...form, alimento_id: e.target.value })}>
                <option value="">Alimento…</option>
                {alimentos.filter((a) => a.activo).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </>
          )}

          <select className={input} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
            <option value="realizada">Realizada</option>
            <option value="parcial">Parcial</option>
            <option value="omitida">No se alimentó</option>
          </select>

          {form.estado !== "omitida" && (
            <>
              <input className={input} placeholder="Cantidad entregada" inputMode="decimal" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
              <select className={input} value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </>
          )}

          <input
            className={`${input} sm:col-span-2`}
            placeholder={form.estado === "realizada" ? "Motivo (opcional)" : "Motivo (obligatorio)"}
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
          />
          <input className={input} placeholder="Observaciones" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
        </div>

        {racionSel && (
          <p className="mt-2 text-xs text-ranch-marron/55">
            Según la dieta le tocan <strong>{racionSel.diarioTexto ?? "—"}</strong> al día
            {racionSel.modo === "individual" ? ` (${racionSel.cantidad} ${racionSel.unidad} × ${racionSel.cabezas} cabezas)` : " para todo el lote"}.
          </p>
        )}

        <button
          className={`${boton} mt-3`} disabled={busy}
          onClick={async () => {
            const ok = await correr(() => registrarAlimentacion(form), "Alimentación registrada.");
            if (ok) setForm({ ...form, cantidad: "", motivo: "", observaciones: "" });
          }}
        >Registrar</button>
      </section>

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60">
            <tr>
              <th className={th}>Fecha</th>
              <th className={th}>Destino</th>
              <th className={th}>Alimento</th>
              <th className={`${th} text-right`}>Entregado</th>
              <th className={`${th} text-right`}>Planeado</th>
              <th className={`${th} text-right`}>Costo</th>
              <th className={th}>Estado</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {bitacora.map((b) => (
              <>
                <tr key={b.id} className={`border-t border-ranch-marron/10 ${b.anulado ? "opacity-50 line-through" : ""}`}>
                  <td className="px-3 py-2 text-ranch-marron/60">
                    {b.fecha}
                    {b.automatico && (
                      <span className="mt-1 block w-fit rounded-full bg-ranch-verde/15 px-2 py-0.5 text-[10px] font-semibold text-ranch-verde">
                        auto {b.franja}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-semibold text-ranch-marron">
                    {b.destino}
                    {b.recinto && <span className="block text-xs font-normal text-ranch-marron/45">{b.recinto}</span>}
                  </td>
                  <td className="px-3 py-2 text-ranch-marron/70">{b.alimento}</td>
                  <td className="px-3 py-2 text-right text-ranch-marron">{b.entregadaTexto}</td>
                  <td className="px-3 py-2 text-right text-ranch-marron/60">
                    {b.planeadaTexto ?? "—"}
                    {b.cumple === false && <span className="block text-xs font-semibold text-amber-600">por debajo</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-ranch-marron/70">{b.costo !== null ? formatearCOP(b.costo) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${b.estado === "realizada" ? "bg-ranch-verde/15 text-ranch-verde" : b.estado === "parcial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                      {b.estado}
                    </span>
                    {b.motivo && <span className="block text-xs text-ranch-marron/45">{b.motivo}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {esAdmin && !b.anulado && (
                      <button className={botonSec} onClick={() => setAnulando(anulando?.id === b.id ? null : { id: b.id, motivo: "" })}>Anular</button>
                    )}
                    {b.anulado && <span className="text-xs text-ranch-marron/45">{b.motivo_anulacion}</span>}
                  </td>
                </tr>
                {anulando?.id === b.id && (
                  <tr key={`${b.id}-anular`} className="border-t border-ranch-marron/5 bg-ranch-crema/30">
                    <td colSpan={8} className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input className={`${input} flex-1`} placeholder="Motivo de la anulación (obligatorio)" value={anulando.motivo} onChange={(e) => setAnulando({ ...anulando, motivo: e.target.value })} />
                        <button
                          className={boton} disabled={busy}
                          onClick={async () => { if (await correr(() => anularAlimentacion(b.id, anulando.motivo), "Registro anulado y alimento devuelto al inventario.")) setAnulando(null); }}
                        >Anular</button>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {bitacora.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-ranch-marron/50">Todavía no se ha registrado ninguna alimentación.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ util

function Kpi({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 bg-white p-3 text-center shadow-sm ${alerta ? "border-amber-300" : "border-ranch-marron/15"}`}>
      <p className={`text-xl font-black ${alerta ? "text-amber-700" : "text-ranch-marron"}`}>{valor}</p>
      <p className="text-[11px] uppercase tracking-wide text-ranch-marron/50">{label}</p>
    </div>
  );
}
