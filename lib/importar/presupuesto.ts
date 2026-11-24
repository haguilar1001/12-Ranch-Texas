import * as XLSX from "xlsx";

// "Presupuesto": el P&G presupuestado (p. ej. «PYG Presupuestado Ranch Texas 2026.xlsx»).
// Es un presupuesto MENSUAL de GASTOS: el mismo valor aplica a cada mes del año. No se cargan
// ingresos (decisión del responsable, 2026-11-24): los ingresos se comparan contra el año anterior.
//   · Hoja «Gastos»: tabla GASTOS | PARQUE | RESTAURANTE | TOTAL; se toma la columna TOTAL de cada
//     cuenta y se controla contra la fila TOTAL GASTOS.
//   · Hoja «Nomina»: un renglón por empleado (salario, prestaciones, parafiscales, seguridad social,
//     total y área). Datos personales: solo los ve el administrador.

export interface LineaPresupuesto { seccion: "gasto"; cuenta: string; orden: number; valor: number }
export interface EmpleadoPresupuesto {
  orden: number; nombre: string; cargo: string; area: string;
  salario: number; aux_transporte: number; sueldo_total: number;
  prestaciones: number; parafiscales: number; seguridad_social: number; total: number;
}
export interface PresupuestoLeido { anio: number; lineas: LineaPresupuesto[]; totalGastos: number; nomina: EmpleadoPresupuesto[]; totalNomina: number; avisos: string[] }

const texto = (v: unknown) => (v == null ? "" : String(v).trim().toUpperCase());
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const filasDe = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
const hoja = (wb: XLSX.WorkBook, nombre: string) => wb.SheetNames.find((n) => sinTildes(texto(n)) === nombre);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function leerPresupuesto(datos: Uint8Array | Buffer, nombreArchivo: string): PresupuestoLeido {
  const wb = XLSX.read(datos, { type: "buffer" });
  const anio = parseInt(/20\d{2}/.exec(nombreArchivo)?.[0] ?? "", 10);
  if (!anio) throw new Error("No pude saber el año: ponlo en el nombre del archivo (p. ej. «… 2026.xlsx»).");
  const hojaGastos = hoja(wb, "GASTOS");
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

  const { nomina, totalNomina, aviso } = leerNomina(wb);
  if (aviso) avisos.push(aviso);
  return { anio, lineas, totalGastos, nomina, totalNomina, avisos };
}

/** Hoja «Nomina»: encabezado con NOMBRE EMPLEADO, CARGO, SALARIO … TOTAL, AREA. */
function leerNomina(wb: XLSX.WorkBook): { nomina: EmpleadoPresupuesto[]; totalNomina: number; aviso?: string } {
  const h = hoja(wb, "NOMINA");
  if (!h) return { nomina: [], totalNomina: 0, aviso: "No encontré la hoja «Nomina»: el presupuesto queda sin detalle de empleados." };
  const filas = filasDe(wb.Sheets[h]);
  const iEnc = filas.findIndex((f) => f.some((v) => texto(v) === "NOMBRE EMPLEADO") && f.some((v) => texto(v) === "SALARIO"));
  if (iEnc < 0) return { nomina: [], totalNomina: 0, aviso: "En la hoja «Nomina» no encontré el encabezado NOMBRE EMPLEADO / SALARIO." };
  const enc = filas[iEnc].map((v) => sinTildes(texto(v)).replace(/\s+/g, " "));
  const col = (...nombres: string[]) => enc.findIndex((c) => nombres.includes(c));
  const c = {
    nombre: col("NOMBRE EMPLEADO"), cargo: col("CARGO"), area: col("AREA"), salario: col("SALARIO"),
    aux: col("AUX. TPTE", "AUX TPTE", "AUXILIO DE TRANSPORTE"), sueldo: col("SUELDO TOTAL"),
    cesan: col("CESAN"), intCesan: col("INT. CESAN", "INT CESAN"), primas: col("PRIMAS"), vacac: col("VACAC.", "VACACIONES"),
    caja: col("CAJA"), icbf: col("ICBF"), sena: col("SENA"), eps: col("EPS"), afp: col("AFP"), arl: col("ARL"), total: enc.lastIndexOf("TOTAL"),
  };
  if (c.nombre < 0 || c.total < 0) return { nomina: [], totalNomina: 0, aviso: "La hoja «Nomina» no trae las columnas NOMBRE EMPLEADO y TOTAL." };
  const v = (f: unknown[], i: number) => (i < 0 ? 0 : Math.round(num(f[i])));

  const nomina: EmpleadoPresupuesto[] = [];
  for (const f of filas.slice(iEnc + 1)) {
    const nombre = texto(f[c.nombre]);
    if (!nombre || !num(f[c.total])) continue;
    nomina.push({
      orden: nomina.length, nombre, cargo: texto(f[c.cargo]), area: texto(f[c.area]) || "SIN ÁREA",
      salario: v(f, c.salario), aux_transporte: v(f, c.aux), sueldo_total: v(f, c.sueldo),
      prestaciones: v(f, c.cesan) + v(f, c.intCesan) + v(f, c.primas) + v(f, c.vacac),
      parafiscales: v(f, c.caja) + v(f, c.icbf) + v(f, c.sena),
      seguridad_social: v(f, c.eps) + v(f, c.afp) + v(f, c.arl),
      total: v(f, c.total),
    });
  }
  const totalNomina = nomina.reduce((t, e) => t + e.total, 0);
  // Control contra la fila TOTALES de la hoja (encima del encabezado).
  const filaTot = filas.slice(0, iEnc).find((f) => f.some((x) => texto(x) === "TOTALES"));
  const control = filaTot ? Math.round(num(filaTot[c.total])) : null;
  const aviso = control && Math.abs(control - totalNomina) > nomina.length ? `La nómina suma ${totalNomina} y el TOTALES de la hoja dice ${control}.` : undefined;
  return { nomina, totalNomina, aviso };
}
