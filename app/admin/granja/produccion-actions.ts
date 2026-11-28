"use server";

// Producción y ventas de la granja. Cada venta crea su venta fuera de taquilla (línea GRANJA) y
// cada egreso un gasto (GRANJA › EXTRAS u OTROS), así entran al P&G. Registrar lo hace quien opera
// la granja; anular, un supervisor. Nada se borra.

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { prisma, type Tx } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { fechaBogota } from "@/lib/tiempo";
import { formatearCantidad } from "@/lib/granja/insumos";
import { normalizar, type Celda } from "@/lib/equipos/importar";
import {
  saldoProducto, validarMovProducto, validarEgreso, leerExcelGranja, CONCEPTOS_EGRESO, LINEA_VENTA_GRANJA,
  type EntradaMovProducto, type TipoMovProducto, type ConceptoEgreso,
} from "@/lib/granja/produccion";

export interface Resultado { ok: boolean; error?: string }

const RUTA = "/admin/granja/produccion";
const refrescar = () => { revalidatePath(RUTA); revalidatePath("/admin/ventas-otras"); revalidatePath("/admin/gastos"); };
async function operador() { const s = await obtenerSesion(); return s && puedeOperarGranja(s.rol) ? s : null; }
async function supervisor() { const s = await obtenerSesion(); return s && tieneRol(s.rol, "supervisor") ? s : null; }
const SIN_PERMISO = "No tienes permiso para registrar en la granja.";
const diaUTC = (t: string) => new Date(`${t}T00:00:00Z`); // columnas @db.Date
const dinero = (n: number) => `$ ${n.toLocaleString("es-CO")}`;

class SaldoNegativo extends Error {}

async function recalcular(tx: Tx, productoId: string, usuario: string) {
  const movs = await tx.movimientoProducto.findMany({ where: { producto_id: productoId }, select: { tipo: true, cantidad: true, fecha: true, creado_en: true, anulado: true } });
  const saldo = saldoProducto(movs.map((m) => ({ ...m, tipo: m.tipo as TipoMovProducto, cantidad: Number(m.cantidad) })));
  if (saldo < 0) {
    const p = await tx.productoGranja.findUnique({ where: { id: productoId }, select: { nombre: true } });
    throw new SaldoNegativo(`${p?.nombre ?? "El producto"} quedaría en ${formatearCantidad(saldo)}.`);
  }
  await tx.productoGranja.update({ where: { id: productoId }, data: { existencia: saldo, actualizado_por: usuario } });
}

/** Rubro GRANJA › EXTRAS / OTROS: se crea la primera vez. */
async function rubroEgreso(tx: Tx, concepto: ConceptoEgreso, usuario: string): Promise<string> {
  let grupo = await tx.rubroGasto.findFirst({ where: { nombre: { equals: "GRANJA", mode: "insensitive" }, nivel: "grupo" } });
  if (!grupo) grupo = await tx.rubroGasto.create({ data: { nombre: "GRANJA", nivel: "grupo", orden: 98, creado_por: usuario } });
  const nombre = CONCEPTOS_EGRESO[concepto];
  const r = await tx.rubroGasto.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" }, padre_id: grupo.id } });
  return r?.id ?? (await tx.rubroGasto.create({ data: { nombre, nivel: "rubro", padre_id: grupo.id, creado_por: usuario } })).id;
}
async function areaGranja(tx: Tx) {
  return (await tx.areaTrabajo.findFirst({ where: { nombre: { equals: "GRANJA", mode: "insensitive" }, activo: true }, select: { id: true } }))?.id ?? null;
}

// ============================================================ productos

