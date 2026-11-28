"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatearCOP } from "@/lib/dinero/cop";
import { formatearCantidad } from "@/lib/granja/insumos";
import { ETIQUETA_MOV_PRODUCTO, EFECTO_PRODUCTO, type MesConsolidado, type TipoMovProducto } from "@/lib/granja/produccion";
import {
  registrarMovProducto, anularMovProducto, registrarEgresoGranja, anularEgresoGranja, guardarProducto, cargarExcelGranja,
  type Resultado, type ResultadoCargaGranja,
} from "../produccion-actions";

interface Producto { id: string; nombre: string; unidad: string; precio: number | null; existencia: number; activo: boolean }
interface Mov {
  id: string; fecha: string; tipo: TipoMovProducto; producto: string; unidad: string; cantidad: number; precio: number | null; valor: number | null;
  detalle: string; anulado: boolean; motivo_anulacion: string | null; quien: string | null;
}
interface Egreso { id: string; fecha: string; valor: number; concepto: "extras" | "otros"; descripcion: string }
interface Props {
  hoy: string; anio: number; anios: number[]; esSupervisor: boolean; productos: Producto[]; empleados: { id: string; nombre: string }[];
  movimientos: Mov[]; egresos: Egreso[]; consolidado: MesConsolidado[];
}

