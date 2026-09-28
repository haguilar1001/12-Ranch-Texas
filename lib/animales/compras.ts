// Compra de alimento: cálculo puro de las líneas y el total, sin base de datos.
//
// Cada línea se escribe en la UNIDAD DE COMPRA del alimento (bulto, paca, kg...) con su
// precio con IVA por esa unidad. De ahí salen dos números enteros:
//   · cantidad_base → lo que entra al kardex (g/ml/unidad), igual que cualquier movimiento.
//   · subtotal      → COP = cantidad × precio, redondeado al peso.
// El total de la compra es la suma de los subtotales y se puede recalcular desde el detalle.

import { aBase, type AlimentoUnidad } from "./unidades";

export interface LineaCompraEntrada {
  alimento_id: string;
  /** Cantidad en unidad de compra; admite fracción (2,5 bultos). */
  cantidad: number;
  /** COP con IVA por unidad de compra. */
  precio_unitario: number;
}

export interface LineaCompraCalculada {
  alimento_id: string;
  unidad: string;
  cantidad_base: number;
  precio_unitario: number;
  subtotal: number;
}

export type ResultadoLineas =
  | { ok: true; lineas: LineaCompraCalculada[]; total: number }
  | { ok: false; error: string };

type AlimentoCompra = AlimentoUnidad & { id: string; nombre: string };

/** Subtotal en COP de una línea: cantidad × precio, redondeado al peso. */
export function subtotalLinea(cantidad: number, precioUnitario: number): number {
  return Math.round(cantidad * precioUnitario);
}

/** Total de la compra recalculado desde su detalle. */
export function totalCompra(detalle: { subtotal: number }[]): number {
  return detalle.reduce((t, l) => t + l.subtotal, 0);
}

/**
 * Valida y calcula las líneas de una compra. Rechaza: compra vacía, alimento repetido
 * (se suma en una sola línea), cantidades ≤ 0, precios no enteros o negativos y
 * alimentos sin equivalencia para pasar a unidad base.
 */
export function calcularLineasCompra(entradas: LineaCompraEntrada[], alimentos: AlimentoCompra[]): ResultadoLineas {
  if (entradas.length === 0) return { ok: false, error: "Agrega al menos un alimento a la compra." };

  const porId = new Map(alimentos.map((a) => [a.id, a]));
  const vistos = new Set<string>();
  const lineas: LineaCompraCalculada[] = [];

  for (const e of entradas) {
    const alimento = porId.get(e.alimento_id);
    if (!alimento) return { ok: false, error: "Hay una línea sin alimento o con un alimento que no existe." };
    if (vistos.has(alimento.id)) {
      return { ok: false, error: `${alimento.nombre} está repetido. Suma las cantidades en una sola línea.` };
    }
    vistos.add(alimento.id);

    if (!Number.isFinite(e.cantidad) || e.cantidad <= 0) {
      return { ok: false, error: `La cantidad de ${alimento.nombre} debe ser mayor a 0.` };
    }
    if (!Number.isInteger(e.precio_unitario) || e.precio_unitario < 0) {
      return { ok: false, error: `El precio de ${alimento.nombre} debe ser un entero en pesos.` };
    }

    const base = aBase(e.cantidad, alimento.unidad_medida, alimento);
    if (base === null || base <= 0) {
      return {
        ok: false,
        error: `No se puede pasar ${alimento.nombre} a kilos: declara cuántos gramos trae un ${alimento.unidad_medida}.`,
      };
    }

    lineas.push({
      alimento_id: alimento.id,
      unidad: alimento.unidad_medida,
      cantidad_base: base,
      precio_unitario: e.precio_unitario,
      subtotal: subtotalLinea(e.cantidad, e.precio_unitario),
    });
  }

  return { ok: true, lineas, total: totalCompra(lineas) };
}

/**
 * Alimentos cuyo costo del maestro cambia con esta compra (se actualiza al último precio).
 * Una línea en $0 (donación, bonificación del proveedor) no es un precio: no toca el costo.
 */
export function preciosQueCambian(
  lineas: { alimento_id: string; precio_unitario: number }[],
  alimentos: { id: string; costo_unitario: number | null }[],
): { alimento_id: string; antes: number | null; despues: number }[] {
  const porId = new Map(alimentos.map((a) => [a.id, a]));
  return lineas
    .filter((l) => l.precio_unitario > 0 && porId.get(l.alimento_id)?.costo_unitario !== l.precio_unitario)
    .map((l) => ({ alimento_id: l.alimento_id, antes: porId.get(l.alimento_id)?.costo_unitario ?? null, despues: l.precio_unitario }));
}
