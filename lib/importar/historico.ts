import * as XLSX from "xlsx";

// "Venta histórica": el Excel de operación (hoja "Datos", columnas FECHA / PRODUCTO / VALOR /
// NEGOCIO en cualquier posición). Solo se cargan las filas de RANCH TEXAS (o sin negocio).
// Al subirlo se reemplaza TODO el histórico importado de Excel (origen `excel:…`), porque el
// archivo trae la historia completa.

const OBJETIVO = ["FECHA", "PRODUCTO", "VALOR", "NEGOCIO"] as const;
const CORTE_VACIAS = 1000;
export const NEGOCIO_HISTORICO = "RANCH TEXAS";

export interface FilaHistorica { fecha: Date; anio: number; mes: number; producto: string; valor: number }
export interface HistoricoLeido { filas: FilaHistorica[]; omitidas: number; otrosNegocios: number; desde: string; hasta: string; total: number }

const celda = (ws: XLSX.WorkSheet, r: number, c: number): unknown => ws[XLSX.utils.encode_cell({ r, c })]?.v ?? null;

export function leerHistorico(datos: Uint8Array | Buffer): HistoricoLeido {
  const wb = XLSX.read(datos, { type: "buffer", cellDates: true });
  const ws = wb.Sheets["Datos"] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) throw new Error("El archivo no tiene datos legibles.");
  const rango = XLSX.utils.decode_range(ws["!ref"]);

  let fila = -1;
  const cols: Record<string, number> = {};
  for (let r = rango.s.r; r <= Math.min(rango.e.r, rango.s.r + 25) && fila < 0; r++) {
    const mapa: Record<string, number> = {};
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const v = celda(ws, r, c);
      const k = v != null ? String(v).trim().toUpperCase() : "";
      if ((OBJETIVO as readonly string[]).includes(k) && mapa[k] === undefined) mapa[k] = c;
    }
    if (mapa.FECHA !== undefined && mapa.PRODUCTO !== undefined && mapa.VALOR !== undefined) { fila = r; Object.assign(cols, mapa); }
  }
  if (fila < 0) throw new Error("No encontré las columnas FECHA, PRODUCTO y VALOR (hoja «Datos»).");

  const filas: FilaHistorica[] = [];
  let omitidas = 0, otrosNegocios = 0, vacias = 0;
  for (let r = fila + 1; r <= rango.e.r; r++) {
    const f = celda(ws, r, cols.FECHA), p = celda(ws, r, cols.PRODUCTO), v = celda(ws, r, cols.VALOR);
    const n = cols.NEGOCIO !== undefined ? celda(ws, r, cols.NEGOCIO) : null;
    if (f == null && p == null && v == null && n == null) { if (++vacias >= CORTE_VACIAS) break; continue; }
    vacias = 0;
    if (n != null && String(n).trim() && String(n).trim().toUpperCase() !== NEGOCIO_HISTORICO) { otrosNegocios++; continue; }
    const fecha = f instanceof Date ? new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate())) : null;
    const producto = p != null ? String(p).trim().toUpperCase() : "";
    const valor = typeof v === "number" ? Math.round(v) : NaN;
    if (!fecha || !producto || Number.isNaN(valor)) { omitidas++; continue; }
    filas.push({ fecha, anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1, producto, valor });
  }
  if (!filas.length) throw new Error("No encontré filas válidas de RANCH TEXAS.");
  const fechas = filas.map((x) => x.fecha.getTime());
  return {
    filas, omitidas, otrosNegocios,
    desde: new Date(Math.min(...fechas)).toISOString().slice(0, 10),
    hasta: new Date(Math.max(...fechas)).toISOString().slice(0, 10),
    total: filas.reduce((t, x) => t + x.valor, 0),
  };
}
