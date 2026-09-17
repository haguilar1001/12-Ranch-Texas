import { describe, it, expect } from "vitest";
import { resumirAnulaciones, type LineaAnulacion } from "../lib/reportes/anulaciones";

const linea = (over: Partial<LineaAnulacion>): LineaAnulacion => ({
  fecha: new Date("2026-09-12T20:00:00-05:00"),
  numero_venta: 1,
  caja: "CAJA 1",
  vendio: "JUAN CAJERO",
  anulo: "JULIETH MARTINEZ",
  motivo: "ERROR DE DIGITACIÓN",
  total_cobrado: 60000,
  cantidad_asistentes: 1,
  comprador: "CLIENTE PARTICULAR",
  reemplazada_por: null,
  ...over,
});

describe("relación de ventas anuladas", () => {
  const lineas: LineaAnulacion[] = [
    linea({ numero_venta: 1, anulo: "JULIETH MARTINEZ", motivo: "LLUVIA", total_cobrado: 60000 }),
    linea({ numero_venta: 2, anulo: "JULIETH MARTINEZ", motivo: "ERROR DE DIGITACIÓN", total_cobrado: 120000 }),
    linea({ numero_venta: 3, anulo: "PEDRO SUPERVISOR", motivo: "LLUVIA", total_cobrado: 300000 }),
  ];

  it("suma el valor anulado y cuenta las ventas", () => {
    const r = resumirAnulaciones(lineas);
    expect(r.totalAnulado).toBe(480000);
    expect(r.totalVentas).toBe(3);
  });

  it("suma los asistentes", () => {
    const r = resumirAnulaciones([linea({ cantidad_asistentes: 2 }), linea({ cantidad_asistentes: 3 })]);
    expect(r.totalAsistentes).toBe(5);
  });

  it("agrupa por quién anuló, de mayor a menor valor", () => {
    const r = resumirAnulaciones(lineas);
    expect(r.porUsuario).toEqual([
      { usuario: "PEDRO SUPERVISOR", ventas: 1, valor: 300000 },
      { usuario: "JULIETH MARTINEZ", ventas: 2, valor: 180000 },
    ]);
  });

  it("agrupa por motivo, de mayor a menor valor", () => {
    const r = resumirAnulaciones(lineas);
    expect(r.porMotivo).toEqual([
      { motivo: "LLUVIA", ventas: 2, valor: 360000 },
      { motivo: "ERROR DE DIGITACIÓN", ventas: 1, valor: 120000 },
    ]);
  });

  it("ordena el detalle de la más reciente a la más antigua", () => {
    const r = resumirAnulaciones([
      linea({ numero_venta: 1, fecha: new Date("2026-09-10T00:00:00-05:00") }),
      linea({ numero_venta: 2, fecha: new Date("2026-09-15T00:00:00-05:00") }),
    ]);
    expect(r.lineas.map((l) => l.numero_venta)).toEqual([2, 1]);
  });

  it("una lista vacía no revienta, da todo en cero", () => {
    const r = resumirAnulaciones([]);
    expect(r).toMatchObject({ totalAnulado: 0, totalVentas: 0, totalAsistentes: 0, porUsuario: [], porMotivo: [] });
  });
});
