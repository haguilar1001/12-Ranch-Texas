import { diasDelMes, queryDe, rangoDe } from "../app/admin/reportes/periodo";
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

describe("beneficiario de la cortesía", () => {
  const base = {
    fecha: new Date("2026-09-12T15:00:00Z"), numero_venta: 23, caja: "Caja 3", cajero: "María José",
    tipo: "cortesia" as const, tipo_visitante: "Adulto", cantidad: 3,
    valor_lista: 60_000, valor_cobrado: 0, no_cobrado: 180_000,
    motivo: "Convenio", autoriza: "Angela Aguilar",
  };

  it("viaja en la línea y llega al resumen", () => {
    const r = resumirCortesias([{ ...base, beneficiario: "ALEX GUZMAN" }]);
    expect(r.lineas[0].beneficiario).toBe("ALEX GUZMAN");
  });

  it("agrupar por motivo no lo pierde: son dos preguntas distintas", () => {
    const r = resumirCortesias([
      { ...base, beneficiario: "ALEX GUZMAN", motivo: "Policía Nacional" },
      { ...base, beneficiario: "LUZ MARINA", motivo: "Policía Nacional", cantidad: 1, no_cobrado: 60_000 },
    ]);
    // Un solo motivo con las dos personas...
    expect(r.porMotivo).toHaveLength(1);
    expect(r.porMotivo[0]).toMatchObject({ motivo: "Policía Nacional", personas: 4 });
    // ...pero cada beneficiario sigue identificable en el detalle.
    expect(r.lineas.map((l) => l.beneficiario).sort()).toEqual(["ALEX GUZMAN", "LUZ MARINA"]);
  });
});

// El período del informe: lo usan la pantalla y el Excel, así que un error aquí
// hace que el archivo descargado traiga otras fechas que las que se están viendo.
describe("período del informe de cortesías", () => {
  const HOY = "2026-09-13";

  it("sin día, toma el mes completo", () => {
    const r = rangoDe({ anio: 2026, mes: 9 }, HOY);
    expect(r.dia).toBeNull();
    expect(r.inicio.toISOString()).toBe("2026-09-01T05:00:00.000Z"); // medianoche de Bogotá
    expect(r.fin.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(r.etiqueta).toBe("septiembre 2026");
  });

  it("con fecha, toma solo ese día de medianoche a medianoche", () => {
    const r = rangoDe({ fecha: "2026-09-13" }, HOY);
    expect(r.inicio.toISOString()).toBe("2026-09-13T05:00:00.000Z");
    expect(r.fin.toISOString()).toBe("2026-09-14T05:00:00.000Z");
    expect(r.etiqueta).toBe("13 de septiembre de 2026");
    expect(r.clave).toBe("2026-09-13");
    expect(r.fecha).toBe("2026-09-13");
  });

  // La fecha es lo que el usuario escogió en el calendario: manda sobre el mes que
  // haya quedado en la URL de antes.
  it("la fecha manda sobre el mes que venga en la URL", () => {
    const r = rangoDe({ fecha: "2026-03-05", anio: 2026, mes: 9 }, HOY);
    expect(r.etiqueta).toBe("5 de marzo de 2026");
  });

  it("diciembre cierra en enero del año siguiente", () => {
    const r = rangoDe({ anio: 2026, mes: 12 }, HOY);
    expect(r.fin.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });

  // Una fecha escrita a mano en la URL puede no existir. Mostrar el mes completo es
  // preferible a inventarse un día que nadie pidió.
  it("una fecha que no existe cae al mes completo", () => {
    expect(rangoDe({ fecha: "2026-02-31", anio: 2026, mes: 2 }, HOY).dia).toBeNull();
    expect(rangoDe({ fecha: "2026-02-31", anio: 2026, mes: 2 }, HOY).etiqueta).toBe("febrero 2026");
    expect(rangoDe({ fecha: "ayer" }, HOY).etiqueta).toBe("septiembre 2026");
    expect(rangoDe({ fecha: "2026-13-01" }, HOY).etiqueta).toBe("septiembre 2026");
  });

  it("sin parámetros usa el mes de hoy", () => {
    const r = rangoDe({}, HOY);
    expect(r.anio).toBe(2026);
    expect(r.mes).toBe(9);
    expect(r.dia).toBeNull();
  });

  it("cuenta bien los días del mes, incluido febrero bisiesto", () => {
    expect(diasDelMes(2026, 2)).toBe(28);
    expect(diasDelMes(2024, 2)).toBe(29);
    expect(diasDelMes(2026, 9)).toBe(30);
    expect(diasDelMes(2026, 12)).toBe(31);
  });

  // La URL dice el modo sin ambigüedad: o `fecha`, o `anio`+`mes`. Nunca los dos,
  // porque entonces el servidor tendría que adivinar cuál manda.
  it("la query string dice el modo sin ambigüedad", () => {
    const conFecha = queryDe(rangoDe({ fecha: "2026-09-13" }, HOY), "caja1", "cajero1");
    expect(conFecha).toBe("fecha=2026-09-13&caja=caja1&cajero=cajero1");
    expect(conFecha).not.toContain("mes=");

    const conMes = queryDe(rangoDe({ anio: 2026, mes: 9 }, HOY));
    expect(conMes).toBe("anio=2026&mes=9");
    expect(conMes).not.toContain("fecha=");
  });

  // Lo que sale en la URL tiene que volver a entrar igual: si no, el enlace del Excel
  // y el de "Ver cortesías" llevarían a otro período.
  it("el período sobrevive la ida y vuelta por la URL", () => {
    for (const p of [{ fecha: "2026-09-13" }, { anio: 2026, mes: 12 }, {}]) {
      const ida = rangoDe(p, HOY);
      const params = Object.fromEntries(new URLSearchParams(queryDe(ida)));
      const vuelta = rangoDe(params, HOY);
      expect(vuelta.clave).toBe(ida.clave);
      expect(vuelta.inicio.toISOString()).toBe(ida.inicio.toISOString());
      expect(vuelta.fin.toISOString()).toBe(ida.fin.toISOString());
    }
  });
});
