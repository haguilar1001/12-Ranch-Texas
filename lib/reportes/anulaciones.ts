// Relación de VENTAS ANULADAS: quién la vendió, quién la anuló, con qué motivo y
// cuánto valía. Control sobre plata que se registró y después se cayó — sea porque
// se corrigió (queda reemplazada por otra venta) o porque se anuló sin más.

import { prisma } from "../db";

export interface LineaAnulacion {
  fecha: Date;
  numero_venta: number;
  caja: string;
  vendio: string;
  anulo: string;
  motivo: string;
  total_cobrado: number;
  cantidad_asistentes: number;
  comprador: string;
  /** Si la anulación fue por una corrección, el n.° de la venta que la reemplazó. */
  reemplazada_por: number | null;
}

export interface ResumenAnulaciones {
  lineas: LineaAnulacion[];
  totalAnulado: number;
  totalVentas: number;
  totalAsistentes: number;
  porUsuario: { usuario: string; ventas: number; valor: number }[];
  porMotivo: { motivo: string; ventas: number; valor: number }[];
}

/** Agrupa por quién anuló y por motivo. Pura: no toca la BD. */
export function resumirAnulaciones(lineas: LineaAnulacion[]): ResumenAnulaciones {
  const porUsuario = new Map<string, { usuario: string; ventas: number; valor: number }>();
  const porMotivo = new Map<string, { motivo: string; ventas: number; valor: number }>();

  let totalAnulado = 0;
  let totalAsistentes = 0;

  for (const l of lineas) {
    totalAnulado += l.total_cobrado;
    totalAsistentes += l.cantidad_asistentes;

    const u = porUsuario.get(l.anulo) ?? { usuario: l.anulo, ventas: 0, valor: 0 };
    u.ventas += 1;
    u.valor += l.total_cobrado;
    porUsuario.set(l.anulo, u);

    const m = porMotivo.get(l.motivo) ?? { motivo: l.motivo, ventas: 0, valor: 0 };
    m.ventas += 1;
    m.valor += l.total_cobrado;
    porMotivo.set(l.motivo, m);
  }

  const porValor = <T extends { valor: number }>(a: T, b: T) => b.valor - a.valor;

  return {
    lineas: [...lineas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime()),
    totalAnulado,
    totalVentas: lineas.length,
    totalAsistentes,
    porUsuario: [...porUsuario.values()].sort(porValor),
    porMotivo: [...porMotivo.values()].sort(porValor),
  };
}

export interface FiltrosAnulaciones {
  cajaId?: string;
  /** Quién ANULÓ (no quién vendió) — es el filtro útil aquí: "qué anuló Fulano". */
  anuloId?: string;
}

const SIN_MOTIVO = "(sin motivo)";
const SIN_USUARIO = "(usuario no encontrado)";

/**
 * Trae el detalle de ventas ANULADAS del período, filtrando por cuándo se anuló
 * (no por cuándo se vendió originalmente): es lo que responde "qué se cayó esta
 * semana", que es la pregunta de un informe de anulaciones.
 */
export async function relacionAnulaciones(
  desde: Date,
  hasta: Date,
  filtros?: FiltrosAnulaciones,
): Promise<ResumenAnulaciones> {
  const ventas = await prisma.venta.findMany({
    where: {
      estado: "anulada",
      anulada_en: { gte: desde, lt: hasta },
      ...(filtros?.anuloId ? { anulada_por: filtros.anuloId } : {}),
      ...(filtros?.cajaId ? { turno: { caja_id: filtros.cajaId } } : {}),
    },
    select: {
      id: true,
      numero_venta: true,
      total_cobrado: true,
      cantidad_asistentes: true,
      comprador_nombre: true,
      motivo_anulacion: true,
      anulada_en: true,
      anulada_por: true,
      usuario: { select: { nombre: true } },
      turno: { select: { caja: { select: { nombre: true } } } },
      correccion: { select: { numero_venta: true } },
    },
    orderBy: { anulada_en: "desc" },
  });

  const idsAnulo = [...new Set(ventas.map((v) => v.anulada_por).filter((x): x is string => !!x))];
  const usuariosAnulo = idsAnulo.length
    ? await prisma.usuario.findMany({ where: { id: { in: idsAnulo } }, select: { id: true, nombre: true } })
    : [];
  const nombrePorId = new Map(usuariosAnulo.map((u) => [u.id, u.nombre]));

  const lineas: LineaAnulacion[] = ventas.map((v) => ({
    fecha: v.anulada_en ?? new Date(0),
    numero_venta: v.numero_venta,
    caja: v.turno?.caja?.nombre ?? "—",
    vendio: v.usuario?.nombre ?? "—",
    anulo: (v.anulada_por && nombrePorId.get(v.anulada_por)) || SIN_USUARIO,
    motivo: v.motivo_anulacion?.trim() || SIN_MOTIVO,
    total_cobrado: v.total_cobrado,
    cantidad_asistentes: v.cantidad_asistentes,
    comprador: v.comprador_nombre?.trim() || "—",
    reemplazada_por: v.correccion?.numero_venta ?? null,
  }));

  return resumirAnulaciones(lineas);
}
