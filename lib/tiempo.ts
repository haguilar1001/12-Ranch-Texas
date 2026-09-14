// Utilidades de tiempo en zona America/Bogota (UTC-5, sin horario de verano).

const TZ = "America/Bogota";

/** Fecha local (YYYY-MM-DD) en Bogotá para un instante dado. */
export function fechaBogota(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Fin del día operativo: 23:59:59 hora Bogotá del día del instante dado.
 * Vigencia por defecto de la manilla (reingreso permitido el mismo día).
 * Configurable a futuro (pasaportes de temporada, abonos).
 */
export function finDelDiaOperativo(now: Date = new Date()): Date {
  return new Date(`${fechaBogota(now)}T23:59:59-05:00`);
}

/** Inicio del día operativo (00:00:00 hora Bogotá). Ventana para aforo y cuadre del día. */
export function inicioDelDiaOperativo(now: Date = new Date()): Date {
  return new Date(`${fechaBogota(now)}T00:00:00-05:00`);
}

/** Hora local (HH:MM, 24h) en Bogotá para un instante dado. */
export function horaBogota(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/** Formatea fecha/hora en Bogotá para mostrar en la manilla. */
export function formatearFechaHoraBogota(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Fecha/hora COMPACTA (dd/MM/yy HH:mm) para la manilla angosta (1"). Cabe en el ancho de la banda. */
export function formatearFechaHoraCortaBogota(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
