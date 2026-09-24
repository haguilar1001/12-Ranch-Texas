import { fechaBogota } from "../tiempo";
import { festivosColombia } from "../../scripts/festivos-co";
import type { DiaTarifa } from "@prisma/client";

/** ¿El día operativo (fecha Bogotá) es sábado, domingo o festivo colombiano? */
export function esFinDeSemanaOFestivo(now: Date = new Date()): boolean {
  const fecha = fechaBogota(now);
  const dow = new Date(`${fecha}T00:00:00-05:00`).getUTCDay(); // 0 = domingo, 6 = sábado
  if (dow === 0 || dow === 6) return true;
  return fecha in festivosColombia(parseInt(fecha.slice(0, 4), 10));
}

/** Franja de tarifa que aplica hoy (o al instante dado) según el día operativo. */
export function diaTarifaDe(now: Date = new Date()): DiaTarifa {
  return esFinDeSemanaOFestivo(now) ? "fin_semana_festivo" : "semana";
}