export async function guardarProducto(id: string | null, e: { nombre: string; unidad: string; precio: string | number | null }): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Los productos los maneja un supervisor." };
  const nombre = e.nombre?.trim();
  const unidad = e.unidad?.trim().toLowerCase();
  if (!nombre || !unidad) return { ok: false, error: "Escribe el nombre y la unidad." };
  const t = String(e.precio ?? "").replace(/[$\s.]/g, "");
  if (t && !/^\d+$/.test(t)) return { ok: false, error: "El precio debe ser un entero en pesos." };
  const precio = t ? parseInt(t, 10) : null;
  const repetido = await prisma.productoGranja.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (repetido) return { ok: false, error: `Ya existe ${repetido.nombre}.` };
  if (id) await prisma.productoGranja.update({ where: { id }, data: { nombre, unidad, precio, actualizado_por: s.id } });
  else await prisma.productoGranja.create({ data: { nombre, unidad, precio, creado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "producto_granja", entidad_id: id ?? nombre, accion: id ? "editar" : "crear", datos_despues: { nombre, unidad, precio } });
  refrescar();
  return { ok: true };
}

// ============================================================ movimientos

export async function registrarMovProducto(productoId: string, e: EntradaMovProducto): Promise<Resultado> {
  const s = await operador();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const p = await prisma.productoGranja.findUnique({ where: { id: productoId } });
  if (!p || !p.activo) return { ok: false, error: "Escoge un producto." };
  const v = validarMovProducto(e, Number(p.existencia), fechaBogota(), p.unidad);
  if (!v.ok) return v;
  const d = v.datos;
  try {
    await prisma.$transaction(async (tx) => {
      let venta_otra_id: string | null = null;
      if (d.tipo === "venta") {
        const vo = await tx.ventaOtra.create({
          data: {
            fecha: diaUTC(d.fecha), linea: LINEA_VENTA_GRANJA, valor: d.valor!, creado_por: s.id,
            descripcion: `${p.nombre} ${formatearCantidad(d.cantidad, p.unidad)} × ${dinero(d.precio_unitario!)}${d.cliente ? ` · ${d.cliente}` : ""}`,
          },
        });
        venta_otra_id = vo.id;
      }
      await tx.movimientoProducto.create({ data: { producto_id: productoId, ...d, fecha: diaUTC(d.fecha), venta_otra_id, creado_por: s.id } });
      await recalcular(tx, productoId, s.id);
    });
  } catch (err) {
    if (err instanceof SaldoNegativo) return { ok: false, error: `No se registró: ${err.message}` };
    throw err;
  }
  await registrarAuditoria({ usuario_id: s.id, entidad: "movimiento_producto", entidad_id: productoId, accion: "crear", datos_despues: { producto: p.nombre, ...d } });
  refrescar();
  return { ok: true };
}

export async function anularMovProducto(id: string, motivo: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Anular lo hace un supervisor." };
  if (!motivo?.trim()) return { ok: false, error: "Indica por qué se anula." };
  const m = await prisma.movimientoProducto.findUnique({ where: { id }, include: { producto: true } });
  if (!m || m.anulado) return { ok: false, error: "No existe o ya está anulado." };
  try {
    await prisma.$transaction(async (tx) => {
      const ahora = new Date();
      await tx.movimientoProducto.update({ where: { id }, data: { anulado: true, motivo_anulacion: motivo.trim(), anulado_por: s.id, anulado_en: ahora, actualizado_por: s.id } });
      if (m.venta_otra_id) {
        await tx.ventaOtra.update({ where: { id: m.venta_otra_id }, data: { estado: "anulada", motivo_anulacion: motivo.trim(), anulada_por: s.id, anulada_en: ahora, actualizado_por: s.id } });
      }
      await recalcular(tx, m.producto_id, s.id);
    });
  } catch (err) {
    if (err instanceof SaldoNegativo) return { ok: false, error: `No se puede anular: ${err.message} Anula primero las ventas o donaciones de esa producción.` };
    throw err;
  }
  await registrarAuditoria({ usuario_id: s.id, entidad: "movimiento_producto", entidad_id: id, accion: "anular",
    datos_antes: { producto: m.producto.nombre, tipo: m.tipo, cantidad: m.cantidad.toString(), valor: m.valor }, datos_despues: { motivo } });
  refrescar();
  return { ok: true };
}

// ============================================================ egresos

