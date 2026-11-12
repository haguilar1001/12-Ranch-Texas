"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { fechaBogota } from "@/lib/tiempo";
import { fechaDelHecho, NOVEDADES_EQUIPO, MOTIVO_OBLIGATORIO_EQUIPO, EFECTO_EQUIPO, type TipoMovEquipo } from "@/lib/inventario/kardex";
import { recalcularUnidadesEquipo, SaldoNegativoError } from "@/lib/inventario/recalcular";
import type { Tx } from "@/lib/db";

interface Resultado {
  ok: boolean;
  error?: string;
  aviso?: string;
}

const RUTA = "/admin/equipos";

async function supervisor() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "supervisor") ? s : null;
}

async function admin() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "administrador") ? s : null;
}

const SIN_PERMISO = "Necesitas rol de supervisor.";

function entero(v: string | number | null | undefined): number | null | "error" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  if (!Number.isInteger(n)) return "error";
  return n;
}

const texto = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** "YYYY-MM-DD" → mediodía de Bogotá. Vacío = null. Admite fechas futuras (garantía, programación). */
function fechaCampo(v: string | null | undefined): Date | null | "error" {
  const t = v?.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "error";
  const d = new Date(`${t}T12:00:00-05:00`);
  return Number.isNaN(d.getTime()) ? "error" : d;
}

/** Proveedor existente o nuevo (se crea si no existe uno con ese nombre). */
async function resolverProveedor(tx: Tx, id: string | null | undefined, nombre: string | null | undefined, usuarioId: string): Promise<string | null> {
  if (id) return id;
  const n = texto(nombre);
  if (!n) return null;
  const existe = await tx.proveedor.findFirst({ where: { nombre: { equals: n, mode: "insensitive" } } });
  if (existe) return existe.id;
  return (await tx.proveedor.create({ data: { nombre: n, creado_por: usuarioId } })).id;
}

// ============================================================ GRUPOS (categorías de equipo)

export async function crearGrupoEquipo(e: { nombre: string; descripcion?: string | null }): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const nombre = texto(e.nombre);
  if (!nombre) return { ok: false, error: "Escribe el nombre del grupo." };
  const repetido = await prisma.categoriaEquipo.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" } } });
  if (repetido) return { ok: false, error: `Ya existe el grupo "${repetido.nombre}".` };
  const g = await prisma.categoriaEquipo.create({ data: { nombre, descripcion: texto(e.descripcion), creado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "categoria_equipo", entidad_id: g.id, accion: "crear", datos_despues: { nombre } });
  revalidatePath(RUTA);
  return { ok: true };
}

export async function editarGrupoEquipo(id: string, e: { nombre: string; descripcion?: string | null }): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const nombre = texto(e.nombre);
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };
  const antes = await prisma.categoriaEquipo.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Grupo no encontrado." };
  await prisma.categoriaEquipo.update({ where: { id }, data: { nombre, descripcion: texto(e.descripcion), actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "categoria_equipo", entidad_id: id, accion: "editar", datos_antes: { nombre: antes.nombre }, datos_despues: { nombre } });
  revalidatePath(RUTA);
  return { ok: true };
}

export async function cambiarEstadoGrupoEquipo(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  if (!activo) {
    const n = await prisma.equipo.count({ where: { categoria_id: id, activo: true, cantidad: { gt: 0 } } });
    if (n > 0) return { ok: false, error: `No puedes desactivar el grupo: tiene ${n} equipo(s) en inventario.` };
  }
  await prisma.categoriaEquipo.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "categoria_equipo", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath(RUTA);
  return { ok: true };
}

// ============================================================ EQUIPOS (hoja de vida)

export interface EntradaEquipo {
  nombre: string;
  categoria_id: string;
  codigo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  referencia?: string | null;
  serie?: string | null;
  area_id?: string | null;
  ubicacion?: string | null;
  responsable_id?: string | null;
  proveedor_id?: string | null;
  proveedor_nombre?: string | null;
  valor_compra?: string | number | null;
  fecha_compra?: string | null;
  fecha_instalacion?: string | null;
  garantia_hasta?: string | null;
  vida_util_meses?: string | number | null;
  observaciones?: string | null;
  /** Solo al crear: unidades y de dónde salen. */
  cantidad?: string | number;
  origen?: string;
}

