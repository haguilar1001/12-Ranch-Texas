import { describe, it, expect } from "vitest";
import { validarMovimiento } from "../lib/caja/movimientos";

const base = { monto: 20000, concepto: "Compra de hielo" };

describe("validarMovimiento", () => {
  it("un egreso exige a quién se le entrega la plata", () => {
    expect(validarMovimiento({ ...base, tipo: "egreso" })).toMatch(/a quién/);
    expect(validarMovimiento({ ...base, tipo: "egreso", beneficiarioId: "b1" })).toBeNull();
  });

  it("un ingreso no exige beneficiario", () => {
    expect(validarMovimiento({ ...base, tipo: "ingreso" })).toBeNull();
  });

  it("monto entero positivo y concepto", () => {
    expect(validarMovimiento({ ...base, tipo: "ingreso", monto: 0 })).toMatch(/Monto/);
    expect(validarMovimiento({ ...base, tipo: "ingreso", monto: 1500.5 })).toMatch(/Monto/);
    expect(validarMovimiento({ ...base, tipo: "ingreso", concepto: "  " })).toMatch(/concepto/);
  });

  it("solo ingreso o egreso", () => {
    expect(validarMovimiento({ ...base, tipo: "apertura" as "ingreso" })).toMatch(/Tipo/);
  });
});
