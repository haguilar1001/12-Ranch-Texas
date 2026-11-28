import type { Tx } from "@/lib/db";
import { calcularExistencia, formatearCantidad, type TipoMovInsumo } from "./insumos";

// Recalcular la existencia de un insumo desde su kardex (dentro de una transacción). Lo usan
// los movimientos a mano, las fumigaciones y los tratamientos.

export class SaldoNegativo extends Error {}

/** Recalcula la existencia. Si quedaría negativa, lanza SaldoNegativo (y la transacción se deshace). */
export async function recalcularInsumo(tx: Tx, insumoId: string, usuario: string): Promise<number> {
  const movs = await tx.movimientoInsumo.findMany({ where: { insumo_id: insumoId }, select: { tipo: true, cantidad: true, fecha: true, creado_en: true, anulado: true } });
  const existencia = calcularExistencia(movs.map((m) => ({ ...m, tipo: m.tipo as TipoMovInsumo, cantidad: Number(m.cantidad) })));
  if (existencia < 0) {
    const ins = await tx.insumoGranja.findUnique({ where: { id: insumoId }, select: { nombre: true } });
    throw new SaldoNegativo(`${ins?.nombre ?? "El insumo"} quedaría en ${formatearCantidad(existencia)}.`);
  }
  await tx.insumoGranja.update({ where: { id: insumoId }, data: { existencia, actualizado_por: usuario } });
  return existencia;
}
