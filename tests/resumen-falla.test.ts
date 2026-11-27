import { describe, expect, it } from "vitest";
import { filasResumen, numeroReporte, textoWhatsApp } from "../lib/equipos/resumen-falla";

const base = {
  id: "a1b2c3d4-0000-4000-8000-000000000000", equipo: "Kart 3", codigo: "KRT-03", grupo: "Karts", ubicacion: "Pista",
  descripcion: "No arranca", prioridad: "critica", detenido: true, reportadoPor: "Ana Pérez", fecha: "2026-11-27T20:30:00Z", fotos: 2,
};

describe("resumen de falla para WhatsApp", () => {
  it("número corto del reporte", () => expect(numeroReporte(base.id)).toBe("A1B2C3D4"));

  it("incluye equipo, quién reporta, prioridad, estado y fecha en hora de Bogotá", () => {
    const f = Object.fromEntries(filasResumen(base).map((x) => [x.etiqueta, x.valor]));
    expect(f.Equipo).toBe("Kart 3 (KRT-03)");
    expect(f.Reporta).toBe("Ana Pérez");
    expect(f.Prioridad).toBe("Crítica");
    expect(f["Estado del equipo"]).toMatch(/DETENIDO/);
    expect(f.Fecha).toMatch(/27/);
    expect(f.Fecha).toMatch(/3:30/); // 20:30 UTC = 3:30 p. m. Bogotá
    expect(f.Fotos).toBe("2 adjuntas en la app");
  });

  it("omite ubicación y fotos si no hay", () => {
    const f = filasResumen({ ...base, grupo: null, ubicacion: null, fotos: 0, codigo: null }).map((x) => x.etiqueta);
    expect(f).not.toContain("Grupo / ubicación");
    expect(f).not.toContain("Fotos");
  });

  it("texto de WhatsApp con negritas y la descripción", () => {
    const t = textoWhatsApp(base);
    expect(t).toContain("*REPORTE DE FALLA #A1B2C3D4*");
    expect(t).toContain("*Falla:* No arranca");
    expect(t).toContain("🔴 Crítica");
    expect(t).not.toContain("Solución sugerida");
    expect(textoWhatsApp({ ...base, solucion: "Cambiar la bujía" })).toContain("*Solución sugerida:* Cambiar la bujía");
  });
});