const ORIGENES: TipoMovEquipo[] = ["saldo_inicial", "compra", "donacion_recibida"];

/** Valida los campos de la hoja de vida (comunes a crear y editar). */
function validarCampos(e: EntradaEquipo) {
  const nombre = texto(e.nombre);
  if (!nombre) return { error: "Escribe el nombre del equipo." } as const;
  if (!e.categoria_id) return { error: "Elige el grupo." } as const;
  const valor = entero(e.valor_compra);
  if (valor === "error" || (valor !== null && valor < 0)) return { error: "El valor de compra debe ser un entero en pesos." } as const;
  const vida = entero(e.vida_util_meses);
  if (vida === "error" || (vida !== null && vida <= 0)) return { error: "La vida útil debe ser un número de meses mayor a 0." } as const;
  const fc = fechaCampo(e.fecha_compra);
  const fi = fechaCampo(e.fecha_instalacion);
  const fg = fechaCampo(e.garantia_hasta);
  if (fc === "error" || fi === "error" || fg === "error") return { error: "Revisa las fechas." } as const;
  return {
    datos: {
      nombre,
      categoria_id: e.categoria_id,
      codigo: texto(e.codigo),
      marca: texto(e.marca),
      modelo: texto(e.modelo),
      referencia: texto(e.referencia),
      serie: texto(e.serie),
      area_id: texto(e.area_id),
      ubicacion: texto(e.ubicacion),
      responsable_id: texto(e.responsable_id),
      valor_compra: valor,
      fecha_compra: fc,
      fecha_instalacion: fi,
      garantia_hasta: fg,
      vida_util_meses: vida,
      observaciones: texto(e.observaciones),
    },
  } as const;
}

async function avisoCodigoRepetido(codigo: string | null, excluirId?: string): Promise<string | undefined> {
  if (!codigo) return undefined;
  const otro = await prisma.equipo.findFirst({
    where: { codigo: { equals: codigo, mode: "insensitive" }, activo: true, ...(excluirId ? { id: { not: excluirId } } : {}) },
  });
  return otro ? `Ojo: el código ${codigo} también lo tiene "${otro.nombre}".` : undefined;
}

export async function crearEquipo(e: EntradaEquipo): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };

  const v = validarCampos(e);
  if ("error" in v) return { ok: false, error: v.error };

  const cantidad = entero(e.cantidad ?? 1);
  if (cantidad === "error" || cantidad === null || cantidad < 1) return { ok: false, error: "La cantidad debe ser un entero mayor a 0." };
  const origen = ORIGENES.includes(e.origen as TipoMovEquipo) ? (e.origen as TipoMovEquipo) : "saldo_inicial";

  const aviso = await avisoCodigoRepetido(v.datos.codigo);

  const eq = await prisma.$transaction(async (tx) => {
    const proveedor_id = await resolverProveedor(tx, e.proveedor_id, e.proveedor_nombre, s.id);
    const creado = await tx.equipo.create({ data: { ...v.datos, proveedor_id, cantidad: 0, creado_por: s.id } });
    await tx.movimientoEquipo.create({
      data: {
        equipo_id: creado.id, tipo: origen, cantidad, fecha: v.datos.fecha_compra && origen === "compra" ? v.datos.fecha_compra : new Date(),
        motivo: "Equipo creado", valor: origen === "compra" && v.datos.valor_compra ? v.datos.valor_compra * cantidad : null,
        creado_por: s.id,
      },
    });
    await recalcularUnidadesEquipo(tx, creado.id, s.id, v.datos.nombre);
    return creado;
  });

  await registrarAuditoria({ usuario_id: s.id, entidad: "equipo", entidad_id: eq.id, accion: "crear", datos_despues: { ...v.datos, cantidad, origen } });
  revalidatePath(RUTA);
  return { ok: true, aviso };
}

