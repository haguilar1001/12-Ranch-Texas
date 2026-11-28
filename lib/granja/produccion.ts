// Producción y ventas de la granja (huevos, queso, suero…). Lógica PURA.
//
//   producción      → suma
//   venta, donación, consumo interno, pérdida → restan
//   ajuste          → FIJA el saldo (conteo)
// La plata: cada venta es una venta fuera de taquilla (línea GRANJA); los egresos (extras y otros)
// son gastos con rubro GRANJA › EXTRAS / GRANJA › OTROS.

import { cantidad, r3, formatearCantidad } from "./insumos";
import { normalizar, type Celda } from "@/lib/equipos/importar";

export const TIPOS_MOV_PRODUCTO = ["produccion", "venta", "donacion", "consumo_interno", "perdida", "ajuste"] as const;
export type TipoMovProducto = (typeof TIPOS_MOV_PRODUCTO)[number];
export const EFECTO_PRODUCTO: Record<TipoMovProducto, "entrada" | "salida" | "ajuste"> = {
  produccion: "entrada", venta: "salida", donacion: "salida", consumo_interno: "salida", perdida: "salida", ajuste: "ajuste",
};
export const ETIQUETA_MOV_PRODUCTO: Record<TipoMovProducto, string> = {
  produccion: "Producción / recolección", venta: "Venta", donacion: "Donación a trabajador", consumo_interno: "Consumo interno",
  perdida: "Pérdida / daño", ajuste: "Ajuste por conteo",
};

export const LINEA_VENTA_GRANJA = "GRANJA";
export const CONCEPTOS_EGRESO = { extras: "EXTRAS", otros: "OTROS" } as const;
export type ConceptoEgreso = keyof typeof CONCEPTOS_EGRESO;

export interface MovSaldo { tipo: TipoMovProducto; cantidad: number; fecha: Date | string; creado_en?: Date | string; anulado?: boolean }

export function saldoProducto(movs: MovSaldo[]): number {
  const t = (d: Date | string | undefined) => (d ? new Date(d).getTime() : 0);
  let saldo = 0;
  for (const m of movs.filter((x) => !x.anulado).sort((a, b) => t(a.fecha) - t(b.fecha) || t(a.creado_en) - t(b.creado_en))) {
    const e = EFECTO_PRODUCTO[m.tipo];
    saldo = r3(e === "ajuste" ? m.cantidad : e === "entrada" ? saldo + m.cantidad : saldo - m.cantidad);
  }
  return saldo;
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };
const texto = (v: unknown) => { const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""; return t || null; };
function pesosEnteros(v: unknown): number | null | "error" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : "error";
  const t = String(v).replace(/[$\s.]/g, "");
  return /^\d+$/.test(t) ? parseInt(t, 10) : "error";
}

export interface EntradaMovProducto {
  tipo: string; cantidad: string | number; fecha?: string | null; precio_unitario?: string | number | null;
  cliente?: string | null; empleado_id?: string | null; motivo?: string | null;
}
export interface DatosMovProducto {
  tipo: TipoMovProducto; cantidad: number; fecha: string; precio_unitario: number | null; valor: number | null;
  cliente: string | null; empleado_id: string | null; motivo: string | null;
}

