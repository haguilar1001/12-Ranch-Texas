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
}

export interface FilaCierre {
  concepto: string;
  cantidad: number;
  /** Valor de lista por unidad. Los descuentos NO se reparten aquí: van en su propia línea. */
  valorUnitario: number;
  valorTotal: number;
}

export interface GrupoManilla {
  tipo: string;
  manillas: number;
  asistentes: number;
}

export interface CierreDia {
  /** Conceptos que cobran: una fila por tipo de visitante y valor unitario. */
  ventas: FilaCierre[];
  /** Lo que entró sin cobrar: cortesías, bonos redimidos, bebés. */
  sinCobro: FilaCierre[];
  /** Personas que entraron, cobradas o no. */
  totalCantidad: number;
  /** Suma de los conceptos a valor de lista, antes de descuentos. */
  totalLista: number;
  /** Lo que se dejó de cobrar por descuentos en líneas de pago. */
  descuentos: number;
  /** Lo que de verdad entró: totalLista − descuentos. */
  totalVenta: number;
  porManilla: GrupoManilla[];
  totalManillas: number;
}

const ETIQUETA_CORTESIA: Record<string, string> = {
  atencion: "Atenciones",
  invitacion: "Invitaciones",
  cortesia: "Cortesías",
};

/**
 * Arma el informe a partir de las líneas del día. Pura: no toca la BD.
 *
 * Criterio de agrupación, igual al informe que se venía llevando a mano:
 * - Un concepto por tipo de visitante y valor unitario de LISTA. Si a un grupo se le
 *   hizo descuento, sigue contando en su concepto a precio lleno y el descuento baja
 *   en una sola línea al final: así se ve cuánto se dejó de cobrar en el día.
 * - Los tipos con tarifa en $ 0 (bebé, bono redimido) y las cortesías se listan aparte,
 *   porque suman personas pero no suman plata.
 */
export function resumirCierre(lineas: LineaCierre[]): CierreDia {
  const ventas = new Map<string, FilaCierre>();
  const sinCobro = new Map<string, FilaCierre>();
  const manillas = new Map<string, GrupoManilla>();

  let totalCantidad = 0;
  let totalLista = 0;
  let descuentos = 0;
  let totalManillas = 0;

  for (const l of lineas) {
    const esCortesia = l.tipo_linea !== "pago";
    totalCantidad += l.cantidad;

    if (esCortesia) {
      const concepto = ETIQUETA_CORTESIA[l.tipo_linea] ?? "Cortesías";
      const f = sinCobro.get(concepto) ?? { concepto, cantidad: 0, valorUnitario: 0, valorTotal: 0 };
      f.cantidad += l.cantidad;
      sinCobro.set(concepto, f);
    } else if (l.valor_lista === 0) {
      // Tarifa en cero: entra, genera manilla, pero no suma plata.
      const f = sinCobro.get(l.tipo_visitante) ?? { concepto: l.tipo_visitante, cantidad: 0, valorUnitario: 0, valorTotal: 0 };
      f.cantidad += l.cantidad;
      sinCobro.set(l.tipo_visitante, f);
    } else {
      const clave = `${l.tipo_visitante}|${l.valor_lista}`;
      const f = ventas.get(clave) ?? {
        concepto: l.tipo_visitante,
        cantidad: 0,
        valorUnitario: l.valor_lista,
        valorTotal: 0,
      };
      f.cantidad += l.cantidad;
      f.valorTotal += l.cantidad * l.valor_lista;
      ventas.set(clave, f);

      totalLista += l.cantidad * l.valor_lista;
      descuentos += (l.valor_lista - l.valor_cobrado) * l.cantidad;
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
    totalLista,
    descuentos,
    totalVenta: totalLista - descuentos,
    porManilla: [...manillas.values()].sort((a, b) => b.asistentes - a.asistentes),
    totalManillas,
  };
}

export interface EncabezadoCierre {
  ventasCompletadas: number;
  ventasAnuladas: number;
  turnos: { caja: string; cajero: string; estado: string; ventas: number; recaudado: number }[];
  porMedioPago: { medio: string; monto: number }[];
}

/** Trae las líneas del día (ventas completadas) y arma el informe. */
export async function cierreDelDia(desde: Date, hasta: Date): Promise<CierreDia & EncabezadoCierre> {
  const [detalle, ventasDelDia, pagos] = await Promise.all([
    prisma.ventaDetalle.findMany({
      where: { venta: { estado: "completada", creado_en: { gte: desde, lt: hasta } } },
      select: {
        tipo_linea: true,
        cantidad: true,
        valor_lista: true,
        valor_cobrado: true,
        tipo_visitante: { select: { nombre: true, codigo: true } },
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
      select: { monto: true, medio_pago: { select: { nombre: true } } },
    }),
  ]);

  const resumen = resumirCierre(
    detalle.map((d) => ({
      tipo_visitante: d.tipo_visitante.nombre,
      tipo_linea: d.tipo_linea,
      cantidad: d.cantidad,
      valor_lista: d.valor_lista,
      valor_cobrado: d.valor_cobrado,
      // Regla del negocio: el bebé entra en brazos y no lleva manilla.
      genera_manilla: d.tipo_visitante.codigo !== "bebe",
    })),
  );

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

  const medios = new Map<string, number>();
  for (const p of pagos) {
    medios.set(p.medio_pago.nombre, (medios.get(p.medio_pago.nombre) ?? 0) + p.monto);
  }

  return {
    ...resumen,
    ventasCompletadas: completadas,
    ventasAnuladas: anuladas,
    turnos: [...porTurno.values()].sort((a, b) => b.recaudado - a.recaudado),
    porMedioPago: [...medios.entries()].map(([medio, monto]) => ({ medio, monto })).sort((a, b) => b.monto - a.monto),
  };
}
