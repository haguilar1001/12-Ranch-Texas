import type { Renglon, PiezaTexto } from "./pdf-lineas";

// Lector del "ESTADO DE PERDIDAS Y GANANCIAS" mensual (consolidado por unidad de negocio) que
// llega de contabilidad en PDF. Es puro: recibe los renglones del PDF y devuelve las cuentas.
//
// Cada número se ubica en su columna por la posición horizontal (los números van alineados a la
// derecha), así una celda en blanco no corre los valores. Antes de aceptar el archivo se verifica
// que cada sección sume su subtotal; si algo no cuadra, se rechaza con el motivo.

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const NUMERO = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/;

export interface LineaPyg {
  seccion: "ingreso" | "costo_ventas" | "gasto";
  cuenta: string;
  orden: number;
  /** Valor por unidad, en el orden de `unidades`. */
  valores: number[];
}

export interface PygLeido {
  anio: number;
  mes: number;
  unidades: string[];
  lineas: LineaPyg[];
  totales: { ingresos: number; costo_ventas: number; utilidad_bruta: number; gastos: number; utilidad_operacional: number };
  avisos: string[];
}

const valorDe = (t: string) => parseInt(t.split(",")[0].replace(/\./g, ""), 10);
const esNumero = (p: PiezaTexto) => NUMERO.test(p.texto);
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export function leerPygPdf(renglones: Renglon[]): PygLeido {
  // Periodo: "ENERO AÑO 2026"
  let anio = 0, mes = 0;
  for (const r of renglones) {
    const t = sinTildes(r.map((p) => p.texto).join(" "));
    const m = t.match(/\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b.*?\b(20\d{2})\b/);
    if (m) { mes = MESES.indexOf(m[1]) + 1; anio = +m[2]; break; }
  }
  if (!anio) throw new Error("No encontré el mes y el año en el título (por ejemplo «ENERO AÑO 2026»).");

  const iIngresos = renglones.findIndex((r) => sinTildes(r[0]?.texto ?? "") === "INGRESOS");
  if (iIngresos < 0) throw new Error("No encontré la línea INGRESOS: ¿es un estado de pérdidas y ganancias?");

  // Columnas: bordes derechos de los números en los renglones que traen la mayor cantidad de valores.
  const cuerpo = renglones.slice(iIngresos);
  const nCols = Math.max(...cuerpo.map((r) => r.filter(esNumero).length));
  if (nCols < 2) throw new Error("No encontré columnas de valores.");
  const llenos = cuerpo.filter((r) => r.filter(esNumero).length === nCols);
  const bordes = Array.from({ length: nCols }, (_, i) => {
    const v = llenos.map((r) => r.filter(esNumero)[i].fin).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  });
  const columna = (x: number) => bordes.reduce((mejor, b, i) => (Math.abs(b - x) < Math.abs(bordes[mejor] - x) ? i : mejor), 0);

  // Nombres de columna: los renglones sin números entre el título y INGRESOS.
  const nombres: string[][] = Array.from({ length: nCols }, () => []);
  const anchoCol = (bordes[nCols - 1] - bordes[0]) / Math.max(1, nCols - 1);
  for (const r of renglones.slice(0, iIngresos)) {
    if (r.some(esNumero)) continue;
    const t = sinTildes(r.map((p) => p.texto).join(" "));
    if (/ESTADO DE|CONSOLIDADO RANCH|\bANO\b|\bAÑO\b/.test(t) && !/ADMINISTRACION/.test(t)) continue;
    // Una pieza puede traer varios nombres juntos ("MARIO KARTS CONSOLIDADO"): se reparte por palabras
    // según su posición aproximada dentro de la pieza.
    for (const p of r) {
      const palabras = p.texto.split(/\s+/);
      const paso = (p.fin - p.x) / Math.max(1, p.texto.length);
      let cursor = p.x;
      for (const w of palabras) {
        const centro = cursor + (w.length * paso) / 2;
        // el borde derecho de una columna queda a la derecha del centro de su encabezado
        nombres[columna(centro + anchoCol * 0.35)].push(sinTildes(w));
        cursor += (w.length + 1) * paso;
      }
    }
  }
  const unidades = nombres.slice(0, -1).map((ws, i) => ws.join(" ") || `UNIDAD ${i + 1}`);
  const avisos: string[] = [];

  // Cuentas por sección
  type Fila = { etiqueta: string; valores: number[]; total: number };
  const filas: Fila[] = [];
  for (const r of cuerpo) {
    const nums = r.filter(esNumero);
    const etiqueta = r.filter((p) => !esNumero(p)).map((p) => p.texto).join(" ").replace(/\s+/g, " ").trim();
    if (!etiqueta || !nums.length) continue;
    const vals = new Array(nCols).fill(0);
    for (const n of nums) vals[columna(n.fin)] += valorDe(n.texto);
    filas.push({ etiqueta: sinTildes(etiqueta), valores: vals.slice(0, -1), total: vals[nCols - 1] });
  }

  const tol = nCols; // redondeo: hasta $1 por columna
  const lineas: LineaPyg[] = [];
  let seccion: LineaPyg["seccion"] | null = null;
  const tot = { ingresos: NaN, costo_ventas: NaN, utilidad_bruta: NaN, gastos: NaN, utilidad_operacional: NaN };
  for (const f of filas) {
    const e = f.etiqueta.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
    if (e === "INGRESOS") { tot.ingresos = f.total; seccion = "ingreso"; continue; }
    if (/^- COSTO DE VENTAS$/.test(e)) {
      tot.costo_ventas = f.total; seccion = null;
      lineas.push({ seccion: "costo_ventas", cuenta: "COSTO DE VENTAS", orden: lineas.length, valores: f.valores });
      continue;
    }
    if (/^= UTILIDAD BRUTA$/.test(e)) { tot.utilidad_bruta = f.total; seccion = null; continue; }
    if (/^- GASTOS$/.test(e)) { tot.gastos = f.total; seccion = "gasto"; continue; }
    if (/^= UTILIDAD OPERACIONAL$/.test(e)) { tot.utilidad_operacional = f.total; seccion = null; continue; }
    if (!seccion) continue;
    const suma = f.valores.reduce((a, b) => a + b, 0);
    if (Math.abs(suma - f.total) > tol) throw new Error(`${f.etiqueta}: las unidades suman ${suma} y el consolidado dice ${f.total}.`);
    if (lineas.some((l) => l.seccion === seccion && l.cuenta === f.etiqueta) && suma !== 0) avisos.push(`La cuenta ${f.etiqueta} aparece dos veces; se cargan ambas, como en el PDF.`);
    lineas.push({ seccion, cuenta: f.etiqueta, orden: lineas.length, valores: f.valores });
  }

  for (const [k, v] of Object.entries(tot)) if (Number.isNaN(v)) throw new Error(`No encontré el subtotal ${k.replace(/_/g, " ")}.`);
  const sum = (s: LineaPyg["seccion"]) => lineas.filter((l) => l.seccion === s).reduce((t, l) => t + l.valores.reduce((a, b) => a + b, 0), 0);
  const revisar = (nombre: string, calculado: number, dice: number) => {
    if (Math.abs(calculado - dice) > tol * 2) throw new Error(`${nombre} no cuadra: las cuentas suman ${calculado} y el PDF dice ${dice}.`);
  };
  revisar("Ingresos", sum("ingreso"), tot.ingresos);
  revisar("Gastos", sum("gasto"), tot.gastos);
  revisar("Utilidad bruta", tot.ingresos - tot.costo_ventas, tot.utilidad_bruta);
  revisar("Utilidad operacional", tot.utilidad_bruta - tot.gastos, tot.utilidad_operacional);

  return { anio, mes, unidades, lineas, totales: tot, avisos };
}
