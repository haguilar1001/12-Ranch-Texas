// INFORME DE CIERRE DEL DÍA: lo que se vendió en la jornada, concepto por concepto,
// con su cantidad, su valor unitario y su valor total, más la agrupación por tipo
// de manilla al final. Es el papel que se firma al cerrar el parque.
//
// La agregación es PURA (`resumirCierre`) para poder probarla sin BD; la consulta
// vive aparte en `cierreDelDia`.

import { prisma } from "../db";

/** Una línea de venta, aplanada para el informe. */
export interface LineaCierre {
  tipo_visitante: string;
  /** "pago" o la clase de cortesía. */
  tipo_linea: string;
  cantidad: number;
  /** Tarifa vigente cuando se vendió, por unidad. */
  valor_lista: number;
  /** Lo que de verdad se cobró por unidad (0 en cortesías, menos que lista si hubo descuento). */
  valor_cobrado: number;
  /** Los bebés entran en brazos: cuentan como asistentes pero no llevan manilla. */
  genera_manilla: boolean;
  motivo_descuento?: string | null;
  autoriza?: string | null;
  /** Caja donde se hizo la venta. Solo se usa para el cuadro por columnas. */
  caja?: string;
}

export interface FilaCierre {
  concepto: string;
  cantidad: number;
  /** Lo que se cobró NETO por unidad: si hubo descuento, ya viene rebajado. */
  valorUnitario: number;
  valorTotal: number;
}

/** Un grupo al que se le cobró por debajo de la tarifa, con su motivo y quién lo autorizó. */
export interface FilaDescuento {
  concepto: string;
  motivo: string;
  autoriza: string;
  personas: number;
  valorLista: number;
  valorCobrado: number;
  /** (lista − cobrado) × personas. */
  noCobrado: number;
}

export interface GrupoManilla {
  tipo: string;
  manillas: number;
  asistentes: number;
}

export interface CierreDia {
  /** Conceptos que cobran: una fila por tipo de visitante y valor NETO unitario. */
  ventas: FilaCierre[];
  /** Lo que entró sin cobrar: cortesías, bonos redimidos, bebés. */
  sinCobro: FilaCierre[];
  /** Personas que entraron, cobradas o no. */
  totalCantidad: number;
  /** Lo que entró a la caja: la suma de los conceptos, ya netos. */
  totalVenta: number;
  /** Cuánto habría entrado a tarifa plena. Solo informativo. */
  totalLista: number;
  /** Diferencia entre lista y neto. Solo informativo: ya está descontada arriba. */
  descuentoTotal: number;
  /** El detalle de los grupos con tarifa rebajada: control de caja, no de cortesías. */
  descuentos: FilaDescuento[];
  porManilla: GrupoManilla[];
  totalManillas: number;
}

const ETIQUETA_CORTESIA: Record<string, string> = {
  atencion: "Atenciones",
  invitacion: "Invitaciones",
  cortesia: "Cortesías",
};

const SIN_MOTIVO = "(sin motivo)";
const SIN_AUTORIZA = "(sin autorización)";

/**
 * A qué concepto del informe pertenece una línea, y a qué valor unitario.
 * Vive aparte para que el cuadro general y el cuadro por caja agrupen IGUAL:
 * si uno cambia de criterio, el otro no se queda atrás.
 */
export function conceptoDe(l: LineaCierre): { concepto: string; valorUnitario: number; cobra: boolean } {
  if (l.tipo_linea !== "pago") {
    return { concepto: ETIQUETA_CORTESIA[l.tipo_linea] ?? "Cortesías", valorUnitario: 0, cobra: false };
  }
  if (l.valor_cobrado === 0) return { concepto: l.tipo_visitante, valorUnitario: 0, cobra: false };
  return { concepto: l.tipo_visitante, valorUnitario: l.valor_cobrado, cobra: true };
}

export interface CeldaCaja {
  cantidad: number;
  valorTotal: number;
}

export interface FilaMatriz {
  concepto: string;
  valorUnitario: number;
  cobra: boolean;
  /** Mismo orden y longitud que `cajas`. */
  celdas: CeldaCaja[];
  cantidad: number;
  valorTotal: number;
}

export interface MatrizCajas {
  /** Solo las cajas que tuvieron movimiento, en orden alfabético. */
  cajas: string[];
  filas: FilaMatriz[];
  totalPorCaja: CeldaCaja[];
  totalCantidad: number;
  totalValor: number;
}

/**
 * El mismo informe pero con una columna por caja: así se ve de dónde salió cada
 * concepto cuando hay varias taquillas abiertas. Pura: no toca la BD.
 */