const input = "w-full rounded-lg border border-ranch-marron/30 px-3 py-2 text-base sm:text-sm";
const boton = "rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50";
const botonSec = "rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60 disabled:opacity-50";
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white";
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const ICONO: Record<string, string> = { HUEVOS: "🥚", QUESO: "🧀", SUERO: "🥛" };
const fechaCorta = (f: string) => new Date(`${f}T12:00:00-05:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

type Accion = "produccion" | "venta" | "donacion" | "otro" | "egreso";
const ACCIONES: { id: Accion; label: string }[] = [
  { id: "produccion", label: "🧺 Producción" }, { id: "venta", label: "💵 Venta" }, { id: "donacion", label: "🎁 Donación" },
  { id: "otro", label: "± Otro" }, { id: "egreso", label: "💸 Egreso" },
];

export default function ProduccionClient(p: Props) {
  const router = useRouter();
  const activos = p.productos.filter((x) => x.activo);
  const [accion, setAccion] = useState<Accion>("produccion");
  const vacio = { producto_id: activos[0]?.id ?? "", tipo_otro: "consumo_interno", cantidad: "", precio: "", cliente: "", empleado_id: "", motivo: "", fecha: p.hoy, concepto: "extras", valor: "", descripcion: "" };
  const [f, setF] = useState(vacio);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [anulando, setAnulando] = useState<{ id: string; tipo: "mov" | "egreso"; motivo: string } | null>(null);
  const [verProductos, setVerProductos] = useState(false);
  const [verCarga, setVerCarga] = useState(false);

  const prod = activos.find((x) => x.id === f.producto_id);
  const set = (k: keyof typeof vacio) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const mes = p.hoy.slice(0, 7);
  const delMes = p.consolidado[Number(mes.slice(5)) - 1];
  const donacionesMes = p.movimientos.filter((m) => !m.anulado && m.tipo === "donacion" && m.fecha.startsWith(mes));
  const productosConsolidado = useMemo(() => [...new Set([...activos.map((x) => x.nombre), ...p.consolidado.flatMap((m) => Object.keys(m.ingresos))])], [activos, p.consolidado]);
  const total = (k: (m: MesConsolidado) => number) => p.consolidado.reduce((t, m) => t + k(m), 0);
  const valorVenta = (() => { const c = parseFloat(f.cantidad.replace(",", ".")); const pr = parseInt(f.precio.replace(/\D/g, ""), 10); return c > 0 && pr > 0 ? Math.round(c * pr) : null; })();

  async function correr(fn: () => Promise<Resultado>, ok: string) {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: ok } : { ok: false, t: r.error ?? "No se pudo." });
    if (r.ok) router.refresh();
    return r.ok;
  }

  async function guardar() {
    if (accion === "egreso") {
      if (await correr(() => registrarEgresoGranja({ concepto: f.concepto, valor: f.valor, fecha: f.fecha, descripcion: f.descripcion }), "Egreso registrado: ya está en gastos de la granja.")) setF({ ...vacio, fecha: f.fecha, concepto: f.concepto });
      return;
    }
    const tipo = accion === "otro" ? f.tipo_otro : accion;
    const ok = await correr(() => registrarMovProducto(f.producto_id, { tipo, cantidad: f.cantidad, fecha: f.fecha, precio_unitario: f.precio, cliente: f.cliente, empleado_id: f.empleado_id, motivo: f.motivo }),
      tipo === "venta" ? "Venta registrada: ya está en ventas fuera de taquilla (GRANJA)." : "Registrado.");
    if (ok) setF({ ...vacio, producto_id: f.producto_id, fecha: f.fecha, precio: accion === "venta" ? f.precio : "" });
  }

  function escogerAccion(a: Accion) {
    setAccion(a); setMsg(null);
    if (a === "venta" && prod?.precio && !f.precio) setF({ ...f, precio: String(prod.precio) });
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="text-3xl font-black text-ranch-marron">Producción y ventas de la granja</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Lo que se produce suma; ventas, donaciones y consumo restan. Las ventas entran a Ventas fuera de taquilla (línea GRANJA) y los egresos a gastos de la granja.</p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {activos.map((x) => (
          <div key={x.id} className={`${card} p-3 text-center`}>
            <p className="text-2xl font-black text-ranch-marron">{ICONO[x.nombre] ?? "📦"} {formatearCantidad(x.existencia)}</p>
            <p className="text-xs uppercase text-ranch-marron/60">{x.nombre} en existencia ({x.unidad})</p>
          </div>
        ))}
        <div className={`${card} p-3 text-center`}>
          <p className="text-2xl font-black text-ranch-verde">{formatearCOP(delMes?.neto ?? 0)}</p>
          <p className="text-xs uppercase text-ranch-marron/60">Neto del mes</p>
          <p className="text-[11px] text-ranch-marron/50">ventas {formatearCOP(delMes?.totalIngresos ?? 0)} · egresos {formatearCOP(delMes?.totalEgresos ?? 0)}</p>
        </div>
        <div className={`${card} p-3 text-center`}>
          <p className="text-2xl font-black text-ranch-marron">{donacionesMes.length}</p>
          <p className="text-xs uppercase text-ranch-marron/60">Donaciones del mes</p>
          <p className="text-[11px] text-ranch-marron/50">{donacionesMes.map((d) => `${d.producto} ${formatearCantidad(d.cantidad)}`).slice(0, 3).join(" · ")}</p>
        </div>
      </div>

      <section className={`mb-5 ${card} p-4`}>
        <div className="mb-3 flex flex-wrap gap-2">
          {ACCIONES.map((a) => (
            <button key={a.id} onClick={() => escogerAccion(a.id)} aria-pressed={accion === a.id}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${accion === a.id ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/25 text-ranch-marron hover:bg-ranch-crema/60"}`}>{a.label}</button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {accion !== "egreso" && (
            <Campo label="Producto">
              <select className={input} value={f.producto_id} onChange={(e) => { const np = activos.find((x) => x.id === e.target.value); setF({ ...f, producto_id: e.target.value, precio: accion === "venta" && np?.precio ? String(np.precio) : f.precio }); }}>
                {activos.map((x) => <option key={x.id} value={x.id}>{x.nombre} · hay {formatearCantidad(x.existencia, x.unidad)}</option>)}
              </select>
            </Campo>
          )}
          {accion === "otro" && (
            <Campo label="Qué pasó">
              <select className={input} value={f.tipo_otro} onChange={set("tipo_otro")}>
                {(["consumo_interno", "perdida", "ajuste"] as TipoMovProducto[]).map((t) => <option key={t} value={t}>{ETIQUETA_MOV_PRODUCTO[t]}</option>)}
              </select>
            </Campo>
          )}
          {accion !== "egreso" && (
            <Campo label={accion === "otro" && f.tipo_otro === "ajuste" ? `Cantidad contada (${prod?.unidad ?? ""})` : `Cantidad (${prod?.unidad ?? ""})`}>
              <input className={input} inputMode="decimal" value={f.cantidad} onChange={set("cantidad")} placeholder={prod?.unidad === "unidad" ? "Ej.: 30" : "Ej.: 7,5"} />
            </Campo>
          )}
          {accion === "venta" && (
            <>
              <Campo label="Precio por unidad ($)"><input className={input} inputMode="numeric" value={f.precio} onChange={set("precio")} /></Campo>
              <Campo label="Cliente (opcional)"><input className={input} value={f.cliente} onChange={set("cliente")} /></Campo>
            </>
          )}
          {accion === "donacion" && (
            <Campo label="A qué trabajador">
              <select className={input} value={f.empleado_id} onChange={set("empleado_id")}>
                <option value="">—</option>{p.empleados.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </Campo>
          )}
          {accion === "egreso" && (
            <>
              <Campo label="Concepto">
                <select className={input} value={f.concepto} onChange={set("concepto")}><option value="extras">EXTRAS</option><option value="otros">OTROS</option></select>
              </Campo>
              <Campo label="Valor ($)"><input className={input} inputMode="numeric" value={f.valor} onChange={set("valor")} /></Campo>
              <Campo label="A quién / en qué" span><input className={input} value={f.descripcion} onChange={set("descripcion")} placeholder="Ej.: extras de ordeño a Juan" /></Campo>
            </>
          )}
          <Campo label="Fecha"><input type="date" max={p.hoy} className={input} value={f.fecha} onChange={set("fecha")} /></Campo>
          {(accion === "otro" || accion === "donacion" || accion === "produccion") && (
            <Campo label={accion === "otro" && f.tipo_otro !== "consumo_interno" ? "Motivo *" : "Nota (opcional)"} span><input className={input} value={f.motivo} onChange={set("motivo")} /></Campo>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className={boton} disabled={busy || (accion !== "egreso" && !activos.length)} onClick={guardar}>{busy ? "Guardando…" : "Registrar"}</button>
          {accion === "venta" && valorVenta !== null && <span className="text-sm text-ranch-marron/70">Total de la venta: <b>{formatearCOP(valorVenta)}</b></span>}
        </div>
        {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
      </section>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-ranch-marron">Consolidado {p.anio}</h2>
          <select className="rounded-lg border border-ranch-marron/30 px-2 py-1 text-sm" value={p.anio} onChange={(e) => router.push(`?anio=${e.target.value}`)} aria-label="Año">
            {p.anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-ranch-marron/15 text-xs uppercase text-ranch-marron/50">
                <th className="px-3 py-2 text-left">Mes</th>
                {productosConsolidado.map((n) => <th key={n} className="px-3 py-2 text-right">{n}</th>)}
                <th className="px-3 py-2 text-right">Ingresos</th><th className="px-3 py-2 text-right">Extras</th><th className="px-3 py-2 text-right">Otros</th>
                <th className="px-3 py-2 text-right">Egresos</th><th className="px-3 py-2 text-right">Neto</th>
              </tr>
            </thead>
            <tbody>
              {p.consolidado.map((m) => (
                <tr key={m.mes} className={`border-b border-ranch-marron/10 ${m.totalIngresos || m.totalEgresos ? "" : "text-ranch-marron/30"}`}>
                  <td className="px-3 py-1.5">{MESES[m.mes - 1]}</td>
                  {productosConsolidado.map((n) => <td key={n} className="px-3 py-1.5 text-right">{m.ingresos[n] ? formatearCOP(m.ingresos[n]) : "—"}</td>)}
                  <td className="px-3 py-1.5 text-right font-semibold">{formatearCOP(m.totalIngresos)}</td>
                  <td className="px-3 py-1.5 text-right">{m.extras ? formatearCOP(m.extras) : "—"}</td>
                  <td className="px-3 py-1.5 text-right">{m.otros ? formatearCOP(m.otros) : "—"}</td>
                  <td className="px-3 py-1.5 text-right">{formatearCOP(m.totalEgresos)}</td>
                  <td className={`px-3 py-1.5 text-right font-bold ${m.neto < 0 ? "text-red-700" : ""}`}>{formatearCOP(m.neto)}</td>
                </tr>
              ))}
              <tr className="bg-ranch-crema/50 font-bold">
                <td className="px-3 py-2">Total</td>
                {productosConsolidado.map((n) => <td key={n} className="px-3 py-2 text-right">{formatearCOP(total((m) => m.ingresos[n] ?? 0))}</td>)}
                <td className="px-3 py-2 text-right">{formatearCOP(total((m) => m.totalIngresos))}</td>
                <td className="px-3 py-2 text-right">{formatearCOP(total((m) => m.extras))}</td>
                <td className="px-3 py-2 text-right">{formatearCOP(total((m) => m.otros))}</td>
                <td className="px-3 py-2 text-right">{formatearCOP(total((m) => m.totalEgresos))}</td>
                <td className="px-3 py-2 text-right">{formatearCOP(total((m) => m.neto))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-2 font-bold text-ranch-marron">Movimientos recientes</h2>
          <div className={`${card} max-h-[32rem] overflow-y-auto`}>
            <table className="w-full text-sm">
              <tbody>
                {!p.movimientos.length && <tr><td className="px-3 py-6 text-center text-ranch-marron/50">Todavía no hay movimientos.</td></tr>}
                {p.movimientos.map((m) => {
                  const ef = EFECTO_PRODUCTO[m.tipo];
                  return (
                    <tr key={m.id} className={`border-b border-ranch-marron/10 align-top ${m.anulado ? "text-ranch-marron/40 line-through" : ""}`}>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs">{fechaCorta(m.fecha)}</td>
                      <td className="px-3 py-1.5"><b>{m.producto}</b> <span className="text-xs">{ETIQUETA_MOV_PRODUCTO[m.tipo]}</span>
                        {m.detalle && <span className="block text-xs text-ranch-marron/60">{m.detalle}</span>}
                        {m.anulado && m.motivo_anulacion && <span className="block text-xs">Anulado: {m.motivo_anulacion}</span>}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${ef === "entrada" ? "text-green-700" : ef === "salida" ? "text-red-700" : ""}`}>
                        {ef === "entrada" ? "+" : ef === "salida" ? "−" : "= "}{formatearCantidad(m.cantidad, m.unidad)}
                        {m.valor ? <span className="block text-xs text-ranch-marron">{formatearCOP(m.valor)}</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right">
                        {p.esSupervisor && !m.anulado && <Anular id={m.id} tipo="mov" anulando={anulando} setAnulando={setAnulando} busy={busy}
                          onAnular={async (motivo) => { if (await correr(() => anularMovProducto(m.id, motivo), m.tipo === "venta" ? "Venta anulada (también en ventas fuera de taquilla)." : "Anulado.")) setAnulando(null); }} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-bold text-ranch-marron">Egresos {p.anio}</h2>
          <ul className={`${card} max-h-[32rem] divide-y divide-ranch-marron/10 overflow-y-auto text-sm`}>
            {!p.egresos.length && <li className="px-3 py-6 text-center text-ranch-marron/50">Sin egresos.</li>}
            {p.egresos.map((e) => (
              <li key={e.id} className="px-3 py-2">
                <div className="flex justify-between gap-2"><span className="text-xs">{fechaCorta(e.fecha)} · {e.concepto.toUpperCase()}</span><b>{formatearCOP(e.valor)}</b></div>
                <p className="text-xs text-ranch-marron/60">{e.descripcion}</p>
                {p.esSupervisor && <Anular id={e.id} tipo="egreso" anulando={anulando} setAnulando={setAnulando} busy={busy}
                  onAnular={async (motivo) => { if (await correr(() => anularEgresoGranja(e.id, motivo), "Egreso anulado.")) setAnulando(null); }} />}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {p.esSupervisor && (
        <div className="mt-6 flex flex-wrap gap-2">
          <button className={botonSec} onClick={() => setVerProductos(!verProductos)}>{verProductos ? "Cerrar productos" : "⚙ Productos y precios"}</button>
          <button className={botonSec} onClick={() => setVerCarga(!verCarga)}>{verCarga ? "Cerrar carga" : "⬆ Subir el Excel de la granja"}</button>
        </div>
      )}
      {verProductos && <Productos productos={p.productos} busy={busy} correr={correr} />}
      {verCarga && <CargaGranja onListo={() => router.refresh()} />}
    </main>
  );
}

function Anular({ id, tipo, anulando, setAnulando, busy, onAnular }: {
  id: string; tipo: "mov" | "egreso"; anulando: { id: string; tipo: string; motivo: string } | null;
  setAnulando: (a: { id: string; tipo: "mov" | "egreso"; motivo: string } | null) => void; busy: boolean; onAnular: (motivo: string) => void;
}) {
  if (anulando?.id === id && anulando.tipo === tipo) {
    return (
      <span className="mt-1 flex justify-end gap-1 no-underline">
        <input autoFocus className="w-28 rounded border px-1 text-xs" placeholder="Motivo" value={anulando.motivo} onChange={(e) => setAnulando({ id, tipo, motivo: e.target.value })} />
        <button disabled={busy} className="rounded bg-red-600 px-2 text-xs text-white" onClick={() => onAnular(anulando.motivo)}>Anular</button>
        <button className="rounded border px-1 text-xs" onClick={() => setAnulando(null)}>✕</button>
      </span>
    );
  }
  return <button className="text-xs text-red-700 underline" onClick={() => setAnulando({ id, tipo, motivo: "" })}>Anular</button>;
}

function Productos({ productos, busy, correr }: { productos: Producto[]; busy: boolean; correr: (fn: () => Promise<Resultado>, ok: string) => Promise<boolean> }) {
  const [filas, setFilas] = useState(productos.map((x) => ({ id: x.id as string | null, nombre: x.nombre, unidad: x.unidad, precio: x.precio === null ? "" : String(x.precio) })));
  return (
    <section className={`mt-3 ${card} p-4`}>
      <h2 className="mb-2 font-bold text-ranch-marron">Productos y precios</h2>
      <p className="mb-3 text-xs text-ranch-marron/60">El precio es el que se sugiere al vender; cada venta guarda el que se cobró.</p>
      <div className="space-y-2">
        {filas.map((x, i) => (
          <div key={x.id ?? `n${i}`} className="flex flex-wrap items-center gap-2">
            <input className={`${input} w-40`} value={x.nombre} aria-label="Nombre" onChange={(e) => setFilas(filas.map((y, j) => (j === i ? { ...y, nombre: e.target.value } : y)))} />
            <input className={`${input} w-28`} value={x.unidad} aria-label="Unidad" onChange={(e) => setFilas(filas.map((y, j) => (j === i ? { ...y, unidad: e.target.value } : y)))} />
            <input className={`${input} w-32`} inputMode="numeric" value={x.precio} aria-label="Precio" placeholder="Precio" onChange={(e) => setFilas(filas.map((y, j) => (j === i ? { ...y, precio: e.target.value } : y)))} />
            <button className={botonSec} disabled={busy} onClick={() => correr(() => guardarProducto(x.id, x), "Producto guardado.")}>Guardar</button>
          </div>
        ))}
      </div>
      <button className="mt-2 text-sm font-semibold text-ranch-marron underline" onClick={() => setFilas([...filas, { id: null, nombre: "", unidad: "unidad", precio: "" }])}>+ Otro producto</button>
    </section>
  );
}

function CargaGranja({ onListo }: { onListo: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [r, setR] = useState<ResultadoCargaGranja | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function enviar(confirmar: boolean) {
    if (!archivo) return;
    const fd = new FormData(); fd.set("archivo", archivo); if (confirmar) fd.set("confirmar", "1");
    setOcupado(true);
    try { const res = await cargarExcelGranja(fd); setR(res); if (res.confirmado) onListo(); }
    catch { setR({ ok: false, error: "No se pudo enviar el archivo." }); }
    finally { setOcupado(false); }
  }
  return (
    <section className={`mt-3 ${card} space-y-3 p-4 text-sm`}>
      <h2 className="font-bold text-ranch-marron">Subir el Excel de la granja</h2>
      <p className="text-xs text-ranch-marron/60">El mismo Excel que llevaban (hoja DATOS: FECHA, TIPO, PRODUCTO, VR UNITARIO, CANTIDAD, TOTAL). INGRESO = venta; EGRESO NOMINA/EXTRAS u OTROS = egreso. Las filas que ya se cargaron se saltan. Cada venta cargada registra también su producción, para que la existencia no quede en negativo.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept=".xlsx,.xls" onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setR(null); }} aria-label="Excel de la granja" />
        <button className={boton} disabled={!archivo || ocupado} onClick={() => enviar(false)}>{ocupado && !r ? "Revisando…" : "Revisar archivo"}</button>
      </div>
      {r && (
        <div className="space-y-2">
          {r.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{r.error}</p>}
          {r.confirmado && <p className="rounded-lg bg-green-50 px-3 py-2 font-semibold text-green-700">Listo: se cargaron {r.ventas} ventas ({formatearCOP(r.valorVentas ?? 0)}) y {r.egresos} egresos ({formatearCOP(r.valorEgresos ?? 0)}).</p>}
          {!r.confirmado && ((r.ventas ?? 0) > 0 || (r.egresos ?? 0) > 0) && (
            <div>
              <p><b>{r.ventas}</b> ventas por <b>{formatearCOP(r.valorVentas ?? 0)}</b> · <b>{r.egresos}</b> egresos por <b>{formatearCOP(r.valorEgresos ?? 0)}</b>{r.yaCargadas ? ` · ${r.yaCargadas} filas ya estaban cargadas y se saltan` : ""}</p>
              <ul className="list-inside list-disc text-xs text-ranch-marron/70">{r.porProducto?.map((x) => <li key={x.producto}>{x.producto}: {formatearCantidad(x.cantidad)} · {formatearCOP(x.valor)}</li>)}</ul>
            </div>
          )}
          {(r.errores?.length ?? 0) > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {r.errores!.map((e) => <li key={e.fila}>Fila {e.fila}: {e.errores.join(" ")}</li>)}
            </ul>
          )}
          {!r.confirmado && r.ok && ((r.ventas ?? 0) > 0 || (r.egresos ?? 0) > 0) && (
            <button className={boton} disabled={ocupado} onClick={() => enviar(true)}>{ocupado ? "Cargando…" : `Confirmar: ${r.ventas} ventas y ${r.egresos} egresos`}</button>
          )}
        </div>
      )}
    </section>
  );
}

function Campo({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return <label className={`block text-xs text-ranch-marron/70 ${span ? "sm:col-span-2" : ""}`}>{label}<div className="mt-1">{children}</div></label>;
}
