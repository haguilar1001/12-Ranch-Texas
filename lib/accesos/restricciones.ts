// Lectura de las restricciones del reglamento, que en el Excel vienen en texto libre:
// "115 cm - 160 cm", "130 cm max", "80 kg max", "3 - 12 años", "15 +", "NA"...
//
// Funciones PURAS para poder probarlas contra las celdas reales una por una. Un rango
// mal leído deja gente por fuera en la puerta, así que ante la duda se devuelve vacío
// en vez de inventar un número.

export interface Rango {
  min: number | null;
  max: number | null;
  /** El texto original, cuando dice algo que no es un número (p. ej. "acompañados"). */
  nota: string | null;
}

const VACIO: Rango = { min: null, max: null, nota: null };

/** "NA", "N/A", vacío o guion suelto significan "sin restricción". */
function sinDato(texto: string): boolean {
  const t = texto.trim().toUpperCase();
  return t === "" || t === "NA" || t === "N/A" || t === "-" || t === "—";
}

/** Todos los números de un texto, en orden de aparición. */
function numeros(texto: string): number[] {
  return (texto.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Math.round(Number(n.replace(",", "."))));
}

/**
 * Interpreta una celda de restricción numérica.
 *
 * `porDefecto` decide qué es un número suelto cuando la celda no lo dice:
 *   - "min" para estatura ("150 cm" en Karts de Pista es mínimo)
 *   - "max" para peso (la columna se llama "Peso max kg")
 */
export function leerRango(celda: unknown, porDefecto: "min" | "max"): Rango {
  const texto = String(celda ?? "").trim();
  if (sinDato(texto)) return { ...VACIO };

  const t = texto.toLowerCase();
  const ns = numeros(texto);

  // Sin números: es una nota ("menores de 4 años acompañados" sin cifra útil de corte).
  if (ns.length === 0) return { min: null, max: null, nota: texto };

  // "acompañado" no es un límite: es una condición que el reglamento maneja aparte.
  const esAcompanamiento = /acompa/.test(t);
  if (esAcompanamiento) return { min: null, max: null, nota: texto };

  const diceMin = /\bmin\b|mínim|minim|en adelante|\+\s*$|\d\s*\+/.test(t);
  const diceMax = /\bmax\b|máxim|maxim|menor/.test(t);

  // Rango explícito: dos números.
  if (ns.length >= 2) {
    const [a, b] = ns;
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    return { min, max, nota: null };
  }

  const n = ns[0];
  if (diceMin && !diceMax) return { min: n, max: null, nota: null };
  if (diceMax && !diceMin) return { min: null, max: n, nota: null };

  // Número suelto: manda la convención de la columna.
  return porDefecto === "min" ? { min: n, max: null, nota: null } : { min: null, max: n, nota: null };
}

/** Texto corto para mostrarle la restricción al visitante. */
export function describirRango(r: Rango, unidad: string): string | null {
  if (r.min !== null && r.max !== null) return `${r.min}–${r.max} ${unidad}`;
  if (r.min !== null) return `desde ${r.min} ${unidad}`;
  if (r.max !== null) return `hasta ${r.max} ${unidad}`;
  return r.nota;
}

/** Junta estatura, peso y edad en una sola línea legible. */
export function describirRestricciones(p: {
  estatura_minima: number | null;
  estatura_maxima: number | null;
  peso_minimo: number | null;
  peso_maximo: number | null;
  edad_minima: number | null;
  edad_maxima: number | null;
}): string | null {
  const partes = [
    describirRango({ min: p.estatura_minima, max: p.estatura_maxima, nota: null }, "cm"),
    describirRango({ min: p.peso_minimo, max: p.peso_maximo, nota: null }, "kg"),
    describirRango({ min: p.edad_minima, max: p.edad_maxima, nota: null }, "años"),
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}
