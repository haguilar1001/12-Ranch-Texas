import { prisma } from "./db";
import { indicadoresVentas, type IndicadoresVentas } from "./reportes/ventas";
import { comparativoAnual, ventaPorProductoMes, type Comparativo } from "./reportes/comparativo";
import { estadoResultados, aniosConEstadoResultados } from "./reportes/estado-resultados";
import { inicioDelDiaOperativo, fechaBogota } from "./tiempo";

// Datos del tablero de Inicio: la realidad del parque en una pantalla. Cada bloque se pide solo si
// el rol lo puede ver; lo que no aplica llega en null y la página no lo dibuja.

export interface DatosInicio {
  hoy: { ventas: IndicadoresVentas; ayer: IndicadoresVentas; aforo: number; aforoMax: number | null } | null;
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
  equipos: { porEstado: Record<string, number>; mantVencidos: number } | null;
  animales: { porEstado: Record<string, number>; sinUbicar: number } | null;
  vehiculos: { pendientes: number } | null;
}

export async function datosInicio(permisos: { cifras: boolean; animales: boolean; equipos: boolean; vehiculos: boolean }): Promise<DatosInicio> {
  const anio = +fechaBogota().slice(0, 4);
  const inicioHoy = inicioDelDiaOperativo();
  const finHoy = new Date(inicioHoy.getTime() + 86_400_000);
  const inicioAyer = new Date(inicioHoy.getTime() - 86_400_000);

  const hoyP = permisos.cifras
    ? (async () => {
        const [ventas, ayer, ep] = await Promise.all([
          indicadoresVentas(inicioHoy, finHoy),
          indicadoresVentas(inicioAyer, inicioHoy),
          prisma.puntoControl.findFirst({ where: { nombre: { equals: "Entrada Principal", mode: "insensitive" } } }),
        ]);
        let aforo = 0;
        if (ep) {
          const [e, s] = await Promise.all([
            prisma.acceso.count({ where: { punto_control_id: ep.id, resultado: "permitido", sentido: "entrada", escaneado_en: { gte: inicioHoy } } }),
            prisma.acceso.count({ where: { punto_control_id: ep.id, resultado: "permitido", sentido: "salida", escaneado_en: { gte: inicioHoy } } }),
          ]);
          aforo = Math.max(0, e - s);
        }
        return { ventas, ayer, aforo, aforoMax: ep?.aforo_maximo ?? null };
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

  const resultadoP = permisos.cifras
    ? (async () => {
        const anios = await aniosConEstadoResultados();
        const a = anios.includes(anio) ? anio : anios[0];
        if (!a) return null;
        const er = await estadoResultados(a);
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
          const [g, venc] = await Promise.all([
            prisma.equipo.groupBy({ by: ["estado"], where: { activo: true }, _sum: { cantidad: true } }),
            prisma.mantenimientoEquipo.count({ where: { estado: "programado", fecha_programada: { lt: inicioHoy } } }),
          ]);
          return { porEstado: Object.fromEntries(g.map((x) => [x.estado, x._sum.cantidad ?? 0])), mantVencidos: venc };
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

  return { hoy, diario, comparativo, anio, resultado, mezcla, equipos, animales, vehiculos };
}
