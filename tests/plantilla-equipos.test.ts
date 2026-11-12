import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { construirPlantillaEquipos } from "../lib/equipos/plantilla";
import { COLUMNAS, leerFilas, normalizar, type Celda } from "../lib/equipos/importar";

const listas = {
  grupos: ["KARTS", "PLANTAS ELÉCTRICAS", "SILLAS Y MESAS"],
  areas: ["RESTAURANTE", "TALLER"],
  empleados: ["JUAN PÉREZ"],
  proveedores: ["FERRETERÍA EL SOL"],
  fecha: "2026-11-12",
};

describe("plantilla de equipos", () => {
  it("trae las hojas, los encabezados y las listas desplegables", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await construirPlantillaEquipos(listas)) as unknown as ArrayBuffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual(["EQUIPOS", "LISTAS", "INSTRUCCIONES"]);
    expect(libro.getWorksheet("LISTAS")!.state).toBe("hidden");

    const hoja = libro.getWorksheet("EQUIPOS")!;
    const titulos = (hoja.getRow(1).values as unknown[]).slice(1);
    expect(titulos[0]).toBe("GRUPO *");
    expect(titulos).toHaveLength(COLUMNAS.length);

    const grupo = hoja.getCell("A2").dataValidation;
    expect(grupo.type).toBe("list");
    expect(grupo.formulae[0]).toBe("LISTAS!$A$2:$A$4");
    expect(hoja.getCell("C500").dataValidation.type).toBe("whole"); // CANTIDAD
    const listasHoja = libro.getWorksheet("LISTAS")!;
    expect(listasHoja.getCell("A3").value).toBe("PLANTAS ELÉCTRICAS");
  });

  it("ida y vuelta: lo que se llena en la plantilla lo lee la carga", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await construirPlantillaEquipos(listas)) as unknown as ArrayBuffer);
    const hoja = libro.getWorksheet("EQUIPOS")!;
    const col = (clave: string) => COLUMNAS.findIndex((c) => c.clave === clave) + 1;
    const r2 = hoja.getRow(2);
    r2.getCell(col("grupo")).value = "PLANTAS ELÉCTRICAS";
    r2.getCell(col("nombre")).value = "PLANTA ELÉCTRICA 60 KVA";
    r2.getCell(col("cantidad")).value = 1;
    r2.getCell(col("codigo")).value = "PE-01";
    r2.getCell(col("garantia_hasta")).value = new Date(Date.UTC(2027, 5, 30));
    r2.getCell(col("responsable")).value = "JUAN PÉREZ";
    const r3 = hoja.getRow(3);
    r3.getCell(col("grupo")).value = "SILLAS Y MESAS";
    r3.getCell(col("nombre")).value = "SILLA PLÁSTICA";
    r3.getCell(col("cantidad")).value = 120;
    r3.getCell(col("origen")).value = "COMPRA";
    r3.getCell(col("valor_compra")).value = 45000;
    const archivo = Buffer.from(await libro.xlsx.writeBuffer());

    const leido = XLSX.read(archivo, { type: "buffer", cellDates: true });
    const filas = XLSX.utils.sheet_to_json<Celda[]>(leido.Sheets.EQUIPOS, { header: 1, raw: true, defval: null, blankrows: true });
    const m = (xs: string[]) => new Map(xs.map((x, i) => [normalizar(x), `id${i}`]));
    const r = leerFilas(filas, {
      grupos: m(listas.grupos), areas: m(listas.areas), empleados: m(listas.empleados),
      proveedores: m(listas.proveedores), codigosExistentes: new Set(),
    });
    expect(r.errores).toEqual([]);
    expect(r.validas).toHaveLength(2);
    expect(r.validas[0]).toMatchObject({ nombre: "PLANTA ELÉCTRICA 60 KVA", codigo: "PE-01", garantia_hasta: "2027-06-30", responsable_id: "id0", fila: 2 });
    expect(r.validas[1]).toMatchObject({ cantidad: 120, origen: "compra", valor_compra: 45000, fila: 3 });
  });
});
