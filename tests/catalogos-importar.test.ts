import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { DEFS, leerCatalogo, condicionDesde, type Existentes } from "@/lib/catalogos/importar";
import { construirPlantillaCatalogo } from "@/lib/catalogos/plantilla";
import type { Celda } from "@/lib/equipos/importar";

const vacio: Existentes = { registros: new Map() };
const enc = (tipo: keyof typeof DEFS) => DEFS[tipo].columnas.map((c) => (c.obligatoria ? `${c.titulo} *` : c.titulo));

describe("carga de proveedores desde Excel", () => {
  it("crea los nuevos, convierte NIT numérico a texto y entiende la condición de pago por su nombre", () => {
    const r = leerCatalogo("proveedores", [
      enc("proveedores"),
      ["Santiagro Limitada", 8020202699, "REPUESTOS", "María", "3049349", "", "Calle 67", "Barranquilla", "Crédito 30 días", "Guadañas", ""],
    ], vacio);
    expect(r.errores).toEqual([]);
    expect(r.nuevos[0].datos).toMatchObject({ nombre: "Santiagro Limitada", nit_cedula: "8020202699", condiciones_pago: "credito_30", email: null });
  });

  it("si el nombre existe, actualiza solo lo que cambia y no borra con celdas vacías", () => {
    const ex: Existentes = { registros: new Map([["santiagro limitada", { id: "p1", nombre: "SANTIAGRO LIMITADA", ciudad: "BARRANQUILLA", telefono: "111" }]]) };
    const r = leerCatalogo("proveedores", [enc("proveedores"), ["SANTIAGRO limitada", "", "", "", "300 111 2222", "", "", "barranquilla", "", "", ""]], ex);
    expect(r.nuevos).toEqual([]);
    expect(r.actualizar).toHaveLength(1);
    expect(r.actualizar[0]).toMatchObject({ id: "p1", datos: { telefono: "300 111 2222" } });
  });

  it("sin cambios no hace nada; filas vacías se ignoran", () => {
    const ex: Existentes = { registros: new Map([["x", { id: "p1", nombre: "X", ciudad: "BARANOA" }]]) };
    const r = leerCatalogo("proveedores", [enc("proveedores"), ["x", null, null, null, null, null, null, "Baranoa"], [null, ""]], ex);
    expect(r.nuevos.length + r.actualizar.length + r.errores.length).toBe(0);
  });

  it("errores por fila: sin nombre, repetido, correo malo, condición inventada", () => {
    const r = leerCatalogo("proveedores", [
      enc("proveedores"),
      ["", "123"],
      ["A", "", "", "", "", "malo"],
      ["B", "", "", "", "", "", "", "", "fiado"],
      ["C"], ["c"],
    ], vacio);
    expect(r.errores.map((e) => e.fila)).toEqual([2, 3, 4, 6]);
    expect(r.errores[3].errores[0]).toMatch(/fila 5/);
  });

  it("condiciones de pago", () => {
    expect(condicionDesde("Contado")).toBe("contado");
    expect(condicionDesde("credito_15")).toBe("credito_15");
    expect(condicionDesde("fiado")).toBe("error");
  });

  it("archivo que no es la plantilla", () => {
    expect(leerCatalogo("proveedores", [["CUALQUIER", "COSA"]], vacio).faltanColumnas).toEqual(["NOMBRE"]);
  });
});

describe("carga de materias primas", () => {
  it("usa el proveedor existente o avisa que crea uno nuevo", () => {
    const ex: Existentes = { registros: new Map(), proveedores: new Map([["santiagro limitada", "p1"]]) };
    const r = leerCatalogo("materias", [
      enc("materias"),
      ["Cloro", "Piscina", "KG", 12500, "Santiagro Limitada"],
      ["Jabón", "", "litro", "8.000", "Ferretería Nueva"],
      ["Sin unidad", "", ""],
    ], ex);
    expect(r.nuevos[0].datos).toMatchObject({ unidad_medida: "kg", costo_referencia: 12500, proveedor_id: "p1" });
    expect(r.nuevos[1]).toMatchObject({ proveedor_nuevo: "Ferretería Nueva", datos: { costo_referencia: 8000 } });
    expect(r.avisos[0]).toMatch(/FERRETERÍA NUEVA/);
    expect(r.errores[0].fila).toBe(4);
  });
});

describe("carga de rubros por ruta", () => {
  it("crea rutas nuevas, actualiza el orden de las existentes y valida los niveles", () => {
    const ex: Existentes = { registros: new Map(), rutasRubros: new Map([["operacion|aseo", "r1"]]) };
    const r = leerCatalogo("rubros", [
      enc("rubros"),
      ["Operación", "Aseo", "Jabón", null],
      ["OPERACIÓN", "ASEO", null, 3],
      ["Operación", null, "Huérfano"],
      [null, "Sin grupo"],
      ["Operación", "Aseo", "jabon"],
    ], ex);
    expect(r.nuevos.map((f) => f.ruta)).toEqual([["Operación", "Aseo", "Jabón"]]);
    expect(r.actualizar[0]).toMatchObject({ id: "r1", datos: { orden: 3 } });
    expect(r.errores.map((e) => e.fila)).toEqual([4, 5, 6]);
  });
});

