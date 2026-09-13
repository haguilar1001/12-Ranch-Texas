// Utilidades puras para reportes.

/** Variación porcentual actual vs. anterior. null si no hay base (anterior = 0). */
export function variacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

/** Formatea la variación como "+12,3%" / "−4,0%" / "—". */
export function formatearVariacion(v: number | null): string {
  if (v === null) return "—";
  const signo = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${signo}${Math.abs(v).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Un porcentaje tal como se escribe en Colombia: "30,6%", con coma decimal.
 *
 * `toFixed(1)` devuelve "30.6" con punto, que en una pantalla llena de cifras en
 * pesos —donde el punto es separador de MILES— se lee mal: "100.0%" parece cien mil.
 */
export function formatearPct(v: number, decimales = 1): string {
  return `${v.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}%`;
}
