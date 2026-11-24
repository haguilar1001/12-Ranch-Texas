import { prisma } from "../db";
import { GRUPOS_GASTO, GRUPOS_INGRESO, grupoGasto, grupoIngreso, cuentaComparable } from "../pyg/cuentas";

// Estado de resultados del año a partir de los PDF cargados (Financiero → Carga de archivos),
// agrupado por grupo de cuenta, con el presupuesto mensual al lado. Solo cuentan los archivos
// vigentes (procesados).

export interface FilaEr {
  clave: string;
  concepto: string;
  nivel: "total" | "grupo" | "pct";
  /** Valor por mes (índice 0 = enero); null si ese mes no se ha cargado. */
  meses: (number | null)[];
  acumulado: number;
  /** Presupuesto de los meses cargados (presupuesto mensual × meses), null si no hay presupuesto. */
  presupuesto: number | null;
  /** Dirección deseada: 1 subir es bueno (ingresos, utilidad), -1 subir es malo (costos y gastos). */
  sentido: 1 | -1 | 0;
}

export interface EstadoResultados {
  anio: number;
  mesesCargados: number[];
  filas: FilaEr[];
  cuentas: { grupo: string; cuenta: string; acumulado: number; presupuesto: number | null }[];
  unidades: { unidad: string; ingresos: number; gastos: number; resultado: number }[];
  hayPresupuesto: boolean;
}

export async function aniosConEstadoResultados(): Promise<number[]> {
  const r = await prisma.archivoCargado.findMany({ where: { tipo: "estado_resultados", estado: "procesado" }, distinct: ["anio"], select: { anio: true }, orderBy: { anio: "desc" } });
  return r.map((x) => x.anio!).filter(Boolean);
}