export async function registrarEgresoGranja(e: { concepto: string; valor: string | number; fecha?: string | null; descripcion?: string | null }): Promise<Resultado> {
  const s = await operador();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const v = validarEgreso(e, fechaBogota());
  if (!v.ok) return v;
  const g = await prisma.$transaction(async (tx) => tx.gasto.create({
    data: {
      rubro_gasto_id: await rubroEgreso(tx, v.datos.concepto, s.id), area_id: await areaGranja(tx),
      descripcion: `GRANJA ${CONCEPTOS_EGRESO[v.datos.concepto]} · ${v.datos.descripcion}`,
      fecha_gasto: new Date(`${v.datos.fecha}T12:00:00-05:00`), base_gravable: v.datos.valor, total: v.datos.valor,
      // Se paga en efectivo con la plata de las ventas de la granja.
      estado: "pagado", pagado_en: new Date(`${v.datos.fecha}T12:00:00-05:00`), creado_por: s.id,
    },
  }));
  await registrarAuditoria({ usuario_id: s.id, entidad: "gasto", entidad_id: g.id, accion: "crear", datos_despues: { origen: "granja", ...v.datos } });
  refrescar();
  return { ok: true };
}

export async function anularEgresoGranja(gastoId: string, motivo: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Anular lo hace un supervisor." };
  if (!motivo?.trim()) return { ok: false, error: "Indica por qué se anula." };
  const g = await prisma.gasto.findUnique({ where: { id: gastoId } });
  if (!g || g.estado === "anulado") return { ok: false, error: "No existe o ya está anulado." };
  await prisma.gasto.update({ where: { id: gastoId }, data: { estado: "anulado", actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "gasto", entidad_id: gastoId, accion: "anular", datos_antes: { total: g.total, descripcion: g.descripcion }, datos_despues: { motivo } });
  refrescar();
  return { ok: true };
}

// ============================================================ carga del Excel de la granja

export interface ResultadoCargaGranja {
  ok: boolean; error?: string; confirmado?: boolean;
  ventas?: number; valorVentas?: number; egresos?: number; valorEgresos?: number; yaCargadas?: number;
  porProducto?: { producto: string; cantidad: number; valor: number }[];
  errores?: { fila: number; errores: string[] }[];
}

const MAX_BYTES = 3.5 * 1024 * 1024;
const marca = (clave: string) => `[GRJ ${clave}]`;

/**
 * Carga la hoja DATOS del Excel de la granja (ventas e ingresos/egresos). Lo que ya se cargó antes
 * (misma fila) se salta, así el mismo Excel se puede volver a subir cuando tenga filas nuevas.
 * Como el histórico no trae la producción, cada venta cargada registra también su producción
 * (lo vendido se produjo): la existencia no cambia y se corrige con un conteo.
 */
export async function cargarExcelGranja(form: FormData): Promise<ResultadoCargaGranja> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "La carga de Excel la hace un supervisor." };
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elige el archivo de Excel." };
  if (archivo.size > MAX_BYTES) return { ok: false, error: "El archivo pesa más de 3,5 MB." };
  if (!/\.xlsx?$/i.test(archivo.name)) return { ok: false, error: "El archivo debe ser de Excel (.xlsx)." };
  const confirmar = form.get("confirmar") === "1";

  const productos = await prisma.productoGranja.findMany({ where: { activo: true } });
  let lectura: ReturnType<typeof leerExcelGranja>;
  try {
    const libro = XLSX.read(Buffer.from(await archivo.arrayBuffer()), { type: "buffer", cellDates: true });
    const hoja = libro.SheetNames.find((n) => normalizar(n) === "datos") ?? libro.SheetNames[0];
    const filas = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[hoja], { header: 1, raw: true, defval: null, blankrows: true });
    lectura = leerExcelGranja(filas, new Map(productos.map((p) => [normalizar(p.nombre), p.id])), fechaBogota());
  } catch {
    return { ok: false, error: "No se pudo leer el archivo." };
  }
  if (!lectura.encabezado) return { ok: false, error: "No encontré la tabla: la hoja debe tener las columnas FECHA, TIPO, PRODUCTO, VR UNITARIO, CANTIDAD y TOTAL." };

  // Lo que ya está cargado.
  const yaVentas = new Set((await prisma.movimientoProducto.findMany({ where: { clave_carga: { in: lectura.ventas.map((v) => v.clave) } }, select: { clave_carga: true } })).map((x) => x.clave_carga));
  const gastosGranja = await prisma.gasto.findMany({ where: { descripcion: { contains: "[GRJ " } }, select: { descripcion: true } });
  const yaEgresos = new Set(lectura.egresos.filter((e) => gastosGranja.some((g) => g.descripcion.includes(marca(e.clave)))).map((e) => e.clave));
  const ventas = lectura.ventas.filter((v) => !yaVentas.has(v.clave));
  const egresos = lectura.egresos.filter((e) => !yaEgresos.has(e.clave));

  const nombre = new Map(productos.map((p) => [p.id, p]));
  const porProductoMap = new Map<string, { producto: string; cantidad: number; valor: number }>();
  for (const v of ventas) {
    const x = porProductoMap.get(v.producto_id) ?? { producto: nombre.get(v.producto_id)!.nombre, cantidad: 0, valor: 0 };
    x.cantidad = Math.round((x.cantidad + v.cantidad) * 1000) / 1000; x.valor += v.total;
    porProductoMap.set(v.producto_id, x);
  }
  const resumen = {
    ventas: ventas.length, valorVentas: ventas.reduce((t, v) => t + v.total, 0),
    egresos: egresos.length, valorEgresos: egresos.reduce((t, e) => t + e.valor, 0),
    yaCargadas: yaVentas.size + yaEgresos.size, porProducto: [...porProductoMap.values()], errores: lectura.errores,
  };
  if (!ventas.length && !egresos.length && !lectura.errores.length) return { ok: false, ...resumen, error: "No hay nada nuevo: todas las filas ya estaban cargadas." };
  if (!confirmar || lectura.errores.length) {
    return { ok: lectura.errores.length === 0, confirmado: false, ...resumen, error: confirmar && lectura.errores.length ? "Corrige las filas con error; no se cargó nada." : undefined };
  }

  await prisma.$transaction(async (tx) => {
    for (const v of ventas) {
      const p = nombre.get(v.producto_id)!;
      const fecha = diaUTC(v.fecha);
      await tx.movimientoProducto.create({ data: { producto_id: p.id, tipo: "produccion", cantidad: v.cantidad, fecha, motivo: "PRODUCCIÓN DE LO VENDIDO (CARGA DEL EXCEL)", clave_carga: `${v.clave}|P`, creado_por: s.id } });
      const vo = await tx.ventaOtra.create({
        data: { fecha, linea: LINEA_VENTA_GRANJA, valor: v.total, creado_por: s.id, descripcion: `${p.nombre} ${formatearCantidad(v.cantidad, p.unidad)} × ${dinero(v.precio)} · carga del Excel` },
      });
      await tx.movimientoProducto.create({
        data: { producto_id: p.id, tipo: "venta", cantidad: v.cantidad, fecha, precio_unitario: v.precio, valor: v.total, venta_otra_id: vo.id, clave_carga: v.clave, motivo: "CARGA DEL EXCEL", creado_por: s.id },
      });
    }
    const area = await areaGranja(tx);
    for (const e of egresos) {
      const f = new Date(`${e.fecha}T12:00:00-05:00`);
      await tx.gasto.create({
        data: {
          rubro_gasto_id: await rubroEgreso(tx, e.concepto, s.id), area_id: area, base_gravable: e.valor, total: e.valor, fecha_gasto: f, estado: "pagado", pagado_en: f,
          descripcion: `GRANJA ${CONCEPTOS_EGRESO[e.concepto]} · carga del Excel ${marca(e.clave)}`, creado_por: s.id,
        },
      });
    }
    for (const id of new Set(ventas.map((v) => v.producto_id))) await recalcular(tx, id, s.id);
  }, { timeout: 120000 });

  await registrarAuditoria({ usuario_id: s.id, entidad: "granja", entidad_id: "carga_excel", accion: "carga_masiva", datos_despues: { archivo: archivo.name, ...resumen, errores: undefined } });
  refrescar();
  return { ok: true, confirmado: true, ...resumen };
}
