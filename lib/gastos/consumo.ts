// ¿Dónde se consume más y quién pide más? (puro). Enteros COP.
//
// Los gastos no llevan inventario: el control es por ÁREA (centro de costo) y por
// SOLICITANTE (empleado que pidió la compra). Esta función agrupa y ordena de mayor a menor.

export const SIN_ASIGNAR = "Sin asignar";

export interface GastoConsumo {
  /** id del área o del solicitante; null = no se registró. */
  clave: string | null;
  nombre: string | null;
  total: number;
}

export interface FilaConsumo {
  clave: string | null;
  nombre: string;
  total: number;
  /** Número de gastos (facturas) registrados. */
  gastos: number;
  /** Participación sobre el total, en porcentaje (0–100, un decimal). */
  participacion: number;
}

/** Agrupa por clave y ordena de mayor a menor gasto. "Sin asignar" siempre va al final. */
export function rankingConsumo(gastos: GastoConsumo[]): FilaConsumo[] {
  const acc = new Map<string, { clave: string | null; nombre: string; total: number; gastos: number }>();
  for (const g of gastos) {
    const k = g.clave ?? "";
    const fila = acc.get(k) ?? { clave: g.clave, nombre: g.clave ? g.nombre ?? "—" : SIN_ASIGNAR, total: 0, gastos: 0 };
    fila.total += g.total;
    fila.gastos += 1;
    acc.set(k, fila);
  }

  const total = gastos.reduce((t, g) => t + g.total, 0);
  return [...acc.values()]
    .map((f) => ({ ...f, participacion: total > 0 ? Math.round((f.total / total) * 1000) / 10 : 0 }))
    .sort((a, b) => {
      if ((a.clave === null) !== (b.clave === null)) return a.clave === null ? 1 : -1;
      return b.total - a.total;
    });
}