/** Valida un movimiento. `existencia`: saldo actual (no se puede sacar más de lo que hay). */
export function validarMovProducto(e: EntradaMovProducto, existencia: number, hoy: string, unidad = ""): Resultado<DatosMovProducto> {
  if (!TIPOS_MOV_PRODUCTO.includes(e.tipo as TipoMovProducto)) return { ok: false, error: "Escoge qué vas a registrar." };
  const tipo = e.tipo as TipoMovProducto;
  const ef = EFECTO_PRODUCTO[tipo];
  const c = cantidad(e.cantidad);
  if (c === null || c === "error") return { ok: false, error: "Escribe la cantidad (puede tener decimales, ej. 7,5)." };
  if (ef !== "ajuste" && c <= 0) return { ok: false, error: "La cantidad debe ser mayor a 0." };
  if (ef === "salida" && c > existencia) {
    return { ok: false, error: `No alcanza: hay ${formatearCantidad(existencia, unidad)}. Registra primero la producción, o haz un ajuste si el conteo no cuadra.` };
  }
  const fecha = texto(e.fecha) ?? hoy;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy) return { ok: false, error: "La fecha no es válida (no puede ser futura)." };
  const motivo = texto(e.motivo);
  if ((tipo === "perdida" || tipo === "ajuste") && !motivo) return { ok: false, error: "Cuenta el motivo." };
  const empleado_id = texto(e.empleado_id);
  if (tipo === "donacion" && !empleado_id) return { ok: false, error: "Escoge a qué trabajador se le dio." };
  let precio_unitario: number | null = null;
  let valor: number | null = null;
  if (tipo === "venta") {
    const p = pesosEnteros(e.precio_unitario);
    if (p === null || p === "error" || p <= 0) return { ok: false, error: "Escribe el precio por unidad, en pesos." };
    precio_unitario = p;
    valor = Math.round(c * p);
  }
  return { ok: true, datos: { tipo, cantidad: c, fecha, precio_unitario, valor, cliente: tipo === "venta" ? texto(e.cliente) : null, empleado_id: tipo === "donacion" ? empleado_id : null, motivo } };
}

export function validarEgreso(e: { concepto: string; valor: string | number; fecha?: string | null; descripcion?: string | null }, hoy: string): Resultado<{ concepto: ConceptoEgreso; valor: number; fecha: string; descripcion: string }> {
  if (!(e.concepto in CONCEPTOS_EGRESO)) return { ok: false, error: "Escoge si es EXTRAS u OTROS." };
  const valor = pesosEnteros(e.valor);
  if (valor === null || valor === "error" || valor <= 0) return { ok: false, error: "Escribe el valor en pesos." };
  const fecha = texto(e.fecha) ?? hoy;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy) return { ok: false, error: "La fecha no es válida (no puede ser futura)." };
  const descripcion = texto(e.descripcion);
  if (!descripcion) return { ok: false, error: "Cuenta a quién o en qué se pagó." };
  return { ok: true, datos: { concepto: e.concepto as ConceptoEgreso, valor, fecha, descripcion } };
}

// ------------------------------------------------------------------ Excel de la granja (hoja DATOS)

export interface FilaVentaExcel { fila: number; fecha: string; producto: string; producto_id: string; precio: number; cantidad: number; total: number; clave: string }
export interface FilaEgresoExcel { fila: number; fecha: string; concepto: ConceptoEgreso; valor: number; clave: string }
export interface LecturaGranja { ventas: FilaVentaExcel[]; egresos: FilaEgresoExcel[]; errores: { fila: number; errores: string[] }[]; encabezado: boolean }

