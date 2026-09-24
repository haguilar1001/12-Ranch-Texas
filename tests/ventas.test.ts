import { describe, it, expect } from "vitest";
import { calcularTotales, faltanPorEscanear, validarVenta, type LineaVenta, type Pago } from "../lib/ventas/calculo";

const adulto = (cant: number, cobrado = 60000): LineaVenta => ({
  tipo_visitante_id: "adulto",
  cantidad: cant,
  valor_lista: 60000,
  valor_cobrado: cobrado,
  tipo_linea: "pago",
});

describe("cálculo de totales", () => {
  it("suma detalle correctamente", () => {
    const t = calcularTotales([adulto(3), { ...adulto(2), tipo_visitante_id: "nino" }]);
    expect(t.total_lista).toBe(300000);
    expect(t.total_cobrado).toBe(300000);
    expect(t.total_descuento).toBe(0);
    expect(t.cantidad_asistentes).toBe(5);
  });

  it("bebé/adulto mayor gratis suman asistentes pero no valor", () => {
    const bebe: LineaVenta = { tipo_visitante_id: "bebe", cantidad: 1, valor_lista: 0, valor_cobrado: 0, tipo_linea: "pago" };
    const t = calcularTotales([adulto(2), bebe]);
    expect(t.total_cobrado).toBe(120000);
    expect(t.cantidad_asistentes).toBe(3);
  });

  it("refleja el descuento en total_descuento", () => {
    const t = calcularTotales([adulto(1, 50000)]);
    expect(t.total_descuento).toBe(10000);
    expect(t.total_cobrado).toBe(50000);
  });
});

describe("validación de venta", () => {
  it("acepta una venta simple con pago exacto", () => {
    const lineas = [adulto(2)];
    const pagos: Pago[] = [{ medio_pago_id: "efectivo", monto: 120000 }];
    expect(validarVenta(lineas, pagos)).toEqual({ ok: true, errores: [] });
  });

  it("acepta pago mixto (efectivo + tarjeta) que cuadra", () => {
    const lineas = [adulto(3)];
    const pagos: Pago[] = [
      { medio_pago_id: "efectivo", monto: 100000 },
      { medio_pago_id: "debito", monto: 80000 },
    ];
    expect(validarVenta(lineas, pagos).ok).toBe(true);
  });

  it("rechaza si los pagos no cuadran con el total", () => {
    const r = validarVenta([adulto(2)], [{ medio_pago_id: "efectivo", monto: 100000 }]);
    expect(r.ok).toBe(false);
    expect(r.errores.some((e) => e.includes("no cuadran"))).toBe(true);
  });

  it("exige motivo y autorización en una cortesía (invitación)", () => {
    const linea: LineaVenta = {
      tipo_visitante_id: "adulto",
      cantidad: 1,
      valor_lista: 60000,
      valor_cobrado: 0,
      tipo_linea: "invitacion",
    };
    const r = validarVenta([linea], []);
    expect(r.ok).toBe(false);
    expect(r.errores.some((e) => e.includes("motivo"))).toBe(true);
    expect(r.errores.some((e) => e.includes("autorización"))).toBe(true);
  });

  it("acepta una cortesía bien formada (sin pagos, total 0)", () => {
    const linea: LineaVenta = {
      tipo_visitante_id: "adulto",
      cantidad: 1,
      valor_lista: 60000,
      valor_cobrado: 0,
      tipo_linea: "invitacion",
      motivo_cortesia_id: "cortesia-comercial",
      autorizado_por: "sup-1",
    };
    expect(validarVenta([linea], []).ok).toBe(true);
  });

  it("una cortesía no puede cobrar > 0", () => {
    const linea: LineaVenta = {
      tipo_visitante_id: "adulto",
      cantidad: 1,
      valor_lista: 60000,
      valor_cobrado: 60000,
      tipo_linea: "atencion",
      motivo_cortesia_id: "prensa",
      autorizado_por: "sup-1",
    };
    const r = validarVenta([linea], [{ medio_pago_id: "efectivo", monto: 60000 }]);
    expect(r.ok).toBe(false);
    expect(r.errores.some((e) => e.includes("debe cobrar 0"))).toBe(true);
  });

  it("un descuento exige motivo y autorización", () => {
    const r = validarVenta([adulto(1, 50000)], [{ medio_pago_id: "efectivo", monto: 50000 }]);
    expect(r.ok).toBe(false);
    expect(r.errores.some((e) => e.includes("descuento requiere motivo"))).toBe(true);
    expect(r.errores.some((e) => e.includes("descuento requiere autorización"))).toBe(true);
  });

  it("acepta descuento con motivo y autorización", () => {
    const linea: LineaVenta = {
      tipo_visitante_id: "adulto",
      cantidad: 1,
      valor_lista: 60000,
      valor_cobrado: 50000,
      tipo_linea: "pago",
      motivo_descuento: "convenio",
      autorizado_por: "sup-1",
    };
    expect(validarVenta([linea], [{ medio_pago_id: "efectivo", monto: 50000 }]).ok).toBe(true);
  });

  it("rechaza el descuento si el tipo no lo admite (lo decide la BD, no el cliente)", () => {
    const linea: LineaVenta = {
      tipo_visitante_id: "adulto",
      cantidad: 1,
      valor_lista: 60000,
      valor_cobrado: 50000,
      tipo_linea: "pago",
      motivo_descuento: "convenio",
      autorizado_por: "sup-1",
      permite_descuento: false,
    };
    const r = validarVenta([linea], [{ medio_pago_id: "efectivo", monto: 50000 }]);
    expect(r.ok).toBe(false);
    expect(r.errores.some((e) => e.includes("no admite descuento unitario"))).toBe(true);
  });

  it("rechaza una línea de un tipo que hoy no está disponible (lo decide la BD, no la pantalla)", () => {
    const linea: LineaVenta = { ...adulto(1), disponible_hoy: false };
    const r = validarVenta([linea], [{ medio_pago_id: "efectivo", monto: 60000 }]);
    expect(r.ok).toBe(false);
    expect(r.errores.some((e) => e.includes("no está disponible hoy"))).toBe(true);
  });

  it("rechaza cantidades no enteras o cero", () => {
    expect(validarVenta([adulto(0)], []).ok).toBe(false);
    expect(validarVenta([{ ...adulto(1), cantidad: 1.5 }], [{ medio_pago_id: "e", monto: 60000 }]).ok).toBe(false);
  });
});