export async function editarEquipo(id: string, e: EntradaEquipo): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };

  const antes = await prisma.equipo.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Equipo no encontrado." };

  const v = validarCampos(e);
  if ("error" in v) return { ok: false, error: v.error };

  // La ubicación cambia con "Trasladar" (deja historia); aquí se conserva la actual.
  const { area_id: _a, ubicacion: _u, ...datos } = v.datos;
  void _a; void _u;
  const aviso = await avisoCodigoRepetido(datos.codigo, id);

  await prisma.$transaction(async (tx) => {
    const proveedor_id = await resolverProveedor(tx, e.proveedor_id, e.proveedor_nombre, s.id);
    await tx.equipo.update({ where: { id }, data: { ...datos, proveedor_id, actualizado_por: s.id } });
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "equipo", entidad_id: id, accion: "editar",
    datos_antes: JSON.parse(JSON.stringify(antes)), datos_despues: JSON.parse(JSON.stringify(datos)),
  });
  revalidatePath(RUTA);
  return { ok: true, aviso };
}

const ESTADOS_MANUALES = ["operativo", "en_mantenimiento", "fuera_servicio"] as const;

/** Estado operativo. "Dado de baja" no se elige aquí: sale solo cuando una baja/robo/venta deja 0 unidades. */
export async function cambiarEstadoEquipo(id: string, estado: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  if (!ESTADOS_MANUALES.includes(estado as (typeof ESTADOS_MANUALES)[number])) return { ok: false, error: "Estado no válido." };
  const antes = await prisma.equipo.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Equipo no encontrado." };
  if (antes.cantidad === 0) return { ok: false, error: "El equipo no tiene unidades en inventario." };
  await prisma.equipo.update({ where: { id }, data: { estado: estado as (typeof ESTADOS_MANUALES)[number], actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "equipo", entidad_id: id, accion: "estado", datos_antes: { estado: antes.estado }, datos_despues: { estado } });
  revalidatePath(RUTA);
  return { ok: true };
}

// ============================================================ TRASLADOS

const lugar = (area: string | null | undefined, ubicacion: string | null | undefined) =>
  [area, ubicacion].filter(Boolean).join(" · ") || "sin ubicación";

/**
 * Cambia el equipo de área/ubicación. Completo: el registro se mueve y queda un movimiento "traslado"
 * (no cambia la cantidad). Parcial (p. ej. 5 de 20 sillas): las unidades pasan a un registro igual en
 * el destino (si no existe, se crea), con traslado_salida / traslado_entrada enlazados.
 */
export async function trasladarEquipo(
  id: string,
  e: { area_id?: string | null; ubicacion?: string | null; cantidad?: string | number; motivo?: string | null; fecha?: string },
): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };

  const eq = await prisma.equipo.findUnique({ where: { id }, include: { area: { select: { nombre: true } } } });
  if (!eq) return { ok: false, error: "Equipo no encontrado." };
  if (eq.cantidad === 0) return { ok: false, error: "El equipo no tiene unidades en inventario." };

  const area_id = texto(e.area_id);
  const ubicacion = texto(e.ubicacion);
  if (!area_id && !ubicacion) return { ok: false, error: "Indica el área o la ubicación de destino." };
  if (area_id === eq.area_id && (ubicacion ?? null) === (eq.ubicacion ?? null)) return { ok: false, error: "El equipo ya está ahí." };
  const areaDestino = area_id ? await prisma.areaTrabajo.findUnique({ where: { id: area_id } }) : null;
  if (area_id && !areaDestino) return { ok: false, error: "Área no encontrada." };

  const cantTexto = e.cantidad === undefined || e.cantidad === "" ? eq.cantidad : e.cantidad;
  const cant = entero(cantTexto);
  if (cant === "error" || cant === null || cant < 1) return { ok: false, error: "La cantidad trasladada debe ser un entero mayor a 0." };
  if (cant > eq.cantidad) return { ok: false, error: `Hay ${eq.cantidad} unidades; no puedes trasladar ${cant}.` };
  const parcial = cant < eq.cantidad;

  const fecha = fechaDelHecho(e.fecha || fechaBogota(), fechaBogota());
  if (!fecha) return { ok: false, error: "La fecha no puede ser futura." };

  const origen = lugar(eq.area?.nombre, eq.ubicacion);
  const destino = lugar(areaDestino?.nombre, ubicacion);
  const motivo = texto(e.motivo);

  try {
    await prisma.$transaction(async (tx) => {
      if (!parcial) {
        await tx.movimientoEquipo.create({
          data: { equipo_id: id, tipo: "traslado", cantidad: cant, fecha, motivo, origen, destino, creado_por: s.id },
        });
        await tx.equipo.update({ where: { id }, data: { area_id, ubicacion, actualizado_por: s.id } });
        return;
      }
      let receptor = await tx.equipo.findFirst({
        where: {
          activo: true, id: { not: id }, nombre: eq.nombre, categoria_id: eq.categoria_id,
          marca: eq.marca, referencia: eq.referencia, area_id, ubicacion,
        },
      });
      if (!receptor) {
        receptor = await tx.equipo.create({
          data: {
            nombre: eq.nombre, categoria_id: eq.categoria_id, marca: eq.marca, modelo: eq.modelo, referencia: eq.referencia,
            area_id, ubicacion, proveedor_id: eq.proveedor_id, responsable_id: eq.responsable_id, valor_compra: eq.valor_compra,
            fecha_compra: eq.fecha_compra, garantia_hasta: eq.garantia_hasta, vida_util_meses: eq.vida_util_meses,
            estado: eq.estado, cantidad: 0, observaciones: `Separado de ${eq.codigo ?? eq.nombre}`, creado_por: s.id,
          },
        });
      }
      const salida = await tx.movimientoEquipo.create({
        data: { equipo_id: id, tipo: "traslado_salida", cantidad: cant, fecha, motivo, origen, destino, creado_por: s.id },
      });
      const entrada = await tx.movimientoEquipo.create({
        data: { equipo_id: receptor.id, tipo: "traslado_entrada", cantidad: cant, fecha, motivo, origen, destino, contraparte_id: salida.id, creado_por: s.id },
      });
      await tx.movimientoEquipo.update({ where: { id: salida.id }, data: { contraparte_id: entrada.id } });
      await recalcularUnidadesEquipo(tx, id, s.id, eq.nombre);
      await recalcularUnidadesEquipo(tx, receptor.id, s.id, receptor.nombre);
    });
  } catch (err) {
    if (err instanceof SaldoNegativoError) return { ok: false, error: err.message };
    throw err;
  }

  await registrarAuditoria({
    usuario_id: s.id, entidad: "equipo", entidad_id: id, accion: parcial ? "trasladar_parcial" : "trasladar",
    datos_antes: { origen, cantidad: eq.cantidad }, datos_despues: { destino, cantidad: cant, motivo },
  });
  revalidatePath(RUTA);
  return { ok: true };
}

