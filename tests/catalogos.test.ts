import { describe, expect, it } from "vitest";
import { validarProveedor, validarMateriaPrima, validarRubro, validarArea, rutaRubro, pesos, etiquetaCondicion } from "@/lib/catalogos/validar";

describe("catálogo de proveedores", () => {
  it("limpia espacios, deja vacíos en null y el correo en minúsculas", () => {
    const r = validarProveedor({ nombre: "  Henos   Orjuela ", email: "Ventas@Henos.CO", telefono: "300 123 4567", condiciones_pago: "credito_30", ciudad: " " });
    expect(r).toMatchObject({ ok: true, datos: { nombre: "Henos Orjuela", email: "ventas@henos.co", telefono: "300 123 4567", condiciones_pago: "credito_30", ciudad: null } });
  });
  it("exige nombre y valida correo, teléfono y condiciones de pago", () => {
    expect(validarProveedor({ nombre: " " }).ok).toBe(false);
    expect(validarProveedor({ nombre: "X", email: "sin-arroba" }).ok).toBe(false);
    expect(validarProveedor({ nombre: "X", telefono: "llamar" }).ok).toBe(false);
    expect(validarProveedor({ nombre: "X", condiciones_pago: "fiado" }).ok).toBe(false);
  });
  it("etiqueta de condiciones de pago", () => {
    expect(etiquetaCondicion("credito_30")).toBe("Crédito 30 días");
    expect(etiquetaCondicion(null)).toBe("");
  });
});

describe("catálogo de materias primas", () => {
  it("costo en pesos desde texto con puntos y unidad en minúsculas", () => {
    const r = validarMateriaPrima({ nombre: "Cloro granulado", unidad_medida: "KG", costo_referencia: "$ 12.500" });
    expect(r).toMatchObject({ ok: true, datos: { unidad_medida: "kg", costo_referencia: 12500, proveedor_id: null } });
  });
  it("rechaza costo con decimales o negativo y exige unidad", () => {
    expect(validarMateriaPrima({ nombre: "A", unidad_medida: "kg", costo_referencia: "12,5" }).ok).toBe(false);
    expect(validarMateriaPrima({ nombre: "A", unidad_medida: "kg", costo_referencia: -3 }).ok).toBe(false);
    expect(validarMateriaPrima({ nombre: "A", unidad_medida: "" }).ok).toBe(false);
  });
  it("pesos", () => {
    expect(pesos("")).toBeNull();
    expect(pesos("45.000")).toBe(45000);
    expect(pesos("abc")).toBe("error");
  });
});

describe("catálogo de rubros (grupo › rubro › subrubro)", () => {
  it("un grupo no lleva padre; un rubro va en un grupo; un subrubro en un rubro", () => {
    expect(validarRubro({ nombre: "Operación", nivel: "grupo" }, null)).toMatchObject({ ok: true, datos: { padre_id: null, orden: 0 } });
    expect(validarRubro({ nombre: "X", nivel: "grupo", padre_id: "g1" }, "grupo").ok).toBe(false);
    expect(validarRubro({ nombre: "Aseo", nivel: "rubro", padre_id: "g1" }, "grupo").ok).toBe(true);
    expect(validarRubro({ nombre: "Aseo", nivel: "rubro", padre_id: "r1" }, "rubro").ok).toBe(false);
    expect(validarRubro({ nombre: "Aseo", nivel: "rubro" }, null).ok).toBe(false);
    expect(validarRubro({ nombre: "Jabón", nivel: "subrubro", padre_id: "r1" }, "rubro").ok).toBe(true);
    expect(validarRubro({ nombre: "Jabón", nivel: "subrubro", padre_id: "g1" }, "grupo").ok).toBe(false);
    expect(validarRubro({ nombre: "Jabón", nivel: "otro" }, null).ok).toBe(false);
  });
  it("ruta legible", () => {
    const m = new Map([
      ["g", { nombre: "OPERACIÓN", padre_id: null }],
      ["r", { nombre: "ASEO", padre_id: "g" }],
      ["s", { nombre: "JABÓN", padre_id: "r" }],
    ]);
    expect(rutaRubro("s", m)).toBe("OPERACIÓN › ASEO › JABÓN");
  });
});

describe("catálogo de áreas", () => {
  it("exige nombre", () => {
    expect(validarArea({ nombre: "" }).ok).toBe(false);
    expect(validarArea({ nombre: "Piscina", descripcion: "" })).toEqual({ ok: true, datos: { nombre: "Piscina", descripcion: null } });
  });
});
