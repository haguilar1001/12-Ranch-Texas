import * as XLSX from "xlsx";
import type { Tx } from "../db";
import { LINEAS_TAQUILLA, inicioTaquilla, mesUsaTaquilla, taquillaPorMesYLinea } from "../reportes/comparativo";

// "Venta por mes": el cuadro mes x producto de la gerencia (hoja con Mes | Total | ENTRADAS |
// EVENTOS | ARRIENDOS…). Se cuadra `ventas_historicas` contra él: por año/mes/producto se guarda la
// diferencia con lo que ya hay (histórico de otros orígenes + ventas fuera de taquilla) como fila de
// AJUSTE con origen `cuadro:<archivo>`. Es idempotente: descarta sus filas y recalcula.
// ENTRADAS y EVENTOS de los meses que salen de la taquilla no se ajustan; solo se informa la
// diferencia taquilla vs. cuadro.

const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const NEGOCIO = "RANCH TEXAS";

export interface CeldaVentaMes { anio: number; mes: number; producto: string; valor: number }
export interface VentaMesLeida { anio: number; celdas: CeldaVentaMes[]; totales: Map<number, number> }

export function leerVentaMes(datos: Uint8Array | Buffer, nombreArchivo: string): VentaMesLeida {
  const wb = XLSX.read(datos, { type: "buffer" });
  const hoja = wb.SheetNames[0];
  const anio = parseInt(/\d{4}/.exec(hoja)?.[0] ?? /\d{4}/.exec(nombreArchivo)?.[0] ?? "", 10);
  if (!anio) throw new Error("No pude saber el año: ponlo en el nombre de la hoja o del archivo (p. ej. «2026»).");
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, raw: true });
  const iEnc = filas.findIndex((f) => String(f?.[0] ?? "").trim().toUpperCase() === "MES");
  if (iEnc < 0) throw new Error("No encontré el encabezado «Mes» en la primera columna.");
  const enc = filas[iEnc].map((v) => String(v ?? "").trim().toUpperCase());
  const celdas: CeldaVentaMes[] = [];
  const totales = new Map<number, number>();
  for (const f of filas.slice(iEnc + 1)) {
    const mes = MESES.indexOf(String(f?.[0] ?? "").trim().toUpperCase().slice(0, 3)) + 1;
    if (mes < 1) continue;
    enc.forEach((col, j) => {
      const v = Number(f[j]);
      if (j === 0 || !col || !Number.isFinite(v) || v === 0) return;
      if (col === "TOTAL") totales.set(mes, Math.round(v));
      else celdas.push({ anio, mes, producto: col, valor: Math.round(v) });
    });
  }
  if (!celdas.length) throw new Error("El cuadro no trae valores por producto.");
  return { anio, celdas, totales };
}

export interface ResultadoVentaMes {
  anio: number;
  ajustes: CeldaVentaMes[];
  taquilla: { mes: number; taquilla: number; cuadro: number }[];
  avisos: string[];
}

type Db = Tx;

/** Calcula y (si `aplicar`) guarda los ajustes. `origen` identifica el archivo. */
export async function cuadrarVentaMes(db: Db, leido: VentaMesLeida, origen: string, aplicar: boolean): Promise<ResultadoVentaMes> {
  const { anio, celdas, totales } = leido;
  const [hist, otras, taqLineas, inicio] = await Promise.all([
    db.ventaHistorica.groupBy({ by: ["mes", "producto"], where: { anio, negocio: NEGOCIO, NOT: { origen } }, _sum: { valor: true } }),
    db.ventaOtra.findMany({
      where: { estado: "activa", fecha: { gte: new Date(Date.UTC(anio, 0, 1)), lt: new Date(Date.UTC(anio + 1, 0, 1)) } },
      select: { fecha: true, linea: true, valor: true },
    }),
    taquillaPorMesYLinea(anio),
    inicioTaquilla(),
  ]);
  const usa = (mes: number) => mesUsaTaquilla(inicio, anio, mes);
  const deTaquilla = (p: string) => (LINEAS_TAQUILLA as readonly string[]).includes(p);

  const taquilla: ResultadoVentaMes["taquilla"] = [];
  for (let mes = 1; mes <= 12; mes++) {
    if (!usa(mes) || !totales.has(mes)) continue;
    taquilla.push({
      mes,
      taquilla: taqLineas[mes - 1].ENTRADAS + taqLineas[mes - 1].EVENTOS,
      cuadro: celdas.filter((c) => c.mes === mes && deTaquilla(c.producto)).reduce((s, c) => s + c.valor, 0),
    });
  }

  const ya = new Map(hist.map((r) => [`${r.mes}|${r.producto}`, r._sum.valor ?? 0]));
  for (const o of otras) {
    const k = `${o.fecha.getUTCMonth() + 1}|${o.linea}`;
    ya.set(k, (ya.get(k) ?? 0) + o.valor);
  }

  const ajustes: CeldaVentaMes[] = [];
  for (const c of celdas) {
    if (usa(c.mes) && deTaquilla(c.producto)) continue;
    const dif = c.valor - (ya.get(`${c.mes}|${c.producto}`) ?? 0);
    if (dif !== 0) ajustes.push({ ...c, valor: dif });
  }
  const avisos: string[] = [];
  for (const [k, v] of ya) {
    const [m, producto] = k.split("|");
    if (!totales.has(+m) || v === 0 || (usa(+m) && deTaquilla(producto))) continue;
    if (!celdas.some((c) => c.mes === +m && c.producto === producto)) avisos.push(`${MESES[+m - 1]} ${producto}: está en la app pero no en el cuadro (no se tocó).`);
  }
  for (const t of taquilla) {
    if (t.taquilla !== t.cuadro) avisos.push(`${MESES[t.mes - 1]}: la taquilla suma ${t.taquilla} y el cuadro ENTRADAS+EVENTOS ${t.cuadro}.`);
  }

  if (aplicar) {
    await db.ventaHistorica.deleteMany({ where: { origen } });
    if (ajustes.length) {
      await db.ventaHistorica.createMany({
        data: ajustes.map((a) => ({ fecha: new Date(Date.UTC(a.anio, a.mes, 0)), anio: a.anio, mes: a.mes, producto: a.producto, valor: a.valor, negocio: NEGOCIO, origen })),
      });
    }
  }
  return { anio, ajustes, taquilla, avisos };
}
