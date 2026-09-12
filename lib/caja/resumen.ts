import { prisma } from "../db";
import { efectivoEsperado } from "./cierre";

export interface LineaMedio { medio: string; codigo: string; es_efectivo: boolean; total: number }
export interface LineaTipo { tipo: string; cantidad: number; total: number }

export interface ResumenTurno {
  base_inicial: number;
  numVentas: number;
  totalVentas: number;
  asistentes: number;
  /** Valor no cobrado por cortesías: entraron gratis. */
  cortesias: number;
  /** Valor no cobrado por rebaja de tarifa: el grupo sí pagó, solo que menos. */
  descuentos: number;
  anuladas: number;
  ventasPorMedio: LineaMedio[];
  ventasPorTipo: LineaTipo[];
  ventasEfectivo: number;
  otrosIngresos: number;
  egresos: number;
  esperadoEfectivo: number;
}

/** Consolida las ventas y movimientos de un turno para el cuadre. */
export async function resumenTurno(turnoId: string): Promise<ResumenTurno> {
  const turno = await prisma.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } });

  const ventas = await prisma.venta.findMany({
    where: { turno_id: turnoId, estado: "completada" },
    select: { id: true, total_cobrado: true, total_descuento: true, cantidad_asistentes: true },
  });
  const ventaIds = ventas.map((v) => v.id);
  const anuladas = await prisma.venta.count({ where: { turno_id: turnoId, estado: "anulada" } });

  const medios = await prisma.medioPago.findMany();
  const medioMap = new Map(medios.map((m) => [m.id, m]));
  const pagos = ventaIds.length
    ? await prisma.ventaPago.groupBy({ by: ["medio_pago_id"], where: { venta_id: { in: ventaIds } }, _sum: { monto: true } })
    : [];
  const ventasPorMedio: LineaMedio[] = pagos.map((p) => {
    const m = medioMap.get(p.medio_pago_id)!;
    return { medio: m.nombre, codigo: m.codigo, es_efectivo: m.es_efectivo, total: p._sum.monto ?? 0 };
  });
  const ventasEfectivo = ventasPorMedio.filter((m) => m.es_efectivo).reduce((a, m) => a + m.total, 0);

  // Ventas por tipo de visitante.
  const detalle = ventaIds.length
    ? await prisma.ventaDetalle.findMany({ where: { venta_id: { in: ventaIds } }, include: { tipo_visitante: true } })
    : [];
  const tipoAcc = new Map<string, LineaTipo>();
  let cortesias = 0;
  let descuentos = 0;
  for (const d of detalle) {
    const k = d.tipo_visitante.nombre;
    const acc = tipoAcc.get(k) ?? { tipo: k, cantidad: 0, total: 0 };
    acc.cantidad += d.cantidad;
    acc.total += d.valor_cobrado * d.cantidad;
    tipoAcc.set(k, acc);

    // Lo no cobrado se separa: la cortesía entró gratis, el descuento sí pagó (menos).
    const noCobrado = (d.valor_lista - d.valor_cobrado) * d.cantidad;
    if (d.tipo_linea === "pago") descuentos += noCobrado;
    else cortesias += noCobrado;
  }

  const movs = await prisma.movimientoCaja.groupBy({ by: ["tipo"], where: { turno_id: turnoId }, _sum: { monto: true } });
  const otrosIngresos = movs.find((m) => m.tipo === "ingreso")?._sum.monto ?? 0;
  const egresos = movs.find((m) => m.tipo === "egreso")?._sum.monto ?? 0;

  return {
    base_inicial: turno.base_inicial,
    numVentas: ventas.length,
    totalVentas: ventas.reduce((a, v) => a + v.total_cobrado, 0),
    asistentes: ventas.reduce((a, v) => a + v.cantidad_asistentes, 0),
    cortesias,
    descuentos,
    anuladas,
    ventasPorMedio,
    ventasPorTipo: [...tipoAcc.values()],
    ventasEfectivo,
    otrosIngresos,
    egresos,
    esperadoEfectivo: efectivoEsperado({ base_inicial: turno.base_inicial, ventasEfectivo, otrosIngresos, egresos }),
  };
}