export function matrizPorCaja(lineas: LineaCierre[]): MatrizCajas {
  const SIN_CAJA = "—";
  const cajas = [...new Set(lineas.map((l) => l.caja ?? SIN_CAJA))].sort((a, b) => a.localeCompare(b, "es"));
  const indice = new Map(cajas.map((c, i) => [c, i]));

  const vacias = () => cajas.map(() => ({ cantidad: 0, valorTotal: 0 }));
  const filas = new Map<string, FilaMatriz>();
  const totalPorCaja = vacias();
  let totalCantidad = 0;
  let totalValor = 0;

  for (const l of lineas) {
    const { concepto, valorUnitario, cobra } = conceptoDe(l);
    const clave = `${concepto}|${valorUnitario}|${cobra}`;
    const fila = filas.get(clave) ?? { concepto, valorUnitario, cobra, celdas: vacias(), cantidad: 0, valorTotal: 0 };

    const i = indice.get(l.caja ?? SIN_CAJA)!;
    const valor = cobra ? l.valor_cobrado * l.cantidad : 0;

    fila.celdas[i].cantidad += l.cantidad;
    fila.celdas[i].valorTotal += valor;
    fila.cantidad += l.cantidad;
    fila.valorTotal += valor;
    filas.set(clave, fila);

    totalPorCaja[i].cantidad += l.cantidad;
    totalPorCaja[i].valorTotal += valor;
    totalCantidad += l.cantidad;
    totalValor += valor;
  }

  return {
    cajas,
    // Primero lo que cobra, de mayor a menor; después lo que entró sin cobrar.
    filas: [...filas.values()].sort(
      (a, b) => Number(b.cobra) - Number(a.cobra) || b.valorTotal - a.valorTotal || b.cantidad - a.cantidad,
    ),
    totalPorCaja,
    totalCantidad,
    totalValor,
  };
}

/**
 * Arma el informe a partir de las líneas del día. Pura: no toca la BD.
 *
 * Criterio de agrupación:
 * - Un concepto por tipo de visitante y valor NETO unitario. Si a un grupo se le
 *   rebajó la tarifa, ese grupo queda en su propio renglón con lo que de verdad se
 *   le cobró, y el total del informe ya es lo que entró a la caja: no hay que restarle
 *   nada abajo. El descuento se explica aparte, que es control de caja.
 * - Los tipos con tarifa en $ 0 (bebé, bono redimido) y las cortesías se listan aparte,
 *   porque suman personas pero no suman plata.
 */
export function resumirCierre(lineas: LineaCierre[]): CierreDia {
  const ventas = new Map<string, FilaCierre>();
  const sinCobro = new Map<string, FilaCierre>();
  const manillas = new Map<string, GrupoManilla>();
  const descuentos = new Map<string, FilaDescuento>();

  let totalCantidad = 0;
  let totalVenta = 0;
  let totalLista = 0;
  let totalManillas = 0;

  for (const l of lineas) {
    const esCortesia = l.tipo_linea !== "pago";
    totalCantidad += l.cantidad;

    const { concepto, valorUnitario, cobra } = conceptoDe(l);
    if (!cobra) {
      const f = sinCobro.get(concepto) ?? { concepto, cantidad: 0, valorUnitario: 0, valorTotal: 0 };
      f.cantidad += l.cantidad;
      sinCobro.set(concepto, f);
    } else {
      const clave = `${concepto}|${valorUnitario}`;
      const f = ventas.get(clave) ?? { concepto, cantidad: 0, valorUnitario, valorTotal: 0 };
      f.cantidad += l.cantidad;
      f.valorTotal += l.cantidad * valorUnitario;
      ventas.set(clave, f);

      totalVenta += l.cantidad * valorUnitario;
      totalLista += l.cantidad * l.valor_lista;
    }

    // Rebaja sobre la tarifa: se anota con su motivo y quién la autorizó.
    if (!esCortesia && l.valor_cobrado < l.valor_lista) {
      const motivo = l.motivo_descuento?.trim() || SIN_MOTIVO;
      const autoriza = l.autoriza?.trim() || SIN_AUTORIZA;
      const clave = `${l.tipo_visitante}|${l.valor_cobrado}|${motivo}|${autoriza}`;
      const d = descuentos.get(clave) ?? {
        concepto: l.tipo_visitante,
        motivo,
        autoriza,
        personas: 0,
        valorLista: l.valor_lista,
        valorCobrado: l.valor_cobrado,
        noCobrado: 0,
      };
      d.personas += l.cantidad;
      d.noCobrado += (l.valor_lista - l.valor_cobrado) * l.cantidad;
      descuentos.set(clave, d);
    }

    // Manillas: por tipo de visitante, coticen o no. Los bebés suman asistentes pero no manilla.
    const g = manillas.get(l.tipo_visitante) ?? { tipo: l.tipo_visitante, manillas: 0, asistentes: 0 };
    g.asistentes += l.cantidad;
    if (l.genera_manilla) {
      g.manillas += l.cantidad;
      totalManillas += l.cantidad;
    }
    manillas.set(l.tipo_visitante, g);
  }

  const porValor = (a: FilaCierre, b: FilaCierre) => b.valorTotal - a.valorTotal || b.cantidad - a.cantidad;

  return {
    ventas: [...ventas.values()].sort(porValor),
    sinCobro: [...sinCobro.values()].sort((a, b) => b.cantidad - a.cantidad),
    totalCantidad,
    totalVenta,
    totalLista,
    descuentoTotal: totalLista - totalVenta,
    descuentos: [...descuentos.values()].sort((a, b) => b.noCobrado - a.noCobrado),
    porManilla: [...manillas.values()].sort((a, b) => b.asistentes - a.asistentes),
    totalManillas,
  };
}