// ============================================================ NOVEDADES (kardex de equipos)

export async function registrarNovedadEquipo(e: {
  equipo_id: string;
  tipo: string;
  cantidad: string | number;
  fecha: string;
  motivo?: string | null;
  valor?: string | number | null;
  tercero?: string | null;
}): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };

  if (!NOVEDADES_EQUIPO.includes(e.tipo as TipoMovEquipo)) return { ok: false, error: "Elige el tipo de novedad." };
  const tipo = e.tipo as TipoMovEquipo;

  const eq = await prisma.equipo.findUnique({ where: { id: e.equipo_id ?? "" } });
  if (!eq || !eq.activo) return { ok: false, error: "Elige el equipo." };

  const cantidad = entero(e.cantidad);
  const minimo = tipo === "ajuste" ? 0 : 1;
  if (cantidad === "error" || cantidad === null || cantidad < minimo) {
    return { ok: false, error: tipo === "ajuste" ? "Escribe las unidades contadas (0 o más)." : "La cantidad debe ser un entero mayor a 0." };
  }

  const fecha = fechaDelHecho(e.fecha, fechaBogota());
  if (!fecha) return { ok: false, error: "Indica la fecha en que ocurrió (no puede ser futura)." };

  const motivo = texto(e.motivo);
  if (MOTIVO_OBLIGATORIO_EQUIPO.includes(tipo) && !motivo) {
    return { ok: false, error: tipo === "robo" ? "Describe el robo (y si hay denuncia, el número)." : "Escribe el motivo." };
  }
  const valor = entero(e.valor);
  if (valor === "error" || (valor !== null && valor < 0)) return { ok: false, error: "El valor debe ser un entero en pesos." };

  let saldo: number;
  try {
    saldo = await prisma.$transaction(async (tx) => {
      await tx.movimientoEquipo.create({
        data: { equipo_id: eq.id, tipo, cantidad, fecha, motivo, valor, tercero: texto(e.tercero), creado_por: s.id },
      });
      const nuevo = await recalcularUnidadesEquipo(tx, eq.id, s.id, eq.nombre);
      if (nuevo === 0 && EFECTO_EQUIPO[tipo] !== "entrada") {
        await tx.equipo.update({ where: { id: eq.id }, data: { estado: "dado_de_baja" } });
      } else if (nuevo > 0 && eq.estado === "dado_de_baja") {
        await tx.equipo.update({ where: { id: eq.id }, data: { estado: "operativo" } });
      }
      return nuevo;
    });
  } catch (err) {
    if (err instanceof SaldoNegativoError) return { ok: false, error: err.message };
    throw err;
  }

  await registrarAuditoria({
    usuario_id: s.id, entidad: "equipo", entidad_id: eq.id, accion: `novedad_${tipo}`,
    datos_antes: { cantidad: eq.cantidad }, datos_despues: { cantidad: saldo, tipo, movidas: cantidad, fecha: e.fecha, motivo, valor },
  });
  revalidatePath(RUTA);
  return { ok: true, aviso: `${eq.nombre}: ${eq.cantidad} → ${saldo} unidad(es).` };
}

