import { prisma } from "../db";
import { bloquear } from "./turno";

export interface EntradaMovimiento {
  tipo: "ingreso" | "egreso";
  monto: number;
  concepto: string;
  /** Egreso: a quién se le entrega la plata (lista de beneficiarios). Obligatorio en egresos. */
  beneficiarioId?: string | null;
  /** Ingreso: de quién se recibió, texto libre y opcional. */
  tercero?: string | null;
}

/** Reglas del movimiento, sin BD. Devuelve el error o null. */
export function validarMovimiento(e: EntradaMovimiento): string | null {
  if (e.tipo !== "ingreso" && e.tipo !== "egreso") return "Tipo de movimiento inválido.";
  if (!Number.isInteger(e.monto) || e.monto <= 0) return "Monto inválido.";
  if (!e.concepto?.trim()) return "Indica el concepto.";
  // La plata que sale del cajón tiene que tener quién la recibió: es lo que firma en el comprobante.
  if (e.tipo === "egreso" && !e.beneficiarioId) return "Elige a quién se le entrega la plata.";
  return null;
}

/**
 * Crea un movimiento manual de caja (ingreso o egreso) con el consecutivo de su comprobante,
 * uno por tipo. El candado evita que dos cajas saquen el mismo número al mismo tiempo; el
 * índice único (tipo, numero) de la base es la segunda barrera.
 */
export async function crearMovimientoCaja(
  entrada: EntradaMovimiento & { turnoId: string; medioPagoId?: string | null; por: string },
): Promise<{ ok: true; id: string; numero: number } | { ok: false; error: string }> {
  const error = validarMovimiento(entrada);
  if (error) return { ok: false, error };

  // En un egreso el nombre sale del beneficiario (activo), no de lo que escriba el cajero.
  let tercero = entrada.tipo === "ingreso" ? entrada.tercero?.trim() || null : null;
  let beneficiarioId: string | null = null;
  if (entrada.tipo === "egreso") {
    const b = await prisma.beneficiarioCaja.findUnique({ where: { id: entrada.beneficiarioId! } });
    if (!b || !b.activo) return { ok: false, error: "Ese beneficiario no existe o está inactivo." };
    beneficiarioId = b.id;
    tercero = b.nombre;
  }

  const m = await prisma.$transaction(async (tx) => {
    await bloquear(tx, `movimiento:${entrada.tipo}`);
    const ultimo = await tx.movimientoCaja.aggregate({ where: { tipo: entrada.tipo }, _max: { numero: true } });
    return tx.movimientoCaja.create({
      data: {
        turno_id: entrada.turnoId,
        tipo: entrada.tipo,
        numero: (ultimo._max.numero ?? 0) + 1,
        monto: entrada.monto,
        concepto: entrada.concepto.trim(),
        tercero,
        beneficiario_id: beneficiarioId,
        medio_pago_id: entrada.medioPagoId ?? null,
        creado_por: entrada.por,
      },
    });
  });
  return { ok: true, id: m.id, numero: m.numero! };
}
