"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";

interface Resultado {
  ok: boolean;
  error?: string;
}

export interface EntradaTaquilla {
  nombre: string;
  ubicacion?: string | null;
  /** Caja de pruebas: su venta no entra a los indicadores del parque. */
  es_prueba: boolean;
}

async function admin() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "administrador") ? s : null;
}

function refrescar() {
  revalidatePath("/admin/taquillas");
  revalidatePath("/admin/cajas");
  revalidatePath("/caja/turno");
}

async function nombreRepetido(nombre: string, exceptoId?: string) {
  return prisma.caja.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" }, ...(exceptoId ? { id: { not: exceptoId } } : {}) },
  });
}

export async function crearTaquilla(e: EntradaTaquilla): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador puede gestionar las taquillas." };

  const nombre = e.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  const repetida = await nombreRepetido(nombre);
  if (repetida) {
    return {
      ok: false,
      error: repetida.activo ? `Ya existe "${repetida.nombre}".` : `"${repetida.nombre}" ya existe pero está inactiva: actívala en vez de crearla de nuevo.`,
    };
  }

  const c = await prisma.caja.create({
    data: { nombre, ubicacion: e.ubicacion?.trim() || null, es_prueba: !!e.es_prueba, creado_por: s.id },
  });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "caja", entidad_id: c.id, accion: "crear",
    datos_despues: { nombre, ubicacion: c.ubicacion, es_prueba: c.es_prueba },
  });
  refrescar();
  return { ok: true };
}

/** Renombrar no toca los turnos ni las ventas: quedan colgados del mismo id y se ven con el nombre nuevo. */
export async function editarTaquilla(id: string, e: EntradaTaquilla): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const antes = await prisma.caja.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Taquilla no encontrada." };

  const nombre = e.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };
  const repetida = await nombreRepetido(nombre, id);
  if (repetida) return { ok: false, error: `Ya existe otra taquilla llamada "${repetida.nombre}".` };

  const ubicacion = e.ubicacion?.trim() || null;
  await prisma.caja.update({
    where: { id },
    data: { nombre, ubicacion, es_prueba: !!e.es_prueba, actualizado_por: s.id },
  });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "caja", entidad_id: id, accion: "editar",
    datos_antes: { nombre: antes.nombre, ubicacion: antes.ubicacion, es_prueba: antes.es_prueba },
    datos_despues: { nombre, ubicacion, es_prueba: !!e.es_prueba },
  });
  refrescar();
  return { ok: true };
}

/** Baja lógica. No se puede desactivar con un turno abierto ni dejar el parque sin taquillas. */
export async function cambiarEstadoTaquilla(id: string, activo: boolean): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const caja = await prisma.caja.findUnique({ where: { id } });
  if (!caja) return { ok: false, error: "Taquilla no encontrada." };

  if (!activo) {
    const abierto = await prisma.turnoCaja.findFirst({
      where: { caja_id: id, estado: { in: ["abierto", "reabierto"] } },
      include: { usuario: { select: { nombre: true } } },
    });
    if (abierto) return { ok: false, error: `Tiene un turno abierto (${abierto.usuario.nombre}): ciérralo antes de desactivarla.` };
    const otras = await prisma.caja.count({ where: { activo: true, id: { not: id } } });
    if (otras === 0) return { ok: false, error: "Debe quedar al menos una taquilla activa." };
  }

  await prisma.caja.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "caja", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  refrescar();
  return { ok: true };
}
