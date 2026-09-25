import { describe, it, expect } from "vitest";
import { enteroALetras, pesosEnLetras } from "../lib/dinero/letras";

describe("enteroALetras", () => {
  it("unidades, decenas y los casos especiales", () => {
    expect(enteroALetras(0)).toBe("CERO");
    expect(enteroALetras(1)).toBe("UN");
    expect(enteroALetras(15)).toBe("QUINCE");
    expect(enteroALetras(21)).toBe("VEINTIÚN");
    expect(enteroALetras(30)).toBe("TREINTA");
    expect(enteroALetras(45)).toBe("CUARENTA Y CINCO");
    expect(enteroALetras(100)).toBe("CIEN");
    expect(enteroALetras(101)).toBe("CIENTO UN");
    expect(enteroALetras(500)).toBe("QUINIENTOS");
    expect(enteroALetras(999)).toBe("NOVECIENTOS NOVENTA Y NUEVE");
  });

  it("miles", () => {
    expect(enteroALetras(1000)).toBe("MIL");
    expect(enteroALetras(1500)).toBe("MIL QUINIENTOS");
    expect(enteroALetras(21000)).toBe("VEINTIÚN MIL");
    expect(enteroALetras(100000)).toBe("CIEN MIL");
    expect(enteroALetras(125000)).toBe("CIENTO VEINTICINCO MIL");
    expect(enteroALetras(500000)).toBe("QUINIENTOS MIL");
  });

  it("millones", () => {
    expect(enteroALetras(1_000_000)).toBe("UN MILLÓN");
    expect(enteroALetras(2_350_000)).toBe("DOS MILLONES TRESCIENTOS CINCUENTA MIL");
    expect(enteroALetras(1_001_001)).toBe("UN MILLÓN MIL UN");
  });

  it("rechaza negativos y decimales", () => {
    expect(() => enteroALetras(-1)).toThrow();
    expect(() => enteroALetras(1.5)).toThrow();
  });
});

describe("pesosEnLetras", () => {
  it("como va en un comprobante", () => {
    expect(pesosEnLetras(35000)).toBe("TREINTA Y CINCO MIL PESOS M/CTE");
    expect(pesosEnLetras(1)).toBe("UN PESO M/CTE");
  });

  it("los millones redondos llevan DE", () => {
    expect(pesosEnLetras(1_000_000)).toBe("UN MILLÓN DE PESOS M/CTE");
    expect(pesosEnLetras(3_000_000)).toBe("TRES MILLONES DE PESOS M/CTE");
    expect(pesosEnLetras(1_200_000)).toBe("UN MILLÓN DOSCIENTOS MIL PESOS M/CTE");
  });
});
