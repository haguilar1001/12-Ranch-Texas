// Utilidades de dinero en pesos colombianos (COP).
// Regla dura del proyecto: el dinero SIEMPRE se maneja como entero (sin decimales).

const formateador = new Intl.NumberFormat("es-CO", {
  style: "decimal",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Espacio DURO entre el símbolo y la cifra.
 *
 * Con un espacio normal, una columna angosta parte "$ 300.000" en dos líneas: el
 * "$" arriba y "300.000" abajo. Pasaba en el detalle de cortesías, en los turnos
 * del cierre y en cualquier tabla apretada. Se arregla aquí y no en cada celda
 * porque son 19 pantallas: un `whitespace-nowrap` olvidado en una tabla nueva
 * volvería a partir la cifra, y nadie lo nota hasta que sale impreso.
 */
const ESPACIO_DURO = " ";

/** Formatea un entero COP como "$ 1.234.567" (el espacio no se parte de línea). */
export function formatearCOP(valor: number): string {
  const entero = Math.round(valor);
  const signo = entero < 0 ? "-" : "";
  return `${signo}$${ESPACIO_DURO}${formateador.format(Math.abs(entero))}`;
}

/** Formatea sin el símbolo: "1.234.567". */
export function formatearMiles(valor: number): string {
  return formateador.format(Math.round(valor));
}

/**
 * Convierte un texto ingresado por el usuario (con puntos de miles o $) a entero COP.
 * Ignora separadores de miles; descarta decimales (no aplican en COP de operación).
 */
export function parseCOP(texto: string): number {
  if (typeof texto === "number") return Math.round(texto);
  const limpio = texto.replace(/[^\d-]/g, "");
  if (limpio === "" || limpio === "-") return 0;
  return parseInt(limpio, 10);
}

/** Suma segura de una lista de enteros COP. */
export function sumarCOP(valores: number[]): number {
  return valores.reduce((acc, v) => acc + Math.round(v), 0);
}
