import { prisma } from "../db";

// Indicadores de mantenimiento de un año, a partir de las órdenes realizadas.

export interface OrdenIndicador {
  tipo: "preventivo" | "correctivo";
  costo: number;
  fecha_programada: Date | null;
  fecha_realizada: Date | null;
  horas_fuera_servicio: number | null;
  equipo: string;
  grupo: string;
}

export interface IndicadoresMantenimiento {
  ordenes: number;
  preventivos: number;
  correctivos: number;
  costoTotal: number;
  costoPreventivo: number;
  costoCorrectivo: number;
  /** Preventivos hechos a más tardar el día programado ÷ preventivos hechos. */
  cumplimiento: number | null;
  /** Promedio de horas que un equipo estuvo parado por un correctivo. */
  horasParadoPromedio: number | null;
  porGrupo: { grupo: string; costo: number; ordenes: number }[];
  topEquipos: { equipo: string; costo: number; correctivos: number }[];
  porMes: { mes: number; preventivo: number; correctivo: number }[];
}

export function calcularIndicadores(ordenes: OrdenIndicador[]): IndicadoresMantenimiento {
  const prev = ordenes.filter((o) => o.tipo === "preventivo"), corr = ordenes.filter((o) => o.tipo === "correctivo");
  const suma = (l: OrdenIndicador[]) => l.reduce((t, o) => t + o.costo, 0);
  const conFecha = prev.filter((o) => o.fecha_programada && o.fecha_realizada);
  const aTiempo = conFecha.filter((o) => o.fecha_realizada!.getTime() <= o.fecha_programada!.getTime() + 86_400_000).length;
  const paradas = corr.map((o) => o.horas_fuera_servicio).filter((h): h is number => h != null);
  const agrupar = <K extends string>(clave: (o: OrdenIndicador) => K) => {
    const m = new Map<K, OrdenIndicador[]>();
    for (const o of ordenes) m.set(clave(o), [...(m.get(clave(o)) ?? []), o]);
    return m;
  };
  const porMes = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, preventivo: 0, correctivo: 0 }));
  for (const o of ordenes) if (o.fecha_realizada) porMes[new Date(o.fecha_realizada.getTime() - 5 * 3600_000).getUTCMonth()][o.tipo] += o.costo;
  return {
    ordenes: ordenes.length, preventivos: prev.length, correctivos: corr.length,
    costoTotal: suma(ordenes), costoPreventivo: suma(prev), costoCorrectivo: suma(corr),
    cumplimiento: conFecha.length ? aTiempo / conFecha.length : null,
    horasParadoPromedio: paradas.length ? paradas.reduce((a, b) => a + b, 0) / paradas.length : null,
    porGrupo: [...agrupar((o) => o.grupo).entries()].map(([grupo, l]) => ({ grupo, costo: suma(l), ordenes: l.length })).sort((a, b) => b.costo - a.costo),
    topEquipos: [...agrupar((o) => o.equipo).entries()].map(([equipo, l]) => ({ equipo, costo: suma(l), correctivos: l.filter((o) => o.tipo === "correctivo").length }))
      .sort((a, b) => b.costo - a.costo || b.correctivos - a.correctivos).slice(0, 10),
    porMes,
  };
}

export async function indicadoresMantenimiento(anio: number): Promise<IndicadoresMantenimiento> {
  const ordenes = await prisma.mantenimientoEquipo.findMany({
    where: { estado: "realizado", fecha_realizada: { gte: new Date(`${anio}-01-01T00:00:00-05:00`), lt: new Date(`${anio + 1}-01-01T00:00:00-05:00`) } },
    select: { tipo: true, costo: true, fecha_programada: true, fecha_realizada: true, horas_fuera_servicio: true, equipo: { select: { nombre: true, codigo: true, categoria: { select: { nombre: true } } } } },
  });
  return calcularIndicadores(ordenes.map((o) => ({
    tipo: o.tipo, costo: o.costo, fecha_programada: o.fecha_programada, fecha_realizada: o.fecha_realizada, horas_fuera_servicio: o.horas_fuera_servicio,
    equipo: o.equipo.codigo ? `${o.equipo.nombre} (${o.equipo.codigo})` : o.equipo.nombre, grupo: o.equipo.categoria.nombre,
  })));
}
