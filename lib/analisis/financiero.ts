import { prisma } from "../db";
import { GRUPOS_GASTO, grupoGasto, normalizarCuenta } from "../pyg/cuentas";

// Análisis financiero del año a partir de los estados de resultados cargados: indicadores,
// comparativos, punto de equilibrio y conclusiones escritas a partir de los números.
// La parte de cálculo (`analizar`) es pura para poder probarla; `analisisFinanciero` carga los datos.
//
// Supuestos (se muestran en la página):
//  · Equilibrio "bajo": regresión de costos totales contra ingresos de los meses cargados.
//  · Equilibrio "alto": por naturaleza; solo costo de ventas, comisiones, datáfono, impuestos e IVA
//    son variables y todo el personal es fijo.
//  · No hay depreciación, gastos financieros ni impuesto de renta en el estado: la utilidad
//    operacional no es utilidad neta.

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NOMBRE = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const VARIABLES = new Set(["COMISION", "COMISIONES", "DATAFONO", "IMPUESTOS", "IVA"]);

export interface MesPyg {
  mes: number;
  ingresos: number;
  costo_ventas: number;
  gastos: number;
  /** Gasto por cuenta (nombre como viene del PDF). */
  cuentas: Record<string, number>;
}

export interface Conclusion { titulo: string; detalle: string; tono: "bueno" | "malo" | "neutro" }
export interface Alerta { senal: string; valor: string; umbral: string; disparada: boolean; significa: string }

export interface Analisis {
  anio: number;
  meses: (MesPyg & { costos: number; utilidad: number; margen_bruto: number; margen_op: number; personal: number; personal_extra: number })[];
  acum: { ingresos: number; costos: number; costo_ventas: number; gastos: number; utilidad: number; margen_bruto: number; margen_op: number; personal: number; personal_extra: number };
  trimestres: { nombre: string; ingresos: number; costos: number; utilidad: number; margen_op: number; var_ingresos: number | null; var_margen_pp: number | null }[];
  ultimo: { mes: number; ingresos: number; utilidad: number; margen_op: number; gastos: number; prev: { mes: number; ingresos: number; utilidad: number; margen_op: number; gastos: number } | null };
  estructura: { grupo: string; total: number; pct_ingresos: number; presupuesto: number | null }[];
  concentracionTop3: number;
  equilibrio: { fijo_mes: number; tasa_var: number; r2: number; pe_bajo: number; pe_alto: number; margen_seguridad: number; apalancamiento: number | null; meses_bajo_pe: number[] } | null;
  personalExtra: { tasa: number; exceso: number; mesesAltos: number[] };
  presupuesto: { gastos: number; ejecucion: number; desvioMayor: { grupo: string; diferencia: number } | null } | null;
  conclusiones: Conclusion[];
  alertas: Alerta[];
}

const millones = (v: number) => `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1e6).toLocaleString("es-CO", { maximumFractionDigits: Math.abs(v) < 1e7 ? 1 : 0 })} M`;
const pct = (v: number) => `${(v * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pp`;
const lista = (ms: number[]) => ms.map((m) => NOMBRE[m - 1]).join(", ").replace(/, ([^,]*)$/, " y $1");
const sumaCuentas = (c: Record<string, number>, f: (k: string) => boolean) => Object.entries(c).reduce((t, [k, v]) => t + (f(k) ? v : 0), 0);

