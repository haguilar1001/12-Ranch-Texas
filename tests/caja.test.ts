import { describe, it, expect } from "vitest";
import { totalConteo, efectivoEsperado, calcularDiferencia } from "../lib/caja/cierre";
import { consolidarDia, type EntradaTurnoDia } from "../lib/caja/cuadreDiario";

describe("cierre de caja", () => {
  it("suma el conteo por denominación", () => {
    const t = totalConteo([
      { denominacion: 50000, cantidad: 3 }, // 150000
      { denominacion: 10000, cantidad: 5 }, // 50000
      { denominacion: 1000, cantidad: 7 },  // 7000
    ]);
    expect(t).toBe(207000);
  });

  it("efectivo esperado = base + ventas efectivo + otros ingresos − egresos", () => {
    expect(efectivoEsperado({ base_inicial: 200000, ventasEfectivo: 480000, otrosIngresos: 50000, egresos: 30000 })).toBe(700000);
  });

  it("diferencia con signo (sobrante / faltante / cuadra)", () => {
    expect(calcularDiferencia(700000, 700000)).toBe(0); // cuadra
    expect(calcularDiferencia(705000, 700000)).toBe(5000); // sobrante
    expect(calcularDiferencia(690000, 700000)).toBe(-10000); // faltante
  });
});

describe("cuadre diario consolidado (por fecha de venta)", () => {
  const entrada = (over: Partial<EntradaTurnoDia>): EntradaTurnoDia => ({
    turnoId: "t", caja: "Caja 1", usuario: "Ana", estado: "cerrado", abiertoEn: "", cerradoEn: null,
    numVentas: 0, totalVentas: 0, asistentes: 0, cortesias: 0, descuentos: 0,
    ventasPorMedio: [], ventasPorTipo: [],
    ventasEfectivo: 0, otrosIngresos: 0, egresos: 0, ...over,
  });

  it("suma totales y cuenta turnos con actividad", () => {
    const c = consolidarDia("2026-08-10", [
      entrada({ turnoId: "a", estado: "cerrado", numVentas: 3, totalVentas: 180000, asistentes: 3 }),
      entrada({ turnoId: "b", caja: "Caja 2", estado: "abierto", numVentas: 2, totalVentas: 120000, asistentes: 2 }),
    ], 1);
    expect(c.turnos).toBe(2);
    expect(c.turnosCerrados).toBe(1);
    expect(c.turnosAbiertos).toBe(1);
    expect(c.numVentas).toBe(5);
    expect(c.totalVentas).toBe(300000);
    expect(c.asistentes).toBe(5);
    expect(c.anuladas).toBe(1);
  });

  it("efectivo recaudado = ventas efectivo + otros ingresos − egresos (sin base)", () => {
    const c = consolidarDia("2026-08-10", [
      entrada({ ventasEfectivo: 300000, otrosIngresos: 50000, egresos: 20000 }),
      entrada({ caja: "Caja 2", ventasEfectivo: 100000 }),
    ], 0);
    expect(c.ventasEfectivo).toBe(400000);
    expect(c.otrosIngresos).toBe(50000);
    expect(c.egresos).toBe(20000);
    expect(c.efectivoRecaudado).toBe(430000);
  });

  it("agrega ventas por medio y por tipo entre cajas", () => {
    const c = consolidarDia("2026-08-10", [
      entrada({
        ventasPorMedio: [{ medio: "Efectivo", codigo: "efectivo", es_efectivo: true, total: 100000 }],
        ventasPorTipo: [{ tipo: "Adulto", cantidad: 2, total: 120000 }],
      }),
      entrada({
        caja: "Caja 2",
        ventasPorMedio: [{ medio: "Efectivo", codigo: "efectivo", es_efectivo: true, total: 60000 }],
        ventasPorTipo: [{ tipo: "Adulto", cantidad: 1, total: 60000 }],
      }),
    ], 0);
    expect(c.ventasPorMedio).toHaveLength(1);
    expect(c.ventasPorMedio[0].total).toBe(160000);
    expect(c.ventasPorTipo[0]).toMatchObject({ tipo: "Adulto", cantidad: 3, total: 180000 });
  });
});
