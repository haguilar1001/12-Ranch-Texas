import { prisma } from "../db";

const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Convierte un instante UTC a la hora local de Bogotá (UTC-5). */
function aBogota(d: Date): Date {
  return new Date(d.getTime() - 5 * 3600000);
}

export interface IndicadoresVentas {
  numVentas: number;
  asistentes: number;
  ingreso: number;
  /** Ingreso entre ENTRADAS (personas), no entre ventas — el gasto promedio por
   * cliente atendido, sin importar cuántas cabezas trajera cada tiquete. */
  ticketPromedio: number;
  valorNoCobrado: number; // cortesías + descuentos
  pctCortesias: number; // sobre el valor lista
  /** Personas que entraron por cortesía (atención + invitación + cortesía). */
  personasCortesia: number;
  /** `cortesias` son las personas de ese tipo que NO pagaron por ser cortesía. */
  porTipo: { tipo: string; cantidad: number; cortesias: number; total: number }[];
  /** Cómo entró la gente: pagando, o por cada clase de cortesía. */
  porClase: { clase: string; personas: number; noCobrado: number }[];
  porMedio: { medio: string; total: number }[];
  porDiaSemana: { dia: string; total: number }[];
  porHora: { hora: number; total: number }[];
}

const CLASE: Record<string, string> = {
  pago: "Pagadas",
  atencion: "Atenciones",
  invitacion: "Invitaciones",
  cortesia: "Cortesías",
};

export interface FiltrosVentas {
  cajaId?: string;
  cajeroId?: string;
}

function whereVentas(desde: Date, hasta: Date, f?: FiltrosVentas) {
  const where: {
    estado: "completada";
    creado_en: { gte: Date; lt: Date };
    usuario_id?: string;
    turno?: { caja_id: string } | { caja: { es_prueba: boolean } };
  } = { estado: "completada", creado_en: { gte: desde, lt: hasta } };
  if (f?.cajeroId) where.usuario_id = f.cajeroId;
  // Sin caja puntual, se excluye la(s) caja(s) de prueba: no deben inflar ni distorsionar
  // el ingreso real. Si el admin SÍ eligió una caja a propósito (incluida una de prueba),
  // se respeta su elección.
  where.turno = f?.cajaId ? { caja_id: f.cajaId } : { caja: { es_prueba: false } };
  return where;
}

