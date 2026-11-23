import { describe, it, expect, vi } from "vitest";

// Funciones puras; se aísla el cliente de BD para no requerir Postgres.
vi.mock("../lib/db", () => ({ prisma: {} }));

import { combinarMes, esMesFuturo, incluyeTaquilla, mesUsaTaquilla, totalesComparables } from "../lib/reportes/comparativo";

// Cifras reales del cuadro mes x producto 2026 y de la taquilla en producción.
const OCT_HIST = { ARRIENDOS: 35_500_000 };
const OCT_TAQ = { ENTRADAS: 424_828_000, EVENTOS: 62_585_000 }; // total taquilla 487.413.000
const SEP_HIST = { ENTRADAS: 247_008_000, EVENTOS: 23_820_000, ARRIENDOS: 35_500_000 };
const SEP_TAQ = { ENTRADAS: 187_361_000, EVENTOS: 9_880_000 }; // solo desde el 12-sep
const INICIO = { anio: 2026, mes: 9 };

describe("comparativo — corte por mes (histórico + taquilla)", () => {
  it("la taquilla manda desde el primer mes completo, no desde el mes de arranque", () => {
    expect(mesUsaTaquilla(INICIO, 2026, 8)).toBe(false);
    expect(mesUsaTaquilla(INICIO, 2026, 9)).toBe(false);
    expect(mesUsaTaquilla(INICIO, 2026, 10)).toBe(true);
    expect(mesUsaTaquilla(INICIO, 2027, 1)).toBe(true);
    expect(mesUsaTaquilla(null, 2026, 10)).toBe(false);
  });

  it("oct-2026: taquilla (entradas + eventos) + arriendos del histórico = total del cuadro", () => {
    expect(combinarMes(OCT_HIST, OCT_TAQ, true)).toEqual({ valor: 522_913_000, fuente: "taquilla" });
  });

  it("no suma dos veces ENTRADAS/EVENTOS si el histórico también las trae en un mes de taquilla", () => {
    const hist = { ...OCT_HIST, ENTRADAS: 467_353_000, EVENTOS: 20_060_000 };
    expect(combinarMes(hist, OCT_TAQ, true).valor).toBe(522_913_000);
  });

  it("sep-2026 (mes de arranque): todo sale del histórico", () => {
    expect(combinarMes(SEP_HIST, SEP_TAQ, false)).toEqual({ valor: 306_328_000, fuente: "historico" });
  });

  it("filtra por producto", () => {
    expect(combinarMes(OCT_HIST, OCT_TAQ, true, "ARRIENDOS")).toEqual({ valor: 35_500_000, fuente: "historico" });
    expect(combinarMes(OCT_HIST, OCT_TAQ, true, "EVENTOS")).toEqual({ valor: 62_585_000, fuente: "taquilla" });
    expect(combinarMes({}, { ENTRADAS: 0, EVENTOS: 0 }, false, "GRANJA")).toEqual({ valor: 0, fuente: null });
  });

  it("un mes de taquilla sin ventas (p. ej. diciembre que no ha llegado) no lleva marca", () => {
    expect(combinarMes(OCT_HIST, { ENTRADAS: 0, EVENTOS: 0 }, true, "ENTRADAS")).toEqual({ valor: 0, fuente: null });
  });

  it("detecta meses que aún no empiezan", () => {
    expect(esMesFuturo(2026, 12, "2026-11-23")).toBe(true);
    expect(esMesFuturo(2026, 11, "2026-11-23")).toBe(false);
    expect(esMesFuturo(2025, 12, "2026-11-23")).toBe(false);
    expect(esMesFuturo(2027, 1, "2026-12-31")).toBe(true);
  });

  it("el total compara solo los meses transcurridos (ene–nov vs ene–nov)", () => {
    const meses = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1, anterior: 100, actual: i < 11 ? 110 : 0,
      fuenteAnterior: null, fuenteActual: null, futuro: i === 11,
    }));
    expect(totalesComparables(meses)).toEqual({ totalActual: 1210, totalAnterior: 1100, totalAnteriorAnio: 1200, periodo: "ene–nov" });
    expect(totalesComparables(meses.map((m) => ({ ...m, futuro: false }))).periodo).toBeNull();
  });

  it("la taquilla solo cuenta en todos los productos, ENTRADAS o EVENTOS", () => {
    expect(incluyeTaquilla()).toBe(true);
    expect(incluyeTaquilla("ENTRADAS")).toBe(true);
    expect(incluyeTaquilla("EVENTOS")).toBe(true);
    expect(incluyeTaquilla("ARRIENDOS")).toBe(false);
  });
});
