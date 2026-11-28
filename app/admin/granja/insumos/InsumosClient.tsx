"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP } from "@/lib/dinero/cop";
import {
  CATEGORIAS_INSUMO, ETIQUETA_CATEGORIA, ETIQUETA_MOV_INSUMO, ETIQUETA_STOCK, EFECTO_INSUMO, MOV_MANUALES, UNIDADES_INSUMO,
  estadoStock, formatearCantidad, type CategoriaInsumo, type TipoMovInsumo,
} from "@/lib/granja/insumos";
import { guardarInsumo, cambiarEstadoInsumo, registrarMovimientoInsumo, anularMovimientoInsumo, type Resultado } from "../actions";

interface Mov {
  id: string; tipo: TipoMovInsumo; cantidad: number; fecha: string; motivo: string | null; valor: number | null; proveedor: string | null;
  lote: string | null; vencimiento: string | null; anulado: boolean; motivo_anulacion: string | null; de_fumigacion: boolean; donde: string | null; quien: string | null;
}
interface Insumo {
  id: string; nombre: string; codigo: string | null; categoria: string; unidad: string; activo: boolean; existencia: number;
  stock_minimo: number | null; observaciones: string | null; vence: string | null; movimientos: Mov[];
}
interface Props { hoy: string; catInicial?: string; esSupervisor: boolean; proveedores: { id: string; nombre: string }[]; insumos: Insumo[] }

