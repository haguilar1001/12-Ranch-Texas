import { describe, it, expect } from "vitest";
import { validarSolicitud, validarCierre, kmRecorridos, horaFinDe, type EntradaSolicitud } from "../lib/vehiculos/calculo";

const base: EntradaSolicitud = {
  solicitante_id: "sol-1",
  hora_inicio: new Date("2026-09-25T08:00:00-05:00"),
  hora_fin: new Date("2026-09-25T12:00:00-05:00"),
  prioridad: "media",
  descripcion: "Recoger insumos en el centro",
  origen: "Parque",
  destino: "Centro de acopio",
};

describe("validarSolicitud", () => {
  it("acepta una solicitud bien formada", () => {
    expect(validarSolicitud(base)).toEqual([]);
  });

  it("exige solicitante", () => {
    const e = validarSolicitud({ ...base, solicitante_id: "" });
    expect(e.some((x) => x.includes("quién solicita"))).toBe(true);
  });

  it("exige descripción", () => {
    const e = validarSolicitud({ ...base, descripcion: "  " });
    expect(e.some((x) => x.includes("Describe"))).toBe(true);
  });

  it("rechaza hora de fin antes o igual a la de inicio", () => {
    const igual = validarSolicitud({ ...base, hora_fin: base.hora_inicio });
    expect(igual.some((x) => x.includes("después de la hora de inicio"))).toBe(true);

    const antes = validarSolicitud({ ...base, hora_fin: new Date("2026-09-25T07:00:00-05:00") });
    expect(antes.some((x) => x.includes("después de la hora de inicio"))).toBe(true);
  });

  it("rechaza fechas inválidas", () => {
    const e = validarSolicitud({ ...base, hora_inicio: null, hora_fin: null });
    expect(e.some((x) => x.includes("hora de inicio no es válida"))).toBe(true);
    expect(e.some((x) => x.includes("duración no es válida"))).toBe(true);
  });

  it("exige origen y destino", () => {
    const sinOrigen = validarSolicitud({ ...base, origen: "  " });
    expect(sinOrigen.some((x) => x.includes("el origen"))).toBe(true);

    const sinDestino = validarSolicitud({ ...base, destino: "" });
    expect(sinDestino.some((x) => x.includes("el destino"))).toBe(true);
  });
});

describe("horaFinDe", () => {
  it("suma la duración en minutos a la hora de inicio", () => {
    const inicio = new Date("2026-09-25T08:00:00-05:00");
    expect(horaFinDe(inicio, 90).toISOString()).toBe(new Date("2026-09-25T09:30:00-05:00").toISOString());
    expect(horaFinDe(inicio, 480).toISOString()).toBe(new Date("2026-09-25T16:00:00-05:00").toISOString());
  });
});

describe("validarCierre", () => {
  it("acepta un cierre válido", () => {
    expect(validarCierre(1000, 1050)).toEqual([]);
  });

  it("acepta kilometraje inicial y final iguales (viaje corto, mismo cuadro)", () => {
    expect(validarCierre(1000, 1000)).toEqual([]);
  });

  it("rechaza kilometraje final menor al inicial", () => {
    const e = validarCierre(1050, 1000);
    expect(e.some((x) => x.includes("no puede ser menor"))).toBe(true);
  });

  it("rechaza valores negativos o no enteros", () => {
    expect(validarCierre(-1, 100).length).toBeGreaterThan(0);
    expect(validarCierre(100, -1).length).toBeGreaterThan(0);
    expect(validarCierre(100.5, 200).length).toBeGreaterThan(0);
  });
});

describe("kmRecorridos", () => {
  it("calcula la diferencia", () => {
    expect(kmRecorridos(1000, 1050)).toBe(50);
  });

  it("da 0 si falta algún dato o el final es menor", () => {
    expect(kmRecorridos(null, 1050)).toBe(0);
    expect(kmRecorridos(1000, null)).toBe(0);
    expect(kmRecorridos(1050, 1000)).toBe(0);
  });
});
