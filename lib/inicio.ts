import { prisma } from "./db";
import { indicadoresVentas, type IndicadoresVentas } from "./reportes/ventas";
import { comparativoAnual, ventaPorProductoMes, type Comparativo } from "./reportes/comparativo";
import { estadoResultados, aniosConEstadoResultados } from "./reportes/estado-resultados";
import { analisisFinanciero, type Analisis } from "./analisis/financiero";
import { inicioDelDiaOperativo, fechaBogota } from "./tiempo";
import { alertasEquipos } from "./equipos/mantenimiento";

// Datos del tablero de Inicio: la realidad del parque en una pantalla. Cada bloque se pide solo si
// el rol lo puede ver; lo que no aplica llega en null y la página no lo dibuja.

export interface DatosInicio {
  /** Indicadores del periodo elegido (hoy o el mes en curso) contra su base de comparación. */
  hoy: {
    periodo: "dia" | "mes";
    titulo: string; // "Hoy" · "Noviembre (1 al 24)"
    textoBase: string; // "vs ayer" · "vs 1 al 24 de octubre"
    ventas: IndicadoresVentas;
    ayer: IndicadoresVentas; // la base de comparación
    diasConVenta: number; // solo en mes
    aforo: number;
    aforoMax: number | null;
  } | null;
  diario: { fecha: string; ingreso: number; entradas: number }[] | null; // últimos 30 días operativos
  comparativo: Comparativo | null;
  anio: number;
  resultado: {
    anio: number;
    meses: { mes: number; ingresos: number; costos: number; utilidad: number }[];
    ingresos: number; utilidad: number; margen: number;
    gastos: number; presupuestoGastos: number | null;
  } | null;
  mezcla: { producto: string; total: number }[] | null;
  /** Análisis financiero del año del último estado de resultados (equilibrio, alertas…). */
  analisis: Analisis | null;
  equipos: { porEstado: Record<string, number>; mantVencidos: number; mantProximos: number; fallas: number; fallasCriticas: number } | null;
  animales: { porEstado: Record<string, number>; sinUbicar: number } | null;
  vehiculos: { pendientes: number } | null;
}

const NOMBRE_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * Rango del periodo elegido y su base de comparación.
 *  · día: hoy (día operativo) contra ayer.
 *  · mes: del 1 hasta hoy, contra los mismos días del mes anterior (si el mes anterior es más
 *    corto, hasta su último día). Así un mes a medias no se compara contra un mes completo.
 */
export function rangosPeriodo(periodo: "dia" | "mes", hoy: string, inicioHoy: Date) {
  const finHoy = new Date(inicioHoy.getTime() + 86_400_000);
  if (periodo === "dia") {
    return { desde: inicioHoy, hasta: finHoy, baseDesde: new Date(inicioHoy.getTime() - 86_400_000), baseHasta: inicioHoy, titulo: "Hoy", textoBase: "vs ayer" };
  }
  const [a, m, d] = hoy.split("-").map(Number);
  const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1;
  const diasPrev = new Date(Date.UTC(pa, pm, 0)).getUTCDate();
  const dBase = Math.min(d, diasPrev);
  const f = (y: number, mo: number, dia: number) => new Date(`${y}-${String(mo).padStart(2, "0")}-${String(dia).padStart(2, "0")}T00:00:00-05:00`);
  const nombre = NOMBRE_MES[m - 1], nombrePrev = NOMBRE_MES[pm - 1];
  return {
    desde: f(a, m, 1), hasta: finHoy,
    baseDesde: f(pa, pm, 1), baseHasta: new Date(f(pa, pm, dBase).getTime() + 86_400_000),
    titulo: `${nombre[0].toUpperCase()}${nombre.slice(1)} (${d === 1 ? "día 1" : `1 al ${d}`})`,
    textoBase: `vs ${dBase === 1 ? "el 1" : `1 al ${dBase}`} de ${nombrePrev}`,
  };
}