export async function estadoResultados(anio: number): Promise<EstadoResultados> {
  const [lineas, pres] = await Promise.all([
    prisma.estadoResultadoLinea.findMany({ where: { anio, archivo: { estado: "procesado" } }, select: { mes: true, unidad: true, seccion: true, cuenta: true, valor: true } }),
    prisma.presupuestoPygLinea.findMany({ where: { anio, seccion: "gasto", archivo: { estado: "procesado" } }, select: { mes: true, seccion: true, cuenta: true, valor: true } }),
  ]);
  const mesesCargados = [...new Set(lineas.map((l) => l.mes))].sort((a, b) => a - b);
  const nMeses = mesesCargados.length;
  const hayPresupuesto = pres.length > 0;

  // Presupuesto del periodo cargado: mensual (mes null) × meses cargados, o el del mes si viene por mes.
  const presDe = (filtro: (p: (typeof pres)[number]) => boolean): number | null => {
    if (!hayPresupuesto) return null;
    return pres.filter(filtro).reduce((t, p) => t + (p.mes == null ? p.valor * nMeses : mesesCargados.includes(p.mes) ? p.valor : 0), 0);
  };

  const porMes = (filtro: (l: (typeof lineas)[number]) => boolean) => {
    const v: (number | null)[] = Array.from({ length: 12 }, (_, i) => (mesesCargados.includes(i + 1) ? 0 : null));
    for (const l of lineas) if (filtro(l)) v[l.mes - 1] = (v[l.mes - 1] ?? 0) + l.valor;
    return v;
  };
  const suma = (v: (number | null)[]) => v.reduce<number>((t, x) => t + (x ?? 0), 0);
  const fila = (clave: string, concepto: string, nivel: FilaEr["nivel"], meses: (number | null)[], presupuesto: number | null, sentido: FilaEr["sentido"]): FilaEr =>
    ({ clave, concepto, nivel, meses, acumulado: suma(meses), presupuesto, sentido });
  const resta = (a: (number | null)[], b: (number | null)[]) => a.map((x, i) => (x == null ? null : x - (b[i] ?? 0)));

  const ing = porMes((l) => l.seccion === "ingreso");
  const cv = porMes((l) => l.seccion === "costo_ventas");
  const gas = porMes((l) => l.seccion === "gasto");
  const ub = resta(ing, cv), uo = resta(ub, gas);
  // El presupuesto es solo de gastos: ingresos, costo de ventas y utilidades no tienen presupuesto.
  const pGas = presDe((p) => p.seccion === "gasto");

  const filas: FilaEr[] = [
    fila("ingresos", "Ingresos", "total", ing, null, 1),
    ...GRUPOS_INGRESO.map((g) => fila(`ing:${g}`, g, "grupo", porMes((l) => l.seccion === "ingreso" && grupoIngreso(l.cuenta) === g), null, 1)).filter((f) => f.acumulado !== 0),
    fila("costo_ventas", "Costo de ventas", "total", cv, null, -1),
    fila("utilidad_bruta", "Utilidad bruta", "total", ub, null, 1),
    fila("gastos", "Gastos operacionales", "total", gas, pGas, -1),
    ...GRUPOS_GASTO.map((g) => fila(`gas:${g}`, g, "grupo", porMes((l) => l.seccion === "gasto" && grupoGasto(l.cuenta) === g), presDe((p) => p.seccion === "gasto" && grupoGasto(p.cuenta) === g), -1))
      .filter((f) => f.acumulado !== 0 || (f.presupuesto ?? 0) !== 0),
    fila("utilidad_operacional", "Utilidad operacional", "total", uo, null, 1),
  ];
  const pct = (clave: string, concepto: string, num: (number | null)[]) => {
    const meses = num.map((x, i) => (x == null || !ing[i] ? null : x / (ing[i] as number)));
    return { clave, concepto, nivel: "pct" as const, meses, acumulado: suma(ing) ? suma(num) / suma(ing) : 0, presupuesto: null, sentido: 1 as const };
  };
  filas.push(pct("margen_bruto", "Margen bruto", ub), pct("margen_operacional", "Margen operacional", uo));

  // Detalle por cuenta (gastos)
  const mapa = new Map<string, { grupo: string; cuenta: string; acumulado: number; presupuesto: number | null }>();
  // Real y presupuesto se juntan por cuenta equivalente (el presupuesto usa otros nombres).
  for (const l of lineas.filter((x) => x.seccion === "gasto")) {
    const k = cuentaComparable(l.cuenta);
    const o = mapa.get(k) ?? { grupo: grupoGasto(k), cuenta: k, acumulado: 0, presupuesto: null };
    o.acumulado += l.valor;
    mapa.set(k, o);
  }
  if (hayPresupuesto) {
    for (const p of pres.filter((x) => x.seccion === "gasto")) {
      const k = cuentaComparable(p.cuenta);
      const o = mapa.get(k) ?? { grupo: grupoGasto(k), cuenta: k, acumulado: 0, presupuesto: 0 };
      o.presupuesto = (o.presupuesto ?? 0) + (p.mes == null ? p.valor * nMeses : mesesCargados.includes(p.mes) ? p.valor : 0);
      mapa.set(k, o);
    }
  }
  const cuentas = [...mapa.values()].sort((a, b) => GRUPOS_GASTO.indexOf(a.grupo as never) - GRUPOS_GASTO.indexOf(b.grupo as never) || b.acumulado - a.acumulado);

  const uMap = new Map<string, { unidad: string; ingresos: number; gastos: number; resultado: number }>();
  for (const l of lineas) {
    const o = uMap.get(l.unidad) ?? { unidad: l.unidad, ingresos: 0, gastos: 0, resultado: 0 };
    if (l.seccion === "ingreso") o.ingresos += l.valor; else o.gastos += l.valor;
    o.resultado = o.ingresos - o.gastos;
    uMap.set(l.unidad, o);
  }

  return { anio, mesesCargados, filas, cuentas, unidades: [...uMap.values()].sort((a, b) => b.ingresos - a.ingresos || b.gastos - a.gastos), hayPresupuesto };
}
