import { describe, it, expect } from "vitest";
import { resumirVehiculos, type FilaViajeCompletado } from "../lib/reportes/vehiculos";

const fila = (over: Partial<FilaViajeCompletado>): FilaViajeCompletado => ({
  solicitante: "Gerencia Comercial", chofer: "Pedro Pérez", vehiculo: "ABC123",
  km_inicial: 1000, km_final: 1050, ...over,
});

describe("resumirVehiculos", () => {
  it("suma viajes y kilómetros totales", () => {
    const r = resumirVehiculos([fila({}), fila({ km_inicial: 2000, km_final: 2030 })]);
    expect(r.totalViajes).toBe(2);
    expect(r.kmTotales).toBe(80);
  });

  it("agrupa por solicitante y muestra quién pide más", () => {
    const r = resumirVehiculos([
      fila({ solicitante: "Gerencia Comercial" }),
      fila({ solicitante: "Gerencia Comercial" }),
      fila({ solicitante: "Recursos Humanos" }),
    ]);
    expect(r.porSolicitante[0]).toEqual({ nombre: "Gerencia Comercial", viajes: 2, km: 100 });
    expect(r.porSolicitante[1]).toEqual({ nombre: "Recursos Humanos", viajes: 1, km: 50 });
  });

  it("agrupa por chofer y por vehículo", () => {
    const r = resumirVehiculos([fila({ chofer: "Pedro Pérez", vehiculo: "ABC123" }), fila({ chofer: "Juan Gómez", vehiculo: "XYZ789" })]);
    expect(r.porChofer.map((c) => c.nombre).sort()).toEqual(["Juan Gómez", "Pedro Pérez"]);
    expect(r.porVehiculo.map((v) => v.nombre).sort()).toEqual(["ABC123", "XYZ789"]);
  });

  it("un viaje sin kilometraje no suma km pero sí cuenta como viaje", () => {
    const r = resumirVehiculos([fila({ km_inicial: null, km_final: null })]);
    expect(r.totalViajes).toBe(1);
    expect(r.kmTotales).toBe(0);
  });

  it("lista vacía da todo en cero", () => {
    const r = resumirVehiculos([]);
    expect(r.totalViajes).toBe(0);
    expect(r.kmTotales).toBe(0);
    expect(r.porSolicitante).toEqual([]);
  });
});
