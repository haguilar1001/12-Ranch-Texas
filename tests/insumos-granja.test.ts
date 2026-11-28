import { describe, expect, it } from "vitest";
import {
  cantidad, calcularExistencia, estadoStock, proximoVencimiento, validarInsumo, validarMovimiento, validarProductosFumigacion, formatearCantidad,
} from "@/lib/granja/insumos";

const HOY = "2026-11-28";

describe("cantidades con decimales", () => {
  it("acepta coma o punto y hasta 3 decimales", () => {
    expect(cantidad("0,5")).toBe(0.5);
    expect(cantidad("1.25")).toBe(1.25);
    expect(cantidad(30)).toBe(30);
    expect(cantidad("")).toBeNull();
    expect(cantidad("1.000,5")).toBe("error");
    expect(cantidad("-1")).toBe("error");
    expect(cantidad("0,1234")).toBe("error");
  });
  it("formato legible", () => expect(formatearCantidad(1.5, "litro")).toBe("1,5 litro"));
});

describe("existencia desde el kardex", () => {
  it("suma entradas, resta salidas, el ajuste fija el saldo y lo anulado no cuenta", () => {
    expect(calcularExistencia([
      { tipo: "saldo_inicial", cantidad: 30, fecha: "2026-11-01" },
      { tipo: "consumo", cantidad: 2.5, fecha: "2026-11-02" },
      { tipo: "compra", cantidad: 10, fecha: "2026-11-03" },
      { tipo: "fumigacion", cantidad: 1, fecha: "2026-11-04", anulado: true },
      { tipo: "ajuste", cantidad: 36, fecha: "2026-11-05" },
      { tipo: "fumigacion", cantidad: 0.3, fecha: "2026-11-06" },
    ])).toBe(35.7);
  });
  it("ordena por fecha aunque lleguen desordenados", () => {
    expect(calcularExistencia([
      { tipo: "consumo", cantidad: 1, fecha: "2026-11-10" },
      { tipo: "ajuste", cantidad: 5, fecha: "2026-11-01" },
    ])).toBe(4);
  });
  it("sin decimales fantasma (0,1 + 0,2)", () => {
    expect(calcularExistencia([{ tipo: "compra", cantidad: 0.1, fecha: "2026-11-01" }, { tipo: "compra", cantidad: 0.2, fecha: "2026-11-02" }])).toBe(0.3);
  });
});

describe("estado del stock y vencimientos", () => {
  it("agotado, bajo y disponible", () => {
    expect(estadoStock(0, 2)).toBe("agotado");
    expect(estadoStock(1, 2)).toBe("bajo");
    expect(estadoStock(1, null)).toBe("disponible");
    expect(estadoStock(3, 2)).toBe("disponible");
  });
  it("vencimiento más próximo de las entradas que no han vencido", () => {
    expect(proximoVencimiento([
      { tipo: "compra", vencimiento: "2027-03-01" },
      { tipo: "compra", vencimiento: "2026-12-15" },
      { tipo: "compra", vencimiento: "2026-10-01" },
      { tipo: "compra", vencimiento: "2026-12-01", anulado: true },
      { tipo: "consumo", vencimiento: "2026-12-02" },
    ], HOY)).toBe("2026-12-15");
  });
});

describe("validaciones", () => {
  it("insumo", () => {
    expect(validarInsumo({ nombre: " Cloro ", categoria: "aseo", unidad: "Litro", stock_minimo: "2" })).toMatchObject({ ok: true, datos: { nombre: "Cloro", unidad: "litro", stock_minimo: 2 } });
    expect(validarInsumo({ nombre: "X", categoria: "veneno", unidad: "l" }).ok).toBe(false);
    expect(validarInsumo({ nombre: "X", categoria: "aseo", unidad: "" }).ok).toBe(false);
  });
  it("movimiento: no deja sacar más de lo que hay y exige motivo en pérdidas y ajustes", () => {
    expect(validarMovimiento({ tipo: "consumo", cantidad: "3" }, 2, HOY).ok).toBe(false);
    expect(validarMovimiento({ tipo: "consumo", cantidad: "1,5" }, 2, HOY)).toMatchObject({ ok: true, datos: { cantidad: 1.5, fecha: HOY } });
    expect(validarMovimiento({ tipo: "ajuste", cantidad: "0" }, 2, HOY).ok).toBe(false);
    expect(validarMovimiento({ tipo: "ajuste", cantidad: "0", motivo: "Conteo" }, 2, HOY).ok).toBe(true);
    expect(validarMovimiento({ tipo: "perdida", cantidad: "1" }, 2, HOY).ok).toBe(false);
    expect(validarMovimiento({ tipo: "fumigacion", cantidad: "1" }, 2, HOY).ok).toBe(false);
    expect(validarMovimiento({ tipo: "compra", cantidad: "1", fecha: "2026-12-01" }, 0, HOY).ok).toBe(false);
  });
  it("compra guarda valor, lote y vencimiento; una salida no", () => {
    expect(validarMovimiento({ tipo: "compra", cantidad: "2", valor: "$ 45.000", lote: "L12", vencimiento: "2027-01-31" }, 0, HOY))
      .toMatchObject({ ok: true, datos: { valor: 45000, lote: "L12", vencimiento: "2027-01-31" } });
    expect(validarMovimiento({ tipo: "consumo", cantidad: "1", valor: "5000", lote: "L1" }, 2, HOY)).toMatchObject({ ok: true, datos: { valor: null, lote: null } });
  });
  it("productos de una fumigación", () => {
    const ex = new Map([["a", { nombre: "NO FLY", existencia: 2, unidad: "litro" }], ["b", { nombre: "CITRONELA", existencia: 100, unidad: "cc" }]]);
    expect(validarProductosFumigacion([], ex).ok).toBe(false);
    expect(validarProductosFumigacion([{ insumo_id: "a", cantidad: "3" }], ex).ok).toBe(false);
    expect(validarProductosFumigacion([{ insumo_id: "a", cantidad: "1" }, { insumo_id: "a", cantidad: "1" }], ex).ok).toBe(false);
    expect(validarProductosFumigacion([{ insumo_id: "a", cantidad: "0,5" }, { insumo_id: "b", cantidad: "50" }, { insumo_id: "", cantidad: "" }], ex))
      .toEqual({ ok: true, datos: [{ insumo_id: "a", cantidad: 0.5 }, { insumo_id: "b", cantidad: 50 }] });
  });
});