describe("carga de alimentos, grupos y áreas", () => {
  it("alimentos validan unidad y gramos", () => {
    const r = leerCatalogo("alimentos", [enc("alimentos"), ["Concentrado", "concentrado", "bulto", 98000, 40000], ["Malo", "", "", "", 0]], vacio);
    expect(r.nuevos[0].datos).toMatchObject({ unidad_medida: "bulto", costo_unitario: 98000, equivalencia_g: 40000 });
    expect(r.errores[0].errores.join(" ")).toMatch(/UNIDAD.*GRAMOS/);
  });
  it("grupos y áreas", () => {
    expect(leerCatalogo("grupos", [enc("grupos"), ["Herramientas", "Guadañas"]], vacio).nuevos[0].datos).toEqual({ nombre: "Herramientas", descripcion: "Guadañas" });
    expect(leerCatalogo("areas", [enc("areas"), ["Zonas verdes"]], vacio).nuevos).toHaveLength(1);
  });
});

describe("plantilla de ida y vuelta", () => {
  it.each(Object.keys(DEFS) as (keyof typeof DEFS)[])("la plantilla de %s se llena y se lee sin errores", async (tipo) => {
    const buf = await construirPlantillaCatalogo(tipo, { proveedores: ["SANTIAGRO LIMITADA"], fecha: "2026-11-27" });
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buf as unknown as ArrayBuffer);
    const hoja = libro.getWorksheet(DEFS[tipo].hoja)!;
    expect(hoja).toBeDefined();
    DEFS[tipo].ejemplos[0].forEach((v, i) => { if (v !== "") hoja.getRow(2).getCell(i + 1).value = v; });
    const salida = Buffer.from(await libro.xlsx.writeBuffer());
    const wb = XLSX.read(salida, { type: "buffer", cellDates: true });
    const filas = XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[DEFS[tipo].hoja], { header: 1, raw: true, defval: null, blankrows: true });
    const r = leerCatalogo(tipo, filas, { registros: new Map(), proveedores: new Map([["santiagro limitada", "p1"]]), rutasRubros: new Map() });
    expect(r.faltanColumnas).toEqual([]);
    expect(r.errores).toEqual([]);
    expect(r.nuevos).toHaveLength(1);
  });

  it("la plantilla con datos trae las filas actuales", async () => {
    const buf = await construirPlantillaCatalogo("grupos", { proveedores: [], fecha: "2026-11-27", filas: [["KARTS", "PISTA"], ["BOTES", null]] });
    const wb = XLSX.read(buf, { type: "buffer" });
    const filas = XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets.GRUPOS, { header: 1, defval: null });
    expect(filas.slice(1, 3)).toEqual([["KARTS", "PISTA"], ["BOTES", null]]);
  });
});

describe("carga de insumos de granja", () => {
  it("entiende la categoría por su nombre, acepta decimales y guarda la existencia contada", () => {
    const r = leerCatalogo("insumos", [
      enc("insumos"),
      ["Citronela", "FUM-002", "Venenos de fumigación", "cc", "200", "100", ""],
      ["Formol", "DES-002", "desinfeccion", "Litro", "0,5", "1", ""],
      ["Sin conteo", "", "Aseo general", "litro", "", "", ""],
      ["Mala", "", "Venenos", "litro"],
      ["Mala 2", "", "Aseo general", "litro", "", "mucho"],
    ], vacio);
    expect(r.nuevos.map((f) => [f.datos.categoria, f.datos.unidad, f.datos.stock_minimo, f.existencia])).toEqual([
      ["fumigacion", "cc", 200, 100], ["desinfeccion", "litro", 0.5, 1], ["aseo", "litro", null, null],
    ]);
    expect(r.errores.map((e) => e.fila)).toEqual([5, 6]);
  });

  it("si ya existe, solo actualiza lo que cambia; un conteo distinto cuenta como cambio", () => {
    const ex: Existentes = { registros: new Map([["cloro", { id: "i1", nombre: "CLORO", categoria: "aseo", unidad: "litro", stock_minimo: 2, existencia: 0 }]]) };
    const igual = leerCatalogo("insumos", [enc("insumos"), ["Cloro", "", "Aseo general", "litro", "2", "0"]], ex);
    expect(igual.actualizar).toEqual([]);
    const conteo = leerCatalogo("insumos", [enc("insumos"), ["Cloro", "", "Aseo general", "litro", "2", "5"]], ex);
    expect(conteo.actualizar[0]).toMatchObject({ id: "i1", existencia: 5, datos: {} });
  });
});