export interface EncabezadoCierre {
  ventasCompletadas: number;
  ventasAnuladas: number;
  turnos: { caja: string; cajero: string; estado: string; ventas: number; recaudado: number }[];
  /** Lo que de verdad entró hoy al parque. */
  porMedioPago: { medio: string; monto: number }[];
  /** Entradas ya pagadas por banco antes de la visita: suman a la venta, no al recaudo. */
  yaRecaudado: { medio: string; monto: number }[];
}

/** Trae las líneas del día (ventas completadas) y arma el informe. */
export async function cierreDelDia(desde: Date, hasta: Date): Promise<CierreDia & EncabezadoCierre & { porCaja: MatrizCajas }> {
  const [detalle, ventasDelDia, pagos] = await Promise.all([
    prisma.ventaDetalle.findMany({
      where: { venta: { estado: "completada", creado_en: { gte: desde, lt: hasta } } },
      select: {
        tipo_linea: true,
        cantidad: true,
        valor_lista: true,
        valor_cobrado: true,
        motivo_descuento: true,
        autorizado_por: true,
        tipo_visitante: { select: { nombre: true, codigo: true } },
        venta: { select: { turno: { select: { caja: { select: { nombre: true } } } } } },
      },
    }),
    prisma.venta.findMany({
      where: { creado_en: { gte: desde, lt: hasta } },
      select: {
        estado: true,
        total_cobrado: true,
        turno: { select: { id: true, estado: true, caja: { select: { nombre: true } }, usuario: { select: { nombre: true } } } },
      },
    }),
    prisma.ventaPago.findMany({
      where: { venta: { estado: "completada", creado_en: { gte: desde, lt: hasta } } },
      select: { monto: true, medio_pago: { select: { nombre: true, afecta_recaudo: true } } },
    }),
  ]);

  // Quién autorizó los descuentos: hoy es un id del catálogo de autorizadores, y en
  // las ventas viejas un id de usuario. Se busca en las dos tablas.
  const idsAutoriza = [...new Set(detalle.map((d) => d.autorizado_por).filter((x): x is string => !!x))];
  const [autorizadores, usuarios] = idsAutoriza.length
    ? await Promise.all([
        prisma.autorizadorCortesia.findMany({ where: { id: { in: idsAutoriza } }, select: { id: true, nombre: true } }),
        prisma.usuario.findMany({ where: { id: { in: idsAutoriza } }, select: { id: true, nombre: true } }),
      ])
    : [[], []];
  const nombrePorId = new Map([...usuarios, ...autorizadores].map((u) => [u.id, u.nombre]));

  const planas: LineaCierre[] = detalle.map((d) => ({
      tipo_visitante: d.tipo_visitante.nombre,
      tipo_linea: d.tipo_linea,
      cantidad: d.cantidad,
      valor_lista: d.valor_lista,
      valor_cobrado: d.valor_cobrado,
      motivo_descuento: d.motivo_descuento,
      autoriza: d.autorizado_por ? nombrePorId.get(d.autorizado_por) ?? null : null,
      caja: d.venta.turno.caja.nombre,
      // Regla del negocio: el bebé entra en brazos y no lleva manilla.
      genera_manilla: d.tipo_visitante.codigo !== "bebe",
    }));

  const resumen = resumirCierre(planas);

  const porTurno = new Map<string, EncabezadoCierre["turnos"][number]>();
  let completadas = 0;
  let anuladas = 0;
  for (const v of ventasDelDia) {
    if (v.estado === "anulada") {
      anuladas++;
      continue;
    }
    completadas++;
    const clave = v.turno.id;
    const t = porTurno.get(clave) ?? {
      caja: v.turno.caja.nombre,
      cajero: v.turno.usuario?.nombre ?? "—",
      estado: v.turno.estado,
      ventas: 0,
      recaudado: 0,
    };
    t.ventas++;
    t.recaudado += v.total_cobrado;
    porTurno.set(clave, t);
  }

  // El prepagado se aparta: es venta del día, pero esa plata ya estaba en el banco.
  const medios = new Map<string, number>();
  const prepagados = new Map<string, number>();
  for (const p of pagos) {
    const donde = p.medio_pago.afecta_recaudo ? medios : prepagados;
    donde.set(p.medio_pago.nombre, (donde.get(p.medio_pago.nombre) ?? 0) + p.monto);
  }

  return {
    ...resumen,
    porCaja: matrizPorCaja(planas),
    ventasCompletadas: completadas,
    ventasAnuladas: anuladas,
    turnos: [...porTurno.values()].sort((a, b) => b.recaudado - a.recaudado),
    porMedioPago: [...medios.entries()].map(([medio, monto]) => ({ medio, monto })).sort((a, b) => b.monto - a.monto),
    yaRecaudado: [...prepagados.entries()].map(([medio, monto]) => ({ medio, monto })).sort((a, b) => b.monto - a.monto),
  };
}
