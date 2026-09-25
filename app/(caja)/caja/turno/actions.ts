"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { turnoAbiertoDe, abrirTurnoEnCaja, reabrirTurnoCerrado } from "@/lib/caja/turno";
import { crearMovimientoCaja } from "@/lib/caja/movimientos";
import { resumenTurno } from "@/lib/caja/resumen";
import { totalConteo } from "@/lib/caja/cierre";
import { registrarAuditoria } from "@/lib/audit";

interface EstadoTurno {
  error?: string;
  ok?: boolean;
}

export async function abrirTurno(_prev: EstadoTurno | null, formData: FormData): Promise<EstadoTurno> {
  const s = await obtenerSesion();
  if (!s) return { error: "Sesión expirada." };

  const caja_id = String(formData.get("caja_id") ?? "");
  const base_inicial = parseInt(String(formData.get("base_inicial") ?? "0").replace(/\D/g, ""), 10) || 0;
  if (!caja_id) return { error: "Selecciona una caja." };

  // Una caja = un turno activo, y un usuario = un turno activo (con candado: ver lib/caja/turno).
  let r: Awaited<ReturnType<typeof abrirTurnoEnCaja>>;
  try {
    r = await abrirTurnoEnCaja({ cajaId: caja_id, usuarioId: s.id, baseInicial: base_inicial });
  } catch (e) {
    // Segunda barrera: el índice único de la base rechazó un segundo turno activo.
    if ((e as { code?: string })?.code === "P2002") return { error: "Esa caja (o tu usuario) ya tiene un turno abierto. Recarga la página." };
    throw e;
  }
  if (!r.ok) return { error: r.error };
  await registrarAuditoria({
    usuario_id: s.id, entidad: "turno_caja", entidad_id: r.turnoId, accion: "abrir",
    datos_despues: { caja_id, base_inicial },
  });
  revalidatePath("/caja/turno");
  revalidatePath("/taquilla");
  return { ok: true };
}

export interface ResultadoAccionCaja {
  ok: boolean;
  error?: string;
  /** Movimiento recién creado: para abrir su comprobante. */
  movimientoId?: string;
}

/** Movimiento de caja distinto a ventas (ingreso/egreso), con motivo. */
export async function registrarMovimiento(input: {
  tipo: "ingreso" | "egreso";
  monto: number;
  concepto: string;
  medio_pago_id?: string | null;
  /** Egreso: a quién se le entrega la plata, de la lista de beneficiarios. Obligatorio. */
  beneficiario_id?: string | null;
  /** Ingreso: de quién se recibió. Opcional. */
  tercero?: string | null;
}): Promise<ResultadoAccionCaja> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  const turno = await turnoAbiertoDe(s.id);
  if (!turno) return { ok: false, error: "No tienes un turno abierto." };

  const r = await crearMovimientoCaja({
    turnoId: turno.id, tipo: input.tipo, monto: input.monto, concepto: input.concepto,
    beneficiarioId: input.beneficiario_id, tercero: input.tercero, medioPagoId: input.medio_pago_id, por: s.id,
  });
  if (!r.ok) return { ok: false, error: r.error };
  await registrarAuditoria({
    usuario_id: s.id, entidad: "movimiento_caja", entidad_id: r.id, accion: "crear",
    datos_despues: { tipo: input.tipo, numero: r.numero, monto: input.monto, concepto: input.concepto, beneficiario_id: input.beneficiario_id ?? null, tercero: input.tercero ?? null },
  });
  revalidatePath("/caja/turno");
  return { ok: true, movimientoId: r.id };
}

export interface ResultadoCierre {
  ok: boolean;
  error?: string;
  esperado?: number;
  contado?: number;
  diferencia?: number;
}

/** Cierre del turno: conteo por denominación → esperado vs. contado → diferencia. */
export async function cerrarTurno(input: {
  conteos: { denominacion: number; cantidad: number }[];
  observacion: string;
}): Promise<ResultadoCierre> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  const turno = await turnoAbiertoDe(s.id);
  if (!turno) return { ok: false, error: "No tienes un turno abierto." };

  const resumen = await resumenTurno(turno.id);
  const conteos = (input.conteos ?? []).filter((c) => c.cantidad > 0);
  const contado = totalConteo(conteos);
  const esperado = resumen.esperadoEfectivo;
  const diferencia = contado - esperado;

  if (diferencia !== 0 && !input.observacion?.trim()) {
    return { ok: false, error: "Hay diferencia; escribe una observación.", esperado, contado, diferencia };
  }

  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.conteoDenominacion.deleteMany({ where: { turno_id: turno.id } });
    if (conteos.length) {
      await tx.conteoDenominacion.createMany({
        data: conteos.map((c) => ({ turno_id: turno.id, denominacion: c.denominacion, cantidad: c.cantidad, creado_por: s.id })),
      });
    }
    await tx.movimientoCaja.create({
      data: { turno_id: turno.id, tipo: "cierre", monto: contado, concepto: "Cierre de turno", creado_por: s.id },
    });
    await tx.turnoCaja.update({
      where: { id: turno.id },
      data: {
        estado: "cerrado",
        cerrado_en: ahora,
        efectivo_esperado: esperado,
        efectivo_contado: contado,
        diferencia,
        observacion_cierre: input.observacion?.trim() || null,
        actualizado_por: s.id,
      },
    });
    await registrarAuditoria({
      usuario_id: s.id, entidad: "turno_caja", entidad_id: turno.id, accion: "cerrar",
      datos_despues: { esperado, contado, diferencia },
    });
  });

  revalidatePath("/caja/turno");
  return { ok: true, esperado, contado, diferencia };
}

/** Reapertura de un turno cerrado: solo administrador, con motivo y auditoría. */
export async function reabrirTurno(turnoId: string, motivo: string): Promise<ResultadoAccionCaja> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  if (!tieneRol(s.rol, "administrador")) return { ok: false, error: "Solo un administrador puede reabrir." };
  if (!motivo?.trim()) return { ok: false, error: "Indica el motivo de la reapertura." };

  // Mismas reglas que al abrir: no se reabre si la caja o el cajero ya tienen otro turno activo.
  const r = await reabrirTurnoCerrado({ turnoId, por: s.id });
  if (!r.ok) return { ok: false, error: r.error };
  await registrarAuditoria({ usuario_id: s.id, entidad: "turno_caja", entidad_id: turnoId, accion: "reabrir", datos_despues: { motivo: motivo.trim() } });
  revalidatePath("/caja/turno");
  return { ok: true };
}
