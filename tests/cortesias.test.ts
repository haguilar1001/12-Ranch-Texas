import { describe, it, expect } from "vitest";
import { resumirCortesias, type LineaCortesia } from "../lib/reportes/cortesias";
import { resolverValorCobrado, descuentoDeLinea } from "../lib/ventas/calculo";

const TARIFA = 60_000;

function linea(p: Partial<LineaCortesia> & Pick<LineaCortesia, "tipo" | "cantidad" | "valor_cobrado">): LineaCortesia {
  return {
    fecha: new Date("2026-09-09T15:00:00.000Z"),
    numero_venta: 1,
    caja: "Caja 1",
    cajero: "Ana",
    tipo_visitante: "Adulto",
    valor_lista: TARIFA,
    motivo: "Cliente frecuente",
    autoriza: "Héctor",
    no_cobrado: (TARIFA - p.valor_cobrado) * p.cantidad,
    ...p,
  } as LineaCortesia;
}

describe("valor cobrado por línea (descuentos)", () => {
  it("una cortesía siempre cobra 0, aunque pidan otra cosa", () => {
    expect(resolverValorCobrado(TARIFA, "atencion", 50_000)).toBe(0);
    expect(resolverValorCobrado(TARIFA, "invitacion", TARIFA)).toBe(0);
  });

  it("sin descuento pedido, cobra el valor de lista", () => {
    expect(resolverValorCobrado(TARIFA, "pago")).toBe(TARIFA);
    expect(resolverValorCobrado(TARIFA, "pago", null)).toBe(TARIFA);
  });

  it("aplica el descuento pedido", () => {
    expect(resolverValorCobrado(TARIFA, "pago", 45_000)).toBe(45_000);
    expect(resolverValorCobrado(TARIFA, "pago", 0)).toBe(0);
  });

  it("no deja cobrar más que la tarifa ni valores negativos", () => {
    expect(resolverValorCobrado(TARIFA, "pago", 90_000)).toBe(TARIFA);
    expect(resolverValorCobrado(TARIFA, "pago", -5_000)).toBe(0);
  });

  it("nunca deja decimales en pesos", () => {
    expect(resolverValorCobrado(TARIFA, "pago", 45_000.6)).toBe(45_001);
    expect(resolverValorCobrado(TARIFA, "pago", Number.NaN)).toBe(TARIFA);
  });

  it("calcula el descuento total de la línea", () => {
    expect(descuentoDeLinea({ valor_lista: TARIFA, valor_cobrado: 45_000, cantidad: 4 })).toBe(60_000);
    expect(descuentoDeLinea({ valor_lista: TARIFA, valor_cobrado: TARIFA, cantidad: 4 })).toBe(0);
  });
});

describe("relación de atenciones e invitaciones", () => {
  const lineas: LineaCortesia[] = [
    linea({ tipo: "atencion", cantidad: 2, valor_cobrado: 0, motivo: "Prensa", autoriza: "Héctor" }),
    linea({ tipo: "invitacion", cantidad: 3, valor_cobrado: 0, motivo: "Convenio colegio", autoriza: "Ana" }),
    linea({ tipo: "atencion", cantidad: 1, valor_cobrado: 0, motivo: "Prensa", autoriza: "Ana" }),
    linea({ tipo: "descuento", cantidad: 4, valor_cobrado: 45_000, motivo: "Grupo grande", autoriza: "Héctor" }),
  ];

  it("suma el valor no cobrado y las personas", () => {
    const r = resumirCortesias(lineas);
    // 2×60.000 + 3×60.000 + 1×60.000 = 360.000 en cortesías, + 4×15.000 = 60.000 de descuento
    expect(r.totalNoCobrado).toBe(420_000);
    expect(r.totalPersonas).toBe(10);
  });

  it("separa atenciones, invitaciones y descuentos", () => {
    const r = resumirCortesias(lineas);
    const porTipo = Object.fromEntries(r.porTipo.map((t) => [t.tipo, t]));
    expect(porTipo.atencion).toMatchObject({ personas: 3, noCobrado: 180_000 });
    expect(porTipo.invitacion).toMatchObject({ personas: 3, noCobrado: 180_000 });
    expect(porTipo.descuento).toMatchObject({ personas: 4, noCobrado: 60_000 });
  });

  it("agrupa por motivo", () => {
    const r = resumirCortesias(lineas);
    const prensa = r.porMotivo.find((m) => m.motivo === "Prensa");
    expect(prensa).toMatchObject({ personas: 3, noCobrado: 180_000 });
  });

  it("agrupa por quién autorizó", () => {
    const r = resumirCortesias(lineas);
    const porAutoriza = Object.fromEntries(r.porAutoriza.map((a) => [a.autoriza, a]));
    expect(porAutoriza["Héctor"]).toMatchObject({ personas: 6, noCobrado: 180_000 });
    expect(porAutoriza["Ana"]).toMatchObject({ personas: 4, noCobrado: 240_000 });
  });

  it("ordena de mayor a menor valor no cobrado", () => {
    const r = resumirCortesias(lineas);
    expect(r.porMotivo[0].noCobrado).toBeGreaterThanOrEqual(r.porMotivo[1].noCobrado);
    expect(r.porAutoriza[0].autoriza).toBe("Ana"); // 240.000 > 180.000
  });

  it("con lista vacía no rompe", () => {
    const r = resumirCortesias([]);
    expect(r).toMatchObject({ totalNoCobrado: 0, totalPersonas: 0, porTipo: [], porMotivo: [], porAutoriza: [] });
  });
});
