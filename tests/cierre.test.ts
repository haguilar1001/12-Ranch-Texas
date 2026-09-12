import { describe, it, expect } from "vitest";
import { resumirCierre, type LineaCierre } from "../lib/reportes/cierre";

const linea = (p: Partial<LineaCierre>): LineaCierre => ({
  tipo_visitante: "Adulto",
  tipo_linea: "pago",
  cantidad: 1,
  valor_lista: 60000,
  valor_cobrado: 60000,
  genera_manilla: true,
  ...p,
});

describe("informe de cierre del día", () => {
  it("arma un concepto por tipo con su valor unitario y su total", () => {
    const r = resumirCierre([
      linea({ tipo_visitante: "Adulto", cantidad: 457 }),
      linea({ tipo_visitante: "Niño", cantidad: 180 }),
      linea({ tipo_visitante: "Adulto Mayor", cantidad: 9, valor_lista: 40000, valor_cobrado: 40000 }),
    ]);

    expect(r.ventas).toEqual([
      { concepto: "Adulto", cantidad: 457, valorUnitario: 60000, valorTotal: 27_420_000 },
      { concepto: "Niño", cantidad: 180, valorUnitario: 60000, valorTotal: 10_800_000 },
      { concepto: "Adulto Mayor", cantidad: 9, valorUnitario: 40000, valorTotal: 360_000 },
    ]);
    expect(r.totalLista).toBe(38_580_000);
    expect(r.totalVenta).toBe(38_580_000);
  });

  it("suma las líneas del mismo tipo al mismo valor en un solo concepto", () => {
    const r = resumirCierre([
      linea({ cantidad: 2 }),
      linea({ cantidad: 3 }),
    ]);
    expect(r.ventas).toHaveLength(1);
    expect(r.ventas[0].cantidad).toBe(5);
    expect(r.ventas[0].valorTotal).toBe(300_000);
  });

  it("separa el mismo tipo cuando se vendió a otra tarifa", () => {
    const r = resumirCierre([
      linea({ cantidad: 2 }),
      linea({ cantidad: 4, valor_lista: 54000, valor_cobrado: 54000 }),
    ]);
    expect(r.ventas.map((v) => v.valorUnitario).sort()).toEqual([54000, 60000]);
  });

  it("el descuento no toca el concepto: baja en su propia línea", () => {
    const r = resumirCierre([
      linea({ cantidad: 10, valor_cobrado: 50000 }), // $10.000 menos cada uno
    ]);
    expect(r.ventas[0].valorUnitario).toBe(60000);
    expect(r.ventas[0].valorTotal).toBe(600_000);
    expect(r.descuentos).toBe(100_000);
    expect(r.totalVenta).toBe(500_000);
  });

  it("las cortesías suman personas pero no plata, agrupadas por clase", () => {
    const r = resumirCierre([
      linea({ tipo_linea: "atencion", cantidad: 4 }),
      linea({ tipo_linea: "invitacion", cantidad: 100 }),
      linea({ tipo_linea: "cortesia", cantidad: 2 }),
    ]);
    expect(r.sinCobro.map((f) => [f.concepto, f.cantidad])).toEqual([
      ["Invitaciones", 100],
      ["Atenciones", 4],
      ["Cortesías", 2],
    ]);
    expect(r.totalLista).toBe(0);
    expect(r.totalVenta).toBe(0);
    expect(r.totalCantidad).toBe(106);
  });

  it("los tipos con tarifa en cero van al bloque sin cobro, no a ventas", () => {
    const r = resumirCierre([
      linea({ tipo_visitante: "Redención Bono", valor_lista: 0, valor_cobrado: 0, cantidad: 5 }),
      linea({ tipo_visitante: "Bebé", valor_lista: 0, valor_cobrado: 0, cantidad: 3, genera_manilla: false }),
    ]);
    expect(r.ventas).toHaveLength(0);
    expect(r.sinCobro.map((f) => f.concepto).sort()).toEqual(["Bebé", "Redención Bono"]);
    expect(r.totalVenta).toBe(0);
  });

  it("el bebé cuenta como asistente pero no como manilla", () => {
    const r = resumirCierre([
      linea({ cantidad: 4 }),
      linea({ tipo_visitante: "Bebé", valor_lista: 0, valor_cobrado: 0, cantidad: 2, genera_manilla: false }),
    ]);
    expect(r.totalCantidad).toBe(6);
    expect(r.totalManillas).toBe(4);
    expect(r.porManilla).toEqual([
      { tipo: "Adulto", manillas: 4, asistentes: 4 },
      { tipo: "Bebé", manillas: 0, asistentes: 2 },
    ]);
  });

  it("la agrupación por manilla junta el pago con la cortesía del mismo tipo", () => {
    const r = resumirCierre([
      linea({ cantidad: 5 }),
      linea({ tipo_linea: "invitacion", cantidad: 3 }),
    ]);
    expect(r.porManilla).toEqual([{ tipo: "Adulto", manillas: 8, asistentes: 8 }]);
    expect(r.totalManillas).toBe(8);
  });

  it("un día sin ventas no revienta", () => {
    const r = resumirCierre([]);
    expect(r).toMatchObject({
      ventas: [], sinCobro: [], totalCantidad: 0, totalLista: 0,
      descuentos: 0, totalVenta: 0, porManilla: [], totalManillas: 0,
    });
  });

  // El informe que se venía llevando a mano el domingo 6 de septiembre de 2026.
  // Los renglones de "evento" son otra tarifa ($ 55.000), no un descuento: por eso
  // salen como conceptos aparte del mismo tipo de visitante.
  it("reproduce el informe del 6 de septiembre", () => {
    const r = resumirCierre([
      linea({ tipo_visitante: "Niño", cantidad: 180 }),
      linea({ tipo_visitante: "Adulto", cantidad: 457 }),
      linea({ tipo_visitante: "Adulto Mayor", cantidad: 9, valor_lista: 40000, valor_cobrado: 40000 }),
      linea({ tipo_visitante: "Niño", cantidad: 8, valor_lista: 55000, valor_cobrado: 55000 }),
      linea({ tipo_visitante: "Adulto", cantidad: 16, valor_lista: 55000, valor_cobrado: 55000 }),
      linea({ tipo_visitante: "Adulto Mayor", cantidad: 1, valor_lista: 40000, valor_cobrado: 40000 }),
      linea({ tipo_linea: "invitacion", cantidad: 104 }),
      linea({ tipo_visitante: "Redención Bono", valor_lista: 0, valor_cobrado: 0, cantidad: 5 }),
    ]);

    expect(r.totalCantidad).toBe(780);
    expect(r.totalLista).toBe(39_940_000);
    // Cinco conceptos, no seis: adulto mayor entró a $ 40.000 en los dos renglones
    // del informe viejo, así que aquí queda en uno solo de 10 personas.
    expect(r.ventas).toHaveLength(5);
    expect(r.ventas.find((v) => v.concepto === "Adulto Mayor")).toEqual({
      concepto: "Adulto Mayor", cantidad: 10, valorUnitario: 40000, valorTotal: 400_000,
    });
    // 780 personas, todas con manilla porque no hubo bebés.
    expect(r.totalManillas).toBe(780);
    expect(r.porManilla.reduce((a, g) => a + g.asistentes, 0)).toBe(780);
  });
});
