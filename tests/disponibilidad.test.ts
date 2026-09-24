import { describe, it, expect } from "vitest";
import { esFinDeSemanaOFestivo, diaOperativoDe, disponibleHoy } from "../lib/tarifas/disponibilidad";

/** Instante UTC para el mediodía Bogotá de una fecha YYYY-MM-DD dada. */
function bogota(fecha: string): Date {
  return new Date(`${fecha}T12:00:00-05:00`);
}

describe("día operativo (semana vs. fin de semana/festivo)", () => {
  it("un martes cualquiera es día de semana", () => {
    // 2026-09-22 es martes.
    expect(esFinDeSemanaOFestivo(bogota("2026-09-22"))).toBe(false);
    expect(diaOperativoDe(bogota("2026-09-22"))).toBe("semana");
  });

  it("sábado y domingo son fin de semana", () => {
    // 2026-09-19 sábado, 2026-09-20 domingo.
    expect(esFinDeSemanaOFestivo(bogota("2026-09-19"))).toBe(true);
    expect(esFinDeSemanaOFestivo(bogota("2026-09-20"))).toBe(true);
    expect(diaOperativoDe(bogota("2026-09-19"))).toBe("fin_semana_festivo");
  });

  it("un festivo colombiano entre semana cuenta como fin de semana/festivo", () => {
    // 20 de julio de 2026 (Día de la Independencia) cae lunes: festivo fijo, no fin de semana por sí solo.
    expect(esFinDeSemanaOFestivo(bogota("2026-07-20"))).toBe(true);
    expect(diaOperativoDe(bogota("2026-07-20"))).toBe("fin_semana_festivo");
  });

  it("el día antes y después de un festivo entre semana siguen siendo día de semana", () => {
    // 2026-07-21 martes, día después del festivo del 20 de julio.
    expect(esFinDeSemanaOFestivo(bogota("2026-07-21"))).toBe(false);
  });
});

describe("disponibleHoy", () => {
  it("un tipo 'todos' se ve cualquier día", () => {
    expect(disponibleHoy("todos", bogota("2026-09-22"))).toBe(true);
    expect(disponibleHoy("todos", bogota("2026-09-19"))).toBe(true);
  });

  it("un tipo 'semana' solo se ve entre semana", () => {
    expect(disponibleHoy("semana", bogota("2026-09-22"))).toBe(true); // martes
    expect(disponibleHoy("semana", bogota("2026-09-19"))).toBe(false); // sábado
  });

  it("un tipo 'fin_semana_festivo' solo se ve fin de semana/festivo", () => {
    expect(disponibleHoy("fin_semana_festivo", bogota("2026-09-19"))).toBe(true); // sábado
    expect(disponibleHoy("fin_semana_festivo", bogota("2026-09-22"))).toBe(false); // martes
    expect(disponibleHoy("fin_semana_festivo", bogota("2026-07-20"))).toBe(true); // festivo entre semana
  });
});
