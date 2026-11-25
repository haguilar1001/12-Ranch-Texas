import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/db", () => ({ prisma: {} }));

import { proximoPreventivo, vencimiento, subtotalRepuesto, horasFuera } from "../lib/equipos/mantenimiento";
import { calcularIndicadores, type OrdenIndicador } from "../lib/equipos/indicadores";

const d = (s: string) => new Date(`${s}T12:00:00-05:00`);
const plan = (dias: number | null, horas: number | null) => ({ frecuencia_dias: dias, frecuencia_horas: horas, aviso_dias: 7, creado_en: d("2026-11-01") });
const equipo = (usa: boolean, horometro: number | null = null) => ({ usa_horometro: usa, horometro, fecha_instalacion: null });

describe("programación de preventivos", () => {
  it("por fecha: desde el último realizado, o desde la creación del plan si nunca se hizo", () => {
    expect(proximoPreventivo(plan(30, null), equipo(false), null).fecha!.toISOString()).toBe(d("2026-12-01").toISOString());
    expect(proximoPreventivo(plan(30, null), equipo(false), { fecha_realizada: d("2026-11-20"), horometro: null }).fecha!.toISOString()).toBe(d("2026-12-20").toISOString());
  });

  it("por horas: desde la lectura del último realizado, o desde la lectura actual", () => {
    expect(proximoPreventivo(plan(null, 100), equipo(true, 340), null)).toEqual({ fecha: null, horas: 440 });
    expect(proximoPreventivo(plan(null, 100), equipo(true, 420), { fecha_realizada: d("2026-11-20"), horometro: 400 }).horas).toBe(500);
  });

  it("un plan por horas no programa nada en un equipo sin horómetro", () => {
    expect(proximoPreventivo(plan(null, 100), equipo(false), null)).toEqual({ fecha: null, horas: null });
  });
});

describe("vencimiento de una orden", () => {
  const hoy = d("2026-11-25");
  it("por fecha: vencida, próxima dentro del aviso, o al día", () => {
    expect(vencimiento({ fecha_programada: d("2026-11-24"), horometro_objetivo: null }, { horometro: null }, hoy)).toBe("vencido");
    expect(vencimiento({ fecha_programada: d("2026-11-25"), horometro_objetivo: null }, { horometro: null }, hoy)).toBe("proximo");
    expect(vencimiento({ fecha_programada: d("2026-11-30"), horometro_objetivo: null }, { horometro: null }, hoy)).toBe("proximo");
    expect(vencimiento({ fecha_programada: d("2026-12-20"), horometro_objetivo: null }, { horometro: null }, hoy)).toBe("al_dia");
  });
  it("por horas: vence al llegar a las horas, y avisa en el último 10 %", () => {
    expect(vencimiento({ fecha_programada: null, horometro_objetivo: 500 }, { horometro: 500 }, hoy, 7, 100)).toBe("vencido");
    expect(vencimiento({ fecha_programada: null, horometro_objetivo: 500 }, { horometro: 492 }, hoy, 7, 100)).toBe("proximo");
    expect(vencimiento({ fecha_programada: null, horometro_objetivo: 500 }, { horometro: 450 }, hoy, 7, 100)).toBe("al_dia");
  });
  it("con fecha y horas, vence con lo que llegue primero", () => {
    expect(vencimiento({ fecha_programada: d("2026-12-20"), horometro_objetivo: 500 }, { horometro: 510 }, hoy, 7, 100)).toBe("vencido");
  });
});

describe("costos y tiempos de una orden", () => {
  it("subtotal de repuesto redondeado al peso y horas parado", () => {
    expect(subtotalRepuesto(2.5, 18_333)).toBe(45_833);
    expect(horasFuera(new Date("2026-11-20T08:00:00-05:00"), new Date("2026-11-21T14:00:00-05:00"))).toBe(30);
    expect(horasFuera(null, new Date())).toBeNull();
  });
});

describe("indicadores de mantenimiento", () => {
  const o = (tipo: "preventivo" | "correctivo", costo: number, prog: string | null, real: string, grupo: string, equipo: string, horas: number | null = null): OrdenIndicador =>
    ({ tipo, costo, fecha_programada: prog ? d(prog) : null, fecha_realizada: d(real), horas_fuera_servicio: horas, grupo, equipo });
  const ind = calcularIndicadores([
    o("preventivo", 100_000, "2026-03-10", "2026-03-10", "KARTS", "Kart 1"),
    o("preventivo", 100_000, "2026-04-10", "2026-04-20", "KARTS", "Kart 2"),
    o("correctivo", 500_000, null, "2026-05-02", "KARTS", "Kart 1", 30),
    o("correctivo", 200_000, null, "2026-05-15", "BOTES", "Bote 1", 10),
  ]);
  it("suma costos por tipo, grupo y equipo", () => {
    expect([ind.costoTotal, ind.costoPreventivo, ind.costoCorrectivo]).toEqual([900_000, 200_000, 700_000]);
    expect(ind.porGrupo[0]).toEqual({ grupo: "KARTS", costo: 700_000, ordenes: 3 });
    expect(ind.topEquipos[0]).toEqual({ equipo: "Kart 1", costo: 600_000, correctivos: 1 });
    expect(ind.porMes[4]).toEqual({ mes: 5, preventivo: 0, correctivo: 700_000 });
  });
  it("cumplimiento de preventivos a tiempo y parada promedio por correctivo", () => {
    expect(ind.cumplimiento).toBe(0.5);
    expect(ind.horasParadoPromedio).toBe(20);
  });
});
