import { describe, it, expect } from "vitest";
import { validarVentaOtra } from "../lib/ventas-otras/validar";

const HOY = "2026-11-23";
const base = { fecha: "2026-11-05", linea: "arriendos", valor: 35_500_000, descripcion: "Arriendo local comidas noviembre" };

describe("ventas fuera de taquilla — validación", () => {
  it("acepta una venta válida y normaliza la línea a MAYÚSCULAS", () => {
    const r = validarVentaOtra(base, HOY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.linea).toBe("ARRIENDOS");
      expect(r.datos.fecha.toISOString().slice(0, 10)).toBe("2026-11-05");
      expect(r.datos.valor).toBe(35_500_000);
    }
  });

  it("rechaza ENTRADAS y EVENTOS: salen de la taquilla", () => {
    expect(validarVentaOtra({ ...base, linea: "Entradas" }, HOY)).toMatchObject({ ok: false });
    expect(validarVentaOtra({ ...base, linea: " eventos " }, HOY)).toMatchObject({ ok: false });
  });

  it("rechaza valor cero, negativo o con decimales", () => {
    expect(validarVentaOtra({ ...base, valor: 0 }, HOY).ok).toBe(false);
    expect(validarVentaOtra({ ...base, valor: -1000 }, HOY).ok).toBe(false);
    expect(validarVentaOtra({ ...base, valor: 1000.5 }, HOY).ok).toBe(false);
  });

  it("rechaza fecha futura, inválida o vacía", () => {
    expect(validarVentaOtra({ ...base, fecha: "2026-11-24" }, HOY).ok).toBe(false);
    expect(validarVentaOtra({ ...base, fecha: "2026-02-30" }, HOY).ok).toBe(false);
    expect(validarVentaOtra({ ...base, fecha: "" }, HOY).ok).toBe(false);
  });

  it("exige línea y descripción", () => {
    expect(validarVentaOtra({ ...base, linea: "  " }, HOY).ok).toBe(false);
    expect(validarVentaOtra({ ...base, descripcion: "" }, HOY).ok).toBe(false);
  });
});
