import { describe, expect, it } from "vitest";
import { validarTratamiento, validarSeguimiento, validarMedicamentos, diasDeTratamiento } from "@/lib/granja/tratamientos";

const HOY = "2026-11-28";

describe("tratamientos", () => {
  it("exige animal y diagnóstico; fecha por defecto hoy", () => {
    expect(validarTratamiento({ animal_id: "", diagnostico: "Cólico" }, HOY).ok).toBe(false);
    expect(validarTratamiento({ animal_id: "a", diagnostico: " " }, HOY).ok).toBe(false);
    expect(validarTratamiento({ animal_id: "a", diagnostico: " Cólico  leve ", marcar_enfermo: true }, HOY))
      .toMatchObject({ ok: true, datos: { fecha: HOY, diagnostico: "Cólico leve", marcar_enfermo: true, veterinario: null } });
  });
  it("fechas: no futura y la revisión no antes del inicio", () => {
    expect(validarTratamiento({ animal_id: "a", diagnostico: "x", fecha: "2026-12-01" }, HOY).ok).toBe(false);
    expect(validarTratamiento({ animal_id: "a", diagnostico: "x", fecha: "2026-11-20", proxima_revision: "2026-11-19" }, HOY).ok).toBe(false);
    expect(validarTratamiento({ animal_id: "a", diagnostico: "x", fecha: "2026-11-20", proxima_revision: "2026-12-05" }, HOY).ok).toBe(true);
  });
  it("seguimiento: nota obligatoria salvo que solo se apliquen medicamentos; no antes del inicio", () => {
    expect(validarSeguimiento({ nota: "" }, "2026-11-20", HOY, false).ok).toBe(false);
    expect(validarSeguimiento({ nota: "" }, "2026-11-20", HOY, true)).toMatchObject({ ok: true, datos: { nota: "APLICACIÓN DE MEDICAMENTO" } });
    expect(validarSeguimiento({ nota: "Mejor", fecha: "2026-11-19" }, "2026-11-20", HOY, false).ok).toBe(false);
  });
  it("medicamentos: cantidad con decimales, sin repetir y sin pasar la existencia; líneas vacías se ignoran", () => {
    const ex = new Map([["i", { nombre: "IVERMECTINA", existencia: 2, unidad: "frasco" }]]);
    expect(validarMedicamentos([{ insumo_id: "i", cantidad: "0,5", dosis: "10 ml IM" }, { insumo_id: "", cantidad: "" }], ex))
      .toEqual({ ok: true, datos: [{ insumo_id: "i", cantidad: 0.5, dosis: "10 ml IM" }] });
    expect(validarMedicamentos([{ insumo_id: "i", cantidad: "3" }], ex).ok).toBe(false);
    expect(validarMedicamentos([{ insumo_id: "i", cantidad: "1" }, { insumo_id: "i", cantidad: "1" }], ex).ok).toBe(false);
    expect(validarMedicamentos([], ex)).toEqual({ ok: true, datos: [] });
  });
  it("días de tratamiento", () => {
    expect(diasDeTratamiento("2026-11-20", "2026-11-20")).toBe(1);
    expect(diasDeTratamiento("2026-11-20", "2026-11-28")).toBe(9);
  });
});
