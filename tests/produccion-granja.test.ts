import { describe, expect, it } from "vitest";
import { saldoProducto, validarMovProducto, validarEgreso, leerExcelGranja, consolidarAnio } from "@/lib/granja/produccion";

const HOY = "2026-11-28";

describe("existencia de productos de la granja", () => {
  it("producción suma, ventas/donaciones restan, el ajuste fija y lo anulado no cuenta", () => {
    expect(saldoProducto([
      { tipo: "produccion", cantidad: 30, fecha: "2026-11-01" },
      { tipo: "venta", cantidad: 10, fecha: "2026-11-02" },
      { tipo: "donacion", cantidad: 2, fecha: "2026-11-02" },
      { tipo: "venta", cantidad: 5, fecha: "2026-11-03", anulado: true },
      { tipo: "ajuste", cantidad: 17, fecha: "2026-11-04" },
      { tipo: "consumo_interno", cantidad: 1.5, fecha: "2026-11-05" },
    ])).toBe(15.5);
  });
});

describe("validar movimientos", () => {
  it("venta: precio obligatorio y valor = cantidad × precio redondeado", () => {
    expect(validarMovProducto({ tipo: "venta", cantidad: "7,5" }, 10, HOY).ok).toBe(false);
    expect(validarMovProducto({ tipo: "venta", cantidad: "7,5", precio_unitario: "24.000", cliente: "Doña Ana" }, 10, HOY))
      .toMatchObject({ ok: true, datos: { cantidad: 7.5, precio_unitario: 24000, valor: 180000, cliente: "Doña Ana" } });
    expect(validarMovProducto({ tipo: "venta", cantidad: "5.35", precio_unitario: 24000 }, 10, HOY)).toMatchObject({ ok: true, datos: { valor: 128400 } });
  });
  it("no deja vender o donar más de lo que hay", () => {
    const r = validarMovProducto({ tipo: "venta", cantidad: "11", precio_unitario: 14000 }, 10, HOY, "unidad");
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/hay 10 unidad/);
  });
  it("donación exige trabajador; pérdida y ajuste exigen motivo; producción no exige precio", () => {
    expect(validarMovProducto({ tipo: "donacion", cantidad: "2" }, 10, HOY).ok).toBe(false);
    expect(validarMovProducto({ tipo: "donacion", cantidad: "2", empleado_id: "e1" }, 10, HOY)).toMatchObject({ ok: true, datos: { empleado_id: "e1", valor: null } });
    expect(validarMovProducto({ tipo: "perdida", cantidad: "1" }, 10, HOY).ok).toBe(false);
    expect(validarMovProducto({ tipo: "ajuste", cantidad: "0", motivo: "Conteo" }, 10, HOY).ok).toBe(true);
    expect(validarMovProducto({ tipo: "produccion", cantidad: "30" }, 0, HOY)).toMatchObject({ ok: true, datos: { fecha: HOY } });
    expect(validarMovProducto({ tipo: "produccion", cantidad: "30", fecha: "2026-12-01" }, 0, HOY).ok).toBe(false);
  });
  it("egresos", () => {
    expect(validarEgreso({ concepto: "extras", valor: "$ 50.000", descripcion: "Pago a Juan" }, HOY)).toMatchObject({ ok: true, datos: { valor: 50000, fecha: HOY } });
    expect(validarEgreso({ concepto: "nomina", valor: 1, descripcion: "x" }, HOY).ok).toBe(false);
    expect(validarEgreso({ concepto: "otros", valor: "", descripcion: "x" }, HOY).ok).toBe(false);
    expect(validarEgreso({ concepto: "otros", valor: 5000, descripcion: "" }, HOY).ok).toBe(false);
  });
});

describe("leer el Excel de la granja", () => {
  const productos = new Map([["huevos", "h"], ["queso", "q"], ["suero", "s"]]);
  const filas = [
    [null, null], [null, "DETALLE PRODUCTOS RANCH TEXAS"], [], [null, null, null, null, null, null, 24133740],
    [null, "FECHA", "TIPO", "PRODUCTO", "VR UNITARIO", "CANTIDAD", "TOTAL", "MES", "AÑO"],
    [null, new Date("2026-03-10T00:00:00Z"), "INGRESO", "QUESO", 24000, 84, 2016000, "marzo", 2026],
    [null, new Date("2026-04-04T00:00:00Z"), "INGRESO", "QUESO", 24000, 5.35, 128400.0, "abril", 2026],
    [null, new Date("2026-03-14T00:00:00Z"), "EGRESO", "NOMINA", 40000, 1, 40000, "marzo", 2026],
    [null, new Date("2026-03-14T00:00:00Z"), "EGRESO", "OTROS", 68000, 1, 68000, "marzo", 2026],
    [null, new Date("2026-06-20T00:00:00Z"), "INGRESO", "HUEVOS", 14000, 2, 28000, "junio", 2026],
    [null, new Date("2026-06-20T00:00:00Z"), "INGRESO", "HUEVOS", 14000, 2, 28000, "junio", 2026],
    [null, new Date("2026-06-21T00:00:00Z"), "INGRESO", "LECHE", 3000, 1, 3000],
    [null, new Date("2026-12-21T00:00:00Z"), "INGRESO", "HUEVOS", 14000, 1, 14000],
    [null, null, null],
  ];
  const r = leerExcelGranja(filas as never, productos, HOY);

  it("encuentra el encabezado aunque haya títulos arriba", () => expect(r.encabezado).toBe(true));
  it("ventas con decimales, egresos NOMINA → extras", () => {
    expect(r.ventas.map((v) => [v.producto_id, v.cantidad, v.total])).toEqual([["q", 84, 2016000], ["q", 5.35, 128400], ["h", 2, 28000], ["h", 2, 28000]]);
    expect(r.egresos.map((e) => [e.concepto, e.valor])).toEqual([["extras", 40000], ["otros", 68000]]);
  });
  it("dos filas idénticas el mismo día son dos ventas con claves distintas", () => {
    const h = r.ventas.filter((v) => v.producto_id === "h");
    expect(h[0].clave).not.toBe(h[1].clave);
  });
  it("errores: producto que no existe y fecha futura", () => {
    expect(r.errores.map((e) => e.fila)).toEqual([12, 13]);
  });
  it("sin encabezado no es el archivo", () => expect(leerExcelGranja([["A", "B"]], productos, HOY).encabezado).toBe(false));
});

describe("consolidado por mes", () => {
  it("suma ingresos por producto, egresos y neto, solo del año pedido", () => {
    const m = consolidarAnio(
      [{ fecha: "2026-03-10", producto: "QUESO", valor: 2016000 }, { fecha: "2026-03-15", producto: "HUEVOS", valor: 42000 }, { fecha: "2025-03-01", producto: "QUESO", valor: 1 }],
      [{ fecha: "2026-03-14", concepto: "extras", valor: 40000 }, { fecha: "2026-03-14", concepto: "otros", valor: 68000 }],
      2026,
    );
    expect(m[2]).toEqual({ mes: 3, ingresos: { QUESO: 2016000, HUEVOS: 42000 }, totalIngresos: 2058000, extras: 40000, otros: 68000, totalEgresos: 108000, neto: 1950000 });
    expect(m[0].totalIngresos).toBe(0);
  });
});
