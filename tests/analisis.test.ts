import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/db", () => ({ prisma: {} }));

import { analizar, type MesPyg } from "../lib/analisis/financiero";

// Parque de juguete: costo fijo 100 al mes (nómina), variable 10% (comisión), sin costo de ventas.
const mes = (m: number, ingresos: number, extra = 0): MesPyg => ({
  mes: m, ingresos, costo_ventas: 0, gastos: 100 + extra + ingresos * 0.1,
  cuentas: { NOMINA: 100, "PERSONAL EXTRA": extra, COMISION: ingresos * 0.1 },
});

describe("análisis financiero", () => {
  const a = analizar(2026, [mes(1, 300), mes(2, 100), mes(3, 200), mes(4, 400)], null)!;

  it("acumula y calcula márgenes", () => {
    expect(a.acum.ingresos).toBe(1000);
    expect(a.acum.utilidad).toBe(1000 - 400 - 100);
    expect(a.acum.margen_op).toBeCloseTo(0.5);
  });

  it("encuentra el punto de equilibrio: fijo 100 / (1 − 10%) ≈ 111", () => {
    expect(a.equilibrio!.fijo_mes).toBeCloseTo(100);
    expect(a.equilibrio!.tasa_var).toBeCloseTo(0.1);
    expect(a.equilibrio!.pe_bajo).toBeCloseTo(111.11, 1);
    expect(a.equilibrio!.meses_bajo_pe).toEqual([2]);
  });

  it("compara trimestres y marca el parcial", () => {
    expect(a.trimestres.map((t) => t.nombre)).toEqual(["I (ene–mar)", "II (abr–abr) parcial"]);
    expect(a.trimestres[1].var_margen_pp).toBeGreaterThan(0);
  });

  it("escribe conclusiones y alertas con las cifras", () => {
    const p = analizar(2026, [mes(1, 300), mes(2, 50, 30), mes(3, 200)], null)!;
    expect(p.conclusiones[0].titulo).toMatch(/1 mes cerró en pérdida/);
    expect(p.alertas.find((x) => x.senal.startsWith("Margen operacional"))!.disparada).toBe(false);
    const feb = analizar(2026, [mes(1, 300), mes(2, 50, 30)], null)!;
    expect(feb.alertas.find((x) => x.senal.startsWith("Personal extra"))!.disparada).toBe(true); // 30/50 = 60%
  });

  it("sin datos no hay análisis", () => {
    expect(analizar(2026, [], null)).toBeNull();
  });
});
