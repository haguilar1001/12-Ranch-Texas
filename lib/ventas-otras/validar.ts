import { mayus } from "../db/mayusculas";

// Validación de una venta que no pasa por taquilla (ver /admin/ventas-otras).
// Pura (sin BD) para poder probarla.

/** Líneas que NO se cargan aquí: salen de la taquilla (ver lib/reportes/comparativo.ts). */
export const LINEAS_SOLO_TAQUILLA = ["ENTRADAS", "EVENTOS"] as const;

export interface EntradaVentaOtra {
  fecha: string; // yyyy-mm-dd (día en Bogotá)
  linea: string;
  valor: number;
  descripcion: string;
}

export type ResultadoValidacion =
  | { ok: true; datos: { fecha: Date; linea: string; valor: number; descripcion: string } }
  | { ok: false; error: string };

export function validarVentaOtra(e: EntradaVentaOtra, hoy: string): ResultadoValidacion {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha ?? "")) return { ok: false, error: "Ingresa la fecha." };
  const fecha = new Date(`${e.fecha}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== e.fecha) return { ok: false, error: "Fecha inválida." };
  if (e.fecha > hoy) return { ok: false, error: "La fecha no puede ser futura." };

  const linea = mayus(e.linea ?? "");
  if (!linea) return { ok: false, error: "Selecciona la línea." };
  if ((LINEAS_SOLO_TAQUILLA as readonly string[]).includes(linea)) {
    return { ok: false, error: `${linea} no se carga aquí: sale de la taquilla.` };
  }

  if (!Number.isInteger(e.valor) || e.valor <= 0) return { ok: false, error: "El valor debe ser mayor que cero." };

  const descripcion = (e.descripcion ?? "").trim();
  if (!descripcion) return { ok: false, error: "Ingresa la descripción." };

  return { ok: true, datos: { fecha, linea, valor: e.valor, descripcion } };
}
