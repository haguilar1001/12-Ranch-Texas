import { describe, it, expect, vi } from "vitest";

// combinarMeses e incluyeTaquilla son puras; se aísla el cliente de BD para no requerir Postgres.
vi.mock("../lib/db", () => ({ prisma: {} }));

import { combinarMeses, incluyeTaquilla } from "../lib/reportes/comparativo";

describe("comparativo — corte por mes (histórico + taquilla)", () => {
  it("usa la taquilla cuando el mes tiene ventas en vivo, aunque exista histórico", () => {
    const hist = [100, 200, 0, 0, 0, 0, 0, 500, 0, 0, 0, 0];
    const vivo = [0, 0, 0, 0, 0, 0, 0, 800, 900, 0, 0, 0];
    const r = combinarMeses(hist, vivo);
    expect(r[0]).toEqual({ valor: 100, fuente: "historico" });
    expect(r[1]).toEqual({ valor: 200, fuente: "historico" });
    expect(r[7]).toEqual({ valor: 800, fuente: "taquilla" }); // no suma 500 + 800
    expect(r[8]).toEqual({ valor: 900, fuente: "taquilla" });
    expect(r[11]).toEqual({ valor: 0, fuente: null });
    expect(r).toHaveLength(12);
  });

  it("la taquilla solo cuenta en todos los productos o ENTRADAS", () => {
    expect(incluyeTaquilla()).toBe(true);
    expect(incluyeTaquilla("ENTRADAS")).toBe(true);
    expect(incluyeTaquilla("GRANJA")).toBe(false);
  });
});