const input = "w-full rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm";
const boton = "rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50";
const botonSec = "rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60 disabled:opacity-50";
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white";
const COLOR_STOCK = { agotado: "bg-red-100 text-red-700", bajo: "bg-amber-100 text-amber-800", disponible: "bg-green-100 text-green-800" };
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fechaCorta = (f: string) => new Date(`${f}T12:00:00-05:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

export default function InsumosClient(p: Props) {
  const router = useRouter();
  const [cat, setCat] = useState<string>(CATEGORIAS_INSUMO.includes(p.catInicial as CategoriaInsumo) ? p.catInicial! : "");
  const [buscar, setBuscar] = useState("");
  const [soloFaltantes, setSoloFaltantes] = useState(false);
  const [verInactivos, setVerInactivos] = useState(false);
  const [ficha, setFicha] = useState<{ id: string | null; v: Record<string, string> } | null>(null);
  const [mov, setMov] = useState<{ id: string; v: Record<string, string> } | null>(null);
  const [kardex, setKardex] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<{ id: string; motivo: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const en30 = useMemo(() => { const d = new Date(`${p.hoy}T12:00:00-05:00`); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); }, [p.hoy]);
  const activos = p.insumos.filter((i) => i.activo);
  const estado = (i: Insumo) => estadoStock(i.existencia, i.stock_minimo);
  const kpi = {
    total: activos.length,
    agotados: activos.filter((i) => estado(i) === "agotado").length,
    bajos: activos.filter((i) => estado(i) === "bajo").length,
    vencen: activos.filter((i) => i.vence && i.vence <= en30).length,
  };
  const visibles = p.insumos.filter((i) =>
    (verInactivos || i.activo) && (!cat || i.categoria === cat) && (!soloFaltantes || estado(i) !== "disponible") &&
    (!buscar || norm(`${i.nombre} ${i.codigo ?? ""} ${i.observaciones ?? ""}`).includes(norm(buscar))));
  const faltantes = activos.filter((i) => estado(i) !== "disponible").sort((a, b) => (estado(a) === "agotado" ? 0 : 1) - (estado(b) === "agotado" ? 0 : 1));

  async function correr(fn: () => Promise<Resultado>, ok: string) {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: ok } : { ok: false, t: r.error ?? "No se pudo." });
    if (r.ok) router.refresh();
    return r.ok;
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="text-3xl font-black text-ranch-marron">Insumos y medicamentos</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Aseo, desinfección, venenos de fumigación y medicamentos de la granja. La existencia sale de las entradas y salidas; para corregirla se hace un ajuste por conteo.</p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Insumos" valor={kpi.total} />
        <Kpi label="Agotados" valor={kpi.agotados} alerta={kpi.agotados > 0} />
        <Kpi label="Stock bajo" valor={kpi.bajos} alerta={kpi.bajos > 0} />
        <Kpi label="Vencen en 30 días" valor={kpi.vencen} alerta={kpi.vencen > 0} />
      </div>

      {faltantes.length > 0 && (
        <details className={`mb-4 ${card} p-3`}>
          <summary className="cursor-pointer text-sm font-bold text-ranch-marron">🛒 Lista de compra: {faltantes.length} insumo(s) agotados o con stock bajo</summary>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {faltantes.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 border-b border-ranch-marron/10 py-1">
                <span>{i.nombre}</span>
                <span className={`rounded-full px-2 text-xs font-bold ${COLOR_STOCK[estado(i)]}`}>{estado(i) === "agotado" ? "Agotado" : `Quedan ${formatearCantidad(i.existencia, i.unidad)}`}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <nav className="mb-3 flex flex-wrap gap-2">
        {["", ...CATEGORIAS_INSUMO].map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${cat === c ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/25 text-ranch-marron hover:bg-ranch-crema/60"}`}>
            {c ? ETIQUETA_CATEGORIA[c as CategoriaInsumo] : "Todos"} <span className="opacity-60">{activos.filter((i) => !c || i.categoria === c).length}</span>
          </button>
        ))}
      </nav>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={`${input} max-w-sm flex-1`} placeholder="Buscar insumo…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        <label className="flex items-center gap-1 text-xs text-ranch-marron/70"><input type="checkbox" checked={soloFaltantes} onChange={(e) => setSoloFaltantes(e.target.checked)} /> Solo agotados y bajos</label>
        <label className="flex items-center gap-1 text-xs text-ranch-marron/70"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver desactivados</label>
        <button className={boton} onClick={() => { setFicha(ficha?.id === null ? null : { id: null, v: { nombre: "", codigo: "", categoria: cat || "aseo", unidad: "litro", stock_minimo: "", observaciones: "" } }); setMsg(null); }}>
          {ficha?.id === null ? "Cerrar" : "+ Nuevo insumo"}
        </button>
        <a className={botonSec} href="/admin/subir?que=insumos">⬆ Subir Excel</a>
      </div>

      {msg && <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {ficha && (
        <section className={`mb-4 ${card} p-4`}>
          <h2 className="mb-3 font-bold text-ranch-marron">{ficha.id ? `Editar: ${ficha.v.nombre}` : "Nuevo insumo"}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Nombre *" span><input className={input} value={ficha.v.nombre} onChange={(e) => setFicha({ ...ficha, v: { ...ficha.v, nombre: e.target.value } })} /></Campo>
            <Campo label="Código"><input className={input} value={ficha.v.codigo} onChange={(e) => setFicha({ ...ficha, v: { ...ficha.v, codigo: e.target.value } })} placeholder="ASE-001" /></Campo>
            <Campo label="Categoría *">
              <select className={input} value={ficha.v.categoria} onChange={(e) => setFicha({ ...ficha, v: { ...ficha.v, categoria: e.target.value } })}>
                {CATEGORIAS_INSUMO.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}
              </select>
            </Campo>
            <Campo label="Unidad *">
              <input className={input} list="unidades-insumo" value={ficha.v.unidad} onChange={(e) => setFicha({ ...ficha, v: { ...ficha.v, unidad: e.target.value } })} />
              <datalist id="unidades-insumo">{UNIDADES_INSUMO.map((u) => <option key={u} value={u} />)}</datalist>
            </Campo>
            <Campo label="Stock mínimo (avisa cuando baja de aquí)"><input className={input} inputMode="decimal" value={ficha.v.stock_minimo} onChange={(e) => setFicha({ ...ficha, v: { ...ficha.v, stock_minimo: e.target.value } })} placeholder="Ej.: 2" /></Campo>
            <Campo label="Observaciones" span><input className={input} value={ficha.v.observaciones} onChange={(e) => setFicha({ ...ficha, v: { ...ficha.v, observaciones: e.target.value } })} /></Campo>
          </div>
          <div className="mt-3 flex gap-2">
            <button className={boton} disabled={busy} onClick={async () => {
              if (await correr(() => guardarInsumo(ficha.id, { nombre: ficha.v.nombre, codigo: ficha.v.codigo, categoria: ficha.v.categoria, unidad: ficha.v.unidad, stock_minimo: ficha.v.stock_minimo, observaciones: ficha.v.observaciones }), ficha.id ? "Insumo guardado." : "Insumo creado. Ahora registra su existencia con un ajuste o una compra.")) setFicha(null);
            }}>{ficha.id ? "Guardar" : "Crear"}</button>
            <button className={botonSec} onClick={() => setFicha(null)}>Cancelar</button>
          </div>
        </section>
      )}

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ranch-marron/15 text-left text-xs uppercase text-ranch-marron/50">
              <th className="px-3 py-2">Insumo</th><th className="px-3 py-2">Categoría</th><th className="px-3 py-2 text-right">Existencia</th>
              <th className="px-3 py-2">Estado</th><th className="px-3 py-2">Vence</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-ranch-marron/50">{p.insumos.length ? "Nada coincide con el filtro." : "Todavía no hay insumos: créalos o sube el Excel."}</td></tr>}
            {visibles.map((i) => {
              const e = estado(i);
              const abierto = mov?.id === i.id || kardex === i.id;
              return (
                <FilaInsumo key={i.id} i={i} e={e} abierto={abierto} activo={i.activo}
                  onMov={() => { setMov(mov?.id === i.id ? null : { id: i.id, v: { tipo: "consumo", cantidad: "", fecha: p.hoy, motivo: "", valor: "", proveedor_id: "", lote: "", vencimiento: "" } }); setKardex(null); setMsg(null); }}
                  onKardex={() => { setKardex(kardex === i.id ? null : i.id); setMov(null); }}
                  onEditar={() => setFicha({ id: i.id, v: { nombre: i.nombre, codigo: i.codigo ?? "", categoria: i.categoria, unidad: i.unidad, stock_minimo: i.stock_minimo === null ? "" : String(i.stock_minimo).replace(".", ","), observaciones: i.observaciones ?? "" } })}
                  onEstado={p.esSupervisor ? () => correr(() => cambiarEstadoInsumo(i.id, !i.activo), i.activo ? "Desactivado." : "Activado.") : undefined}
                  vence={i.vence ? <span className={i.vence <= en30 ? "font-semibold text-amber-700" : ""}>{fechaCorta(i.vence)}</span> : "—"}
                >
                  {mov?.id === i.id && (
                    <FormMovimiento i={i} v={mov.v} set={(v) => setMov({ id: i.id, v })} hoy={p.hoy} proveedores={p.proveedores} busy={busy}
                      onGuardar={async () => {
                        if (await correr(() => registrarMovimientoInsumo(i.id, { ...mov.v, tipo: mov.v.tipo, cantidad: mov.v.cantidad }), "Movimiento registrado.")) setMov(null);
                      }} onCancelar={() => setMov(null)} />
                  )}
                  {kardex === i.id && (
                    <Kardex i={i} esSupervisor={p.esSupervisor} anulando={anulando} setAnulando={setAnulando} busy={busy}
                      onAnular={async (id, motivo) => { if (await correr(() => anularMovimientoInsumo(id, motivo), "Movimiento anulado.")) setAnulando(null); }} />
                  )}
                </FilaInsumo>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function FilaInsumo({ i, e, abierto, activo, onMov, onKardex, onEditar, onEstado, vence, children }: {
  i: Insumo; e: ReturnType<typeof estadoStock>; abierto: boolean; activo: boolean; onMov: () => void; onKardex: () => void; onEditar: () => void;
  onEstado?: () => void; vence: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <>
      <tr className={`border-b border-ranch-marron/10 ${activo ? "" : "text-ranch-marron/40"} ${abierto ? "bg-ranch-crema/50" : ""}`}>
        <td className="px-3 py-2 align-top"><b>{i.nombre}</b>{i.codigo && <span className="block text-xs text-ranch-marron/50">{i.codigo}</span>}</td>
        <td className="px-3 py-2 align-top text-xs">{ETIQUETA_CATEGORIA[i.categoria as CategoriaInsumo] ?? i.categoria}</td>
        <td className="px-3 py-2 text-right align-top tabular-nums">
          <b>{formatearCantidad(i.existencia, i.unidad)}</b>
          {i.stock_minimo !== null && <span className="block text-xs text-ranch-marron/50">mín. {formatearCantidad(i.stock_minimo)}</span>}
        </td>
        <td className="px-3 py-2 align-top"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${COLOR_STOCK[e]}`}>{ETIQUETA_STOCK[e]}</span></td>
        <td className="px-3 py-2 align-top text-xs">{vence}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right align-top">
          {activo && <button className={botonSec} onClick={onMov}>± Movimiento</button>}{" "}
          <button className={botonSec} onClick={onKardex}>Kardex</button>{" "}
          <button className={botonSec} onClick={onEditar}>Editar</button>
          {onEstado && <>{" "}<button className={botonSec} onClick={onEstado}>{activo ? "Desactivar" : "Activar"}</button></>}
        </td>
      </tr>
      {abierto && <tr><td colSpan={6} className="bg-ranch-crema/30 px-3 py-3">{children}</td></tr>}
    </>
  );
}

function FormMovimiento({ i, v, set, hoy, proveedores, busy, onGuardar, onCancelar }: {
  i: Insumo; v: Record<string, string>; set: (v: Record<string, string>) => void; hoy: string; proveedores: { id: string; nombre: string }[];
  busy: boolean; onGuardar: () => void; onCancelar: () => void;
}) {
  const efecto = EFECTO_INSUMO[v.tipo as TipoMovInsumo];
  const c = (k: string) => (ev: { target: { value: string } }) => set({ ...v, [k]: ev.target.value });
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ranch-marron">Movimiento de {i.nombre} · hay {formatearCantidad(i.existencia, i.unidad)}</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo label="Tipo">
          <select className={input} value={v.tipo} onChange={c("tipo")}>
            <optgroup label="Entra (+)">{MOV_MANUALES.filter((t) => EFECTO_INSUMO[t] === "entrada").map((t) => <option key={t} value={t}>{ETIQUETA_MOV_INSUMO[t]}</option>)}</optgroup>
            <optgroup label="Sale (−)">{MOV_MANUALES.filter((t) => EFECTO_INSUMO[t] === "salida").map((t) => <option key={t} value={t}>{ETIQUETA_MOV_INSUMO[t]}</option>)}</optgroup>
            <optgroup label="Conteo"><option value="ajuste">{ETIQUETA_MOV_INSUMO.ajuste}</option></optgroup>
          </select>
        </Campo>
        <Campo label={efecto === "ajuste" ? `Cantidad contada (${i.unidad})` : `Cantidad (${i.unidad})`}><input className={input} inputMode="decimal" value={v.cantidad} onChange={c("cantidad")} placeholder="Ej.: 0,5" /></Campo>
        <Campo label="Fecha"><input type="date" max={hoy} className={input} value={v.fecha} onChange={c("fecha")} /></Campo>
        <Campo label={v.tipo === "perdida" || v.tipo === "vencido" || v.tipo === "ajuste" ? "Motivo *" : "Motivo / detalle"}><input className={input} value={v.motivo} onChange={c("motivo")} /></Campo>
        {v.tipo === "compra" && (
          <>
            <Campo label="Valor total ($)"><input className={input} inputMode="numeric" value={v.valor} onChange={c("valor")} /></Campo>
            <Campo label="Proveedor">
              <select className={input} value={v.proveedor_id} onChange={c("proveedor_id")}>
                <option value="">—</option>{proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </Campo>
          </>
        )}
        {efecto === "entrada" && (
          <>
            <Campo label="Lote"><input className={input} value={v.lote} onChange={c("lote")} /></Campo>
            <Campo label="Vence"><input type="date" className={input} value={v.vencimiento} onChange={c("vencimiento")} /></Campo>
          </>
        )}
      </div>
      <div className="flex gap-2">
        <button className={boton} disabled={busy} onClick={onGuardar}>{busy ? "Guardando…" : "Registrar"}</button>
        <button className={botonSec} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function Kardex({ i, esSupervisor, anulando, setAnulando, busy, onAnular }: {
  i: Insumo; esSupervisor: boolean; anulando: { id: string; motivo: string } | null; setAnulando: (a: { id: string; motivo: string } | null) => void;
  busy: boolean; onAnular: (id: string, motivo: string) => void;
}) {
  if (!i.movimientos.length) return <p className="text-sm text-ranch-marron/60">Sin movimientos todavía. Registra la existencia con un ajuste por conteo o una compra.</p>;
  return (
    <div className="overflow-x-auto">
      <p className="mb-1 text-sm font-semibold text-ranch-marron">Kardex de {i.nombre} (últimos 60)</p>
      <table className="w-full text-xs">
        <thead><tr className="text-left uppercase text-ranch-marron/50"><th className="px-2 py-1">Fecha</th><th className="px-2 py-1">Movimiento</th><th className="px-2 py-1 text-right">Cantidad</th><th className="px-2 py-1">Detalle</th><th className="px-2 py-1">Quién</th><th /></tr></thead>
        <tbody>
          {i.movimientos.map((m) => {
            const ef = EFECTO_INSUMO[m.tipo];
            return (
              <tr key={m.id} className={`border-t border-ranch-marron/10 align-top ${m.anulado ? "text-ranch-marron/40 line-through" : ""}`}>
                <td className="px-2 py-1">{fechaCorta(m.fecha)}</td>
                <td className="px-2 py-1">{ETIQUETA_MOV_INSUMO[m.tipo]}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${ef === "entrada" ? "text-green-700" : ef === "salida" ? "text-red-700" : ""}`}>
                  {ef === "entrada" ? "+" : ef === "salida" ? "−" : "= "}{formatearCantidad(m.cantidad)}
                </td>
                <td className="px-2 py-1">
                  {[m.motivo, m.donde && `en ${m.donde}`, m.proveedor, m.valor ? formatearCOP(m.valor) : null, m.lote && `lote ${m.lote}`, m.vencimiento && `vence ${fechaCorta(m.vencimiento)}`].filter(Boolean).join(" · ")}
                  {m.anulado && m.motivo_anulacion && <span className="block no-underline">Anulado: {m.motivo_anulacion}</span>}
                </td>
                <td className="px-2 py-1">{m.quien}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {esSupervisor && !m.anulado && !m.de_fumigacion && (anulando?.id === m.id ? (
                    <span className="flex gap-1">
                      <input autoFocus className="w-32 rounded border px-1" placeholder="Motivo" value={anulando.motivo} onChange={(e) => setAnulando({ id: m.id, motivo: e.target.value })} />
                      <button disabled={busy} className="rounded bg-red-600 px-2 text-white" onClick={() => onAnular(m.id, anulando.motivo)}>Anular</button>
                      <button className="rounded border px-1" onClick={() => setAnulando(null)}>✕</button>
                    </span>
                  ) : <button className="text-red-700 underline" onClick={() => setAnulando({ id: m.id, motivo: "" })}>Anular</button>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Campo({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return <label className={`block text-xs text-ranch-marron/70 ${span ? "sm:col-span-2" : ""}`}>{label}<div className="mt-1">{children}</div></label>;
}
function Kpi({ label, valor, alerta }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <div className={`${card} p-3 text-center ${alerta ? "border-amber-400" : ""}`}>
      <p className={`text-2xl font-black ${alerta ? "text-amber-700" : "text-ranch-marron"}`}>{valor}</p>
      <p className="text-xs uppercase text-ranch-marron/60">{label}</p>
    </div>
  );
}
