import { describe, it, expect } from "vitest";
import { variacionPct, formatearVariacion, formatearPct } from "../lib/reportes/util";

describe("variación porcentual", () => {
  it("calcula la variación", () => {
    expect(variacionPct(120, 100)).toBeCloseTo(20);
    expect(variacionPct(80, 100)).toBeCloseTo(-20);
    expect(variacionPct(100, 100)).toBe(0);
  });
  it("null cuando no hay base", () => {
    expect(variacionPct(100, 0)).toBeNull();
  });
  it("formatea con signo", () => {
    expect(formatearVariacion(20)).toBe("+20,0%");
    expect(formatearVariacion(-4)).toBe("−4,0%");
    expect(formatearVariacion(null)).toBe("—");
  });
});

describe("porcentajes", () => {
  // En una pantalla llena de pesos el punto es separador de MILES: "100.0%" se lee
  // como cien mil. En Colombia el decimal es coma.
  it("usa coma decimal, no punto", () => {
    expect(formatearPct(100)).toBe("100,0%");
    expect(formatearPct(30.62)).toBe("30,6%");
    expect(formatearPct(0)).toBe("0,0%");
    expect(formatearPct(1.5)).not.toContain(".");
  });

  it("admite otra cantidad de decimales", () => {
    expect(formatearPct(30.615, 2)).toBe("30,62%");
    expect(formatearPct(30.6, 0)).toBe("31%");
  });
});
