import { describe, expect, it } from "vitest";
import {
  calcularSaldo, saldoMinimo, resumirPorTipo,
  EFECTO_ANIMAL, EFECTO_EQUIPO, TIPOS_MOV_ANIMAL, TIPOS_MOV_EQUIPO,
  type MovimientoUnidades,
} from "../lib/inventario/kardex";

const d = (s: string) => new Date(s);
const mov = (efecto: MovimientoUnidades["efecto"], cantidad: number, fecha: string, extra: Partial<MovimientoUnidades> = {}): MovimientoUnidades =>
  ({ efecto, cantidad, fecha: d(fecha), ...extra });

describe("kardex de unidades (animales y equipos)", () => {
  it("suma entradas y resta salidas", () => {
    expect(calcularSaldo([
      mov("entrada", 47, "2026-11-01"), // saldo inicial de patos
      mov("entrada", 6, "2026-11-03"), // nacimientos
      mov("salida", 2, "2026-11-05"), // muertes
    ])).toBe(51);
  });

  it("el ajuste fija el saldo y lo anterior deja de importar", () => {
    expect(calcularSaldo([
      mov("entrada", 47, "2026-11-01"),
      mov("salida", 2, "2026-11-02"),
      mov("ajuste", 40, "2026-11-03"),
      mov("entrada", 1, "2026-11-04"),
    ])).toBe(41);
  });

  it("ordena por la fecha del hecho, no por el orden en que se registró", () => {
    // El ajuste se registró después, pero ocurrió antes que el nacimiento.
    expect(calcularSaldo([
      mov("entrada", 3, "2026-11-10"),
      mov("ajuste", 10, "2026-11-05"),
    ])).toBe(13);
  });

  it("los anulados no cuentan", () => {
    expect(calcularSaldo([
      mov("entrada", 10, "2026-11-01"),
      mov("salida", 4, "2026-11-02", { anulado: true }),
    ])).toBe(10);
  });

  it("el traslado completo de un equipo no mueve la cantidad", () => {
    expect(calcularSaldo([mov("entrada", 1, "2026-11-01"), mov("neutro", 1, "2026-11-02")])).toBe(1);
  });

  it("saldoMinimo detecta que una salida deja el grupo en negativo en algún punto", () => {
    const base = [mov("entrada", 5, "2026-11-01"), mov("salida", 3, "2026-11-10")];
    expect(saldoMinimo(base)).toBe(0);
    // Registrar hoy una muerte con fecha del 5: 5 − 4 = 1, luego −3 = −2.
    expect(saldoMinimo([...base, mov("salida", 4, "2026-11-05")])).toBe(-2);
  });

  it("resumen por tipo ignora anulados", () => {
    const r = resumirPorTipo([
      { tipo: "muerte", cantidad: 1, valor: null, anulado: false },
      { tipo: "muerte", cantidad: 2, valor: null, anulado: false },
      { tipo: "venta", cantidad: 3, valor: 900000, anulado: false },
      { tipo: "venta", cantidad: 1, valor: 300000, anulado: true },
    ]);
    expect(r.find((x) => x.tipo === "muerte")).toEqual({ tipo: "muerte", movimientos: 2, cantidad: 3, valor: 0 });
    expect(r.find((x) => x.tipo === "venta")).toEqual({ tipo: "venta", movimientos: 1, cantidad: 3, valor: 900000 });
  });

  it("cada tipo del enum de la BD tiene su efecto", () => {
    for (const t of TIPOS_MOV_ANIMAL) expect(EFECTO_ANIMAL[t]).toBeDefined();
    for (const t of TIPOS_MOV_EQUIPO) expect(EFECTO_EQUIPO[t]).toBeDefined();
  });
});

import { fechaDelHecho } from "../lib/inventario/kardex";

describe("fechaDelHecho", () => {
  const ahora = new Date("2026-11-12T13:30:00Z");
  it("hoy usa la hora actual", () => expect(fechaDelHecho("2026-11-12", "2026-11-12", ahora)).toBe(ahora));
  it("un día anterior queda al mediodía de Bogotá", () =>
    expect(fechaDelHecho("2026-11-05", "2026-11-12", ahora)?.toISOString()).toBe("2026-11-05T17:00:00.000Z"));
  it("rechaza futuro y basura", () => {
    expect(fechaDelHecho("2026-11-13", "2026-11-12", ahora)).toBeNull();
    expect(fechaDelHecho("12/11/2026", "2026-11-12", ahora)).toBeNull();
  });
});
