// Validación de los datos de contacto del comprador (taquilla y catálogo de clientes).

/** Deja solo los dígitos: "300 123 4567" → "3001234567". */
export function limpiarCelular(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Celular colombiano: exactamente 10 dígitos y empieza por 3 (todo celular en
 * Colombia arranca por 3, sin importar el operador).
 */
export function esCelularColombiano(valor: string): boolean {
  return /^3\d{9}$/.test(limpiarCelular(valor));
}

/**
 * Forma de un correo: algo@algo.algo. No valida que exista ni que reciba correo,
 * solo que tenga arroba y un punto después de la arroba — que es lo que pidieron.
 */
export function esEmailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
}
