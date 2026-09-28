import { describe, it, expect } from "vitest";
import { calcularLineasCompra, preciosQueCambian, subtotalLinea, totalCompra } from "../lib/animales/compras";
import { calcularExistencia } from "../lib/animales/existencia";

// Presentaciones reales del parque (cuadros de 2026-09).
const MAIZ = { id: "maiz", nombre: "Maíz", unidad_medida: "bulto", equivalencia_g: 50_000, costo_unitario: 110_000 };
const HENO = { id: "heno", nombre: "Heno", unidad_medida: "paca", equivalencia_g: 15_000, costo_unitario: 14_500 };
const CONEJINA = { id: "conejina", nombre: "Conejina", unidad_medida: "kg", equivalencia_g: 1_000, costo_unitario: 3_570 };
const SIN_EQUIV = { id: "x", nombre: "Sal", unidad_medida: "bulto", equivalencia_g: null, costo_unitario: 40_000 };
const ALIMENTOS = [MAIZ, HENO, CONEJINA, SIN_EQUIV];

describe("compra de alimento", () => {
  it("pasa cada línea a unidad base y calcula el subtotal en pesos enteros", () => {
    const r = calcularLineasCompra(
      [
        { alimento_id: "maiz", cantidad: 2.5, precio_unitario: 115_000 },
        { alimento_id: "conejina", cantidad: 15, precio_unitario: 3_570 },
      ],
      ALIMENTOS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lineas[0]).toMatchObject({ unidad: "bulto", cantidad_base: 125_000, subtotal: 287_500 });
    expect(r.lineas[1]).toMatchObject({ unidad: "kg", cantidad_base: 15_000, subtotal: 53_550 });
    expect(r.total).toBe(341_050);
  });

  it("el heno se compra por pacas (15 kg promedio cada una)", () => {
    const r = calcularLineasCompra([{ alimento_id: "heno", cantidad: 40, precio_unitario: 14_500 }], ALIMENTOS);
    expect(r.ok && r.lineas[0]).toMatchObject({ unidad: "paca", cantidad_base: 600_000, subtotal: 580_000 });
  });

  it("rechaza un bulto sin equivalencia: no sabría cuántos kilos sumar", () => {
    const r = calcularLineasCompra([{ alimento_id: "x", cantidad: 1, precio_unitario: 40_000 }], ALIMENTOS);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Sal");
  });

  it("rechaza compra vacía, alimento repetido, cantidad cero y precio con decimales", () => {
    expect(calcularLineasCompra([], ALIMENTOS).ok).toBe(false);
    expect(
      calcularLineasCompra(
        [
          { alimento_id: "maiz", cantidad: 1, precio_unitario: 1 },
          { alimento_id: "maiz", cantidad: 2, precio_unitario: 1 },
        ],
        ALIMENTOS,
      ).ok,
    ).toBe(false);
    expect(calcularLineasCompra([{ alimento_id: "maiz", cantidad: 0, precio_unitario: 1 }], ALIMENTOS).ok).toBe(false);
    expect(calcularLineasCompra([{ alimento_id: "maiz", cantidad: 1, precio_unitario: 10.5 }], ALIMENTOS).ok).toBe(false);
    expect(calcularLineasCompra([{ alimento_id: "no-existe", cantidad: 1, precio_unitario: 1 }], ALIMENTOS).ok).toBe(false);
  });

  it("el total del encabezado se recalcula desde el detalle", () => {
    const r = calcularLineasCompra(
      [
        { alimento_id: "maiz", cantidad: 3, precio_unitario: 110_000 },
        { alimento_id: "conejina", cantidad: 0.5, precio_unitario: 3_571 },
      ],
      ALIMENTOS,
    );
    if (!r.ok) throw new Error(r.error);
    expect(totalCompra(r.lineas)).toBe(r.total);
    expect(r.total).toBe(330_000 + subtotalLinea(0.5, 3_571));
    expect(Number.isInteger(r.total)).toBe(true);
  });

  it("actualiza el costo al último precio, salvo líneas en $0 (donación)", () => {
    const cambios = preciosQueCambian(
      [
        { alimento_id: "maiz", precio_unitario: 118_000 },
        { alimento_id: "conejina", precio_unitario: 3_570 },
        { alimento_id: "heno", precio_unitario: 0 },
      ],
      ALIMENTOS,
    );
    expect(cambios).toEqual([{ alimento_id: "maiz", antes: 110_000, despues: 118_000 }]);
  });

  it("la compra suma al kardex y su anulación la compensa sin borrar nada", () => {
    const antes = [{ tipo: "ajuste" as const, cantidad_base: 20_000, fecha: new Date("2026-09-01") }];
    const conCompra = [...antes, { tipo: "entrada" as const, cantidad_base: 125_000, fecha: new Date("2026-09-10") }];
    expect(calcularExistencia(conCompra)).toBe(145_000);
    const anulada = [...conCompra, { tipo: "salida" as const, cantidad_base: 125_000, fecha: new Date("2026-09-11") }];
    expect(calcularExistencia(anulada)).toBe(20_000);
  });
});
