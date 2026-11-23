import { prisma } from "../db";
import { ventasPorMes } from "./ventas";

// Comparativos año vs. año uniendo dos fuentes:
//  - `ventas_historicas`: venta agregada importada del Excel de operación anterior.
//  - Taquilla en vivo (`ventas` completadas, sin cajas de prueba).
// Regla de CORTE POR MES: si un mes tiene ventas de taquilla, se usa la taquilla; si no, el
// histórico. Así nunca se suma dos veces el mismo mes aunque el Excel se siga actualizando.
// La taquilla vende entradas/manillas, por eso solo entra con "Todos los productos" o ENTRADAS.

export const PRODUCTO_TAQUILLA = "ENTRADAS";

export type FuenteMes = "historico" | "taquilla" | null;

/** ¿La taquilla en vivo cuenta para este filtro de producto? */
export function incluyeTaquilla(producto?: string): boolean {
  return !producto || producto === PRODUCTO_TAQUILLA;
}

/** Corte por mes: taquilla si el mes tiene ventas en vivo; si no, el histórico. */
export function combinarMeses(historico: number[], taquilla: number[]): { valor: number; fuente: FuenteMes }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = taquilla[i] ?? 0;
    const h = historico[i] ?? 0;
    if (t > 0) return { valor: t, fuente: "taquilla" as const };
    if (h > 0) return { valor: h, fuente: "historico" as const };
    return { valor: 0, fuente: null };
  });
}

export async function productosVentaHistorica(): Promise<string[]> {
  const rows = await prisma.ventaHistorica.findMany({ distinct: ["producto"], select: { producto: true }, orderBy: { producto: "asc" } });
  const productos = rows.map((r) => r.producto);
  if (!productos.includes(PRODUCTO_TAQUILLA)) productos.push(PRODUCTO_TAQUILLA);
  return productos.sort();
}

async function historicoPorMes(anio: number, producto?: string): Promise<number[]> {
  const rows = await prisma.ventaHistorica.groupBy({
    by: ["mes"],
    where: { anio, ...(producto ? { producto } : {}) },
    _sum: { valor: true },
  });
  const meses = new Array(12).fill(0);
  for (const r of rows) meses[r.mes - 1] = r._sum.valor ?? 0;
  return meses;
}

/** Meses combinados (histórico + taquilla) de un año. */
async function mesesCombinados(anio: number, producto?: string) {
  const [hist, vivo] = await Promise.all([
    historicoPorMes(anio, producto),
    incluyeTaquilla(producto) ? ventasPorMes(anio) : Promise.resolve(new Array(12).fill(0)),
  ]);
  return combinarMeses(hist, vivo);
}

/** Años con datos (histórico o taquilla) y su total combinado. */
export async function resumenAnual(producto?: string): Promise<{ anio: number; total: number }[]> {
  const anios = new Set<number>();
  const hist = await prisma.ventaHistorica.groupBy({ by: ["anio"], where: producto ? { producto } : {} });
  hist.forEach((r) => anios.add(r.anio));
  if (incluyeTaquilla(producto)) {
    const [primera, ultima] = await Promise.all([
      prisma.venta.findFirst({ where: { estado: "completada" }, orderBy: { creado_en: "asc" }, select: { creado_en: true } }),
      prisma.venta.findFirst({ where: { estado: "completada" }, orderBy: { creado_en: "desc" }, select: { creado_en: true } }),
    ]);
    if (primera && ultima) {
      const anioBogota = (d: Date) => new Date(d.getTime() - 5 * 3600000).getUTCFullYear();
      for (let a = anioBogota(primera.creado_en); a <= anioBogota(ultima.creado_en); a++) anios.add(a);
    }
  }
  const lista = [...anios].sort((a, b) => a - b);
  const totales = await Promise.all(lista.map((a) => mesesCombinados(a, producto)));
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
  const [act, ant] = await Promise.all([mesesCombinados(anio, producto), mesesCombinados(anio - 1, producto)]);
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
