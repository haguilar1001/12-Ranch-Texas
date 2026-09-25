import { prisma } from "@/lib/db";
import { bloquear } from "./turno";

/**
 * Crea un movimiento manual de caja (ingreso o egreso) con el consecutivo de su comprobante,
 * uno por tipo. El candado evita que dos cajas saquen el mismo número al mismo tiempo; el
 * índice único (tipo, numero) de la base es la segunda barrera.
 */
export async function crearMovimientoCaja(entrada: {
  turnoId: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  concepto: string;
  tercero?: string | null;
  medioPagoId?: string | null;
  por: string;
}) {
  return prisma.$transaction(async (tx) => {
    await bloquear(tx, `movimiento:${entrada.tipo}`);
    const ultimo = await tx.movimientoCaja.aggregate({ where: { tipo: entrada.tipo }, _max: { numero: true } });
    return tx.movimientoCaja.create({
      data: {
        turno_id: entrada.turnoId,
        tipo: entrada.tipo,
        numero: (ultimo._max.numero ?? 0) + 1,
        monto: entrada.monto,
        concepto: entrada.concepto.trim(),
        tercero: entrada.tercero?.trim() || null,
        medio_pago_id: entrada.medioPagoId ?? null,
        creado_por: entrada.por,
      },
    });
  });
}