export async function anularNovedadEquipo(id: string, motivo: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo el administrador puede anular novedades." };
  const m = texto(motivo);
  if (!m) return { ok: false, error: "Escribe el motivo de la anulación." };

  const mov = await prisma.movimientoEquipo.findUnique({ where: { id }, include: { equipo: true } });
  if (!mov) return { ok: false, error: "Novedad no encontrada." };
  if (mov.anulado) return { ok: false, error: "La novedad ya estaba anulada." };
  if (mov.tipo === "saldo_inicial" && mov.creado_por === "migracion") {
    return { ok: false, error: "El saldo inicial del kardex no se anula; si está mal, registra un ajuste por conteo." };
  }
  if (mov.tipo === "traslado") {
    return { ok: false, error: "Un traslado de ubicación no se anula: traslada el equipo de vuelta." };
  }

  const ids = [mov.id, ...(mov.contraparte_id ? [mov.contraparte_id] : [])];
  try {
    await prisma.$transaction(async (tx) => {
      const afectados = await tx.movimientoEquipo.findMany({ where: { id: { in: ids } }, include: { equipo: true } });
      await tx.movimientoEquipo.updateMany({
        where: { id: { in: ids } },
        data: { anulado: true, motivo_anulacion: m, anulado_por: s.id, anulado_en: new Date(), actualizado_por: s.id },
      });
      for (const a of afectados) {
        const nuevo = await recalcularUnidadesEquipo(tx, a.equipo_id, s.id, a.equipo.nombre);
        if (nuevo > 0 && a.equipo.estado === "dado_de_baja") {
          await tx.equipo.update({ where: { id: a.equipo_id }, data: { estado: "operativo" } });
        } else if (nuevo === 0 && a.equipo.estado !== "dado_de_baja") {
          await tx.equipo.update({ where: { id: a.equipo_id }, data: { estado: "dado_de_baja" } });
        }
      }
    });
  } catch (err) {
    if (err instanceof SaldoNegativoError) return { ok: false, error: `No se puede anular: ${err.message}` };
    throw err;
  }

  await registrarAuditoria({
    usuario_id: s.id, entidad: "movimiento_equipo", entidad_id: id, accion: "anular",
    datos_antes: { tipo: mov.tipo, cantidad: mov.cantidad, equipo: mov.equipo.nombre }, datos_despues: { motivo: m },
  });
  revalidatePath(RUTA);
  return { ok: true };
}

