import { describe, it, expect } from "vitest";
import { codigoDeMedio, etiquetaMedio, medioInicial, validarIcono, validarMediosActivos } from "../lib/caja/medios";

const efectivo = { id: "ef", activo: true, es_efectivo: true };
const nequi = { id: "nq", activo: true, es_efectivo: false };
const prepagado = { id: "pp", activo: true, es_efectivo: false };

describe("medioInicial", () => {
  it("arranca en efectivo aunque no sea el primero del orden (el caso de producción)", () => {
    // PREPAGADO quedó con orden 1 antes que EFECTIVO: la taquilla salía sin billetes.
    expect(medioInicial([prepagado, efectivo, nequi])?.id).toBe("ef");
  });

  it("sin medios en efectivo, toma el primero", () => {
    expect(medioInicial([nequi, prepagado])?.id).toBe("nq");
  });

  it("sin medios, no hay inicial", () => {
    expect(medioInicial([])).toBeUndefined();
  });
});

describe("validarMediosActivos", () => {
  it("deja desactivar un medio que no es efectivo", () => {
    expect(validarMediosActivos([efectivo, nequi], { ...nequi, activo: false })).toBeNull();
  });

  it("no deja desactivar el único efectivo", () => {
    expect(validarMediosActivos([efectivo, nequi], { ...efectivo, activo: false })).toMatch(/efectivo/);
  });

  it("no deja quitarle la marca de efectivo al único efectivo", () => {
    expect(validarMediosActivos([efectivo, nequi], { ...efectivo, es_efectivo: false })).toMatch(/efectivo/);
  });

  it("sí deja desactivar un efectivo si queda otro activo", () => {
    const efectivo2 = { id: "ef2", activo: true, es_efectivo: true };
    expect(validarMediosActivos([efectivo, efectivo2], { ...efectivo, activo: false })).toBeNull();
  });

  it("un efectivo inactivo no cuenta", () => {
    const efectivoInactivo = { id: "ef2", activo: false, es_efectivo: true };
    expect(validarMediosActivos([efectivo, efectivoInactivo, nequi], { ...efectivo, activo: false })).toMatch(/efectivo/);
  });

  it("no deja la lista vacía", () => {
    expect(validarMediosActivos([efectivo], { ...efectivo, activo: false })).toMatch(/al menos un medio/);
  });
});

describe("codigoDeMedio", () => {
  it("genera un código sin tildes ni espacios", () => {
    expect(codigoDeMedio("Tarjeta Débito")).toBe("tarjeta_debito");
    expect(codigoDeMedio("  Bancolombia QR ")).toBe("bancolombia_qr");
    expect(codigoDeMedio("PREPAGADO (BANCO)")).toBe("prepagado_banco");
  });

  it("nunca queda vacío", () => {
    expect(codigoDeMedio("¿?")).toBe("medio");
  });
});

describe("íconos de medios de pago", () => {
  it("el selector muestra el ícono delante del nombre", () => {
    expect(etiquetaMedio({ nombre: "EFECTIVO", icono: "💵" })).toBe("💵 EFECTIVO");
    expect(etiquetaMedio({ nombre: "NEQUI", icono: null })).toBe("NEQUI");
  });

  it("acepta emojis (también los de dos piezas) y vacío", () => {
    expect(validarIcono("💵")).toEqual({ ok: true, icono: "💵" });
    expect(validarIcono("🎟️")).toEqual({ ok: true, icono: "🎟️" });
    expect(validarIcono("  ")).toEqual({ ok: true, icono: null });
  });

  it("rechaza texto y HTML", () => {
    expect(validarIcono("efectivo").ok).toBe(false);
    expect(validarIcono("<b>").ok).toBe(false);
    expect(validarIcono("💵💵💵💵💵").ok).toBe(false);
  });
});
