import ExcelJS from "exceljs";
import { COLUMNAS, type ClaveColumna } from "./importar";

// Construye la plantilla de carga masiva de equipos (.xlsx) con listas desplegables, validaciones
// y una hoja de instrucciones. La ruta /admin/equipos/plantilla le pasa los catálogos de la BD.

const FILAS = 1000; // filas con listas y validaciones
const MARRON = "FF4A2C17";
const CREMA = "FFF5EBDD";
const DORADO = "FFE8C77A";

export interface ListasPlantilla {
  grupos: string[];
  areas: string[];
  empleados: string[];
  proveedores: string[];
  /** Fecha de generación (aaaa-mm-dd), para la hoja de instrucciones. */
  fecha: string;
}

export async function construirPlantillaEquipos(l: ListasPlantilla): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Parque Ranch Texas";
  libro.created = new Date();

  // ---------------------------------------------------------------- hoja EQUIPOS
  const hoja = libro.addWorksheet("EQUIPOS", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  hoja.columns = COLUMNAS.map((c) => ({ header: c.obligatoria ? `${c.titulo} *` : c.titulo, key: c.clave, width: c.ancho }));
  const enc = hoja.getRow(1);
  enc.height = 32;
  enc.eachCell((celda, n) => {
    const col = COLUMNAS[n - 1];
    celda.font = { bold: true, color: { argb: col.obligatoria ? MARRON : "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col.obligatoria ? DORADO : MARRON } };
    celda.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    celda.note = col.ayuda;
  });
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS.length } };

  // ---------------------------------------------------------------- hoja LISTAS (oculta)
  const listas = libro.addWorksheet("LISTAS", { state: "hidden" });
  const columnasListas: [string, string[]][] = [
    ["GRUPOS", l.grupos],
    ["AREAS", l.areas],
    ["EMPLEADOS", l.empleados],
    ["PROVEEDORES", l.proveedores],
    ["ESTADOS", ["OPERATIVO", "EN MANTENIMIENTO", "FUERA DE SERVICIO"]],
    ["ORIGENES", ["YA ESTABA", "COMPRA", "DONACIÓN"]],
  ];
  const rango: Record<string, string> = {};
  columnasListas.forEach(([titulo, valores], i) => {
    const letra = String.fromCharCode(65 + i);
    listas.getCell(`${letra}1`).value = titulo;
    valores.forEach((v, j) => { listas.getCell(`${letra}${j + 2}`).value = v; });
    // Una lista vacía rompería la validación: se deja al menos una celda.
    rango[titulo] = `LISTAS!$${letra}$2:$${letra}$${Math.max(2, valores.length + 1)}`;
  });

  // ---------------------------------------------------------------- validaciones
  const letraDe = (clave: ClaveColumna) => String.fromCharCode(65 + COLUMNAS.findIndex((c) => c.clave === clave));
  const lista = (clave: ClaveColumna, origen: string, estricta: boolean, titulo: string) => {
    const l = letraDe(clave);
    for (let f = 2; f <= FILAS + 1; f++) {
      hoja.getCell(`${l}${f}`).dataValidation = {
        type: "list", allowBlank: true, formulae: [origen],
        showErrorMessage: estricta, errorStyle: "stop", errorTitle: titulo,
        error: "Elija un valor de la lista. Si falta, créelo primero en la app y descargue la plantilla de nuevo.",
      };
    }
  };
  const numero = (clave: ClaveColumna, minimo: number, mensaje: string) => {
    const l = letraDe(clave);
    for (let f = 2; f <= FILAS + 1; f++) {
      hoja.getCell(`${l}${f}`).dataValidation = {
        type: "whole", operator: "greaterThanOrEqual", allowBlank: true, formulae: [minimo],
        showErrorMessage: true, errorTitle: "Número no válido", error: mensaje,
      };
      hoja.getCell(`${l}${f}`).numFmt = "#,##0";
    }
  };
  const fechaCol = (clave: ClaveColumna) => {
    const l = letraDe(clave);
    for (let f = 2; f <= FILAS + 1; f++) {
      hoja.getCell(`${l}${f}`).dataValidation = {
        type: "date", operator: "greaterThan", allowBlank: true, formulae: [new Date(Date.UTC(1990, 0, 1))],
        showErrorMessage: true, errorTitle: "Fecha no válida", error: "Escriba una fecha, por ejemplo 15/03/2025.",
      };
      hoja.getCell(`${l}${f}`).numFmt = "dd/mm/yyyy";
    }
  };

  lista("grupo", rango.GRUPOS, true, "Grupo");
  lista("area", rango.AREAS, true, "Área");
  lista("responsable", rango.EMPLEADOS, true, "Responsable");
  lista("proveedor", rango.PROVEEDORES, false, "Proveedor"); // se puede escribir uno nuevo
  lista("estado", rango.ESTADOS, true, "Estado");
  lista("origen", rango.ORIGENES, true, "Origen");
  numero("cantidad", 1, "La cantidad debe ser un número entero mayor a 0.");
  numero("valor_compra", 0, "El valor es en pesos, sin decimales.");
  numero("vida_util_meses", 1, "La vida útil es un número de meses mayor a 0.");
  fechaCol("fecha_compra");
  fechaCol("fecha_instalacion");
  fechaCol("garantia_hasta");

  // ---------------------------------------------------------------- hoja INSTRUCCIONES
  const ins = libro.addWorksheet("INSTRUCCIONES");
  ins.columns = [{ width: 22 }, { width: 14 }, { width: 90 }];
  ins.addRow(["CARGA DE EQUIPOS · PARQUE RANCH TEXAS"]).font = { bold: true, size: 14, color: { argb: MARRON } };
  ins.addRow([`Plantilla generada el ${l.fecha}. Las listas traen los grupos, áreas, empleados y proveedores que había en la app ese día.`]);
  ins.addRow(["1. Llene la hoja EQUIPOS, una fila por equipo (o por lote de equipos iguales en el mismo sitio)."]);
  ins.addRow(["2. Las columnas en DORADO con * son obligatorias. Pase el mouse por cada título para ver la ayuda."]);
  ins.addRow(["3. Súbala en la app: Parque → Equipos → Cargar Excel. Primero verá una revisión fila por fila; nada se guarda hasta confirmar."]);
  ins.addRow(["4. Si un grupo, área o empleado no aparece en la lista, créelo primero en la app y descargue la plantilla otra vez."]);
  ins.addRow([]);
  const t = ins.addRow(["COLUMNA", "OBLIGATORIA", "QUÉ ESCRIBIR"]);
  t.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARRON } }; });
  for (const c of COLUMNAS) {
    const r = ins.addRow([c.titulo, c.obligatoria ? "SÍ" : "", c.ayuda]);
    if (c.obligatoria) r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: DORADO } };
    r.getCell(3).alignment = { wrapText: true };
  }
  ins.addRow([]);
  ins.addRow(["EJEMPLOS"]).font = { bold: true, color: { argb: MARRON } };
  const ejemplos = [
    ["Un equipo individual", "PLANTAS ELÉCTRICAS · PLANTA ELÉCTRICA 60 KVA · 1 · PE-01 · CUMMINS · C60D6 · … · TALLER · OPERATIVO · YA ESTABA"],
    ["Un lote de iguales", "SILLAS Y MESAS · SILLA PLÁSTICA · 120 · (sin código) · RIMAX · CLASSIC · … · RESTAURANTE · OPERATIVO · COMPRA · 45.000"],
    ["Mismo equipo en dos sitios", "Dos filas: 80 sillas en RESTAURANTE y 40 en PISCINA."],
  ];
  for (const [a, b] of ejemplos) {
    const r = ins.addRow([a, "", b]);
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREMA } };
    r.getCell(3).alignment = { wrapText: true };
  }

  // Al abrir se ve la hoja EQUIPOS, lista para llenar; las instrucciones van en la pestaña de al lado.
  libro.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];

  return Buffer.from(await libro.xlsx.writeBuffer());
}