function fechaDe(c: Celda): string | null {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
  if (typeof c === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000).toISOString().slice(0, 10);
  const t = String(c ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
const num = (c: Celda): number | null => {
  if (typeof c === "number") return c;
  const t = String(c ?? "").trim().replace(/[$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Lee la hoja DATOS del Excel de la granja (FECHA | TIPO | PRODUCTO | VR UNITARIO | CANTIDAD | TOTAL).
 * INGRESO = venta de un producto; EGRESO NOMINA/EXTRAS = extras; EGRESO OTROS = otros.
 * `productos`: nombre normalizado → id. La clave de cada fila evita cargarla dos veces.
 */
export function leerExcelGranja(filas: Celda[][], productos: Map<string, string>, hoy: string): LecturaGranja {
  const res: LecturaGranja = { ventas: [], egresos: [], errores: [], encabezado: false };
  const iEnc = filas.findIndex((f) => f?.some((c) => normalizar(String(c ?? "")) === "fecha") && f.some((c) => normalizar(String(c ?? "")) === "producto"));
  if (iEnc < 0) return res;
  res.encabezado = true;
  const enc = filas[iEnc].map((c) => normalizar(String(c ?? "")));
  const col = (n: string) => enc.indexOf(n);
  const [cF, cT, cP, cV, cC, cTot] = [col("fecha"), col("tipo"), col("producto"), col("vr unitario"), col("cantidad"), col("total")];
  const vistas = new Map<string, number>();

  filas.slice(iEnc + 1).forEach((f, i) => {
    const fila = iEnc + 2 + i;
    if (!f || f.every((c) => c === null || c === undefined || String(c).trim() === "")) return;
    const errores: string[] = [];
    const fecha = fechaDe(f[cF]);
    const tipo = normalizar(String(f[cT] ?? ""));
    const producto = normalizar(String(f[cP] ?? ""));
    const precio = num(f[cV]);
    const cant = num(f[cC]);
    const total = num(f[cTot]) ?? (precio !== null && cant !== null ? precio * cant : null);
    if (!fecha) errores.push("FECHA no válida.");
    else if (fecha > hoy) errores.push("La FECHA es futura.");
    if (tipo !== "ingreso" && tipo !== "egreso") errores.push("TIPO debe ser INGRESO o EGRESO.");
    if (total === null || total <= 0) errores.push("Falta el TOTAL (o VR UNITARIO × CANTIDAD).");
    const base = `${fecha}|${tipo}|${producto}|${precio}|${cant}`;
    const n = (vistas.get(base) ?? 0) + 1;
    const clave = `${base}|${n}`;

    if (tipo === "ingreso") {
      const pid = productos.get(producto);
      if (!pid) errores.push(`El producto "${f[cP] ?? ""}" no existe en la granja.`);
      if (precio === null || !Number.isInteger(precio) || precio <= 0) errores.push("VR UNITARIO debe ser un entero en pesos.");
      if (cant === null || cant <= 0) errores.push("CANTIDAD debe ser mayor a 0.");
      if (errores.length) return res.errores.push({ fila, errores });
      vistas.set(base, n);
      res.ventas.push({ fila, fecha: fecha!, producto: String(f[cP]).trim().toUpperCase(), producto_id: pid!, precio: precio!, cantidad: r3(cant!), total: Math.round(total!), clave });
    } else if (tipo === "egreso") {
      const concepto: ConceptoEgreso | null = producto === "nomina" || producto === "extras" ? "extras" : producto === "otros" ? "otros" : null;
      if (!concepto) errores.push("En un EGRESO el PRODUCTO debe ser NOMINA, EXTRAS u OTROS.");
      if (errores.length) return res.errores.push({ fila, errores });
      vistas.set(base, n);
      res.egresos.push({ fila, fecha: fecha!, concepto: concepto!, valor: Math.round(total!), clave });
    } else {
      res.errores.push({ fila, errores });
    }
  });
  return res;
}

// ------------------------------------------------------------------ consolidado por mes

export interface MesConsolidado { mes: number; ingresos: Record<string, number>; totalIngresos: number; extras: number; otros: number; totalEgresos: number; neto: number }

/** Como la hoja CONSOLIDADO del Excel: ingresos por producto, egresos y neto, mes a mes. */
export function consolidarAnio(
  ventas: { fecha: string; producto: string; valor: number }[],
  egresos: { fecha: string; concepto: ConceptoEgreso; valor: number }[],
  anio: number,
): MesConsolidado[] {
  const meses: MesConsolidado[] = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ingresos: {}, totalIngresos: 0, extras: 0, otros: 0, totalEgresos: 0, neto: 0 }));
  const delAnio = (f: string) => f.startsWith(`${anio}-`);
  for (const v of ventas.filter((x) => delAnio(x.fecha))) {
    const m = meses[Number(v.fecha.slice(5, 7)) - 1];
    m.ingresos[v.producto] = (m.ingresos[v.producto] ?? 0) + v.valor;
    m.totalIngresos += v.valor;
  }
  for (const e of egresos.filter((x) => delAnio(x.fecha))) {
    const m = meses[Number(e.fecha.slice(5, 7)) - 1];
    m[e.concepto] += e.valor;
    m.totalEgresos += e.valor;
  }
  for (const m of meses) m.neto = m.totalIngresos - m.totalEgresos;
  return meses;
}
