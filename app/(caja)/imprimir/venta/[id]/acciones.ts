"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";

export interface ResultadoAccion {
  ok: boolean;
  error?: string;
}

/** Marca como impresas las manillas de la venta (cola de impresión). */
export async function marcarImpreso(ventaId: string): Promise<ResultadoAccion> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  await prisma.impresion.updateMany({
    where: { manilla: { venta_detalle: { venta_id: ventaId } }, estado: "pendiente" },
    data: { estado: "impreso", impreso_en: new Date() },
  });
  return { ok: true };
}

/** Reimpresión: solo supervisor/administrador, con motivo. Cuenta y audita. */
export async function reimprimirVenta(ventaId: string, motivo: string): Promise<ResultadoAccion> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  if (!tieneRol(s.rol, "supervisor")) return { ok: false, error: "Solo un supervisor puede reimprimir." };
  if (!motivo.trim()) return { ok: false, error: "Indica el motivo de la reimpresión." };

  const manillas = await prisma.manilla.findMany({ where: { venta_detalle: { venta_id: ventaId } }, select: { id: true } });
  if (manillas.length === 0) return { ok: false, error: "La venta no tiene manillas." };

  await prisma.$transaction(async (tx) => {
    for (const m of manillas) {
      await tx.manilla.update({ where: { id: m.id }, data: { reimpresa_veces: { increment: 1 }, actualizado_por: s.id } });
    }
    await registrarAuditoria({
      usuario_id: s.id,
      entidad: "venta",
      entidad_id: ventaId,
      accion: "reimprimir",
      datos_despues: { motivo: motivo.trim(), manillas: manillas.length },
    });
  });

  revalidatePath(`/imprimir/venta/${ventaId}`);
  return { ok: true };
}

/** Anulación de venta: solo supervisor/administrador, con motivo. Anula venta + manillas. */
export async function anularVenta(ventaId: string, motivo: string): Promise<ResultadoAccion> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  if (!tieneRol(s.rol, "supervisor")) return { ok: false, error: "Solo un supervisor puede anular." };
  if (!motivo.trim()) return { ok: false, error: "Indica el motivo de la anulación." };

  const venta = await prisma.venta.findUnique({ where: { id: ventaId }, select: { estado: true } });
  if (!venta) return { ok: false, error: "Venta no encontrada." };
  if (venta.estado === "anulada") return { ok: false, error: "La venta ya está anulada." };

  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.venta.update({
      where: { id: ventaId },
      data: { estado: "anulada", motivo_anulacion: motivo.trim(), anulada_por: s.id, anulada_en: ahora, actualizado_por: s.id },
    });
    await tx.manilla.updateMany({
      where: { venta_detalle: { venta_id: ventaId }, estado: { not: "anulada" } },
      data: { estado: "anulada", anulada_en: ahora, anulada_por: s.id, motivo_anulacion: motivo.trim() },
    });
    await registrarAuditoria({
      usuario_id: s.id,
      entidad: "venta",
      entidad_id: ventaId,
      accion: "anular",
      datos_despues: { motivo: motivo.trim() },
    });
  });

  revalidatePath(`/imprimir/venta/${ventaId}`);
  return { ok: true };
}

/**
 * Cambia SOLO la forma de pago de una venta. Solo supervisor/administrador, con motivo.
 *
 * Es distinto de corregir la venta: aquí no se anula nada, la venta conserva su número,
 * sus líneas y sus manillas. Lo único que cambia es con qué se pagó — el caso del cajero
 * que marcó "Efectivo" cuando fue Nequi.
 *
 * Dos reglas que no se negocian:
 *  · Los pagos nuevos tienen que sumar EXACTAMENTE lo mismo que cobró la venta. Esto no
 *    es para cambiar el valor: para eso está corregir la venta.
 *  · El turno tiene que estar abierto (o reabierto). Mover plata entre medios cambia el
 *    efectivo esperado del cajón; si el turno ya se cerró y se firmó, primero se reabre.
 */
export async function cambiarFormaPago(
  ventaId: string,
  pagos: { medio_pago_id: string; monto: number }[],
  motivo: string,
): Promise<ResultadoAccion> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  if (!tieneRol(s.rol, "supervisor")) return { ok: false, error: "Solo un supervisor puede cambiar la forma de pago." };

  const limpio = motivo?.trim();
  if (!limpio) return { ok: false, error: "Indica el motivo del cambio: queda en la auditoría." };

  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: { pagos: { include: { medio_pago: true } }, turno: true },
  });
  if (!venta) return { ok: false, error: "Venta no encontrada." };
  if (venta.estado === "anulada") return { ok: false, error: "Esa venta está anulada." };
  if (!["abierto", "reabierto"].includes(venta.turno.estado)) {
    return { ok: false, error: "El turno de esa venta ya está cerrado. Reábrelo para poder cambiarle la forma de pago: mover plata entre medios cambia el efectivo esperado del cajón." };
  }

  const limpios = pagos.filter((p) => p.medio_pago_id && Number.isFinite(p.monto) && p.monto > 0)
    .map((p) => ({ medio_pago_id: p.medio_pago_id, monto: Math.round(p.monto) }));
  if (limpios.length === 0) return { ok: false, error: "Indica al menos una forma de pago." };

  const suma = limpios.reduce((a, p) => a + p.monto, 0);
  if (suma !== venta.total_cobrado) {
    return {
      ok: false,
      error: `Los pagos suman ${suma.toLocaleString("es-CO")} y la venta cobró ${venta.total_cobrado.toLocaleString("es-CO")}. Para cambiar el valor hay que corregir la venta, no la forma de pago.`,
    };
  }

  const medios = await prisma.medioPago.findMany({ where: { id: { in: limpios.map((p) => p.medio_pago_id) } } });
  if (medios.length !== new Set(limpios.map((p) => p.medio_pago_id)).size) {
    return { ok: false, error: "Alguna forma de pago no existe." };
  }

  const antes = venta.pagos.map((p) => ({ medio: p.medio_pago.nombre, monto: p.monto }));
  const nombre = new Map(medios.map((m) => [m.id, m.nombre]));
  const despues = limpios.map((p) => ({ medio: nombre.get(p.medio_pago_id) ?? "?", monto: p.monto }));

  await prisma.$transaction(async (tx) => {
    await tx.ventaPago.deleteMany({ where: { venta_id: ventaId } });
    for (const p of limpios) {
      await tx.ventaPago.create({
        data: { venta_id: ventaId, medio_pago_id: p.medio_pago_id, monto: p.monto, creado_por: s.id },
      });
    }
    await tx.venta.update({ where: { id: ventaId }, data: { actualizado_por: s.id } });
  });

  await registrarAuditoria({
    usuario_id: s.id,
    entidad: "venta",
    entidad_id: ventaId,
    accion: "cambiar_forma_pago",
    datos_antes: { pagos: antes },
    datos_despues: { pagos: despues, motivo: limpio },
  });

  revalidatePath(`/imprimir/venta/${ventaId}`);
  revalidatePath("/caja/ventas");
  return { ok: true };
}
