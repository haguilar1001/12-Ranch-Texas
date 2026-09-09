// Cálculo de la fila virtual. Funciones PURAS: no tocan la BD, así que se prueban
// solas y sirven igual en el servidor y en el cliente.
//
// La idea del módulo: el visitante no tiene que quedarse parado esperando a que lo
// llamen. Toma su turno con el QR de su manilla y consulta desde el celular cuántos
// van adelante y cuánto falta, más o menos.

export type EstadoTurnoFila = "esperando" | "llamado" | "atendido" | "no_se_presento" | "cancelado";

/** Un turno ya está fuera de la fila si se atendió, no se presentó o se canceló. */
export function estaCerrado(estado: EstadoTurnoFila): boolean {
  return estado === "atendido" || estado === "no_se_presento" || estado === "cancelado";
}

export interface TurnoEnFila {
  numero: number;
  personas: number;
  estado: EstadoTurnoFila;
}

export interface ConfigFila {
  /** Cuántas personas entran por vuelta. */
  cupo_por_tanda: number | null;
  /** Cuántos minutos dura una vuelta. */
  minutos_por_tanda: number | null;
}

/**
 * Cuántas PERSONAS hay delante de un turno. Se cuentan personas y no turnos porque
 * un grupo de 4 ocupa 4 puestos en los karts, no uno.
 * Los turnos ya cerrados no cuentan; los que están "llamado" sí, porque todavía
 * no han liberado el cupo.
 */
export function personasAdelante(fila: TurnoEnFila[], numero: number): number {
  return fila
    .filter((t) => !estaCerrado(t.estado) && t.numero < numero)
    .reduce((acc, t) => acc + Math.max(1, t.personas), 0);
}

/** Posición en la fila, empezando en 1. */
export function posicion(fila: TurnoEnFila[], numero: number): number {
  return fila.filter((t) => !estaCerrado(t.estado) && t.numero < numero).length + 1;
}

/**
 * Minutos estimados de espera. null si la atracción no tiene configurado el cupo
 * o la duración de la tanda — preferimos no decir nada antes que inventar un número.
 */
export function esperaEstimada(personasDelante: number, cfg: ConfigFila): number | null {
  const cupo = cfg.cupo_por_tanda;
  const minutos = cfg.minutos_por_tanda;
  if (!cupo || cupo <= 0 || !minutos || minutos <= 0) return null;
  // Las tandas completas que tienen que pasar antes de que entre este turno.
  const tandas = Math.floor(personasDelante / cupo);
  return tandas * minutos;
}

/** "ya casi" / "~15 min" / "~1 h 10 min" */
export function textoEspera(minutos: number | null): string {
  if (minutos === null) return "—";
  if (minutos <= 0) return "ya casi";
  if (minutos < 60) return `~${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `~${h} h` : `~${h} h ${m} min`;
}

/** El siguiente consecutivo del día para una atracción. */
export function siguienteNumero(numerosDelDia: number[]): number {
  return numerosDelDia.length === 0 ? 1 : Math.max(...numerosDelDia) + 1;
}

export interface ResumenFila {
  esperando: number;
  personasEsperando: number;
  llamado: number | null;
  atendidosHoy: number;
  noSePresentaron: number;
}

/** Estado de la fila para la pantalla del operario. */
export function resumirFila(fila: TurnoEnFila[]): ResumenFila {
  const enEspera = fila.filter((t) => t.estado === "esperando");
  const llamados = fila.filter((t) => t.estado === "llamado").map((t) => t.numero);
  return {
    esperando: enEspera.length,
    personasEsperando: enEspera.reduce((a, t) => a + Math.max(1, t.personas), 0),
    llamado: llamados.length ? Math.min(...llamados) : null,
    atendidosHoy: fila.filter((t) => t.estado === "atendido").length,
    noSePresentaron: fila.filter((t) => t.estado === "no_se_presento").length,
  };
}
