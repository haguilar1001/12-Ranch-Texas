import { prisma } from "../db";
import type { LineaMedio, LineaTipo } from "./resumen";
import { formatearFechaHoraBogota } from "../tiempo";

// Cuadre diario CONSOLIDADO por FECHA DE LA VENTA (creado_en, hora Bogota): agrupa lo que se
// vendió y recaudó ese día calendario, sin importar cuándo se abrió el turno. Así una venta
// aparece siempre en el día en que ocurrió (evita sorpresas si un turno queda abierto varios días).
//
// El arqueo del cajón (base inicial, efectivo contado, diferencia) NO va aquí: es un concepto de
// cierre POR TURNO (se cuenta el cajón al cerrar) y vive en el cuadre por turno.

export interface EntradaTurnoDia {
  turnoId: string;
  caja: string;
  usuario: string;
  estado: string; // abierto | reabierto | cerrado
  abiertoEn: string;
  cerradoEn: string | null;
  numVentas: number;
  totalVentas: number;
  asistentes: number;
  cortesias: number;
  /** Rebajas de tarifa: el grupo sí pagó, solo que menos. */
  descuentos: number;
  ventasPorMedio: LineaMedio[];
  ventasPorTipo: LineaTipo[];
  ventasEfectivo: number;
  otrosIngresos: number;
  egresos: number;
}

export interface DetalleTurnoDia {
  turnoId: string;
  caja: string;
  usuario: string;
  estado: string;
  abiertoEn: string;
  cerradoEn: string | null;
  totalVentas: number;
  ventasEfectivo: number;
}

export interface ConsolidadoDia {
  fecha: string;
  turnos: number; // turnos con actividad ese día
  turnosCerrados: number;
  turnosAbiertos: number;
  numVentas: number;
  totalVentas: number;
  asistentes: number;
  cortesias: number;
  descuentos: number;
  anuladas: number;
  ventasPorMedio: LineaMedio[];
  ventasPorTipo: LineaTipo[];
  ventasEfectivo: number;
  otrosIngresos: number;
  egresos: number;
  efectivoRecaudado: number; // ventas efectivo + otros ingresos − egresos (sin base)
  detalle: DetalleTurnoDia[];
}

/** Consolida (PURO) las ventas de un día por turno. Todo en enteros COP. */
export function consolidarDia(fecha: string, entradas: EntradaTurnoDia[], anuladas: number): ConsolidadoDia {
  const porMedio = new Map<string, LineaMedio>();
  const porTipo = new Map<string, LineaTipo>();

  const acc: ConsolidadoDia = {
    fecha,
    turnos: entradas.length,
    turnosCerrados: 0,
    turnosAbiertos: 0,
    numVentas: 0,
    totalVentas: 0,
    asistentes: 0,
    cortesias: 0,
    descuentos: 0,
    anuladas,
    ventasPorMedio: [],
    ventasPorTipo: [],
    ventasEfectivo: 0,
    otrosIngresos: 0,
    egresos: 0,
    efectivoRecaudado: 0,
    detalle: [],
  };

  for (const e of entradas) {
    if (e.estado === "cerrado") acc.turnosCerrados += 1;
    else acc.turnosAbiertos += 1;

    acc.numVentas += e.numVentas;
    acc.totalVentas += e.totalVentas;
    acc.asistentes += e.asistentes;
    acc.cortesias += e.cortesias;
    acc.descuentos += e.descuentos;
    acc.ventasEfectivo += e.ventasEfectivo;
    acc.otrosIngresos += e.otrosIngresos;
    acc.egresos += e.egresos;

    for (const m of e.ventasPorMedio) {
      const prev = porMedio.get(m.codigo);
      if (prev) prev.total += m.total;
      else porMedio.set(m.codigo, { ...m });
    }
    for (const t of e.ventasPorTipo) {
      const prev = porTipo.get(t.tipo);
      if (prev) { prev.cantidad += t.cantidad; prev.total += t.total; }
      else porTipo.set(t.tipo, { ...t });
    }

    acc.detalle.push({
      turnoId: e.turnoId,
      caja: e.caja,
      usuario: e.usuario,
      estado: e.estado,
      abiertoEn: e.abiertoEn,
      cerradoEn: e.cerradoEn,
      totalVentas: e.totalVentas,
      ventasEfectivo: e.ventasEfectivo,
    });
  }

  acc.efectivoRecaudado = acc.ventasEfectivo + acc.otrosIngresos - acc.egresos;
  acc.ventasPorMedio = [...porMedio.values()].sort((a, b) => b.total - a.total);
  acc.ventasPorTipo = [...porTipo.values()].sort((a, b) => b.total - a.total);
  return acc;
}

/** Límites del día (00:00:00 a 23:59:59.999 hora Bogotá) para una fecha YYYY-MM-DD. */
export function limitesDiaOperativo(fecha: string): { inicio: Date; fin: Date } {
  return {
    inicio: new Date(`${fecha}T00:00:00.000-05:00`),
    fin: new Date(`${fecha}T23:59:59.999-05:00`),
  };
}