// Los bonos y la compra por la web se verifican en la aplicación de bonos de los PC
// de caja. La regla vive en el servidor: la taquilla puede marcar el cuadrito, pero
// quién tiene que escanear lo decide la BD.
describe("escaneo de bonos", () => {
  const TIPOS = new Map([
    ["bono", { nombre: "BONO COOMEVA", requiere_escaneo: true }],
    ["web", { nombre: "PÁGINA WEB", requiere_escaneo: true }],
    ["adulto", { nombre: "ADULTO", requiere_escaneo: false }],
  ]);
  const linea = (tipo: string, escaneado?: boolean) => ({ tipo_visitante_id: tipo, escaneado });

  it("deja pasar lo que no se escanea", () => {
    expect(faltanPorEscanear([linea("adulto")], TIPOS)).toEqual([]);
  });

  it("reclama el bono que no se escaneó", () => {
    expect(faltanPorEscanear([linea("adulto"), linea("bono")], TIPOS)).toEqual(["BONO COOMEVA"]);
  });

  it("no reclama el bono ya escaneado", () => {
    expect(faltanPorEscanear([linea("bono", true)], TIPOS)).toEqual([]);
  });

  it("nombra cada tipo una sola vez aunque sean varias líneas", () => {
    const faltan = faltanPorEscanear([linea("bono"), linea("bono"), linea("web")], TIPOS);
    expect(faltan).toEqual(["BONO COOMEVA", "PÁGINA WEB"]);
  });

  // Si el tipo no está en el mapa que vino de la BD, no se inventa una exigencia.
  it("ignora un tipo que no conoce", () => {
    expect(faltanPorEscanear([linea("fantasma")], TIPOS)).toEqual([]);
  });
});
