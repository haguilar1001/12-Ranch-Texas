import { describe, it, expect } from "vitest";
import { resumirEstado, tiempoAbierto, type CajaEnEstado } from "../lib/caja/estado";

const caja = (p: Partial<CajaEnEstado> & { caja: string }): CajaEnEstado => ({
  turnoId: p.caja, cajero: "X", estado: "abierto",
  abierto_en: new Date("2026-09-13T13:00:00Z"), cerrado_en: null,
  base: 0, numVentas: 0, anuladas: 0, asistentes: 0, totalVentas: 0,
  esperadoEfectivo: 0, contado: null, diferencia: null,
  ...p,
});

describe("estado de las cajas", () => {
  it("suma lo vendido de abiertas y cerradas juntas", () => {
    const e = resumirEstado(
      [caja({ caja: "CAJA 1", totalVentas: 10_000, numVentas: 2, asistentes: 5 })],
      [caja({ caja: "CAJA 2", estado: "cerrado", totalVentas: 4_000, numVentas: 1, asistentes: 3 })],
    );
    expect(e.totalVentas).toBe(14_000);
    expect(e.totalVentasCount).toBe(3);
    expect(e.totalAsistentes).toBe(8);
  });

  // El efectivo de una caja cerrada ya salió del cajón: sumarlo diría que en el
  // parque hay una plata que ya está en la consignación.
  it("el efectivo en cajones solo cuenta las cajas abiertas", () => {
    const e = resumirEstado(
      [caja({ caja: "CAJA 1", esperadoEfectivo: 350_000 })],
      [caja({ caja: "CAJA 2", estado: "cerrado", esperadoEfectivo: 900_000, contado: 900_000, diferencia: 0 })],
    );
    expect(e.efectivoEnCajones).toBe(350_000);
  });

  it("acumula las diferencias de las cerradas y cuenta cuántas no cuadraron", () => {
    const e = resumirEstado([], [
      caja({ caja: "CAJA 1", estado: "cerrado", diferencia: 0 }),
      caja({ caja: "CAJA 2", estado: "cerrado", diferencia: -20_000 }),
      caja({ caja: "CAJA 3", estado: "cerrado", diferencia: 5_000 }),
    ]);
    expect(e.diferenciaCerradas).toBe(-15_000);
    expect(e.cerradasConDiferencia).toBe(2);
  });

  it("sin cajas no rompe y no inventa cifras", () => {
    const e = resumirEstado([], []);
    expect(e).toMatchObject({
      totalVentas: 0, totalAsistentes: 0, efectivoEnCajones: 0,
      diferenciaCerradas: 0, cerradasConDiferencia: 0,
    });
  });
});

describe("tiempo que lleva abierto un turno", () => {
  const t = (min: number) => tiempoAbierto(new Date(Date.now() - min * 60_000));

  it("lo dice en horas y minutos", () => {
    expect(t(45)).toBe("45 min");
    expect(t(60)).toBe("1 h");
    expect(t(195)).toBe("3 h 15 min");
    // El turno que quedó de ayer tiene que verse como lo que es.
    expect(t(60 * 13 + 20)).toBe("13 h 20 min");
  });

  it("un reloj adelantado no produce tiempos negativos", () => {
    expect(tiempoAbierto(new Date(Date.now() + 60_000))).toBe("0 min");
  });
});