interface AccTurno {
  numVentas: number;
  totalVentas: number;
  asistentes: number;
  cortesias: number;
  descuentos: number;
  medio: Map<string, LineaMedio>;
  tipo: Map<string, LineaTipo>;
  ventasEfectivo: number;
  otrosIngresos: number;
  egresos: number;
}

/** Cuadre diario consolidado de todas las ventas ocurridas en la fecha dada (YYYY-MM-DD, Bogotá). */
export async function cuadreDiario(fecha: string): Promise<ConsolidadoDia> {
  const { inicio, fin } = limitesDiaOperativo(fecha);
  const rango = { gte: inicio, lte: fin };

  const [ventas, anuladas, movs, medios] = await Promise.all([
    prisma.venta.findMany({
      where: { creado_en: rango, estado: "completada" },
      select: {
        total_cobrado: true, total_descuento: true, cantidad_asistentes: true, turno_id: true,
        pagos: { select: { monto: true, medio_pago_id: true } },
        detalle: { select: { cantidad: true, valor_cobrado: true, valor_lista: true, tipo_linea: true, tipo_visitante: { select: { nombre: true } } } },
      },
    }),
    prisma.venta.count({ where: { creado_en: rango, estado: "anulada" } }),
    prisma.movimientoCaja.findMany({ where: { creado_en: rango }, select: { tipo: true, monto: true, turno_id: true } }),
    prisma.medioPago.findMany({ select: { id: true, nombre: true, codigo: true, es_efectivo: true } }),
  ]);

  const medioMap = new Map(medios.map((m) => [m.id, m]));
  const porTurno = new Map<string, AccTurno>();
  const ensure = (id: string): AccTurno => {
    let a = porTurno.get(id);
    if (!a) {
      a = { numVentas: 0, totalVentas: 0, asistentes: 0, cortesias: 0, descuentos: 0, medio: new Map(), tipo: new Map(), ventasEfectivo: 0, otrosIngresos: 0, egresos: 0 };
      porTurno.set(id, a);
    }
    return a;
  };

  for (const v of ventas) {
    const a = ensure(v.turno_id);
    a.numVentas += 1;
    a.totalVentas += v.total_cobrado;
    a.asistentes += v.cantidad_asistentes;
    for (const p of v.pagos) {
      const m = medioMap.get(p.medio_pago_id);
      if (!m) continue;
      const line = a.medio.get(m.codigo) ?? { medio: m.nombre, codigo: m.codigo, es_efectivo: m.es_efectivo, total: 0 };
      line.total += p.monto;
      a.medio.set(m.codigo, line);
      if (m.es_efectivo) a.ventasEfectivo += p.monto;
    }
    for (const d of v.detalle) {
      const k = d.tipo_visitante.nombre;
      const line = a.tipo.get(k) ?? { tipo: k, cantidad: 0, total: 0 };
      line.cantidad += d.cantidad;
      line.total += d.valor_cobrado * d.cantidad;
      a.tipo.set(k, line);
      // Lo no cobrado se separa: la cortesía entró gratis, el descuento sí pagó (menos).
      const noCobrado = (d.valor_lista - d.valor_cobrado) * d.cantidad;
      if (d.tipo_linea === "pago") a.descuentos += noCobrado;
      else a.cortesias += noCobrado;
    }
  }

  for (const mv of movs) {
    const a = ensure(mv.turno_id);
    if (mv.tipo === "ingreso") a.otrosIngresos += mv.monto;
    else if (mv.tipo === "egreso") a.egresos += mv.monto;
  }

  const turnoIds = [...porTurno.keys()];
  const turnos = turnoIds.length
    ? await prisma.turnoCaja.findMany({
        where: { id: { in: turnoIds } },
        select: { id: true, estado: true, abierto_en: true, cerrado_en: true, caja: { select: { nombre: true } }, usuario: { select: { nombre: true } } },
      })
    : [];
  const turnoInfo = new Map(turnos.map((t) => [t.id, t]));

  const entradas: EntradaTurnoDia[] = turnoIds.map((id) => {
    const a = porTurno.get(id)!;
    const t = turnoInfo.get(id);
    return {
      turnoId: id,
      caja: t?.caja.nombre ?? "—",
      usuario: t?.usuario.nombre ?? "—",
      estado: t?.estado ?? "—",
      abiertoEn: t ? formatearFechaHoraBogota(t.abierto_en) : "—",
      cerradoEn: t?.cerrado_en ? formatearFechaHoraBogota(t.cerrado_en) : null,
      numVentas: a.numVentas,
      totalVentas: a.totalVentas,
      asistentes: a.asistentes,
      cortesias: a.cortesias,
      descuentos: a.descuentos,
      ventasPorMedio: [...a.medio.values()],
      ventasPorTipo: [...a.tipo.values()],
      ventasEfectivo: a.ventasEfectivo,
      otrosIngresos: a.otrosIngresos,
      egresos: a.egresos,
    };
  });

  return consolidarDia(fecha, entradas, anuladas);
}
