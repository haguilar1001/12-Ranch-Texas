import * as XLSX from "xlsx";

// "Presupuesto": el P&G presupuestado (p. ej. «PYG Presupuestado Ranch Texas 2026.xlsx»).
// Es un presupuesto MENSUAL: el mismo valor aplica a cada mes del año.
//   · Hoja «Gastos»: tabla GASTOS | PARQUE | RESTAURANTE | TOTAL; se toma la columna TOTAL de cada
//     cuenta hasta SUBTOTAL.
//   · Hoja «PYG»: INGRESOS y COSTO.
// Las demás hojas (parámetros, nómina por empleado, honorarios) son el soporte del cálculo y no se
// cargan como datos; quedan en el archivo original, que solo ve el administrador.

export interface LineaPresupuesto { seccion: "ingreso" | "costo_ventas" | "gasto"; cuenta: string; orden: number; valor: number }
export interface PresupuestoLeido { anio: number; lineas: LineaPresupuesto[]; totalGastos: number; avisos: string[] }

const texto = (v: unknown) => (v == null ? "" : String(v).trim().toUpperCase());
const filasDe = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

export function leerPresupuesto(datos: Uint8Array | Buffer, nombreArchivo: string): PresupuestoLeido {
  const wb = XLSX.read(datos, { type: "buffer" });
  const anio = parseInt(/20\d{2}/.exec(nombreArchivo)?.[0] ?? "", 10);
  if (!anio) throw new Error("No pude saber el año: ponlo en el nombre del archivo (p. ej. «… 2026.xlsx»).");
  const hojaGastos = wb.SheetNames.find((n) => texto(n) === "GASTOS");
  if (!hojaGastos) throw new Error("No encontré la hoja «Gastos».");

  const filas = filasDe(wb.Sheets[hojaGastos]);
  let iEnc = -1, cCuenta = -1, cTotal = -1;
  filas.forEach((f, i) => {
    if (iEnc >= 0) return;
    const j = f.findIndex((v) => texto(v) === "GASTOS"), k = f.findIndex((v) => texto(v) === "TOTAL");
    if (j >= 0 && k > j) { iEnc = i; cCuenta = j; cTotal = k; }
  });
  if (iEnc < 0) throw new Error("En la hoja «Gastos» no encontré el encabezado GASTOS … TOTAL.");

  const lineas: LineaPresupuesto[] = [];
  const avisos: string[] = [];
  let subtotal: number | null = null;
  for (const f of filas.slice(iEnc + 1)) {
    const cuenta = texto(f[cCuenta]);
    if (!cuenta) continue;
    if (cuenta === "SUBTOTAL" || cuenta.startsWith("TOTAL")) { const v = Number(f[cTotal]); if (Number.isFinite(v)) subtotal = Math.round(v); break; }
    const v = Number(f[cTotal]);
    if (!Number.isFinite(v)) continue;
    lineas.push({ seccion: "gasto", cuenta, orden: lineas.length, valor: Math.round(v) });
  }
  if (!lineas.length) throw new Error("La hoja «Gastos» no trae cuentas con valor.");
  const totalGastos = lineas.reduce((t, l) => t + l.valor, 0);
  // El control es la fila «TOTAL GASTOS» (encima de la tabla). El «SUBTOTAL» del pie puede ser parcial.
  const filaTotal = filas.find((f) => f.some((v) => texto(v) === "TOTAL GASTOS"));
  const controlTotal = filaTotal ? Number([...filaTotal].reverse().find((v) => typeof v === "number")) : subtotal;
  if (controlTotal != null && Number.isFinite(controlTotal) && Math.abs(Math.round(controlTotal) - totalGastos) > lineas.length) {
    avisos.push(`Las cuentas suman ${totalGastos} y el total de gastos de la hoja dice ${Math.round(controlTotal)}.`);
  }

  const hojaPyg = wb.SheetNames.find((n) => texto(n) === "PYG");
  if (hojaPyg) {
    for (const f of filasDe(wb.Sheets[hojaPyg])) {
      const i = f.findIndex((v) => ["INGRESOS", "COSTO"].includes(texto(v)));
      if (i < 0) continue;
      const v = Number(f.slice(i + 1).find((x) => typeof x === "number"));
      if (!Number.isFinite(v)) continue;
      lineas.push({ seccion: texto(f[i]) === "INGRESOS" ? "ingreso" : "costo_ventas", cuenta: texto(f[i]) === "INGRESOS" ? "INGRESOS" : "COSTO DE VENTAS", orden: lineas.length, valor: Math.round(v) });
    }
  } else avisos.push("No encontré la hoja «PYG»: el presupuesto queda sin ingresos.");

  return { anio, lineas, totalGastos, avisos };
}
