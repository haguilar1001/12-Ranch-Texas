// Valor en letras para comprobantes: 125000 → "CIENTO VEINTICINCO MIL PESOS M/CTE".
// Pesos colombianos enteros (COP no lleva centavos en esta app).

const UNIDADES = [
  "", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
  "VEINTE", "VEINTIÚN", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE",
];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

/** 0–999 en letras ("" para 0). Usa la forma apocopada "UN"/"VEINTIÚN", la correcta antes de MIL, MILLONES o PESOS. */
function hasta999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (r > 0 && r < 30) partes.push(UNIDADES[r]);
  else if (r >= 30) {
    const d = Math.floor(r / 10);
    const u = r % 10;
    partes.push(u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`);
  }
  return partes.join(" ");
}

/** Número entero no negativo en letras, sin la palabra PESOS. */
export function enteroALetras(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error("Solo enteros no negativos.");
  if (n === 0) return "CERO";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];

  if (millones > 0) partes.push(millones === 1 ? "UN MILLÓN" : `${enteroALetras(millones)} MILLONES`);
  if (miles > 0) partes.push(miles === 1 ? "MIL" : `${hasta999(miles)} MIL`);
  if (resto > 0) partes.push(hasta999(resto));
  return partes.join(" ");
}

/**
 * Valor en pesos en letras, como va en un comprobante. "Un millón de pesos" y "dos millones de
 * pesos" llevan "DE" cuando el número termina justo en millones.
 */
export function pesosEnLetras(n: number): string {
  const letras = enteroALetras(n);
  const redondoEnMillones = n >= 1_000_000 && n % 1_000_000 === 0;
  const unidad = n === 1 ? "PESO" : "PESOS";
  return `${letras}${redondoEnMillones ? " DE" : ""} ${unidad} M/CTE`;
}
