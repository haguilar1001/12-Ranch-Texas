import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { leerPygPdf } from "../lib/importar/pyg-pdf";
import type { Renglon } from "../lib/importar/pdf-lineas";
import { leerVentaMes } from "../lib/importar/venta-mes";
import { leerPresupuesto } from "../lib/importar/presupuesto";
import { grupoGasto, grupoIngreso } from "../lib/pyg/cuentas";

// Renglón de PDF de mentira: etiqueta a la izquierda y números alineados a la derecha en columnas
// de 100 px (bordes derechos en 300, 400, 500 = consolidado). `null` deja la celda en blanco.
const COLS = [300, 400, 500];
const fila = (etiqueta: string, ...vals: (string | null)[]): Renglon => [
  { texto: etiqueta, x: 20, fin: 120 },
  ...vals.flatMap((v, i) => (v == null ? [] : [{ texto: v, x: COLS[i] - v.length * 5, fin: COLS[i] }])),
];
const titulo = (t: string): Renglon => [{ texto: t, x: 200, fin: 320 }];
const pdf = (sobrescribir: Partial<Record<string, Renglon>> = {}): Renglon[] => [
  titulo("CONSOLIDADO RANCH TEXAS PARQUE"),
  titulo("ESTADO DE PERDIDAS Y GANANCIAS"),
  titulo("ABRIL AÑO 2026"),
  [{ texto: "ADMINISTRACION", x: 240, fin: 300 }, { texto: "OPERATIVO", x: 355, fin: 400 }, { texto: "CONSOLIDADO", x: 445, fin: 500 }],
  fila("INGRESOS", "1.000", "9.000", "10.000"),
  fila("ENTRADAS", "0", "9.000", "9.000"),
  sobrescribir.ARRIENDO ?? fila("ARRIENDO", "1.000", null, "1.000"),
  fila("( - ) COSTO DE VENTAS", "0", "500", "500"),
  fila("( = ) UTILIDAD BRUTA", "1.000", "8.500", "9.500"),
  fila("( - ) GASTOS", "3.000", "1.000", "4.000"),
  fila("NOMINA", "2.000", "0", "2.000"),
  fila("ALIMENTO", "1.000", "1.000", "2.000"),
  fila("( = ) UTILIDAD OPERACIONAL", "-2.000", "7.500", "5.500"),
];

describe("lector del estado de resultados en PDF", () => {
  it("lee periodo, unidades, cuentas y totales; una celda en blanco no corre los valores", () => {
    const r = leerPygPdf(pdf());
    expect(r.anio).toBe(2026);
    expect(r.mes).toBe(4);
    expect(r.unidades).toEqual(["ADMINISTRACION", "OPERATIVO"]);
    expect(r.lineas.find((l) => l.cuenta === "ARRIENDO")?.valores).toEqual([1000, 0]);
    expect(r.lineas.find((l) => l.cuenta === "COSTO DE VENTAS")?.valores).toEqual([0, 500]);
    expect(r.totales).toEqual({ ingresos: 10000, costo_ventas: 500, utilidad_bruta: 9500, gastos: 4000, utilidad_operacional: 5500 });
  });

  it("rechaza el archivo si una cuenta no cuadra con su consolidado", () => {
    expect(() => leerPygPdf(pdf({ ARRIENDO: fila("ARRIENDO", "1.000", "300", "1.000") }))).toThrow(/ARRIENDO/);
  });

  it("rechaza un PDF que no es un estado de resultados", () => {
    expect(() => leerPygPdf([titulo("FACTURA DE VENTA"), titulo("MARZO 2026")])).toThrow(/INGRESOS/);
  });
});

const libro = (hojas: Record<string, unknown[][]>) => {
  const wb = XLSX.utils.book_new();
  for (const [n, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), n);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

describe("lector de venta por mes", () => {
  it("lee el año de la hoja y los valores por producto, sin el total", () => {
    const r = leerVentaMes(libro({ "2026": [["Mes", "Total", "ENTRADAS", "ARRIENDOS"], ["ENE", 300, 200, 100], ["FEB", 50, 50, null]] }), "x.xlsx");
    expect(r.anio).toBe(2026);
    expect(r.celdas).toEqual([
      { anio: 2026, mes: 1, producto: "ENTRADAS", valor: 200 },
      { anio: 2026, mes: 1, producto: "ARRIENDOS", valor: 100 },
      { anio: 2026, mes: 2, producto: "ENTRADAS", valor: 50 },
    ]);
    expect(r.totales.get(1)).toBe(300);
  });
});

describe("lector del presupuesto", () => {
  it("carga solo gastos (sin ingresos) y la nómina por empleado", () => {
    const datos = libro({
      Gastos: [[null, "TOTAL GASTOS", 150, 0, 150], [null, "GASTOS", "PARQUE", "RESTAURANTE", "TOTAL"], [null, "NOMINA", 100, 0, 100], [null, "ENERGIA", 50, 0, 50], [null, "SUBTOTAL", null, null, 120]],
      PYG: [[null, "INGRESOS", 500, 1], [null, "COSTO", 0, 0]],
      Nomina: [
        [null, null, null, "TOTALES", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 300],
        [null, "#", "NOMBRE EMPLEADO", "CARGO", "SALARIO", "AUX. TPTE", "AUX. VIV.", "SUELDO TOTAL", "CESAN", "INT. CESAN", "PRIMAS", "VACAC.", "CAJA", "ICBF", "SENA", "EPS", "AFP", "ARL", "OTROS", "ADMON", "TOTAL", "AREA"],
        [null, 1, "Ana Pérez", "Administradora", 100, 0, 0, 100, 8, 1, 8, 4, 4, null, null, 4, 12, 2, 143, 0, 143, "PARQUE"],
        [null, 2, "Luis Gómez", "Celador", 120, 10, 0, 130, 11, 1, 11, 5, 5, 2, 3, 5, 14, 3, 157, 0, 157, "OTROS"],
      ],
    });
    const r = leerPresupuesto(datos, "PYG Presupuestado Ranch Texas 2026.xlsx");
    expect(r.anio).toBe(2026);
    expect(r.totalGastos).toBe(150);
    expect(r.avisos).toEqual([]); // cuadra con TOTAL GASTOS aunque el SUBTOTAL sea parcial, y la nómina con TOTALES
    expect(r.lineas.map((l) => [l.seccion, l.cuenta, l.valor])).toEqual([["gasto", "NOMINA", 100], ["gasto", "ENERGIA", 50]]);
    expect(r.totalNomina).toBe(300);
    expect(r.nomina[1]).toMatchObject({ nombre: "LUIS GÓMEZ", cargo: "CELADOR", area: "OTROS", salario: 120, aux_transporte: 10, prestaciones: 28, parafiscales: 10, seguridad_social: 22, total: 157 });
  });

  it("pide el año en el nombre del archivo", () => {
    expect(() => leerPresupuesto(libro({ Gastos: [["GASTOS", "TOTAL"]] }), "presupuesto.xlsx")).toThrow(/año/);
  });
});

describe("grupos de cuentas", () => {
  it("agrupa sin importar tildes ni mayúsculas, y lo desconocido va a Otros", () => {
    expect(grupoGasto("Energía Eléctrica")).toBe("Servicios públicos y aseo");
    expect(grupoGasto("COMIDA CABALLOS (HENO)")).toBe("Animales");
    expect(grupoGasto("Nómina - Otros")).toBe("Personal");
    expect(grupoGasto("CUENTA NUEVA")).toBe("Otros gastos");
    expect(grupoIngreso("ARRIENDO")).toBe("Arriendos");
  });
});