// ============================================================ MANTENIMIENTOS

export async function crearMantenimiento(e: {
  equipo_id: string;
  tipo: string;
  descripcion: string;
  fecha_programada?: string | null;
  responsable?: string | null;
  costo?: string | number | null;
}): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const eq = await prisma.equipo.findUnique({ where: { id: e.equipo_id ?? "" } });
  if (!eq) return { ok: false, error: "Elige el equipo." };
  if (!["preventivo", "correctivo"].includes(e.tipo)) return { ok: false, error: "Elige preventivo o correctivo." };
  const descripcion = texto(e.descripcion);
  if (!descripcion) return { ok: false, error: "Describe el mantenimiento." };
  const fp = fechaCampo(e.fecha_programada);
  if (fp === "error") return { ok: false, error: "Revisa la fecha programada." };
  const costo = entero(e.costo);
  if (costo === "error" || (costo !== null && costo < 0)) return { ok: false, error: "El costo debe ser un entero en pesos." };

  const m = await prisma.mantenimientoEquipo.create({
    data: {
      equipo_id: eq.id, tipo: e.tipo as "preventivo" | "correctivo", descripcion, fecha_programada: fp ?? new Date(),
      responsable: texto(e.responsable), costo: costo ?? 0, creado_por: s.id,
    },
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "mantenimiento_equipo", entidad_id: m.id, accion: "crear", datos_despues: { equipo: eq.nombre, tipo: e.tipo, descripcion } });
  revalidatePath(RUTA);
  return { ok: true };
}

/**
 * Avanza el mantenimiento. En proceso → el equipo queda "en mantenimiento"; realizado → vuelve a
 * "operativo" (si estaba en mantenimiento). Cancelado no toca el equipo.
 */
export async function actualizarMantenimiento(
  id: string,
  e: { estado: string; costo?: string | number | null; fecha_realizada?: string | null; responsable?: string | null },
): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const m = await prisma.mantenimientoEquipo.findUnique({ where: { id }, include: { equipo: true } });
  if (!m) return { ok: false, error: "Mantenimiento no encontrado." };
  if (!["programado", "en_proceso", "realizado", "cancelado"].includes(e.estado)) return { ok: false, error: "Estado no válido." };
  const estado = e.estado as "programado" | "en_proceso" | "realizado" | "cancelado";
  const costo = entero(e.costo);
  if (costo === "error" || (costo !== null && costo < 0)) return { ok: false, error: "El costo debe ser un entero en pesos." };
  const fr = fechaCampo(e.fecha_realizada);
  if (fr === "error") return { ok: false, error: "Revisa la fecha." };

  await prisma.$transaction(async (tx) => {
    await tx.mantenimientoEquipo.update({
      where: { id },
      data: {
        estado,
        costo: costo ?? m.costo,
        responsable: e.responsable !== undefined ? texto(e.responsable) : m.responsable,
        fecha_realizada: estado === "realizado" ? fr ?? new Date() : m.fecha_realizada,
        actualizado_por: s.id,
      },
    });
    if (estado === "en_proceso" && m.equipo.estado === "operativo") {
      await tx.equipo.update({ where: { id: m.equipo_id }, data: { estado: "en_mantenimiento", actualizado_por: s.id } });
    }
    if (estado === "realizado" && m.equipo.estado === "en_mantenimiento") {
      await tx.equipo.update({ where: { id: m.equipo_id }, data: { estado: "operativo", actualizado_por: s.id } });
    }
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "mantenimiento_equipo", entidad_id: id, accion: "estado",
    datos_antes: { estado: m.estado, costo: m.costo }, datos_despues: { estado, costo: costo ?? m.costo },
  });
  revalidatePath(RUTA);
  return { ok: true };
}
