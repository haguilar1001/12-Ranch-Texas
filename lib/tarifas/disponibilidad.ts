import { fechaBogota } from "../tiempo";
import { festivosColombia } from "../../scripts/festivos-co";

/** ¿El día operativo (fecha Bogotá) es sábado, domingo o festivo colombiano? */
export function esFinDeSemanaOFestivo(now: Date = new Date()): boolean {
  const fecha = fechaBogota(now);
  const dow = new Date(`${fecha}T00:00:00-05:00`).getUTCDay(); // 0 = domingo, 6 = sábado
  if (dow === 0 || dow === 6) return true;
  return fecha in festivosColombia(parseInt(fecha.slice(0, 4), 10));
}

/**
 * Día operativo de hoy, en los mismos términos que `TipoVisitante.disponible_dias`
 * (sin "todos": eso significa "se ve siempre", no es un día concreto).
 */
export function diaOperativoDe(now: Date = new Date()): "semana" | "fin_semana_festivo" {
  return esFinDeSemanaOFestivo(now) ? "fin_semana_festivo" : "semana";
}

/** ¿Un tipo con esta disponibilidad se ve hoy en taquilla? */
export function disponibleHoy(disponibleDias: "todos" | "semana" | "fin_semana_festivo", now: Date = new Date()): boolean {
  return disponibleDias === "todos" || disponibleDias === diaOperativoDe(now);
}
