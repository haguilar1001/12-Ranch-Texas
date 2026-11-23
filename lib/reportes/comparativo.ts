import { prisma } from "../db";

// Comparativos año vs. año uniendo dos fuentes:
//  - `ventas_historicas`: venta agregada por línea (Excel de operación + ajustes de los cuadros
//    "mes x producto" de la gerencia, ver scripts/cuadrar-cuadro-mes-producto.ts).
//  - Taquilla en vivo (`ventas` completadas, sin cajas de prueba).
//  - Ventas que no pasan por taquilla (`ventas_otras` activas: arriendos, chucherías…), que se
//    suman como una línea más del histórico.
//
// Regla de CORTE POR MES: la taquilla vende ENTRADAS y EVENTOS. Desde el PRIMER MES COMPLETO de
// taquilla (el mes siguiente a la primera venta real; la taquilla arrancó el 12-sep-2026, así que
// desde octubre) esas dos líneas salen de la taquilla; antes, del histórico. El mes de arranque se
// toma del histórico porque la taquilla no lo cubre entero. Las demás líneas (ARRIENDOS,
// CHUCHERÍAS…) siempre salen del histórico. Así ningún mes se cuenta dos veces.

export const LINEAS_TAQUILLA = ["ENTRADAS", "EVENTOS"] as const;
export type LineaTaquilla = (typeof LINEAS_TAQUILLA)[number];

/** Tipos de visitante de taquilla que se reportan en la línea EVENTOS (el resto es ENTRADAS). */
const TIPOS_EVENTO = new Set(["EVENTOS VARIOS"]);

export type FuenteMes = "historico" | "taquilla" | null;

export interface InicioTaquilla { anio: number; mes: number }

const esLineaTaquilla = (p: string): p is LineaTaquilla => (LINEAS_TAQUILLA as readonly string[]).includes(p);

/** ¿La taquilla en vivo cuenta para este filtro de producto? */
export function incluyeTaquilla(producto?: string): boolean {
  return !producto || esLineaTaquilla(producto);
}

/** ¿El mes ya es posterior al de arranque de la taquilla (mes completo)? */
export function mesUsaTaquilla(inicio: InicioTaquilla | null, anio: number, mes: number): boolean {
  return !!inicio && anio * 12 + mes > inicio.anio * 12 + inicio.mes;
}

/**
 * Valor de un mes: histórico de todas las líneas, salvo ENTRADAS/EVENTOS en los meses de taquilla,
 * que se reemplazan por la taquilla. `producto` filtra a una sola línea.
 */
export function combinarMes(
  historico: Record<string, number>,
  taquilla: Record<LineaTaquilla, number>,
  usaTaquilla: boolean,
  producto?: string,
): { valor: number; fuente: FuenteMes } {
  let hist = 0;
  for (const [linea, v] of Object.entries(historico)) {
    if (producto && linea !== producto) continue;
    if (usaTaquilla && esLineaTaquilla(linea)) continue;
    hist += v;
  }
  let taq = 0;
  if (usaTaquilla) {
    for (const linea of LINEAS_TAQUILLA) if (!producto || linea === producto) taq += taquilla[linea] ?? 0;
  }
  const valor = hist + taq;
  const fuente: FuenteMes = usaTaquilla && incluyeTaquilla(producto) ? "taquilla" : valor ? "historico" : null;
  return { valor, fuente };
}

/** Mes (hora Bogotá) de la primera venta real de taquilla, o null si aún no hay. */
export async function inicioTaquilla(): Promise<InicioTaquilla | null> {
  const v = await prisma.venta.findFirst({
    where: { estado: "completada", turno: { caja: { es_prueba: false } } },
    orderBy: { creado_en: "asc" },
    select: { creado_en: true },
  });
  if (!v) return null;
  const b = new Date(v.creado_en.getTime() - 5 * 3600000);
  return { anio: b.getUTCFullYear(), mes: b.getUTCMonth() + 1 };
}

/** Taquilla por mes y línea (ENTRADAS / EVENTOS), sin cajas de prueba. */
export async function taquillaPorMesYLinea(anio: number): Promise<Record<LineaTaquilla, number>[]> {
  const detalle = await prisma.ventaDetalle.findMany({
    where: {
      venta: {
        estado: "completada",
        creado_en: { gte: new Date(`${anio}-01-01T00:00:00-05:00`), lt: new Date(`${anio + 1}-01-01T00:00:00-05:00`) },
        turno: { caja: { es_prueba: false } },
      },
    },
    select: { cantidad: true, valor_cobrado: true, tipo_visitante: { select: { nombre: true } }, venta: { select: { creado_en: true } } },
  });
  const meses = Array.from({ length: 12 }, () => ({ ENTRADAS: 0, EVENTOS: 0 }));
  for (const d of detalle) {
    const i = new Date(d.venta.creado_en.getTime() - 5 * 3600000).getUTCMonth();
    const linea: LineaTaquilla = TIPOS_EVENTO.has(d.tipo_visitante.nombre.trim().toUpperCase()) ? "EVENTOS" : "ENTRADAS";
    meses[i][linea] += d.cantidad * d.valor_cobrado;
  }
  return meses;
}

