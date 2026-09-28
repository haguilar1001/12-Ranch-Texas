"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { totalGasto } from "@/lib/gastos/calculo";

export interface ResultadoGasto {
  ok: boolean;
  error?: string;
}

export interface EntradaGasto {
  rubro_gasto_id: string;
  proveedor_nombre?: string;
  proveedor_nit?: string;
  descripcion: string;
  fecha_gasto: string; // yyyy-mm-dd
  base_gravable: number;
  iva: number;
  retefuente: number;
  reteica: number;
  otras_retenciones: number;
  medio_pago_id?: string | null;
  estado: "pendiente" | "pagado";
  soporte_archivo?: string; // URL/referencia del soporte
  /** Dónde se consume (área de trabajo). */
  area_id?: string | null;
  /** Empleado que pidió la compra. */
  solicitante_id?: string | null;
}

export async function crearGasto(e: EntradaGasto): Promise<ResultadoGasto> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  if (!tieneRol(s.rol, "supervisor")) return { ok: false, error: "No autorizado para registrar gastos." };
  if (!e.rubro_gasto_id) return { ok: false, error: "Selecciona el rubro." };
  if (!e.descripcion?.trim()) return { ok: false, error: "Ingresa la descripción." };
  if (!e.fecha_gasto) return { ok: false, error: "Ingresa la fecha." };
  if (!Number.isInteger(e.base_gravable) || e.base_gravable < 0) return { ok: false, error: "Base inválida." };

  const area_id = e.area_id || null;
  const solicitante_id = e.solicitante_id || null;
  if (area_id && !(await prisma.areaTrabajo.findFirst({ where: { id: area_id, activo: true } }))) {
    return { ok: false, error: "El área no existe o está inactiva." };
  }
  if (solicitante_id && !(await prisma.empleado.findFirst({ where: { id: solicitante_id, activo: true } }))) {
    return { ok: false, error: "El empleado que pidió no existe o está inactivo." };
  }

  let proveedor_id: string | null = null;
  if (e.proveedor_nombre?.trim()) {
    const nombre = e.proveedor_nombre.trim();
    const existente = await prisma.proveedor.findFirst({ where: { nombre } });
    proveedor_id = existente
      ? existente.id
      : (await prisma.proveedor.create({ data: { nombre, nit_cedula: e.proveedor_nit?.trim() || null, creado_por: s.id } })).id;
  }

  const total = totalGasto(e);
  await prisma.gasto.create({
    data: {
      rubro_gasto_id: e.rubro_gasto_id,
      proveedor_id,
      descripcion: e.descripcion.trim(),
      fecha_gasto: new Date(`${e.fecha_gasto}T12:00:00-05:00`),
      base_gravable: e.base_gravable,
      iva: e.iva || 0,
      retefuente: e.retefuente || 0,
      reteica: e.reteica || 0,
      otras_retenciones: e.otras_retenciones || 0,
      total,
      estado: e.estado,
      medio_pago_id: e.estado === "pagado" ? e.medio_pago_id ?? null : null,
      pagado_en: e.estado === "pagado" ? new Date() : null,
      soporte_archivo: e.soporte_archivo?.trim() || null,
      area_id,
      solicitante_id,
      creado_por: s.id,
    },
  });

  revalidatePath("/admin/gastos");
  return { ok: true };
}

export async function marcarPagado(gastoId: string, medio_pago_id: string): Promise<ResultadoGasto> {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "supervisor")) return { ok: false, error: "No autorizado." };
  await prisma.gasto.update({ where: { id: gastoId }, data: { estado: "pagado", pagado_en: new Date(), medio_pago_id, actualizado_por: s.id } });
  revalidatePath("/admin/gastos");
  return { ok: true };
}

export async function anularGasto(gastoId: string, motivo: string): Promise<ResultadoGasto> {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "supervisor")) return { ok: false, error: "No autorizado." };
  if (!motivo?.trim()) return { ok: false, error: "Indica el motivo." };
  await prisma.gasto.update({ where: { id: gastoId }, data: { estado: "anulado", actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "gasto", entidad_id: gastoId, accion: "anular", datos_despues: { motivo: motivo.trim() } });
  revalidatePath("/admin/gastos");
  return { ok: true };
}
