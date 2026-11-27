import ExcelJS from "exceljs";
import { DEFS, LISTAS_FIJAS, type TipoCatalogo } from "./importar";

// Plantilla (.xlsx) de carga de un catálogo: hoja de datos con listas desplegables y ayudas,
// hoja oculta con las listas y hoja de instrucciones. Con `filas` sale con los datos actuales,
// para corregirlos en Excel y volver a subirlos.

const FILAS = 500;
const MARRON = "FF4A2C17";
const CREMA = "FFF5EBDD";
const DORADO = "FFE8C77A";

export interface OpcionesPlantilla {
  /** Proveedores activos (lista de materias primas). */
  proveedores: string[];
  fecha: string;
  /** Datos actuales, en el orden de las columnas, si se pide la plantilla "con datos". */
  filas?: (string | number | null)[][];
}

export async function construirPlantillaCatalogo(tipo: TipoCatalogo, o: OpcionesPlantilla): Promise<Buffer> {
  const def = DEFS[tipo];
  const libro = new ExcelJS.Workbook();
  libro.creator = "Parque Ranch Texas";
  libro.created = new Date();

  const hoja = libro.addWorksheet(def.hoja, { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  hoja.columns = def.columnas.map((c) => ({ header: c.obligatoria ? `${c.titulo} *` : c.titulo, key: c.clave, width: c.ancho }));
  const enc = hoja.getRow(1);
  enc.height = 32;
  enc.eachCell((celda, n) => {
    const col = def.columnas[n - 1];
    celda.font = { bold: true, color: { argb: col.obligatoria ? MARRON : "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col.obligatoria ? DORADO : MARRON } };
    celda.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    celda.note = col.ayuda;
  });
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: def.columnas.length } };
  for (const f of o.filas ?? []) hoja.addRow(f);

  // ---- listas (hoja oculta)
  const listas = libro.addWorksheet("LISTAS", { state: "hidden" });
  const fuentes: Record<string, string[]> = { ...LISTAS_FIJAS, proveedores: o.proveedores };
  const rango: Record<string, string> = {};
  Object.entries(fuentes).forEach(([nombre, valores], i) => {
    const letra = String.fromCharCode(65 + i);
    listas.getCell(`${letra}1`).value = nombre.toUpperCase();
    valores.forEach((v, j) => { listas.getCell(`${letra}${j + 2}`).value = v; });
    rango[nombre] = `LISTAS!$${letra}$2:$${letra}$${Math.max(2, valores.length + 1)}`;
  });

  // ---- validaciones por columna
  const total = Math.max(FILAS, (o.filas?.length ?? 0) + 100);
  def.columnas.forEach((c, i) => {
    const letra = String.fromCharCode(65 + i);
    for (let f = 2; f <= total + 1; f++) {
      const celda = hoja.getCell(`${letra}${f}`);
      if (c.lista) {
        celda.dataValidation = {
          type: "list", allowBlank: true, formulae: [rango[c.lista.origen]],
          showErrorMessage: !!c.lista.estricta, errorStyle: "stop", errorTitle: c.titulo, error: "Elija un valor de la lista.",
        };
      } else if (c.numero) {
        celda.dataValidation = {
          type: "whole", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0],
          showErrorMessage: true, errorTitle: "Número no válido", error: "Escriba un número entero, sin decimales.",
        };
        celda.numFmt = "#,##0";
      } else {
        celda.numFmt = "@"; // texto: el NIT y el teléfono no se vuelven números
      }
    }
  });

  // ---- instrucciones
  const ins = libro.addWorksheet("INSTRUCCIONES");
  ins.columns = [{ width: 24 }, { width: 14 }, { width: 90 }];
  ins.addRow([`CARGA DE ${def.titulo.toUpperCase()} · PARQUE RANCH TEXAS`]).font = { bold: true, size: 14, color: { argb: MARRON } };
  ins.addRow([`Plantilla generada el ${o.fecha}.${o.filas ? ` Trae los ${o.filas.length} registros que había ese día.` : ""}`]);
  ins.addRow([`1. Llene la hoja ${def.hoja}: una fila por ${def.singular}.`]);
  ins.addRow(["2. Las columnas en DORADO con * son obligatorias. Pase el mouse por cada título para ver la ayuda."]);
  ins.addRow(["3. Si el nombre ya existe en la app, la fila ACTUALIZA ese registro; las celdas vacías no borran lo que había. Si no existe, se CREA."]);
  ins.addRow(["4. Súbala en la app: botón ⬆ Subir archivos (en el menú) o Configuración → Catálogos. Primero verá una revisión; nada se guarda hasta confirmar."]);
  if (def.nota) ins.addRow([`5. ${def.nota}`]);
  ins.addRow([]);
  const t = ins.addRow(["COLUMNA", "OBLIGATORIA", "QUÉ ESCRIBIR"]);
  t.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARRON } }; });
  for (const c of def.columnas) {
    const r = ins.addRow([c.titulo, c.obligatoria ? "SÍ" : "", c.ayuda]);
    if (c.obligatoria) r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DORADO } };
    r.getCell(3).alignment = { wrapText: true };
  }
  ins.addRow([]);
  ins.addRow(["EJEMPLO"]).font = { bold: true, color: { argb: MARRON } };
  for (const e of def.ejemplos) {
    const r = ins.addRow(["", "", e.filter(Boolean).join(" · ")]);
    r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREMA } };
  }

  libro.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return Buffer.from(await libro.xlsx.writeBuffer());
}
