"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { codigoDeMedio, validarMediosActivos } from "@/lib/caja/medios";

interface Resultado {
  ok: boolean;
  error?: string;
}

export interface EntradaMedio {
  nombre: string;
  /** Cuenta como efectivo: sale con los billetes en taquilla y se arquea en el cuadre. */
  es_efectivo: boolean;
  /** La plata entra HOY al parque. En false (bono, página web) suma a la venta pero no al recaudo. */
  afecta_recaudo: boolean;
  orden?: number;
}

async function admin() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "administrador") ? s : null;
}

function refrescar() {
  revalidatePath("/admin/medios-pago");
  revalidatePath("/taquilla");
  revalidatePath("/caja/turno");
  revalidatePath("/admin/gastos");
}

async function resumenActual() {
  return prisma.medioPago.findMany({ select: { id: true, activo: true, es_efectivo: true } });
}

export async function crearMedio(e: EntradaMedio): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador puede gestionar los medios de pago." };

  const nombre = e.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };

  const repetido = await prisma.medioPago.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" } } });
  if (repetido) {
    return {
      ok: false,
      error: repetido.activo ? `Ya existe "${repetido.nombre}".` : `"${repetido.nombre}" ya existe pero está inactivo: actívalo en vez de crearlo de nuevo.`,
    };
  }

  // El código es interno y estable (la taquilla reconoce "prepagado" por él): se genera una
  // vez y no se edita.
  const base = codigoDeMedio(nombre);
  let codigo = base;
  for (let n = 2; await prisma.medioPago.findUnique({ where: { codigo } }); n++) codigo = `${base}_${n}`;

  const max = await prisma.medioPago.aggregate({ _max: { orden: true } });
  const orden = Number.isInteger(e.orden) && e.orden! >= 0 ? e.orden! : (max._max.orden ?? 0) + 1;

  const m = await prisma.medioPago.create({
    data: { nombre, codigo, es_efectivo: !!e.es_efectivo, afecta_recaudo: !!e.afecta_recaudo, orden, creado_por: s.id },
  });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "medio_pago", entidad_id: m.id, accion: "crear",
    datos_despues: { nombre, codigo, es_efectivo: m.es_efectivo, afecta_recaudo: m.afecta_recaudo, orden },
  });
  refrescar();
  return { ok: true };
}

export async function editarMedio(id: string, e: EntradaMedio): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const antes = await prisma.medioPago.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Medio de pago no encontrado." };

  const nombre = e.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };
  const repetido = await prisma.medioPago.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" }, id: { not: id } },
  });
  if (repetido) return { ok: false, error: `Ya existe otro medio llamado "${repetido.nombre}".` };

  if (e.orden !== undefined && (!Number.isInteger(e.orden) || e.orden < 0)) {
    return { ok: false, error: "El orden debe ser un número entero (0, 1, 2…)." };
  }

  const error = validarMediosActivos(await resumenActual(), { id, activo: antes.activo, es_efectivo: !!e.es_efectivo });
  if (error) return { ok: false, error };

  await prisma.medioPago.update({
    where: { id },
    data: {
      nombre,
      es_efectivo: !!e.es_efectivo,
      afecta_recaudo: !!e.afecta_recaudo,
      ...(e.orden !== undefined ? { orden: e.orden } : {}),
      actualizado_por: s.id,
    },
  });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "medio_pago", entidad_id: id, accion: "editar",
    datos_antes: { nombre: antes.nombre, es_efectivo: antes.es_efectivo, afecta_recaudo: antes.afecta_recaudo, orden: antes.orden },
    datos_despues: { nombre, es_efectivo: !!e.es_efectivo, afecta_recaudo: !!e.afecta_recaudo, orden: e.orden ?? antes.orden },
  });
  refrescar();
  return { ok: true };
}

/** Baja lógica: un medio que ya tiene pagos no se borra, se desactiva y deja de salir en taquilla. */
export async function cambiarEstadoMedio(id: string, activo: boolean): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const medio = await prisma.medioPago.findUnique({ where: { id } });
  if (!medio) return { ok: false, error: "Medio de pago no encontrado." };

  const error = validarMediosActivos(await resumenActual(), { id, activo, es_efectivo: medio.es_efectivo });
  if (error) return { ok: false, error };

  await prisma.medioPago.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "medio_pago", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  refrescar();
  return { ok: true };
}
