"use server";

// Insumos de la granja (aseo, desinfección, fumigación, medicamentos) y fumigaciones.
// Registrar lo hace quien opera la granja; anular, un supervisor. Nada se borra.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { fechaBogota } from "@/lib/tiempo";
import { recalcularInsumo, SaldoNegativo } from "@/lib/granja/insumos-bd";
import {
  validarInsumo, validarMovimiento, validarProductosFumigacion, formatearCantidad,
  type EntradaInsumo, type EntradaMovInsumo,
} from "@/lib/granja/insumos";

export interface Resultado { ok: boolean; error?: string; id?: string }

const RUTAS = ["/admin/granja/insumos", "/admin/granja/fumigacion"];
const refrescar = () => RUTAS.forEach((r) => revalidatePath(r));

async function operador() {
  const s = await obtenerSesion();
  return s && puedeOperarGranja(s.rol) ? s : null;
}
async function supervisor() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "supervisor") ? s : null;
}
const SIN_PERMISO = "No tienes permiso para registrar en la granja.";
const dia = (t: string) => new Date(`${t}T12:00:00-05:00`);

// ============================================================ insumos (catálogo)

export async function guardarInsumo(id: string | null, e: EntradaInsumo): Promise<Resultado> {
  const s = await operador();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const v = validarInsumo(e);
  if (!v.ok) return v;
  const repetido = await prisma.insumoGranja.findFirst({ where: { nombre: { equals: v.datos.nombre, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (repetido) return { ok: false, error: `Ya existe el insumo "${repetido.nombre}".` };
  if (id) {
    const antes = await prisma.insumoGranja.findUnique({ where: { id } });
    if (!antes) return { ok: false, error: "Insumo no encontrado." };
    await prisma.insumoGranja.update({ where: { id }, data: { ...v.datos, actualizado_por: s.id } });
    await registrarAuditoria({ usuario_id: s.id, entidad: "insumo_granja", entidad_id: id, accion: "editar",
      datos_antes: { nombre: antes.nombre, categoria: antes.categoria, unidad: antes.unidad, minimo: antes.stock_minimo?.toString() ?? null }, datos_despues: { ...v.datos } });
    refrescar();
    return { ok: true, id };
  }
  const n = await prisma.insumoGranja.create({ data: { ...v.datos, creado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "insumo_granja", entidad_id: n.id, accion: "crear", datos_despues: { ...v.datos } });
  refrescar();
  return { ok: true, id: n.id };
}

export async function cambiarEstadoInsumo(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };
  const ins = await prisma.insumoGranja.findUnique({ where: { id } });
  if (!ins) return { ok: false, error: "Insumo no encontrado." };
  if (!activo && Number(ins.existencia) > 0) return { ok: false, error: `Todavía hay ${formatearCantidad(Number(ins.existencia), ins.unidad)}: sácalo con un ajuste antes de desactivarlo.` };
  await prisma.insumoGranja.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "insumo_granja", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  refrescar();
  return { ok: true };
}

// ============================================================ movimientos a mano

export async function registrarMovimientoInsumo(insumoId: string, e: EntradaMovInsumo & { proveedor_id?: string | null }): Promise<Resultado> {
  const s = await operador();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const ins = await prisma.insumoGranja.findUnique({ where: { id: insumoId } });
  if (!ins || !ins.activo) return { ok: false, error: "Escoge un insumo activo." };
  const v = validarMovimiento(e, Number(ins.existencia), fechaBogota());
  if (!v.ok) return v;
  try {
    const mov = await prisma.$transaction(async (tx) => {
      const m = await tx.movimientoInsumo.create({
        data: {
          insumo_id: insumoId, tipo: v.datos.tipo, cantidad: v.datos.cantidad, fecha: dia(v.datos.fecha), motivo: v.datos.motivo,
          valor: v.datos.valor, lote: v.datos.lote, vencimiento: v.datos.vencimiento ? dia(v.datos.vencimiento) : null,
          proveedor_id: v.datos.tipo === "compra" ? e.proveedor_id || null : null, creado_por: s.id,
        },
      });
      await recalcularInsumo(tx, insumoId, s.id);
      return m;
    });
    await registrarAuditoria({ usuario_id: s.id, entidad: "movimiento_insumo", entidad_id: mov.id, accion: "crear", datos_despues: { insumo: ins.nombre, ...v.datos } });
  } catch (err) {
    if (err instanceof SaldoNegativo) return { ok: false, error: `No se registró: ${err.message} Revisa las fechas o haz un ajuste.` };
    throw err;
  }
  refrescar();
  return { ok: true };
}

export async function anularMovimientoInsumo(id: string, motivo: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Anular lo hace un supervisor." };
  if (!motivo?.trim()) return { ok: false, error: "Indica por qué se anula." };
  const m = await prisma.movimientoInsumo.findUnique({ where: { id }, include: { insumo: true } });
  if (!m || m.anulado) return { ok: false, error: "El movimiento no existe o ya está anulado." };
  if (m.fumigacion_id) return { ok: false, error: "Este movimiento es de una fumigación: anula la fumigación completa." };
  if (m.tratamiento_id) return { ok: false, error: "Este movimiento es de un tratamiento: anula el tratamiento completo." };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.movimientoInsumo.update({ where: { id }, data: { anulado: true, motivo_anulacion: motivo.trim(), anulado_por: s.id, anulado_en: new Date(), actualizado_por: s.id } });
      await recalcularInsumo(tx, m.insumo_id, s.id);
    });
  } catch (err) {
    if (err instanceof SaldoNegativo) return { ok: false, error: `No se puede anular: ${err.message}` };
    throw err;
  }
  await registrarAuditoria({ usuario_id: s.id, entidad: "movimiento_insumo", entidad_id: id, accion: "anular",
    datos_antes: { insumo: m.insumo.nombre, tipo: m.tipo, cantidad: m.cantidad.toString() }, datos_despues: { motivo } });
  refrescar();
  return { ok: true };
}

// ============================================================ fumigaciones

const MIME_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FOTO = 1.5 * 1024 * 1024;
const MAX_FOTOS = 4;

/**
 * Registra una fumigación: sus productos salen del inventario (un movimiento "fumigación" por
 * producto) y se guardan las fotos. Todo o nada.
 */
export async function registrarFumigacion(form: FormData): Promise<Resultado> {
  const s = await operador();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const hoy = fechaBogota();
  const fecha = String(form.get("fecha") || hoy);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy) return { ok: false, error: "La fecha no es válida (no puede ser futura)." };
  const recinto_id = String(form.get("recinto_id") || "") || null;
  const zona = String(form.get("zona") || "").trim() || null;
  if (!recinto_id && !zona) return { ok: false, error: "Indica dónde se fumigó: escoge el recinto o escribe la zona." };
  const empleado_id = String(form.get("empleado_id") || "") || null;
  if (!empleado_id) return { ok: false, error: "Escoge quién hizo la fumigación." };
  const plaga = String(form.get("plaga") || "").trim() || null;
  const observaciones = String(form.get("observaciones") || "").trim() || null;

  let productos: { insumo_id: string; cantidad: string }[];
  try { productos = JSON.parse(String(form.get("productos") || "[]")); } catch { return { ok: false, error: "Productos no válidos." }; }
  const insumos = await prisma.insumoGranja.findMany({ where: { id: { in: productos.map((p) => p.insumo_id).filter(Boolean) }, activo: true } });
  const v = validarProductosFumigacion(productos, new Map(insumos.map((i) => [i.id, { nombre: i.nombre, existencia: Number(i.existencia), unidad: i.unidad }])));
  if (!v.ok) return v;

  const archivos = form.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  if (archivos.length > MAX_FOTOS) return { ok: false, error: `Máximo ${MAX_FOTOS} fotos.` };
  const fotos: { mime: string; tamano: number; contenido: Uint8Array<ArrayBuffer>; creado_por: string }[] = [];
  for (const f of archivos) {
    if (!MIME_FOTO.has(f.type)) return { ok: false, error: "Las fotos deben ser JPG, PNG o WEBP." };
    if (f.size > MAX_FOTO) return { ok: false, error: "Una foto pesa demasiado (máximo 1,5 MB)." };
    fotos.push({ mime: f.type, tamano: f.size, contenido: new Uint8Array(await f.arrayBuffer()), creado_por: s.id });
  }

  let fumId: string;
  try {
    fumId = await prisma.$transaction(async (tx) => {
      const fum = await tx.fumigacion.create({
        data: { fecha: dia(fecha), recinto_id, zona, plaga, empleado_id, observaciones, creado_por: s.id, fotos: { create: fotos } },
      });
      for (const p of v.datos) {
        await tx.movimientoInsumo.create({
          data: { insumo_id: p.insumo_id, tipo: "fumigacion", cantidad: p.cantidad, fecha: dia(fecha), fumigacion_id: fum.id, motivo: plaga ? `FUMIGACIÓN: ${plaga}` : "FUMIGACIÓN", creado_por: s.id },
        });
        await recalcularInsumo(tx, p.insumo_id, s.id);
      }
      return fum.id;
    });
  } catch (err) {
    if (err instanceof SaldoNegativo) return { ok: false, error: `No se registró: ${err.message}` };
    throw err;
  }
  await registrarAuditoria({ usuario_id: s.id, entidad: "fumigacion", entidad_id: fumId, accion: "crear",
    datos_despues: { fecha, recinto_id, zona, plaga, empleado_id, productos: v.datos, fotos: fotos.length } });
  refrescar();
  return { ok: true, id: fumId };
}

export async function anularFumigacion(id: string, motivo: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Anular lo hace un supervisor." };
  if (!motivo?.trim()) return { ok: false, error: "Indica por qué se anula." };
  const f = await prisma.fumigacion.findUnique({ where: { id }, include: { productos: true } });
  if (!f || f.estado === "anulada") return { ok: false, error: "La fumigación no existe o ya está anulada." };
  await prisma.$transaction(async (tx) => {
    await tx.fumigacion.update({ where: { id }, data: { estado: "anulada", motivo_anulacion: motivo.trim(), actualizado_por: s.id } });
    await tx.movimientoInsumo.updateMany({ where: { fumigacion_id: id, anulado: false }, data: { anulado: true, motivo_anulacion: `FUMIGACIÓN ANULADA: ${motivo.trim()}`, anulado_por: s.id, anulado_en: new Date(), actualizado_por: s.id } });
    for (const insumoId of new Set(f.productos.map((p) => p.insumo_id))) await recalcularInsumo(tx, insumoId, s.id);
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "fumigacion", entidad_id: id, accion: "anular", datos_despues: { motivo } });
  refrescar();
  return { ok: true };
}
