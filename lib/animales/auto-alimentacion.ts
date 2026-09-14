// Reparto automático de la dieta en franjas horarias del día.
//
// Regla del parque: los EQUINOS comen 3 veces (7 a.m., 12 m. y 4 p.m.); el resto de
// categorías come 2 veces (7 a.m. y 4 p.m.). La cantidad que ya está en la ración es
// la del DÍA COMPLETO (`cantidadPorEntrega` en `racion.ts`), así que cada franja
// entrega esa cantidad repartida entre el número de franjas del día.
//
// Las raciones de "consumo libre" (sal mineralizada, melaza...) no son una entrega
// puntual sino acceso todo el día: se excluyen del reparto por horario.

export const FRANJAS_EQUINOS = ["07:00", "12:00", "16:00"] as const;
export const FRANJAS_DEFAULT = ["07:00", "16:00"] as const;

export type Franja = (typeof FRANJAS_EQUINOS)[number] | (typeof FRANJAS_DEFAULT)[number];

export const TODAS_LAS_FRANJAS: readonly Franja[] = ["07:00", "12:00", "16:00"];

const NOMBRE_CATEGORIA_EQUINOS = "EQUINOS";
const MARCA_CONSUMO_LIBRE = "CONSUMO LIBRE";

/** Las franjas del día que le tocan a una categoría de animal. */
export function franjasDeCategoria(nombreCategoria: string): readonly Franja[] {
  return nombreCategoria.trim().toUpperCase() === NOMBRE_CATEGORIA_EQUINOS ? FRANJAS_EQUINOS : FRANJAS_DEFAULT;
}

/** true si el texto de `horario` marca la ración como de acceso libre (no se reparte por franja). */
export function esConsumoLibre(horario: string | null | undefined): boolean {
  return (horario ?? "").trim().toUpperCase() === MARCA_CONSUMO_LIBRE;
}

/** Cuánto entregar EN ESTA franja: la cantidad del día repartida entre sus franjas. */
export function cantidadPorFranja(cantidadDiaria: number, totalFranjas: number): number {
  if (totalFranjas <= 0) return 0;
  return Math.round(cantidadDiaria / totalFranjas);
}

/** "HH:MM" → minutos desde medianoche. */
function minutosDelDia(horaHHMM: string): number {
  const [h, m] = horaHHMM.split(":").map(Number);
  return h * 60 + m;
}

/**
 * A qué franja corresponde una hora real (el cron no siempre dispara al segundo exacto).
 * null si no cae dentro de la tolerancia de ninguna franja: mejor no alimentar que
 * alimentar la franja equivocada.
 */
export function franjaMasCercana(horaHHMM: string, toleranciaMinutos = 20): Franja | null {
  const actual = minutosDelDia(horaHHMM);
  let mejor: { franja: Franja; distancia: number } | null = null;
  for (const franja of TODAS_LAS_FRANJAS) {
    const distancia = Math.abs(minutosDelDia(franja) - actual);
    if (distancia <= toleranciaMinutos && (!mejor || distancia < mejor.distancia)) {
      mejor = { franja, distancia };
    }
  }
  return mejor?.franja ?? null;
}
