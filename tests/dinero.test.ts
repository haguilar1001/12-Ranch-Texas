import { describe, it, expect } from "vitest";
import { formatearCOP, formatearMiles, parseCOP, sumarCOP } from "../lib/dinero/cop";

// El espacio entre el símbolo y la cifra es DURO (U+00A0), no el normal: con el
// normal, una columna angosta parte "$ 300.000" dejando el "$" solo en una línea.
const NBSP = " ";

describe("dinero COP", () => {
  it("formatea con separador de miles y símbolo", () => {
    expect(formatearCOP(60000)).toBe(`$${NBSP}60.000`);
    expect(formatearCOP(1234567)).toBe(`$${NBSP}1.234.567`);
    expect(formatearCOP(0)).toBe(`$${NBSP}0`);
  });

  it("formatea negativos", () => {
    expect(formatearCOP(-5000)).toBe(`-$${NBSP}5.000`);
  });

  it("el espacio del símbolo no se puede partir de línea", () => {
    // Si alguien lo vuelve a un espacio normal, esta prueba lo detiene.
    expect(formatearCOP(300000)).not.toContain("$ ");
    expect(formatearCOP(300000)).toContain(NBSP);
  });

  // parseCOP tiene que seguir entendiendo lo que la app misma imprime.
  it("vuelve a leer su propia salida", () => {
    expect(parseCOP(formatearCOP(1234567))).toBe(1234567);
    expect(parseCOP(formatearCOP(0))).toBe(0);
  });

  it("formatea sin símbolo", () => {
    expect(formatearMiles(1234567)).toBe("1.234.567");
  });

  it("parsea texto con puntos y símbolo", () => {
    expect(parseCOP("$ 1.234.567")).toBe(1234567);
    expect(parseCOP("60.000")).toBe(60000);
    expect(parseCOP("")).toBe(0);
    expect(parseCOP("abc")).toBe(0);
  });

  it("suma enteros sin pérdida", () => {
    expect(sumarCOP([60000, 60000, 0, 0])).toBe(120000);
  });
});
