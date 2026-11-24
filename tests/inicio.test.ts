import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/db", () => ({ prisma: {} }));

import { rangosPeriodo } from "../lib/inicio";

const hoy0 = new Date("2026-11-24T05:00:00Z"); // 24-nov 00:00 en Bogotá
const bog = (d: Date) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 16);

describe("periodo de los indicadores de Inicio", () => {
  it("día: hoy contra ayer", () => {
    const r = rangosPeriodo("dia", "2026-11-24", hoy0);
    expect([bog(r.desde), bog(r.hasta), bog(r.baseDesde), bog(r.baseHasta)]).toEqual(["2026-11-24T00:00", "2026-11-25T00:00", "2026-11-23T00:00", "2026-11-24T00:00"]);
    expect(r.textoBase).toBe("vs ayer");
  });

  it("mes: del 1 a hoy contra los mismos días del mes anterior", () => {
    const r = rangosPeriodo("mes", "2026-11-24", hoy0);
    expect([bog(r.desde), bog(r.hasta), bog(r.baseDesde), bog(r.baseHasta)]).toEqual(["2026-11-01T00:00", "2026-11-25T00:00", "2026-10-01T00:00", "2026-10-25T00:00"]);
    expect(r.titulo).toBe("Noviembre (1 al 24)");
    expect(r.textoBase).toBe("vs 1 al 24 de octubre");
  });

  it("mes: si el mes anterior es más corto, compara hasta su último día; enero compara con diciembre", () => {
    const r = rangosPeriodo("mes", "2027-03-31", new Date("2027-03-31T05:00:00Z"));
    expect(bog(r.baseHasta)).toBe("2027-03-01T00:00"); // 1 al 28 de febrero
    expect(r.textoBase).toBe("vs 1 al 28 de febrero");
    const e = rangosPeriodo("mes", "2027-01-10", new Date("2027-01-10T05:00:00Z"));
    expect(bog(e.baseDesde)).toBe("2026-12-01T00:00");
  });
});
