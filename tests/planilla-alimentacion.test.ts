import { describe, expect, it } from "vitest";
import {
  aValorPlanilla, estadoEntrega, fechaDelTurno, franjasDeRacion, teoricoEnFranja, textoPlanilla, unidadPlanilla,
  type RacionPlanilla,
} from "../lib/animales/planilla";

const heno = { id: "h", nombre: "HENO", unidad_medida: "paca", equivalencia_g: 15_000, costo_unitario: 17_500 };
const podium = { id: "p", nombre: "PODIUM", unidad_medida: "bulto", equivalencia_g: 40_000, costo_unitario: 87_260 };
const sal = { id: "s", nombre: "SAL EQUINA", unidad_medida: "saco", equivalencia_g: 10_000, costo_unitario: 32_445 };

const racion = (x: Partial<RacionPlanilla>): RacionPlanilla => ({
  id: "r", destino: "CABALLOS", categoria: "EQUINOS", cabezas: 36, cantidad: 1, unidad: "paca",
  modo: "individual", frecuencia: "diaria", horario: null, alimento: heno, ...x,
});

describe("planilla de alimentación por turno", () => {
  it("equinos: 3 turnos y el día repartido entre ellos (36 pacas → 12 por turno)", () => {
    const r = racion({});
    expect(franjasDeRacion(r)).toEqual(["07:00", "12:00", "16:00"]);
    expect(teoricoEnFranja(r, "12:00")).toBe(12 * 15_000);
    expect(textoPlanilla(teoricoEnFranja(r, "07:00")!, heno)).toBe("12 pacas");
  });

  it("los demás animales: 2 turnos, sin mediodía", () => {
    const r = racion({ categoria: "BOVINOS", destino: "VACAS", cabezas: 15, cantidad: 2, unidad: "kg", alimento: podium });
    expect(franjasDeRacion(r)).toEqual(["07:00", "16:00"]);
    expect(teoricoEnFranja(r, "12:00")).toBeNull();
    expect(teoricoEnFranja(r, "07:00")).toBe(15_000);
    expect(aValorPlanilla(15_000, podium)).toBe("15");
  });

  it("consumo libre: una sola vez al día, en el primer turno, con todo el día", () => {
    const r = racion({ cantidad: 30, unidad: "g", alimento: sal, horario: "CONSUMO LIBRE" });
    expect(franjasDeRacion(r)).toEqual(["07:00"]);
    expect(teoricoEnFranja(r, "07:00")).toBe(1_080);
    expect(teoricoEnFranja(r, "16:00")).toBeNull();
    expect(aValorPlanilla(1_080, sal)).toBe("1,08");
  });

  it("el heno se escribe en pacas; lo demás en kg", () => {
    expect(unidadPlanilla(heno)).toEqual({ unidad: "paca", base: 15_000 });
    expect(unidadPlanilla(podium)).toEqual({ unidad: "kg", base: 1_000 });
  });

  it("estado según lo real frente a lo teórico", () => {
    expect(estadoEntrega(12_000, 12_000)).toBe("realizada");
    expect(estadoEntrega(13_000, 12_000)).toBe("realizada");
    expect(estadoEntrega(8_000, 12_000)).toBe("parcial");
    expect(estadoEntrega(0, 12_000)).toBe("omitida");
  });

  it("un día pasado queda a la hora del turno; hoy, a la hora real", () => {
    const ahora = new Date("2026-11-12T15:30:00Z");
    expect(fechaDelTurno("2026-11-12", "07:00", "2026-11-12", ahora)).toBe(ahora);
    expect(fechaDelTurno("2026-11-10", "16:00", "2026-11-12", ahora).toISOString()).toBe("2026-11-10T21:00:00.000Z");
  });
});
