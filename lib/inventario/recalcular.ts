// Recalcula la cantidad guardada (animales.cantidad / equipos.cantidad) desde el kardex.
// Se llama SIEMPRE dentro de la misma transacción que crea o anula el movimiento.

import type { Tx } from "@/lib/db";
import { calcularSaldo, saldoMinimo, EFECTO_ANIMAL, EFECTO_EQUIPO, type MovimientoUnidades, type TipoMovAnimal, type TipoMovEquipo } from "./kardex";

export class SaldoNegativoError extends Error {}

async function movsAnimal(tx: Tx, animalId: string): Promise<MovimientoUnidades[]> {
  const movs = await tx.movimientoAnimal.findMany({
    where: { animal_id: animalId },
    select: { tipo: true, cantidad: true, fecha: true, creado_en: true, anulado: true },
  });
  return movs.map((m) => ({ ...m, efecto: EFECTO_ANIMAL[m.tipo as TipoMovAnimal] }));
}

async function movsEquipo(tx: Tx, equipoId: string): Promise<MovimientoUnidades[]> {
  const movs = await tx.movimientoEquipo.findMany({
    where: { equipo_id: equipoId },
    select: { tipo: true, cantidad: true, fecha: true, creado_en: true, anulado: true },
  });
  return movs.map((m) => ({ ...m, efecto: EFECTO_EQUIPO[m.tipo as TipoMovEquipo] }));
}

/**
 * Recalcula las cabezas del grupo. Si en algún punto de la historia el saldo queda negativo,
 * lanza SaldoNegativoError (la transacción se revierte y el usuario ve el mensaje).
 */
export async function recalcularCenso(tx: Tx, animalId: string, usuarioId: string, nombre = "El grupo"): Promise<number> {
  const movs = await movsAnimal(tx, animalId);
  if (saldoMinimo(movs) < 0) {
    throw new SaldoNegativoError(`${nombre} quedaría con cabezas negativas. Revisa la cantidad o la fecha de la novedad.`);
  }
  const saldo = calcularSaldo(movs);
  await tx.animal.update({ where: { id: animalId }, data: { cantidad: saldo, actualizado_por: usuarioId } });
  return saldo;
}

export async function recalcularUnidadesEquipo(tx: Tx, equipoId: string, usuarioId: string, nombre = "El equipo"): Promise<number> {
  const movs = await movsEquipo(tx, equipoId);
  if (saldoMinimo(movs) < 0) {
    throw new SaldoNegativoError(`${nombre} quedaría con unidades negativas. Revisa la cantidad o la fecha de la novedad.`);
  }
  const saldo = calcularSaldo(movs);
  await tx.equipo.update({ where: { id: equipoId }, data: { cantidad: saldo, actualizado_por: usuarioId } });
  return saldo;
}