export function analizar(anio: number, entrada: MesPyg[], presupuestoMensual: Record<string, number> | null): Analisis | null {
  const base = [...entrada].sort((a, b) => a.mes - b.mes);
  if (!base.length) return null;
  const meses = base.map((m) => {
    const costos = m.costo_ventas + m.gastos, utilidad = m.ingresos - costos;
    return {
      ...m, costos, utilidad,
      margen_bruto: m.ingresos ? (m.ingresos - m.costo_ventas) / m.ingresos : 0,
      margen_op: m.ingresos ? utilidad / m.ingresos : 0,
      personal: sumaCuentas(m.cuentas, (k) => grupoGasto(k) === "Personal"),
      personal_extra: sumaCuentas(m.cuentas, (k) => normalizarCuenta(k) === "PERSONAL EXTRA"),
    };
  });
  const S = (k: "ingresos" | "costos" | "costo_ventas" | "gastos" | "utilidad" | "personal" | "personal_extra", l = meses) => l.reduce((t, m) => t + m[k], 0);
  const ING = S("ingresos");
  const acum = {
    ingresos: ING, costos: S("costos"), costo_ventas: S("costo_ventas"), gastos: S("gastos"), utilidad: S("utilidad"),
    margen_bruto: ING ? (ING - S("costo_ventas")) / ING : 0, margen_op: ING ? S("utilidad") / ING : 0,
    personal: S("personal"), personal_extra: S("personal_extra"),
  };

  // Trimestres con datos
  const trimestres: Analisis["trimestres"] = [];
  for (let q = 1; q <= 4; q++) {
    const l = meses.filter((m) => Math.ceil(m.mes / 3) === q);
    if (!l.length) continue;
    const ing = S("ingresos", l), uti = S("utilidad", l), mop = ing ? uti / ing : 0;
    const prev = trimestres[trimestres.length - 1];
    trimestres.push({
      nombre: `${["I", "II", "III", "IV"][q - 1]} (${MESES[l[0].mes - 1]}–${MESES[l[l.length - 1].mes - 1]})${l.length < 3 ? " parcial" : ""}`,
      ingresos: ing, costos: S("costos", l), utilidad: uti, margen_op: mop,
      var_ingresos: prev && prev.ingresos ? ing / prev.ingresos - 1 : null,
      var_margen_pp: prev ? mop - prev.margen_op : null,
    });
  }

  const u = meses[meses.length - 1], p = meses.length > 1 ? meses[meses.length - 2] : null;
  const ultimo = { mes: u.mes, ingresos: u.ingresos, utilidad: u.utilidad, margen_op: u.margen_op, gastos: u.gastos, prev: p && { mes: p.mes, ingresos: p.ingresos, utilidad: p.utilidad, margen_op: p.margen_op, gastos: p.gastos } };

  // Estructura de gastos por grupo
  const presGrupo = (g: string) => (presupuestoMensual ? (presupuestoMensual[g] ?? 0) * meses.length : null);
  const estructura = GRUPOS_GASTO.map((g) => {
    const total = meses.reduce((t, m) => t + sumaCuentas(m.cuentas, (k) => grupoGasto(k) === g), 0);
    return { grupo: g, total, pct_ingresos: ING ? total / ING : 0, presupuesto: presGrupo(g) };
  }).filter((e) => e.total || e.presupuesto).sort((a, b) => b.total - a.total);
  const gastoTot = estructura.reduce((t, e) => t + e.total, 0);
  const concentracionTop3 = gastoTot ? estructura.slice(0, 3).reduce((t, e) => t + e.total, 0) / gastoTot : 0;

  // Punto de equilibrio
  let equilibrio: Analisis["equilibrio"] = null;
  if (meses.length >= 3) {
    const x = meses.map((m) => m.ingresos), y = meses.map((m) => m.costos), n = x.length;
    const mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
    const sxx = x.reduce((t, v) => t + (v - mx) ** 2, 0);
    const b = sxx ? x.reduce((t, v, i) => t + (v - mx) * (y[i] - my), 0) / sxx : 0, a = my - b * mx;
    const syy = y.reduce((t, v) => t + (v - my) ** 2, 0);
    const r2 = syy ? 1 - y.reduce((t, v, i) => t + (v - (a + b * x[i])) ** 2, 0) / syy : 0;
    const varNat = acum.costo_ventas + meses.reduce((t, m) => t + sumaCuentas(m.cuentas, (k) => VARIABLES.has(normalizarCuenta(k))), 0);
    const mcNat = ING ? (ING - varNat) / ING : 0;
    const peNat = mcNat > 0 ? (acum.costos - varNat) / n / mcNat : Infinity;
    const peReg = b < 1 ? a / (1 - b) : Infinity;
    const candidatos = [peReg, peNat].filter((v) => Number.isFinite(v) && v > 0);
    if (candidatos.length) {
      const pe_bajo = Math.min(...candidatos), pe_alto = Math.max(...candidatos);
      const prom = ING / n;
      equilibrio = {
        fijo_mes: a, tasa_var: b, r2, pe_bajo, pe_alto,
        margen_seguridad: prom ? (prom - pe_alto) / prom : 0,
        apalancamiento: acum.utilidad > 0 ? (ING - varNat) / acum.utilidad : null,
        meses_bajo_pe: meses.filter((m) => m.ingresos < pe_alto).map((m) => m.mes),
      };
    }
  }

  // Personal extra contra la venta
  const tasaPE = ING ? acum.personal_extra / ING : 0;
  const personalExtra = {
    tasa: tasaPE,
    exceso: meses.reduce((t, m) => t + Math.max(0, m.personal_extra - tasaPE * m.ingresos), 0),
    mesesAltos: meses.filter((m) => m.ingresos && m.personal_extra / m.ingresos > 0.15).map((m) => m.mes),
  };

  // Presupuesto de gastos
  let presupuesto: Analisis["presupuesto"] = null;
  if (presupuestoMensual) {
    const pres = Object.values(presupuestoMensual).reduce((t, v) => t + v, 0) * meses.length;
    const desv = estructura.filter((e) => e.presupuesto != null).map((e) => ({ grupo: e.grupo, diferencia: e.total - (e.presupuesto ?? 0) })).sort((a, b) => b.diferencia - a.diferencia)[0] ?? null;
    presupuesto = { gastos: pres, ejecucion: pres ? acum.gastos / pres : 0, desvioMayor: desv && desv.diferencia > 0 ? desv : null };
  }

  // ---------------- Conclusiones ----------------
  // Orden fijo por lo que más pesa en la caja: pérdidas, desvío del presupuesto, personal,
  // equilibrio, tendencia del trimestre y, al final, lo que funciona.
  const conclusiones: Conclusion[] = [];
  const perdidas = meses.filter((m) => m.utilidad < 0);
  if (perdidas.length) {
    const total = -perdidas.reduce((t, m) => t + m.utilidad, 0);
    conclusiones.push({ tono: "malo", titulo: `${perdidas.length} ${perdidas.length === 1 ? "mes cerró" : "meses cerraron"} en pérdida: ${millones(-total)}`, detalle: `${lista(perdidas.map((m) => m.mes))} no alcanzaron a cubrir los costos. ${equilibrio ? `Con un equilibrio de ${millones(equilibrio.pe_bajo)} a ${millones(equilibrio.pe_alto)} al mes, son meses en los que la venta quedó por debajo.` : ""}` });
  } else {
    conclusiones.push({ tono: "bueno", titulo: `Todos los meses dejaron utilidad`, detalle: `La utilidad operacional acumulada es ${millones(acum.utilidad)}, un margen de ${pct(acum.margen_op)}.` });
  }
  if (presupuesto && presupuesto.desvioMayor) {
    conclusiones.push({ tono: "malo",
      titulo: `${presupuesto.desvioMayor.grupo} se pasa del presupuesto en ${millones(presupuesto.desvioMayor.diferencia)}`,
      detalle: `Los gastos van al ${pct(presupuesto.ejecucion)} de lo presupuestado para ${meses.length} meses (${millones(acum.gastos)} contra ${millones(presupuesto.gastos)}).` });
  }
  if (acum.personal) {
    conclusiones.push({ tono: acum.personal / ING > 0.4 ? "malo" : "neutro",
      titulo: `El personal se lleva ${pct(acum.personal / (ING || 1))} de los ingresos`,
      detalle: `Son ${millones(acum.personal)} en ${meses.length} meses. El personal extra suma ${millones(acum.personal_extra)} (${pct(tasaPE)} de la venta)${personalExtra.mesesAltos.length ? ` y en ${lista(personalExtra.mesesAltos)} pasó del 15% de la venta` : ""}. Si en los meses flojos hubiera seguido la proporción promedio, se habrían ahorrado ${millones(personalExtra.exceso)}.` });
  }
  if (equilibrio) {
    conclusiones.push({ tono: equilibrio.margen_seguridad < 0.15 ? "malo" : "neutro",
      titulo: `Hay que vender entre ${millones(equilibrio.pe_bajo)} y ${millones(equilibrio.pe_alto)} al mes para no perder`,
      detalle: `El costo fijo ronda ${millones(equilibrio.fijo_mes)} al mes. El margen de seguridad es ${pct(equilibrio.margen_seguridad)}${equilibrio.apalancamiento ? ` y el apalancamiento operativo ${equilibrio.apalancamiento.toLocaleString("es-CO", { maximumFractionDigits: 2 })}x: cada 10% menos de venta le quita cerca de ${pct(Math.min(1, equilibrio.apalancamiento * 0.1))} a la utilidad` : ""}.` });
  }
  if (trimestres.length >= 2) {
    const t = trimestres[trimestres.length - 1], prev = trimestres[trimestres.length - 2];
    const sube = (t.var_margen_pp ?? 0) >= 0;
    conclusiones.push({ tono: sube ? "bueno" : "malo",
      titulo: `Trimestre ${t.nombre.split(" ")[0]}: margen ${pct(t.margen_op)} (${pp(t.var_margen_pp ?? 0)})`,
      detalle: `Frente al trimestre anterior los ingresos cambiaron ${t.var_ingresos != null ? `${t.var_ingresos >= 0 ? "+" : ""}${pct(t.var_ingresos)}` : "—"} y la utilidad pasó de ${millones(prev.utilidad)} a ${millones(t.utilidad)}.` });
  }
  const mejor = meses.reduce((a, b) => (b.margen_op > a.margen_op ? b : a));
  conclusiones.push({ tono: "bueno", titulo: `${NOMBRE[mejor.mes - 1][0].toUpperCase()}${NOMBRE[mejor.mes - 1].slice(1)} fue el mejor mes: margen ${pct(mejor.margen_op)}`, detalle: `Vendió ${millones(mejor.ingresos)} y dejó ${millones(mejor.utilidad)}. Es la referencia de lo que el parque puede dar en temporada.` });

  // ---------------- Señales del último mes ----------------
  const ratioPE = u.ingresos ? u.personal_extra / u.ingresos : 0;
  const alertas: Alerta[] = [
    ...(equilibrio ? [{ senal: `Ingresos de ${NOMBRE[u.mes - 1]}`, valor: millones(u.ingresos), umbral: `menos de ${millones(equilibrio.pe_alto)} (equilibrio)`, disparada: u.ingresos < equilibrio.pe_alto, significa: "El mes no cubre la estructura fija." }] : []),
    { senal: `Margen operacional de ${NOMBRE[u.mes - 1]}`, valor: pct(u.margen_op), umbral: "menor a 10%", disparada: u.margen_op < 0.1, significa: "Una caída pequeña de ventas lo lleva a pérdida." },
    { senal: `Personal extra / ingresos de ${NOMBRE[u.mes - 1]}`, valor: pct(ratioPE), umbral: "mayor a 15%", disparada: ratioPE > 0.15, significa: "Se está contratando por calendario y no por demanda." },
    ...(presupuesto ? [{ senal: "Gastos acumulados vs presupuesto", valor: pct(presupuesto.ejecucion), umbral: "mayor a 100%", disparada: presupuesto.ejecucion > 1, significa: "El gasto va por encima de lo planeado." }] : []),
  ];

  return { anio, meses, acum, trimestres, ultimo, estructura, concentracionTop3, equilibrio, personalExtra, presupuesto, conclusiones, alertas };
}

