// Escritura compartida de la bitácora de alimentación: la usan tanto la acción manual
// (`app/admin/animales/actions.ts`) como el reparto automático por horarios
// (`lib/animales/ejecutar-automatico.ts`), para no duplicar el kardex ni el recálculo
// de existencia.

import type { Tx } from "@/lib/db";
import { calcularExistencia } from "./existencia";
import type { EstadoAlimentacion } from "@prisma/client";

/** Recalcula la existencia del alimento desde su kardex (nunca se escribe a mano). */
export async function recalcularExistencia(tx: Tx, alimentoId: string, usuarioId: string): Promise<number> {
  const movs = await tx.movimientoAlimento.findMany({
    where: { alimento_id: alimentoId },
    select: { tipo: true, cantidad_base: true, fecha: true },
  });
  const saldo = calcularExistencia(movs);
  await tx.alimento.update({ where: { id: alimentoId }, data: { existencia_base: saldo, actualizado_por: usuarioId } });
  return saldo;
}

export interface DatosEntregaAlimento {
  racion_id?: string | null;
  animal_id?: string | null;
  categoria_animal_id?: string | null;
  recinto_id?: string | null;
  alimento_id: string;
  cantidad_planeada?: number | null;
  cantidad_entregada: number;
  costo?: number | null;
  estado: EstadoAlimentacion;
  motivo?: string | null;
  empleado_id?: string | null;
  usuario_id: string;
  automatico?: boolean;
  franja?: string | null;
  observaciones?: string | null;
  creado_por: string;
  motivoMovimiento: string;
}

/**
 * Crea el registro de la bitácora y, si hubo entrega, su salida en el kardex del
 * alimento (con el recálculo de existencia). Una sola transacción, un solo lugar.
 */
export async function registrarEntregaConKardex(tx: Tx, e: DatosEntregaAlimento): Promise<{ registroId: string; saldo: number }> {
  const reg = await tx.registroAlimentacion.create({
    data: {
      racion_id: e.racion_id ?? null,
      animal_id: e.animal_id ?? null,
      categoria_animal_id: e.categoria_animal_id ?? null,
      recinto_id: e.recinto_id ?? null,
      alimento_id: e.alimento_id,
      cantidad_planeada: e.cantidad_planeada ?? null,
      cantidad_entregada: e.cantidad_entregada,
      costo: e.costo ?? null,
      estado: e.estado,
      motivo: e.motivo ?? null,
      empleado_id: e.empleado_id ?? null,
      usuario_id: e.usuario_id,
      automatico: e.automatico ?? false,
      franja: e.franja ?? null,
      observaciones: e.observaciones ?? null,
      creado_por: e.creado_por,
    },
  });

  if (e.cantidad_entregada > 0) {
    await tx.movimientoAlimento.create({
      data: {
        alimento_id: e.alimento_id,
        tipo: "salida",
        cantidad_base: e.cantidad_entregada,
        motivo: e.motivoMovimiento,
        costo: e.costo ?? null,
        alimentacion_id: reg.id,
        creado_por: e.creado_por,
      },
    });
  }

  const saldo = await recalcularExistencia(tx, e.alimento_id, e.creado_por);
  return { registroId: reg.id, saldo };
}
