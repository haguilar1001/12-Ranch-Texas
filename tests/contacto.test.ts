import { describe, it, expect } from "vitest";
import { limpiarCelular, esCelularColombiano, esEmailValido } from "../lib/contacto";

describe("celular colombiano", () => {
  it("acepta 10 dígitos que empiezan por 3", () => {
    expect(esCelularColombiano("3001234567")).toBe(true);
    expect(esCelularColombiano("3187654321")).toBe(true);
  });

  it("ignora espacios y guiones al validar", () => {
    expect(esCelularColombiano("300 123 4567")).toBe(true);
    expect(esCelularColombiano("300-123-4567")).toBe(true);
  });

  it("rechaza lo que no empieza por 3", () => {
    expect(esCelularColombiano("2001234567")).toBe(false);
    expect(esCelularColombiano("6011234567")).toBe(false); // fijo de Bogotá
  });

  it("rechaza longitudes distintas de 10", () => {
    expect(esCelularColombiano("300123456")).toBe(false); // 9
    expect(esCelularColombiano("30012345678")).toBe(false); // 11
    expect(esCelularColombiano("")).toBe(false);
  });

  it("rechaza si trae letras", () => {
    expect(esCelularColombiano("300ABC4567")).toBe(false);
  });

  it("limpiarCelular deja solo dígitos", () => {
    expect(limpiarCelular("300 123-4567")).toBe("3001234567");
  });
});

describe("correo con arroba y punto", () => {
  it("acepta correos normales", () => {
    expect(esEmailValido("maria@gmail.com")).toBe(true);
    expect(esEmailValido("juan.perez@ranchtexas.com.co")).toBe(true);
  });

  it("rechaza sin arroba", () => {
    expect(esEmailValido("mariagmail.com")).toBe(false);
  });

  it("rechaza sin punto después de la arroba", () => {
    expect(esEmailValido("maria@gmailcom")).toBe(false);
  });

  it("rechaza espacios o arroba vacía de dominio", () => {
    expect(esEmailValido("maria @gmail.com")).toBe(false);
    expect(esEmailValido("maria@.com")).toBe(false);
    expect(esEmailValido("")).toBe(false);
  });
});