/** Carga los estados de resultados vigentes del año y el presupuesto de gastos, y los analiza. */
export async function analisisFinanciero(anio: number): Promise<Analisis | null> {
  const [lineas, pres] = await Promise.all([
    prisma.estadoResultadoLinea.groupBy({ by: ["mes", "seccion", "cuenta"], where: { anio, archivo: { estado: "procesado" } }, _sum: { valor: true } }),
    prisma.presupuestoPygLinea.findMany({ where: { anio, seccion: "gasto", archivo: { estado: "procesado" } }, select: { cuenta: true, valor: true, mes: true } }),
  ]);
  const porMes = new Map<number, MesPyg>();
  for (const l of lineas) {
    const m = porMes.get(l.mes) ?? { mes: l.mes, ingresos: 0, costo_ventas: 0, gastos: 0, cuentas: {} };
    const v = l._sum.valor ?? 0;
    if (l.seccion === "ingreso") m.ingresos += v;
    else if (l.seccion === "costo_ventas") m.costo_ventas += v;
    else { m.gastos += v; m.cuentas[l.cuenta] = (m.cuentas[l.cuenta] ?? 0) + v; }
    porMes.set(l.mes, m);
  }
  let presupuestoMensual: Record<string, number> | null = null;
  if (pres.length) {
    presupuestoMensual = {};
    for (const p of pres.filter((x) => x.mes == null)) presupuestoMensual[grupoGasto(p.cuenta)] = (presupuestoMensual[grupoGasto(p.cuenta)] ?? 0) + p.valor;
  }
  return analizar(anio, [...porMes.values()], presupuestoMensual);
}