export async function indicadoresVentas(desde: Date, hasta: Date, filtros?: FiltrosVentas): Promise<IndicadoresVentas> {
  const ventas = await prisma.venta.findMany({
    where: whereVentas(desde, hasta, filtros),
    select: { id: true, total_cobrado: true, total_lista: true, total_descuento: true, cantidad_asistentes: true, creado_en: true },
  });
  const ids = ventas.map((v) => v.id);

  const ingreso = ventas.reduce((a, v) => a + v.total_cobrado, 0);
  const asistentes = ventas.reduce((a, v) => a + v.cantidad_asistentes, 0);
  const totalLista = ventas.reduce((a, v) => a + v.total_lista, 0);
  const valorNoCobrado = ventas.reduce((a, v) => a + v.total_descuento, 0);

  // Por tipo de visitante
  const detalle = ids.length
    ? await prisma.ventaDetalle.findMany({ where: { venta_id: { in: ids } }, include: { tipo_visitante: true } })
    : [];
  const tipoAcc = new Map<string, { tipo: string; cantidad: number; cortesias: number; total: number }>();
  const claseAcc = new Map<string, { clase: string; personas: number; noCobrado: number; orden: number }>();
  let personasCortesia = 0;

  for (const d of detalle) {
    const acc = tipoAcc.get(d.tipo_visitante.nombre) ?? { tipo: d.tipo_visitante.nombre, cantidad: 0, cortesias: 0, total: 0 };
    acc.cantidad += d.cantidad;
    acc.total += d.valor_cobrado * d.cantidad;

    const esCortesia = d.tipo_linea !== "pago";
    if (esCortesia) {
      acc.cortesias += d.cantidad;
      personasCortesia += d.cantidad;
    }
    tipoAcc.set(d.tipo_visitante.nombre, acc);

    // Cómo entró. Tres familias, y en ese orden se muestran:
    //   0) pagando de verdad
    //   1) con un tipo de tarifa gratis (bono redimido, bebé): no es cortesía de nadie,
    //      así que no se mezcla con las pagadas ni con lo que alguien autorizó regalar
    //   2) por cortesía, que sí lleva motivo y autorización
    const gratisPorTarifa = !esCortesia && d.valor_lista === 0;
    const clase = esCortesia
      ? CLASE[d.tipo_linea] ?? d.tipo_linea
      : gratisPorTarifa
        ? d.tipo_visitante.nombre
        : "Pagadas";
    const orden = esCortesia ? 2 : gratisPorTarifa ? 1 : 0;

    const c = claseAcc.get(clase) ?? { clase, personas: 0, noCobrado: 0, orden };
    c.personas += d.cantidad;
    c.noCobrado += (d.valor_lista - d.valor_cobrado) * d.cantidad;
    claseAcc.set(clase, c);
  }

  // Por medio de pago
  const pagos = ids.length
    ? await prisma.ventaPago.groupBy({ by: ["medio_pago_id"], where: { venta_id: { in: ids } }, _sum: { monto: true } })
    : [];
  const medios = await prisma.medioPago.findMany();
  const medioMap = new Map(medios.map((m) => [m.id, m.nombre]));
  const porMedio = pagos.map((p) => ({ medio: medioMap.get(p.medio_pago_id) ?? "?", total: p._sum.monto ?? 0 }));

  // Por día de semana y por hora (Bogotá)
  const diaAcc = new Array(7).fill(0);
  const horaAcc = new Map<number, number>();
  for (const v of ventas) {
    const b = aBogota(v.creado_en);
    diaAcc[b.getUTCDay()] += v.total_cobrado;
    horaAcc.set(b.getUTCHours(), (horaAcc.get(b.getUTCHours()) ?? 0) + v.total_cobrado);
  }

  return {
    numVentas: ventas.length,
    asistentes,
    ingreso,
    ticketPromedio: asistentes ? Math.round(ingreso / asistentes) : 0,
    valorNoCobrado,
    pctCortesias: totalLista ? (valorNoCobrado / totalLista) * 100 : 0,
    personasCortesia,
    porTipo: [...tipoAcc.values()].sort((a, b) => b.total - a.total || b.cantidad - a.cantidad),
    // Pagadas, luego las gratis por tarifa, y al final las cortesías por lo que costaron.
    porClase: [...claseAcc.values()]
      .sort((a, b) => a.orden - b.orden || b.noCobrado - a.noCobrado || b.personas - a.personas)
      .map(({ clase, personas, noCobrado }) => ({ clase, personas, noCobrado })),
    porMedio: porMedio.sort((a, b) => b.total - a.total),
    porDiaSemana: diaAcc.map((total, i) => ({ dia: NOMBRES_DIA[i], total })).filter((d) => d.total > 0),
    porHora: [...horaAcc.entries()].map(([hora, total]) => ({ hora, total })).sort((a, b) => a.hora - b.hora),
  };
}

/** Ventas en vivo por mes del año (índice 0 = enero), con filtros opcionales. */
export async function ventasPorMes(anio: number, filtros?: FiltrosVentas): Promise<number[]> {
  const inicio = new Date(`${anio}-01-01T00:00:00-05:00`);
  const fin = new Date(`${anio + 1}-01-01T00:00:00-05:00`);
  const ventas = await prisma.venta.findMany({
    where: whereVentas(inicio, fin, filtros),
    select: { total_cobrado: true, creado_en: true },
  });
  const meses = new Array(12).fill(0);
  for (const v of ventas) {
    const b = aBogota(v.creado_en);
    meses[b.getUTCMonth()] += v.total_cobrado;
  }
  return meses;
}
