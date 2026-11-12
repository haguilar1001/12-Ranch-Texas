"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP, formatearMiles } from "@/lib/dinero/cop";
import { NOVEDADES_EQUIPO, ETIQUETA_EQUIPO, EFECTO_EQUIPO, MOTIVO_OBLIGATORIO_EQUIPO, type TipoMovEquipo } from "@/lib/inventario/kardex";
import {
  crearGrupoEquipo, editarGrupoEquipo, cambiarEstadoGrupoEquipo,
  crearEquipo, editarEquipo, cambiarEstadoEquipo, trasladarEquipo,
  registrarNovedadEquipo, anularNovedadEquipo,
  crearMantenimiento, actualizarMantenimiento,
  type EntradaEquipo,
} from "./actions";

// ------------------------------------------------------------------ tipos

export interface EquipoVista {
  id: string; nombre: string; codigo: string | null; categoria_id: string; grupo: string;
  marca: string | null; modelo: string | null; referencia: string | null; serie: string | null;
  area_id: string | null; area: string | null; ubicacion: string | null; cantidad: number;
  proveedor_id: string | null; proveedor: string | null; responsable_id: string | null; responsable: string | null;
  valor_compra: number | null; fecha_compra: string | null; fecha_instalacion: string | null;
  garantia_hasta: string | null; vida_util_meses: number | null; estado: string; observaciones: string | null;
}

export interface MovimientoVista {
  id: string; equipo_id: string; fecha: string; equipo: string; codigo: string | null; tipo: string; etiqueta: string;
  cantidad: number; motivo: string | null; valor: number | null; tercero: string | null;
  origen: string | null; destino: string | null; anulado: boolean; motivo_anulacion: string | null; anulable: boolean;
}

export interface MantenimientoVista {
  id: string; equipo_id: string; equipo: string; codigo: string | null; tipo: string; descripcion: string;
  fecha_programada: string | null; fecha_realizada: string | null; costo: number; responsable: string | null;
  estado: string; vencido: boolean;
}

interface Opcion { id: string; nombre: string }

interface Props {
  esAdmin: boolean;
  hoy: string;
  kpis: { registros: number; unidades: number; operativos: number; noOperativos: number; valor: number; mantVencidos: number; garantiasPorVencer: number };
  equipos: EquipoVista[];
  grupos: { id: string; nombre: string; descripcion: string | null; activo: boolean; equipos: number }[];
  areas: Opcion[];
  empleados: Opcion[];
  proveedores: Opcion[];
  movimientos: MovimientoVista[];
  resumenMes: { tipo: string; etiqueta: string; movimientos: number; cantidad: number; valor: number }[];
  mantenimientos: MantenimientoVista[];
}

type Pestana = "inventario" | "novedades" | "mantenimientos" | "grupos";
const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "inventario", label: "Inventario" },
  { id: "novedades", label: "Novedades" },
  { id: "mantenimientos", label: "Mantenimientos" },
  { id: "grupos", label: "Grupos" },
];

const ESTADO_EQUIPO: Record<string, string> = {
  operativo: "bg-ranch-verde/15 text-ranch-verde",
  en_mantenimiento: "bg-amber-100 text-amber-700",
  fuera_servicio: "bg-red-100 text-red-700",
  dado_de_baja: "bg-ranch-marron/10 text-ranch-marron/60",
};
const ESTADO_MANT: Record<string, string> = {
  programado: "bg-ranch-dorado/20 text-ranch-marron",
  en_proceso: "bg-amber-100 text-amber-700",
  realizado: "bg-ranch-verde/15 text-ranch-verde",
  cancelado: "bg-ranch-marron/10 text-ranch-marron/60",
};

const input = "rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm";
const boton = "rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50";
const botonSec = "rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60 disabled:opacity-50";
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white";
const th = "px-3 py-2 text-xs uppercase text-ranch-marron/60";
const etiquetaEstado = (e: string) => e.replace(/_/g, " ");

type Correr = (fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, exito: string) => Promise<boolean>;

// ------------------------------------------------------------------ componente