export async function productosVentaHistorica(): Promise<string[]> {
  const [hist, otras] = await Promise.all([
    prisma.ventaHistorica.findMany({ distinct: ["producto"], select: { producto: true } }),
    prisma.ventaOtra.findMany({ where: { estado: "activa" }, distinct: ["linea"], select: { linea: true } }),
  ]);
  return [...new Set([...hist.map((r) => r.producto), ...otras.map((o) => o.linea), ...LINEAS_TAQUILLA])].sort();
}

/** Histórico + ventas fuera de taquilla, por mes y línea. */
async function historicoPorMesYLinea(anio: number): Promise<Record<string, number>[]> {
  const [rows, otras] = await Promise.all([
    prisma.ventaHistorica.groupBy({ by: ["mes", "producto"], where: { anio }, _sum: { valor: true } }),
    prisma.ventaOtra.findMany({
      where: { estado: "activa", fecha: { gte: new Date(Date.UTC(anio, 0, 1)), lt: new Date(Date.UTC(anio + 1, 0, 1)) } },
      select: { fecha: true, linea: true, valor: true },
    }),
  ]);
  const meses: Record<string, number>[] = Array.from({ length: 12 }, () => ({}));
  const sumar = (i: number, linea: string, v: number) => { meses[i][linea] = (meses[i][linea] ?? 0) + v; };
  for (const r of rows) sumar(r.mes - 1, r.producto, r._sum.valor ?? 0);
  for (const o of otras) sumar(o.fecha.getUTCMonth(), o.linea, o.valor);
  return meses;
}

/** Meses combinados (histórico + taquilla) de un año. */
async function mesesCombinados(anio: number, producto: string | undefined, inicio: InicioTaquilla | null) {
  const [hist, taq] = await Promise.all([
    historicoPorMesYLinea(anio),
    inicio && anio >= inicio.anio ? taquillaPorMesYLinea(anio) : Promise.resolve(null),
  ]);
  return hist.map((h, i) =>
    combinarMes(h, taq?.[i] ?? { ENTRADAS: 0, EVENTOS: 0 }, mesUsaTaquilla(inicio, anio, i + 1), producto),
  );
}

/** Años con datos (histórico o taquilla) y su total combinado. */
export async function resumenAnual(producto?: string): Promise<{ anio: number; total: number }[]> {
  const inicio = await inicioTaquilla();
  const anios = new Set<number>();
  const hist = await prisma.ventaHistorica.groupBy({ by: ["anio"], where: producto ? { producto } : {} });
  hist.forEach((r) => anios.add(r.anio));
  const otras = await prisma.ventaOtra.findMany({ where: { estado: "activa", ...(producto ? { linea: producto } : {}) }, select: { fecha: true } });
  otras.forEach((o) => anios.add(o.fecha.getUTCFullYear()));
  if (inicio && incluyeTaquilla(producto)) {
    const hoy = new Date(Date.now() - 5 * 3600000).getUTCFullYear();
    for (let a = inicio.anio; a <= hoy; a++) anios.add(a);
  }
  const lista = [...anios].sort((a, b) => a - b);
  const totales = await Promise.all(lista.map((a) => mesesCombinados(a, producto, inicio)));
  return lista.map((anio, i) => ({ anio, total: totales[i].reduce((s, m) => s + m.valor, 0) }));
}

export interface FilaMesComparativo {
  mes: number;
  anterior: number;
  actual: number;
  fuenteAnterior: FuenteMes;
  fuenteActual: FuenteMes;
}

export interface Comparativo {
  meses: FilaMesComparativo[];
  totalActual: number;
  totalAnterior: number;
}

/** Comparativo mensual del año vs. el año anterior (opcionalmente por producto). */
export async function comparativoAnual(anio: number, producto?: string): Promise<Comparativo> {
  const inicio = await inicioTaquilla();
  const [act, ant] = await Promise.all([mesesCombinados(anio, producto, inicio), mesesCombinados(anio - 1, producto, inicio)]);
  const meses = act.map((m, i) => ({
    mes: i + 1,
    actual: m.valor,
    anterior: ant[i].valor,
    fuenteActual: m.fuente,
    fuenteAnterior: ant[i].fuente,
  }));
  return {
    meses,
    totalActual: meses.reduce((a, m) => a + m.actual, 0),
    totalAnterior: meses.reduce((a, m) => a + m.anterior, 0),
  };
}
