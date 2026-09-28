import { describe, it, expect } from "vitest";
import { rankingConsumo, SIN_ASIGNAR } from "../lib/gastos/consumo";

describe("gasto por área y por solicitante", () => {
  const gastos = [
    { clave: "rest", nombre: "RESTAURANTE", total: 300_000 },
    { clave: "adm", nombre: "ADMINISTRACIÓN", total: 120_000 },
    { clave: "rest", nombre: "RESTAURANTE", total: 180_000 },
    { clave: null, nombre: null, total: 900_000 },
    { clave: "adm", nombre: "ADMINISTRACIÓN", total: 0 },
  ];

  it("agrupa, suma y ordena de mayor a menor", () => {
    const r = rankingConsumo(gastos);
    expect(r.map((f) => f.nombre)).toEqual(["RESTAURANTE", "ADMINISTRACIÓN", SIN_ASIGNAR]);
    expect(r[0]).toMatchObject({ total: 480_000, gastos: 2 });
    expect(r[1]).toMatchObject({ total: 120_000, gastos: 2 });
  });

  it("lo no asignado va al final aunque sea lo más grande", () => {
    const r = rankingConsumo(gastos);
    expect(r[r.length - 1]).toMatchObject({ clave: null, total: 900_000 });
  });

  it("la participación suma 100 % y la suma de totales cuadra", () => {
    const r = rankingConsumo(gastos);
    expect(r.reduce((t, f) => t + f.total, 0)).toBe(1_500_000);
    expect(r.find((f) => f.clave === "rest")!.participacion).toBe(32);
    expect(Math.round(r.reduce((t, f) => t + f.participacion, 0))).toBe(100);
  });

  it("sin gastos no hay filas ni divisiones por cero", () => {
    expect(rankingConsumo([])).toEqual([]);
    expect(rankingConsumo([{ clave: "a", nombre: "A", total: 0 }])[0].participacion).toBe(0);
  });
});