export async function datosInicio(
  permisos: { cifras: boolean; animales: boolean; equipos: boolean; vehiculos: boolean },
  periodo: "dia" | "mes" = "dia",
): Promise<DatosInicio> {
  const anio = +fechaBogota().slice(0, 4);
  const inicioHoy = inicioDelDiaOperativo();
  const finHoy = new Date(inicioHoy.getTime() + 86_400_000);
  const rango = rangosPeriodo(periodo, fechaBogota(), inicioHoy);

  const hoyP = permisos.cifras
    ? (async () => {
        const [ventas, ayer, ep, fechas] = await Promise.all([
          indicadoresVentas(rango.desde, rango.hasta),
          indicadoresVentas(rango.baseDesde, rango.baseHasta),
          prisma.puntoControl.findFirst({ where: { nombre: { equals: "Entrada Principal", mode: "insensitive" } } }),
          periodo === "mes"
            ? prisma.venta.findMany({ where: { estado: "completada", creado_en: { gte: rango.desde, lt: rango.hasta }, turno: { caja: { es_prueba: false } } }, select: { creado_en: true } })
            : Promise.resolve([] as { creado_en: Date }[]),
        ]);
        const diasConVenta = new Set(fechas.map((v) => fechaBogota(v.creado_en))).size;
        let aforo = 0;
        if (ep) {
          const [e, s] = await Promise.all([
            prisma.acceso.count({ where: { punto_control_id: ep.id, resultado: "permitido", sentido: "entrada", escaneado_en: { gte: inicioHoy } } }),
            prisma.acceso.count({ where: { punto_control_id: ep.id, resultado: "permitido", sentido: "salida", escaneado_en: { gte: inicioHoy } } }),
          ]);
          aforo = Math.max(0, e - s);
        }
        return { periodo, titulo: rango.titulo, textoBase: rango.textoBase, ventas, ayer, diasConVenta, aforo, aforoMax: ep?.aforo_maximo ?? null };
      })()
    : Promise.resolve(null);

  const diarioP = permisos.cifras
    ? (async () => {
        const desde = new Date(inicioHoy.getTime() - 29 * 86_400_000);
        const ventas = await prisma.venta.findMany({
          where: { estado: "completada", creado_en: { gte: desde, lt: finHoy }, turno: { caja: { es_prueba: false } } },
          select: { creado_en: true, total_cobrado: true, cantidad_asistentes: true },
        });
        const dias = Array.from({ length: 30 }, (_, i) => ({ fecha: fechaBogota(new Date(desde.getTime() + i * 86_400_000 + 12 * 3600_000)), ingreso: 0, entradas: 0 }));
        for (const v of ventas) {
          const d = dias.find((x) => x.fecha === fechaBogota(v.creado_en));
          if (d) { d.ingreso += v.total_cobrado; d.entradas += v.cantidad_asistentes; }
        }
        return dias;
      })()
    : Promise.resolve(null);

  let analisis: Analisis | null = null;
  const resultadoP = permisos.cifras
    ? (async () => {
        const anios = await aniosConEstadoResultados();
        const a = anios.includes(anio) ? anio : anios[0];
        if (!a) return null;
        const [er, an] = await Promise.all([estadoResultados(a), analisisFinanciero(a)]);
        analisis = an;
        const f = (k: string) => er.filas.find((x) => x.clave === k)!;
        const ing = f("ingresos"), cv = f("costo_ventas"), gas = f("gastos"), uo = f("utilidad_operacional");
        return {
          anio: a,
          meses: er.mesesCargados.map((m) => ({ mes: m, ingresos: ing.meses[m - 1] ?? 0, costos: (cv.meses[m - 1] ?? 0) + (gas.meses[m - 1] ?? 0), utilidad: uo.meses[m - 1] ?? 0 })),
          ingresos: ing.acumulado, utilidad: uo.acumulado, margen: ing.acumulado ? uo.acumulado / ing.acumulado : 0,
          gastos: gas.acumulado, presupuestoGastos: gas.presupuesto,
        };
      })()
    : Promise.resolve(null);

  const [hoy, diario, comparativo, resultado, mezcla, equipos, animales, vehiculos] = await Promise.all([
    hoyP,
    diarioP,
    permisos.cifras ? comparativoAnual(anio) : Promise.resolve(null),
    resultadoP,
    permisos.cifras ? ventaPorProductoMes(anio).then((r) => r.filas.map((f) => ({ producto: f.producto, total: f.total })).filter((f) => f.total > 0)) : Promise.resolve(null),
    permisos.equipos
      ? (async () => {
          const [g, alertas] = await Promise.all([
            prisma.equipo.groupBy({ by: ["estado"], where: { activo: true }, _sum: { cantidad: true } }),
            alertasEquipos(),
          ]);
          const fallas = alertas.filter((a) => a.tipo === "falla");
          return {
            porEstado: Object.fromEntries(g.map((x) => [x.estado, x._sum.cantidad ?? 0])),
            mantVencidos: alertas.filter((a) => a.tipo === "vencido").length,
            mantProximos: alertas.filter((a) => a.tipo === "proximo").length,
            fallas: fallas.length, fallasCriticas: fallas.filter((a) => a.nivel === "critica").length,
          };
        })()
      : Promise.resolve(null),
    permisos.animales
      ? (async () => {
          const [g, sinUbicar] = await Promise.all([
            prisma.animal.groupBy({ by: ["estado"], where: { activo: true }, _sum: { cantidad: true } }),
            prisma.animal.count({ where: { activo: true, estado: "activo", recinto_id: null } }),
          ]);
          return { porEstado: Object.fromEntries(g.map((x) => [x.estado, x._sum.cantidad ?? 0])), sinUbicar };
        })()
      : Promise.resolve(null),
    permisos.vehiculos ? prisma.solicitudVehiculo.count({ where: { estado: "pendiente" } }).then((pendientes) => ({ pendientes })) : Promise.resolve(null),
  ]);

  return { hoy, diario, comparativo, anio, resultado, mezcla, analisis, equipos, animales, vehiculos };
}