export default function EquiposClient(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Pestana>("inventario");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [novedadPara, setNovedadPara] = useState("");

  const correr: Correr = async (fn, exito) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg({ ok: r.ok, t: r.ok ? [exito, r.aviso].filter(Boolean).join(" ") : r.error ?? "Error" });
    if (r.ok) router.refresh();
    return r.ok;
  };

  const gruposActivos = p.grupos.filter((g) => g.activo);

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ranch-marron">Equipos</h1>
        <p className="text-sm text-ranch-marron/60">Inventario, novedades (compras, bajas, robos, traslados) y mantenimientos</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Equipos" valor={formatearMiles(p.kpis.registros)} />
        <Kpi label="Unidades" valor={formatearMiles(p.kpis.unidades)} />
        <Kpi label="Operativas" valor={formatearMiles(p.kpis.operativos)} />
        <Kpi label="En taller / fuera" valor={formatearMiles(p.kpis.noOperativos)} alerta={p.kpis.noOperativos > 0} />
        <Kpi label="Valor de compra" valor={formatearCOP(p.kpis.valor)} />
        <Kpi label="Mant. vencidos" valor={formatearMiles(p.kpis.mantVencidos)} alerta={p.kpis.mantVencidos > 0} />
      </div>
      {p.kpis.garantiasPorVencer > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {p.kpis.garantiasPorVencer} equipo(s) con la garantía venciendo en los próximos 30 días.
        </p>
      )}

      <nav className="mb-4 flex flex-wrap gap-2">
        {PESTANAS.map((x) => (
          <button
            key={x.id}
            onClick={() => { setTab(x.id); setMsg(null); }}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === x.id ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/25 text-ranch-marron hover:bg-ranch-crema/60"}`}
          >
            {x.label}
          </button>
        ))}
      </nav>

      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {tab === "inventario" && (
        <Inventario
          {...p} grupos={gruposActivos} busy={busy} correr={correr}
          irANovedad={(id) => { setNovedadPara(id); setMsg(null); setTab("novedades"); }}
        />
      )}
      {tab === "novedades" && (
        <Novedades esAdmin={p.esAdmin} hoy={p.hoy} equipos={p.equipos} movimientos={p.movimientos} resumenMes={p.resumenMes} inicial={novedadPara} busy={busy} correr={correr} />
      )}
      {tab === "mantenimientos" && <Mantenimientos hoy={p.hoy} equipos={p.equipos} mantenimientos={p.mantenimientos} busy={busy} correr={correr} />}
      {tab === "grupos" && <Grupos grupos={p.grupos} busy={busy} correr={correr} />}
    </main>
  );
}

// ------------------------------------------------------------------ INVENTARIO

const fichaVacia = (): Required<Omit<EntradaEquipo, "valor_compra" | "vida_util_meses" | "cantidad">> & { valor_compra: string; vida_util_meses: string; cantidad: string } => ({
  nombre: "", categoria_id: "", codigo: "", marca: "", modelo: "", referencia: "", serie: "",
  area_id: "", ubicacion: "", responsable_id: "", proveedor_id: "", proveedor_nombre: "",
  valor_compra: "", fecha_compra: "", fecha_instalacion: "", garantia_hasta: "", vida_util_meses: "",
  observaciones: "", cantidad: "1", origen: "saldo_inicial",
});
type Ficha = ReturnType<typeof fichaVacia>;

function fichaDe(e: EquipoVista): Ficha {
  return {
    ...fichaVacia(),
    nombre: e.nombre, categoria_id: e.categoria_id, codigo: e.codigo ?? "", marca: e.marca ?? "", modelo: e.modelo ?? "",
    referencia: e.referencia ?? "", serie: e.serie ?? "", area_id: e.area_id ?? "", ubicacion: e.ubicacion ?? "",
    responsable_id: e.responsable_id ?? "", proveedor_id: e.proveedor_id ?? "",
    valor_compra: e.valor_compra === null ? "" : String(e.valor_compra),
    fecha_compra: e.fecha_compra ?? "", fecha_instalacion: e.fecha_instalacion ?? "", garantia_hasta: e.garantia_hasta ?? "",
    vida_util_meses: e.vida_util_meses === null ? "" : String(e.vida_util_meses), observaciones: e.observaciones ?? "",
  };
}

