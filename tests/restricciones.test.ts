import { describe, it, expect } from "vitest";
import { leerRango, describirRango, describirRestricciones } from "../lib/accesos/restricciones";

// Celdas TAL CUAL vienen en el reglamento del parque. Si alguna se lee mal, la puerta
// deja por fuera a alguien que sí podía entrar.
describe("estatura (número suelto = mínimo)", () => {
  const est = (c: string) => leerRango(c, "min");

  it("rango con dos números", () => {
    expect(est("115 cm - 160 cm")).toEqual({ min: 115, max: 160, nota: null });
    expect(est("160 cm - 170 cm")).toEqual({ min: 160, max: 170, nota: null });
  });

  it("Mario Karts: 130 cm 110 cm, sin guion, se ordena solo", () => {
    expect(est("130 cm 110 cm")).toEqual({ min: 110, max: 130, nota: null });
  });

  it("máximo explícito", () => {
    expect(est("130 cm max")).toEqual({ min: null, max: 130, nota: null });
    expect(est("167 cm (max)")).toEqual({ min: null, max: 167, nota: null });
  });

  it("mínimo explícito", () => {
    expect(est("150 cm (min)")).toEqual({ min: 150, max: null, nota: null });
    expect(est("65 cm (min)")).toEqual({ min: 65, max: null, nota: null });
  });

  it("Karts de Pista: número suelto es MÍNIMO (confirmado con el responsable)", () => {
    expect(est("150 cm")).toEqual({ min: 150, max: null, nota: null });
  });

  it("Piscinas: se queda con el número y no se pierde el matiz", () => {
    expect(est("155 cm (min para piscina adulto)")).toEqual({ min: 155, max: null, nota: null });
  });

  it("NA es sin restricción", () => {
    expect(est("NA")).toEqual({ min: null, max: null, nota: null });
    expect(est("")).toEqual({ min: null, max: null, nota: null });
  });
});

describe("peso (número suelto = máximo, la columna se llama 'Peso max kg')", () => {
  const peso = (c: string) => leerRango(c, "max");

  it("rango", () => {
    expect(peso("20 kg - 55 kg")).toEqual({ min: 20, max: 55, nota: null });
  });

  it("máximo explícito", () => {
    expect(peso("80 kg max")).toEqual({ min: null, max: 80, nota: null });
  });

  it("número suelto es tope", () => {
    expect(peso("37 kg")).toEqual({ min: null, max: 37, nota: null });
    expect(peso("150 kg")).toEqual({ min: null, max: 150, nota: null });
  });
});

describe("edad", () => {
  const edad = (c: string) => leerRango(c, "min");

  it("rango de años", () => {
    expect(edad("3 - 12 años")).toEqual({ min: 3, max: 12, nota: null });
    expect(edad("3 - 10 años")).toEqual({ min: 3, max: 10, nota: null });
  });

  it("de tantos en adelante", () => {
    expect(edad("10 años en adelante")).toEqual({ min: 10, max: null, nota: null });
    expect(edad("15 +")).toEqual({ min: 15, max: null, nota: null });
    expect(edad("18 +")).toEqual({ min: 18, max: null, nota: null });
  });

  it("acompañamiento NO es un límite de edad: queda como nota", () => {
    const botes = edad("menores de 4 años acompañados");
    expect(botes.min).toBeNull();
    expect(botes.max).toBeNull();
    expect(botes.nota).toContain("acompañados");

    const piscinas = edad("menos de 12 años acompañados con adulto responsable");
    expect(piscinas.min).toBeNull();
    expect(piscinas.nota).toContain("adulto responsable");
  });
});

describe("cómo se le muestra al visitante", () => {
  it("arma el texto según lo que haya", () => {
    expect(describirRango({ min: 115, max: 160, nota: null }, "cm")).toBe("115–160 cm");
    expect(describirRango({ min: 150, max: null, nota: null }, "cm")).toBe("desde 150 cm");
    expect(describirRango({ min: null, max: 130, nota: null }, "cm")).toBe("hasta 130 cm");
    expect(describirRango({ min: null, max: null, nota: null }, "cm")).toBeNull();
  });

  it("junta las tres restricciones de Karts Areneros", () => {
    expect(
      describirRestricciones({
        estatura_minima: 115, estatura_maxima: 160,
        peso_minimo: 20, peso_maximo: 55,
        edad_minima: null, edad_maxima: null,
      }),
    ).toBe("115–160 cm · 20–55 kg");
  });

  it("Motocross: estatura con tope, peso con tope y edad mínima", () => {
    expect(
      describirRestricciones({
        estatura_minima: 160, estatura_maxima: 170,
        peso_minimo: null, peso_maximo: 80,
        edad_minima: 15, edad_maxima: null,
      }),
    ).toBe("160–170 cm · hasta 80 kg · desde 15 años");
  });

  it("sin restricciones no dice nada", () => {
    expect(
      describirRestricciones({
        estatura_minima: null, estatura_maxima: null,
        peso_minimo: null, peso_maximo: null,
        edad_minima: null, edad_maxima: null,
      }),
    ).toBeNull();
  });
});
