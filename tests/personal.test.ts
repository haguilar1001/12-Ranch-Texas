import { describe, it, expect } from "vitest";
import { FACTOR_PRESTACIONAL, costoEmpresa, cargaPrestacional, consolidarNomina } from "../lib/personal/costo";

// Salario mínimo aproximado usado en la nómina real del parque.
const MINIMO = 1_750_905;

describe("factor prestacional", () => {
  it("un empleado vale 1,5 veces su salario", () => {
    expect(FACTOR_PRESTACIONAL).toBe(0.5);
    expect(costoEmpresa(2_000_000)).toBe(3_000_000);
    expect(costoEmpresa(MINIMO)).toBe(2_626_358); // 1.750.905 × 1,5 = 2.626.357,5 → redondea
  });

  it("no deja decimales en pesos", () => {
    expect(Number.isInteger(costoEmpresa(MINIMO))).toBe(true);
    expect(Number.isInteger(costoEmpresa(1_333_333))).toBe(true);
  });

  it("separa la carga prestacional del salario", () => {
    expect(cargaPrestacional(2_000_000)).toBe(1_000_000);
    expect(cargaPrestacional(MINIMO) + MINIMO).toBe(costoEmpresa(MINIMO));
  });

  it("acepta otro factor si el negocio lo cambia", () => {
    expect(costoEmpresa(2_000_000, 0.45)).toBe(2_900_000);
    expect(costoEmpresa(2_000_000, 0)).toBe(2_000_000);
  });

  it("un salario inválido no cuesta nada, en vez de romper", () => {
    expect(costoEmpresa(0)).toBe(0);
    expect(costoEmpresa(-100)).toBe(0);
    expect(costoEmpresa(Number.NaN)).toBe(0);
  });
});

describe("consolidado de nómina", () => {
  it("suma salarios, carga y total", () => {
    const r = consolidarNomina([2_000_000, 4_000_000]);
    expect(r).toEqual({ personas: 2, salarios: 6_000_000, carga: 3_000_000, total: 9_000_000 });
  });

  it("ignora a quien no tiene salario cargado", () => {
    const r = consolidarNomina([2_000_000, null, undefined, 0]);
    expect(r.personas).toBe(1);
    expect(r.total).toBe(3_000_000);
  });

  it("el total siempre es salarios más carga", () => {
    const r = consolidarNomina([MINIMO, 1_800_000, 14_000_000]);
    expect(r.salarios + r.carga).toBe(r.total);
  });

  it("con la lista vacía devuelve ceros", () => {
    expect(consolidarNomina([])).toEqual({ personas: 0, salarios: 0, carga: 0, total: 0 });
  });
});
