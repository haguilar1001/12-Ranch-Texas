// Relación de ATENCIONES e INVITACIONES (y descuentos): quién autorizó, con qué motivo
// y cuánto se dejó de cobrar. Es el reporte de control de la plata que no entró a caja.
//
// La agregación es PURA (`resumirCortesias`) para poder probarla sin BD; la consulta
// vive aparte en `relacionCortesias`.

import { prisma } from "../db";

export type TipoCortesia = "atencion" | "invitacion" | "cortesia" | "descuento";

export interface LineaCortesia {
  fecha: Date;
  numero_venta: number;
  caja: string;
  cajero: string;
  tipo: TipoCortesia;
  tipo_visitante: string;
  cantidad: number;
  valor_lista: number; // por unidad
  valor_cobrado: number; // por unidad
  no_cobrado: number; // (lista − cobrado) × cantidad
  motivo: string;
  autoriza: string;
}

export interface ResumenCortesias {
  lineas: LineaCortesia[];
  totalNoCobrado: number;
  totalPersonas: number;
  porTipo: { tipo: TipoCortesia; personas: number; noCobrado: number }[];
  porMotivo: { motivo: string; personas: number; noCobrado: number }[];
  porAutoriza: { autoriza: string; personas: number; noCobrado: number }[];
}

/** Agrupa la relación por tipo, motivo y autorizador. Pura: no toca la BD. */
export function resumirCortesias(lineas: LineaCortesia[]): ResumenCortesias {
  const porTipo = new Map<TipoCortesia, { tipo: TipoCortesia; personas: number; noCobrado: number }>();
  const porMotivo = new Map<string, { motivo: string; personas: number; noCobrado: number }>();
  const porAutoriza = new Map<string, { autoriza: string; personas: number; noCobrado: number }>();

  let totalNoCobrado = 0;
  let totalPersonas = 0;

  for (const l of lineas) {
    totalNoCobrado += l.no_cobrado;
    totalPersonas += l.cantidad;

    const t = porTipo.get(l.tipo) ?? { tipo: l.tipo, personas: 0, noCobrado: 0 };
    t.personas += l.cantidad;
    t.noCobrado += l.no_cobrado;
    porTipo.set(l.tipo, t);

    const m = porMotivo.get(l.motivo) ?? { motivo: l.motivo, personas: 0, noCobrado: 0 };
    m.personas += l.cantidad;
    m.noCobrado += l.no_cobrado;
    porMotivo.set(l.motivo, m);

    const a = porAutoriza.get(l.autoriza) ?? { autoriza: l.autoriza, personas: 0, noCobrado: 0 };
    a.personas += l.cantidad;
    a.noCobrado += l.no_cobrado;
    porAutoriza.set(l.autoriza, a);
  }

  const porNoCobrado = <T extends { noCobrado: number }>(a: T, b: T) => b.noCobrado - a.noCobrado;

  return {
    lineas: [...lineas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime()),
    totalNoCobrado,
    totalPersonas,
    porTipo: [...porTipo.values()].sort(porNoCobrado),
    porMotivo: [...porMotivo.values()].sort(porNoCobrado),
    porAutoriza: [...porAutoriza.values()].sort(porNoCobrado),
  };
}

export interface FiltrosCortesias {
  cajaId?: string;
  cajeroId?: string;
  /** Qué incluir. Por defecto, todo. */
  tipos?: TipoCortesia[];
}

const SIN_MOTIVO = "(sin motivo)";
const SIN_AUTORIZA = "(sin autorización)";

/**
 * Trae el detalle de CORTESÍAS del período: atenciones, invitaciones y cortesías.
 *
 * Los descuentos NO entran aquí aunque también sean plata que no se cobró: una rebaja
 * de tarifa es una decisión de caja (el grupo pagó, solo que menos) y vive en el informe
 * de cierre del día, con su motivo y quién la autorizó. Aquí solo lo que entró gratis.
 */
export async function relacionCortesias(
  desde: Date,
  hasta: Date,
  filtros?: FiltrosCortesias,
): Promise<ResumenCortesias> {
  const detalle = await prisma.ventaDetalle.findMany({
    where: {
      venta: {
        estado: "completada",
        creado_en: { gte: desde, lt: hasta },
        ...(filtros?.cajeroId ? { usuario_id: filtros.cajeroId } : {}),
        ...(filtros?.cajaId ? { turno: { caja_id: filtros.cajaId } } : {}),
      },
      tipo_linea: { in: ["atencion", "invitacion", "cortesia"] },
    },
    include: {
      tipo_visitante: { select: { nombre: true } },
      motivo_cortesia: { select: { nombre: true } },
      venta: {
        select: {
          creado_en: true,
          numero_venta: true,
          usuario: { select: { nombre: true } },
          turno: { select: { caja: { select: { nombre: true } } } },
        },
      },
    },
    orderBy: { creado_en: "desc" },
  });

  // "autorizado_por" guarda hoy un id del catálogo de autorizadores; las ventas
  // anteriores al catálogo guardan un id de usuario. Se buscan en las dos tablas.
  const idsAutoriza = [...new Set(detalle.map((d) => d.autorizado_por).filter((x): x is string => !!x))];
  const [autorizadores, usuarios] = idsAutoriza.length
    ? await Promise.all([
        prisma.autorizadorCortesia.findMany({ where: { id: { in: idsAutoriza } }, select: { id: true, nombre: true } }),
        prisma.usuario.findMany({ where: { id: { in: idsAutoriza } }, select: { id: true, nombre: true } }),
      ])
    : [[], []];
  const nombrePorId = new Map([...usuarios, ...autorizadores].map((u) => [u.id, u.nombre]));

  const permitido = filtros?.tipos;

  const lineas: LineaCortesia[] = [];
  for (const d of detalle) {
    const tipo: TipoCortesia = d.tipo_linea === "pago" ? "descuento" : (d.tipo_linea as TipoCortesia);
    if (permitido && !permitido.includes(tipo)) continue;

    lineas.push({
      fecha: d.venta.creado_en,
      numero_venta: d.venta.numero_venta,
      caja: d.venta.turno?.caja?.nombre ?? "—",
      cajero: d.venta.usuario?.nombre ?? "—",
      tipo,
      tipo_visitante: d.tipo_visitante.nombre,
      cantidad: d.cantidad,
      valor_lista: d.valor_lista,
      valor_cobrado: d.valor_cobrado,
      no_cobrado: (d.valor_lista - d.valor_cobrado) * d.cantidad,
      motivo: d.motivo_cortesia?.nombre ?? d.motivo_descuento ?? SIN_MOTIVO,
      autoriza: (d.autorizado_por && nombrePorId.get(d.autorizado_por)) || SIN_AUTORIZA,
    });
  }

  return resumirCortesias(lineas);
}