function Inventario({
  equipos, grupos, areas, empleados, proveedores, movimientos, hoy, busy, correr, irANovedad,
}: Props & { busy: boolean; correr: Correr; irANovedad: (id: string) => void }) {
  const [ficha, setFicha] = useState<{ id: string | null; f: Ficha } | null>(null);
  const [traslado, setTraslado] = useState<{ id: string; area_id: string; ubicacion: string; cantidad: string; motivo: string } | null>(null);
  const [historial, setHistorial] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [grupo, setGrupo] = useState("");
  const [verCero, setVerCero] = useState(false);

  const q = buscar.trim().toLowerCase();
  const visibles = equipos.filter((e) =>
    (verCero || e.cantidad > 0) &&
    (!grupo || e.categoria_id === grupo) &&
    (!q || [e.nombre, e.codigo, e.marca, e.referencia, e.serie, e.ubicacion, e.area].some((x) => x?.toLowerCase().includes(q))),
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={`${input} flex-1`} placeholder="Buscar por nombre, código, marca, referencia, serie, ubicación…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <select className={input} value={grupo} onChange={(e) => setGrupo(e.target.value)}>
          <option value="">Todos los grupos</option>
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-ranch-marron/70">
          <input type="checkbox" checked={verCero} onChange={(e) => setVerCero(e.target.checked)} /> Ver dados de baja
        </label>
        <button className={botonSec} onClick={() => setFicha(ficha?.id === null ? null : { id: null, f: fichaVacia() })}>
          {ficha?.id === null ? "Cerrar" : "+ Nuevo equipo"}
        </button>
      </div>

      {ficha && (
        <FormFicha
          ficha={ficha} setFicha={setFicha} grupos={grupos} areas={areas} empleados={empleados} proveedores={proveedores}
          busy={busy} correr={correr}
        />
      )}

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60">
            <tr>
              <th className={th}>Código</th>
              <th className={th}>Equipo</th>
              <th className={th}>Grupo</th>
              <th className={th}>Marca / Referencia</th>
              <th className={`${th} text-right`}>Cant.</th>
              <th className={th}>Ubicación</th>
              <th className={th}>Estado</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((e) => (
              <FilaEquipo
                key={e.id} e={e} areas={areas} movimientos={movimientos} hoy={hoy} busy={busy} correr={correr}
                traslado={traslado} setTraslado={setTraslado} historial={historial} setHistorial={setHistorial}
                editar={() => setFicha({ id: e.id, f: fichaDe(e) })} irANovedad={irANovedad}
              />
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-ranch-marron/50">No hay equipos con ese filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FormFicha({
  ficha, setFicha, grupos, areas, empleados, proveedores, busy, correr,
}: {
  ficha: { id: string | null; f: Ficha }; setFicha: (v: { id: string | null; f: Ficha } | null) => void;
  grupos: Props["grupos"]; areas: Opcion[]; empleados: Opcion[]; proveedores: Opcion[]; busy: boolean; correr: Correr;
}) {
  const { id, f } = ficha;
  const set = (k: keyof Ficha, v: string) => setFicha({ id, f: { ...f, [k]: v } });
  const nuevo = id === null;
  const campo = (k: keyof Ficha, placeholder: string, extra = "") => (
    <input className={`${input} ${extra}`} placeholder={placeholder} value={f[k] as string} onChange={(e) => set(k, e.target.value)} />
  );
  const fecha = (k: keyof Ficha, etiqueta: string) => (
    <label className="flex flex-col text-xs text-ranch-marron/60">
      {etiqueta}
      <input className={input} type="date" value={f[k] as string} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  return (
    <section className={`mb-4 ${card} p-4`}>
      <h2 className="mb-3 font-bold text-ranch-marron">{nuevo ? "Nuevo equipo" : `Editar: ${f.nombre}`}</h2>
      <p className="mb-2 text-xs font-bold uppercase text-ranch-marron/50">Identificación</p>
      <div className="grid gap-3 sm:grid-cols-4">
        {campo("nombre", "Nombre (p. ej. Planta eléctrica 60 kVA)", "sm:col-span-2")}
        <select className={input} value={f.categoria_id} onChange={(e) => set("categoria_id", e.target.value)}>
          <option value="">Grupo…</option>
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
        {campo("codigo", "Código / placa interna")}
        {campo("marca", "Marca")}
        {campo("referencia", "Referencia")}
        {campo("modelo", "Modelo")}
        {campo("serie", "N.º de serie")}
      </div>

      {nuevo && (
        <>
          <p className="mb-2 mt-4 text-xs font-bold uppercase text-ranch-marron/50">Ubicación y cantidad</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <select className={input} value={f.area_id ?? ""} onChange={(e) => set("area_id", e.target.value)}>
              <option value="">Área…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            {campo("ubicacion", "Ubicación exacta (p. ej. Tarima central)")}
            <label className="flex items-center gap-2 text-sm text-ranch-marron/70">
              Unidades
              <input className={`${input} w-20 text-right`} inputMode="numeric" value={f.cantidad} onChange={(e) => set("cantidad", e.target.value)} />
            </label>
            <select className={input} value={f.origen} onChange={(e) => set("origen", e.target.value)}>
              <option value="saldo_inicial">Ya estaba en el parque</option>
              <option value="compra">Compra</option>
              <option value="donacion_recibida">Donación recibida</option>
            </select>
          </div>
        </>
      )}

      <p className="mb-2 mt-4 text-xs font-bold uppercase text-ranch-marron/50">Compra, garantía y responsable</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <select className={input} value={f.proveedor_id ?? ""} onChange={(e) => set("proveedor_id", e.target.value)}>
          <option value="">Proveedor…</option>
          {proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>
        {!f.proveedor_id && campo("proveedor_nombre", "…o escribe un proveedor nuevo")}
        <input className={input} inputMode="numeric" placeholder="Valor unitario de compra ($)" value={f.valor_compra} onChange={(e) => set("valor_compra", e.target.value)} />
        <input className={input} inputMode="numeric" placeholder="Vida útil (meses)" value={f.vida_util_meses} onChange={(e) => set("vida_util_meses", e.target.value)} />
        {fecha("fecha_compra", "Fecha de compra")}
        {fecha("fecha_instalacion", "Fecha de instalación")}
        {fecha("garantia_hasta", "Garantía hasta")}
        <select className={input} value={f.responsable_id ?? ""} onChange={(e) => set("responsable_id", e.target.value)}>
          <option value="">Responsable (a cargo)…</option>
          {empleados.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>
        {campo("observaciones", "Observaciones", "sm:col-span-4")}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          className={boton} disabled={busy}
          onClick={async () => {
            const ok = await correr(() => (nuevo ? crearEquipo(f) : editarEquipo(id, f)), nuevo ? "Equipo creado." : "Equipo actualizado.");
            if (ok) setFicha(null);
          }}
        >{nuevo ? "Crear equipo" : "Guardar"}</button>
        <button className={botonSec} onClick={() => setFicha(null)}>Cancelar</button>
      </div>
      {!nuevo && <p className="mt-2 text-xs text-ranch-marron/50">La ubicación cambia con “Trasladar” y las unidades con una novedad, para que quede la historia.</p>}
    </section>
  );
}

function FilaEquipo({
  e, areas, movimientos, hoy, busy, correr, traslado, setTraslado, historial, setHistorial, editar, irANovedad,
}: {
  e: EquipoVista; areas: Opcion[]; movimientos: MovimientoVista[]; hoy: string; busy: boolean; correr: Correr;
  traslado: { id: string; area_id: string; ubicacion: string; cantidad: string; motivo: string } | null;
  setTraslado: (v: { id: string; area_id: string; ubicacion: string; cantidad: string; motivo: string } | null) => void;
  historial: string | null; setHistorial: (v: string | null) => void;
  editar: () => void; irANovedad: (id: string) => void;
}) {
  const trasladando = traslado?.id === e.id;
  const garantiaVigente = e.garantia_hasta && e.garantia_hasta >= hoy;
  const propios = movimientos.filter((m) => m.equipo_id === e.id);

  return (
    <>
      <tr className={`border-t border-ranch-marron/10 align-top ${e.cantidad === 0 ? "opacity-50" : ""}`}>
        <td className="px-3 py-2 font-mono text-xs text-ranch-marron/70">{e.codigo ?? "—"}</td>
        <td className="px-3 py-2 font-semibold text-ranch-marron">
          {e.nombre}
          <span className="block text-xs font-normal text-ranch-marron/50">
            {[e.serie && `Serie ${e.serie}`, e.responsable && `A cargo: ${e.responsable}`, garantiaVigente && `Garantía hasta ${e.garantia_hasta}`].filter(Boolean).join(" · ")}
          </span>
        </td>
        <td className="px-3 py-2 text-ranch-marron/70">{e.grupo}</td>
        <td className="px-3 py-2 text-ranch-marron/70">{[e.marca, e.referencia ?? e.modelo].filter(Boolean).join(" · ") || "—"}</td>
        <td className="px-3 py-2 text-right font-bold text-ranch-marron">{formatearMiles(e.cantidad)}</td>
        <td className="px-3 py-2 text-ranch-marron/70">
          {e.area ?? "—"}{e.ubicacion && <span className="block text-xs text-ranch-marron/45">{e.ubicacion}</span>}
        </td>
        <td className="px-3 py-2">
          {e.cantidad > 0 && e.estado !== "dado_de_baja" ? (
            <select
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_EQUIPO[e.estado] ?? ""}`}
              value={e.estado} disabled={busy}
              onChange={(ev) => correr(() => cambiarEstadoEquipo(e.id, ev.target.value), "Estado actualizado.")}
            >
              {["operativo", "en_mantenimiento", "fuera_servicio"].map((x) => <option key={x} value={x}>{etiquetaEstado(x)}</option>)}
            </select>
          ) : (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_EQUIPO.dado_de_baja}`}>dado de baja</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap justify-end gap-1">
            <button className={botonSec} onClick={() => irANovedad(e.id)} title="Compra, baja, robo, venta, ajuste…">Novedad</button>
            {e.cantidad > 0 && (
              <button className={botonSec} onClick={() => setTraslado(trasladando ? null : { id: e.id, area_id: e.area_id ?? "", ubicacion: "", cantidad: String(e.cantidad), motivo: "" })}>Trasladar</button>
            )}
            <button className={botonSec} onClick={editar}>Editar</button>
            <button className={botonSec} onClick={() => setHistorial(historial === e.id ? null : e.id)}>Historial</button>
          </div>
        </td>
      </tr>

      {trasladando && (
        <tr className="border-t border-ranch-marron/5 bg-ranch-crema/30">
          <td colSpan={8} className="px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ranch-marron">Trasladar</span>
              <input className={`${input} w-20 text-right`} inputMode="numeric" value={traslado.cantidad} onChange={(ev) => setTraslado({ ...traslado, cantidad: ev.target.value })} />
              <span className="text-sm font-semibold text-ranch-marron">de {e.cantidad} a:</span>
              <select className={input} value={traslado.area_id} onChange={(ev) => setTraslado({ ...traslado, area_id: ev.target.value })}>
                <option value="">Área…</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              <input className={input} placeholder="Ubicación exacta" value={traslado.ubicacion} onChange={(ev) => setTraslado({ ...traslado, ubicacion: ev.target.value })} />
              <input className={`${input} flex-1`} placeholder="Motivo (opcional)" value={traslado.motivo} onChange={(ev) => setTraslado({ ...traslado, motivo: ev.target.value })} />
              <button
                className={boton} disabled={busy}
                onClick={async () => { if (await correr(() => trasladarEquipo(e.id, traslado), "Traslado registrado.")) setTraslado(null); }}
              >Trasladar</button>
            </div>
            {Number(traslado.cantidad) > 0 && Number(traslado.cantidad) < e.cantidad && (
              <p className="mt-2 text-xs text-ranch-marron/60">Traslado parcial: esas unidades pasan a un registro igual en el destino (si no existe, se crea). El total no cambia.</p>
            )}
          </td>
        </tr>
      )}

      {historial === e.id && (
        <tr className="border-t border-ranch-marron/5 bg-ranch-crema/20">
          <td colSpan={8} className="px-3 py-3">
            <p className="mb-2 text-xs font-bold uppercase text-ranch-marron/60">Hoja de vida · movimientos</p>
            {propios.length === 0 ? (
              <p className="text-sm text-ranch-marron/50">Sin movimientos.</p>
            ) : (
              <ul className="space-y-1 text-sm text-ranch-marron/75">
                {propios.map((m) => (
                  <li key={m.id} className={m.anulado ? "line-through opacity-60" : ""}>
                    <span className="text-ranch-marron/50">{m.fecha}</span> · <strong>{m.etiqueta}</strong> ({formatearMiles(m.cantidad)})
                    {(m.origen || m.destino) && <> · {m.origen ?? "—"} → {m.destino ?? "—"}</>}
                    {m.motivo && <span className="text-ranch-marron/50"> · {m.motivo}</span>}
                  </li>
                ))}
              </ul>
            )}
            {e.observaciones && <p className="mt-2 text-xs text-ranch-marron/60">Obs.: {e.observaciones}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

// ------------------------------------------------------------------ NOVEDADES

const PIDE_VALOR: TipoMovEquipo[] = ["compra", "venta"];
const PIDE_TERCERO: TipoMovEquipo[] = ["compra", "venta", "donacion_recibida", "entrega"];
const AYUDA_MOTIVO: Partial<Record<TipoMovEquipo, string>> = {
  baja: "Por qué se da de baja: daño irreparable, obsoleto… (obligatorio)",
  robo: "Qué pasó y número de denuncia si hay (obligatorio)",
  perdida: "Qué pasó (obligatorio)",
  entrega: "A quién y por qué (obligatorio)",
  ajuste: "Por qué no cuadraba el conteo (obligatorio)",
  compra: "Factura u observación (opcional)",
};

function Novedades({
  esAdmin, hoy, equipos, movimientos, resumenMes, inicial, busy, correr,
}: Pick<Props, "esAdmin" | "hoy" | "equipos" | "movimientos" | "resumenMes"> & { inicial: string; busy: boolean; correr: Correr }) {
  const vacio = { equipo_id: inicial, tipo: "", cantidad: "1", fecha: hoy, motivo: "", valor: "", tercero: "" };
  const [f, setF] = useState(vacio);
  const [filtro, setFiltro] = useState("");
  const [anulando, setAnulando] = useState<{ id: string; motivo: string } | null>(null);
  const tipo = f.tipo as TipoMovEquipo;
  const eq = equipos.find((e) => e.id === f.equipo_id);
  const efecto = f.tipo ? EFECTO_EQUIPO[tipo] : null;
  const n = parseInt(f.cantidad.replace(/[^\d]/g, ""), 10);
  const quedan = eq && Number.isInteger(n)
    ? efecto === "ajuste" ? n : efecto === "entrada" ? eq.cantidad + n : efecto === "salida" ? eq.cantidad - n : null
    : null;
  const visibles = filtro ? movimientos.filter((m) => m.tipo === filtro) : movimientos;
  const tipos = Array.from(new Set(movimientos.map((m) => m.tipo)));

  return (
    <>
      <section className={`mb-4 ${card} p-4`}>
        <h2 className="mb-1 font-bold text-ranch-marron">Registrar novedad</h2>
        <p className="mb-3 text-xs text-ranch-marron/60">Todo lo que cambia cuántos equipos hay entra por aquí; las unidades se recalculan solas. Para cambiar de lugar usa “Trasladar” en el inventario.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <select className={input} value={f.equipo_id} onChange={(e) => setF({ ...f, equipo_id: e.target.value })}>
            <option value="">Equipo…</option>
            {equipos.map((e) => <option key={e.id} value={e.id}>{e.codigo ? `${e.codigo} · ` : ""}{e.nombre} · {e.cantidad} und.{e.ubicacion ? ` · ${e.ubicacion}` : ""}</option>)}
          </select>
          <select className={input} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            <option value="">Tipo de novedad…</option>
            <optgroup label="Entran (+)">
              {NOVEDADES_EQUIPO.filter((t) => EFECTO_EQUIPO[t] === "entrada").map((t) => <option key={t} value={t}>{ETIQUETA_EQUIPO[t]}</option>)}
            </optgroup>
            <optgroup label="Salen (−)">
              {NOVEDADES_EQUIPO.filter((t) => EFECTO_EQUIPO[t] === "salida").map((t) => <option key={t} value={t}>{ETIQUETA_EQUIPO[t]}</option>)}
            </optgroup>
            <optgroup label="Conteo"><option value="ajuste">{ETIQUETA_EQUIPO.ajuste}</option></optgroup>
          </select>
          <input className={input} type="date" max={hoy} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-ranch-marron/70">
            {tipo === "ajuste" ? "Unidades contadas" : "Unidades"}
            <input className={`${input} w-24 text-right`} inputMode="numeric" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} />
          </label>
          {PIDE_VALOR.includes(tipo) && (
            <input className={input} inputMode="numeric" placeholder={tipo === "compra" ? "Valor total de la compra ($)" : "Valor total de la venta ($)"} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
          )}
          {PIDE_TERCERO.includes(tipo) && (
            <input className={input} placeholder={tipo === "venta" || tipo === "entrega" ? "Quién lo recibe" : "Quién lo vende o entrega"} value={f.tercero} onChange={(e) => setF({ ...f, tercero: e.target.value })} />
          )}
          <input className={`${input} sm:col-span-3`} placeholder={AYUDA_MOTIVO[tipo] ?? "Observación (opcional)"} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className={boton} disabled={busy}
            onClick={async () => { if (await correr(() => registrarNovedadEquipo({ ...f, valor: f.valor || null }), "Novedad registrada.")) setF({ ...vacio, equipo_id: f.equipo_id }); }}
          >Registrar</button>
          {eq && quedan !== null && (
            <span className={`text-sm ${quedan < 0 ? "font-semibold text-red-600" : "text-ranch-marron/70"}`}>
              {eq.nombre}: {eq.cantidad} → <strong>{quedan}</strong> unidad(es){quedan === 0 ? " · queda dado de baja" : ""}
            </span>
          )}
          {MOTIVO_OBLIGATORIO_EQUIPO.includes(tipo) && !f.motivo.trim() && <span className="text-xs text-amber-700">Falta el motivo.</span>}
        </div>
      </section>

      <h2 className="mb-2 font-bold text-ranch-marron">Este mes</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {resumenMes.length === 0 && <p className="col-span-full text-sm text-ranch-marron/50">Sin novedades este mes.</p>}
        {resumenMes.map((r) => (
          <div key={r.tipo} className={`${card} p-3`}>
            <p className="text-xs uppercase text-ranch-marron/50">{r.etiqueta}</p>
            <p className="text-xl font-black text-ranch-marron">{formatearMiles(r.cantidad)}</p>
            <p className="text-xs text-ranch-marron/60">{formatearMiles(r.movimientos)} registro(s){r.valor > 0 ? ` · ${formatearCOP(r.valor)}` : ""}</p>
          </div>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-ranch-marron">Kardex de equipos</h2>
        <select className={input} value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todas las novedades</option>
          {tipos.map((t) => <option key={t} value={t}>{ETIQUETA_EQUIPO[t as TipoMovEquipo] ?? t}</option>)}
        </select>
      </div>
      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60">
            <tr>
              <th className={th}>Fecha</th><th className={th}>Equipo</th><th className={th}>Novedad</th>
              <th className={`${th} text-right`}>Und.</th><th className={th}>Detalle</th><th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((m) => {
              const ef = EFECTO_EQUIPO[m.tipo as TipoMovEquipo];
              const signo = ef === "entrada" ? "+" : ef === "salida" ? "−" : ef === "ajuste" ? "=" : "↔";
              return (
                <tr key={m.id} className={`border-t border-ranch-marron/10 align-top ${m.anulado ? "opacity-50" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-ranch-marron/70">{m.fecha}</td>
                  <td className="px-3 py-2 font-semibold text-ranch-marron">{m.equipo}{m.codigo && <span className="block font-mono text-xs font-normal text-ranch-marron/50">{m.codigo}</span>}</td>
                  <td className="px-3 py-2 text-ranch-marron/80">
                    {m.etiqueta}
                    {m.anulado && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">anulada</span>}
                  </td>
                  <td className={`px-3 py-2 text-right font-bold ${ef === "salida" ? "text-red-600" : ef === "entrada" ? "text-ranch-verde" : "text-ranch-marron"}`}>{signo}{formatearMiles(m.cantidad)}</td>
                  <td className="px-3 py-2 text-xs text-ranch-marron/70">
                    {[(m.origen || m.destino) ? `${m.origen ?? "—"} → ${m.destino ?? "—"}` : null, m.motivo, m.tercero, m.valor ? formatearCOP(m.valor) : null].filter(Boolean).join(" · ") || "—"}
                    {m.anulado && m.motivo_anulacion && <span className="block text-red-700">Anulada: {m.motivo_anulacion}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {esAdmin && m.anulable && (anulando?.id === m.id ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        <input className={`${input} w-40`} placeholder="Motivo" value={anulando.motivo} onChange={(e) => setAnulando({ ...anulando, motivo: e.target.value })} />
                        <button className={botonSec} disabled={busy} onClick={async () => { if (await correr(() => anularNovedadEquipo(m.id, anulando.motivo), "Novedad anulada; las unidades se recalcularon.")) setAnulando(null); }}>Confirmar</button>
                        <button className={botonSec} onClick={() => setAnulando(null)}>No</button>
                      </div>
                    ) : (
                      <button className={botonSec} onClick={() => setAnulando({ id: m.id, motivo: "" })}>Anular</button>
                    ))}
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-ranch-marron/50">Sin novedades registradas.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ MANTENIMIENTOS

function Mantenimientos({ hoy, equipos, mantenimientos, busy, correr }: Pick<Props, "hoy" | "equipos" | "mantenimientos"> & { busy: boolean; correr: Correr }) {
  const vacio = { equipo_id: "", tipo: "preventivo", descripcion: "", fecha_programada: hoy, responsable: "", costo: "" };
  const [f, setF] = useState(vacio);
  const [cerrando, setCerrando] = useState<{ id: string; costo: string; fecha_realizada: string } | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const visibles = verTodos ? mantenimientos : mantenimientos.filter((m) => m.estado === "programado" || m.estado === "en_proceso");

  return (
    <>
      <section className={`mb-4 ${card} p-4`}>
        <h2 className="mb-3 font-bold text-ranch-marron">Programar mantenimiento</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <select className={input} value={f.equipo_id} onChange={(e) => setF({ ...f, equipo_id: e.target.value })}>
            <option value="">Equipo…</option>
            {equipos.filter((e) => e.cantidad > 0).map((e) => <option key={e.id} value={e.id}>{e.codigo ? `${e.codigo} · ` : ""}{e.nombre}</option>)}
          </select>
          <select className={input} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            <option value="preventivo">Preventivo</option>
            <option value="correctivo">Correctivo (reparación)</option>
          </select>
          <label className="flex flex-col text-xs text-ranch-marron/60">
            Fecha programada
            <input className={input} type="date" value={f.fecha_programada} onChange={(e) => setF({ ...f, fecha_programada: e.target.value })} />
          </label>
          <input className={`${input} sm:col-span-3`} placeholder="Qué se va a hacer (p. ej. cambio de aceite y filtros)" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
          <input className={input} placeholder="Responsable (técnico o proveedor)" value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} />
          <input className={input} inputMode="numeric" placeholder="Costo estimado ($)" value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} />
        </div>
        <button className={`${boton} mt-3`} disabled={busy} onClick={async () => { if (await correr(() => crearMantenimiento(f), "Mantenimiento programado.")) setF(vacio); }}>Programar</button>
      </section>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold text-ranch-marron">{verTodos ? "Todos los mantenimientos" : "Pendientes"}</h2>
        <label className="flex items-center gap-1 text-xs text-ranch-marron/70">
          <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} /> Ver realizados y cancelados
        </label>
      </div>
      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60">
            <tr>
              <th className={th}>Equipo</th><th className={th}>Tipo</th><th className={th}>Descripción</th>
              <th className={th}>Programado</th><th className={`${th} text-right`}>Costo</th><th className={th}>Estado</th><th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((m) => (
              <tr key={m.id} className="border-t border-ranch-marron/10 align-top">
                <td className="px-3 py-2 font-semibold text-ranch-marron">{m.equipo}{m.codigo && <span className="block font-mono text-xs font-normal text-ranch-marron/50">{m.codigo}</span>}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{m.tipo}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{m.descripcion}{m.responsable && <span className="block text-xs text-ranch-marron/50">{m.responsable}</span>}</td>
                <td className={`whitespace-nowrap px-3 py-2 ${m.vencido ? "font-semibold text-red-600" : "text-ranch-marron/70"}`}>
                  {m.fecha_programada ?? "—"}{m.vencido && <span className="block text-xs">vencido</span>}
                  {m.fecha_realizada && <span className="block text-xs text-ranch-verde">hecho {m.fecha_realizada}</span>}
                </td>
                <td className="px-3 py-2 text-right text-ranch-marron/70">{formatearCOP(m.costo)}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_MANT[m.estado] ?? ""}`}>{etiquetaEstado(m.estado)}</span></td>
                <td className="px-3 py-2">
                  {cerrando?.id === m.id ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      <input className={`${input} w-32`} inputMode="numeric" placeholder="Costo real" value={cerrando.costo} onChange={(e) => setCerrando({ ...cerrando, costo: e.target.value })} />
                      <input className={input} type="date" max={hoy} value={cerrando.fecha_realizada} onChange={(e) => setCerrando({ ...cerrando, fecha_realizada: e.target.value })} />
                      <button className={botonSec} disabled={busy} onClick={async () => { if (await correr(() => actualizarMantenimiento(m.id, { estado: "realizado", costo: cerrando.costo || null, fecha_realizada: cerrando.fecha_realizada }), "Mantenimiento cerrado.")) setCerrando(null); }}>Guardar</button>
                      <button className={botonSec} onClick={() => setCerrando(null)}>No</button>
                    </div>
                  ) : (m.estado === "programado" || m.estado === "en_proceso") && (
                    <div className="flex flex-wrap justify-end gap-1">
                      {m.estado === "programado" && <button className={botonSec} disabled={busy} onClick={() => correr(() => actualizarMantenimiento(m.id, { estado: "en_proceso" }), "Mantenimiento en proceso; el equipo quedó en mantenimiento.")}>Iniciar</button>}
                      <button className={botonSec} onClick={() => setCerrando({ id: m.id, costo: m.costo ? String(m.costo) : "", fecha_realizada: hoy })}>Realizado</button>
                      <button className={botonSec} disabled={busy} onClick={() => correr(() => actualizarMantenimiento(m.id, { estado: "cancelado" }), "Mantenimiento cancelado.")}>Cancelar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visibles.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-ranch-marron/50">Sin mantenimientos pendientes.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ GRUPOS

function Grupos({ grupos, busy, correr }: { grupos: Props["grupos"]; busy: boolean; correr: Correr }) {
  const [nuevo, setNuevo] = useState({ nombre: "", descripcion: "" });
  const [edicion, setEdicion] = useState<{ id: string; nombre: string; descripcion: string } | null>(null);

  return (
    <>
      <section className={`mb-4 ${card} p-4`}>
        <h2 className="mb-3 font-bold text-ranch-marron">Nuevo grupo</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <input className={input} placeholder="Nombre (p. ej. Karts, Plantas eléctricas, Sonido)" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <input className={`${input} sm:col-span-2`} placeholder="Descripción (opcional)" value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} />
        </div>
        <button className={`${boton} mt-3`} disabled={busy} onClick={async () => { if (await correr(() => crearGrupoEquipo(nuevo), "Grupo creado.")) setNuevo({ nombre: "", descripcion: "" }); }}>Crear grupo</button>
      </section>

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60">
            <tr><th className={th}>Grupo</th><th className={th}>Descripción</th><th className={`${th} text-center`}>Equipos</th><th className={th}></th></tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const editando = edicion?.id === g.id;
              return (
                <tr key={g.id} className={`border-t border-ranch-marron/10 ${g.activo ? "" : "opacity-50"}`}>
                  <td className="px-3 py-2 font-semibold text-ranch-marron">
                    {editando ? <input className={input} value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} /> : g.nombre}
                  </td>
                  <td className="px-3 py-2 text-ranch-marron/70">
                    {editando ? <input className={`${input} w-full`} value={edicion.descripcion} onChange={(e) => setEdicion({ ...edicion, descripcion: e.target.value })} /> : g.descripcion ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center text-ranch-marron/70">{g.equipos || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {editando ? (
                        <>
                          <button className={botonSec} disabled={busy} onClick={async () => { if (await correr(() => editarGrupoEquipo(g.id, edicion), "Grupo actualizado.")) setEdicion(null); }}>Guardar</button>
                          <button className={botonSec} onClick={() => setEdicion(null)}>Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button className={botonSec} onClick={() => setEdicion({ id: g.id, nombre: g.nombre, descripcion: g.descripcion ?? "" })}>Editar</button>
                          <button className={botonSec} disabled={busy} onClick={() => correr(() => cambiarEstadoGrupoEquipo(g.id, !g.activo), g.activo ? "Grupo desactivado." : "Grupo activado.")}>{g.activo ? "Desactivar" : "Activar"}</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {grupos.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-ranch-marron/50">Todavía no hay grupos.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Kpi({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 bg-white p-4 text-center shadow-sm ${alerta ? "border-amber-300" : "border-ranch-marron/15"}`}>
      <p className={`text-xl font-black ${alerta ? "text-amber-700" : "text-ranch-marron"}`}>{valor}</p>
      <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{label}</p>
    </div>
  );
}
