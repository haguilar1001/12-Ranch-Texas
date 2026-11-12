// Kardex de unidades (cabezas de animales, unidades de equipos).
//
// La cantidad de un grupo o de un equipo NUNCA se escribe a mano: se recalcula desde sus
// movimientos, igual que la existencia del alimento y el total de una venta desde su detalle.
//
//   entrada → suma   (saldo inicial, nacimiento, compra, donación recibida, traslado que llega)
//   salida  → resta  (muerte, venta, sacrificio, baja, robo, pérdida, entrega, traslado que sale)
//   neutro  → no mueve la cantidad (traslado completo de un equipo: solo cambia de lugar)
//   ajuste  → FIJA el saldo (conteo físico): lo anterior deja de importar.
//
// Los movimientos anulados no cuentan (nada se borra: se marcan y se recalcula).

export type Efecto = "entrada" | "salida" | "neutro" | "ajuste";

// ------------------------------------------------------------------ ANIMALES

export const TIPOS_MOV_ANIMAL = [
  "saldo_inicial", "nacimiento", "compra", "donacion_recibida", "traslado_entrada",
  "muerte", "venta", "sacrificio", "entrega", "perdida", "traslado_salida",
  "ajuste",
] as const;
export type TipoMovAnimal = (typeof TIPOS_MOV_ANIMAL)[number];

export const EFECTO_ANIMAL: Record<TipoMovAnimal, Efecto> = {
  saldo_inicial: "entrada",
  nacimiento: "entrada",
  compra: "entrada",
  donacion_recibida: "entrada",
  traslado_entrada: "entrada",
  muerte: "salida",
  venta: "salida",
  sacrificio: "salida",
  entrega: "salida",
  perdida: "salida",
  traslado_salida: "salida",
  ajuste: "ajuste",
};

export const ETIQUETA_ANIMAL: Record<TipoMovAnimal, string> = {
  saldo_inicial: "Saldo inicial",
  nacimiento: "Nacimiento / parto",
  compra: "Compra",
  donacion_recibida: "Donación recibida",
  traslado_entrada: "Llega de otro grupo",
  muerte: "Muerte",
  venta: "Venta",
  sacrificio: "Sacrificio",
  entrega: "Entrega / donación",
  perdida: "Pérdida / robo / fuga",
  traslado_salida: "Pasa a otro grupo",
  ajuste: "Ajuste por conteo",
};

/** Tipos que el usuario registra a mano (los traslados los crea la acción de trasladar). */
export const NOVEDADES_ANIMAL: TipoMovAnimal[] = [
  "nacimiento", "compra", "donacion_recibida",
  "muerte", "venta", "sacrificio", "entrega", "perdida",
  "ajuste",
];

/** Novedades que exigen escribir el motivo (causa de la muerte, razón del sacrificio…). */
export const MOTIVO_OBLIGATORIO_ANIMAL: TipoMovAnimal[] = ["muerte", "sacrificio", "perdida", "entrega", "ajuste"];

// ------------------------------------------------------------------ EQUIPOS

export const TIPOS_MOV_EQUIPO = [
  "saldo_inicial", "compra", "donacion_recibida", "traslado_entrada",
  "baja", "robo", "perdida", "venta", "entrega", "traslado_salida",
  "traslado", "ajuste",
] as const;
export type TipoMovEquipo = (typeof TIPOS_MOV_EQUIPO)[number];

export const EFECTO_EQUIPO: Record<TipoMovEquipo, Efecto> = {
  saldo_inicial: "entrada",
  compra: "entrada",
  donacion_recibida: "entrada",
  traslado_entrada: "entrada",
  baja: "salida",
  robo: "salida",
  perdida: "salida",
  venta: "salida",
  entrega: "salida",
  traslado_salida: "salida",
  traslado: "neutro",
  ajuste: "ajuste",
};

export const ETIQUETA_EQUIPO: Record<TipoMovEquipo, string> = {
  saldo_inicial: "Saldo inicial",
  compra: "Compra",
  donacion_recibida: "Donación recibida",
  traslado_entrada: "Llega de otro registro",
  baja: "Baja (daño / obsoleto)",
  robo: "Robo",
  perdida: "Pérdida",
  venta: "Venta",
  entrega: "Entrega / donación",
  traslado_salida: "Pasa a otro registro",
  traslado: "Traslado de ubicación",
  ajuste: "Ajuste por conteo",
};

export const NOVEDADES_EQUIPO: TipoMovEquipo[] = [
  "compra", "donacion_recibida",
  "baja", "robo", "perdida", "venta", "entrega",
  "ajuste",
];

export const MOTIVO_OBLIGATORIO_EQUIPO: TipoMovEquipo[] = ["baja", "robo", "perdida", "entrega", "ajuste"];

// ------------------------------------------------------------------ cálculo

export interface MovimientoUnidades {
  efecto: Efecto;
  cantidad: number;
  fecha: Date;
  /** Desempate cuando dos movimientos tienen la misma fecha del hecho. */
  creado_en?: Date;
  anulado?: boolean;
}

function ordenar(movs: MovimientoUnidades[]): MovimientoUnidades[] {
  return [...movs].sort(
    (a, b) => a.fecha.getTime() - b.fecha.getTime() || (a.creado_en?.getTime() ?? 0) - (b.creado_en?.getTime() ?? 0),
  );
}

/** Saldo resultante. El ajuste más reciente (por fecha del hecho) borra la historia anterior. */
export function calcularSaldo(movs: MovimientoUnidades[]): number {
  let saldo = 0;
  for (const m of ordenar(movs)) {
    if (m.anulado) continue;
    if (m.efecto === "ajuste") saldo = m.cantidad;
    else if (m.efecto === "entrada") saldo += m.cantidad;
    else if (m.efecto === "salida") saldo -= m.cantidad;
  }
  return saldo;
}

/**
 * ¿Alguna vez el saldo cae por debajo de cero? Sirve para rechazar una salida (o una anulación
 * de una entrada) que dejaría el grupo con cabezas negativas en algún punto de su historia.
 */
export function saldoMinimo(movs: MovimientoUnidades[]): number {
  let saldo = 0;
  let minimo = 0;
  for (const m of ordenar(movs)) {
    if (m.anulado) continue;
    if (m.efecto === "ajuste") saldo = m.cantidad;
    else if (m.efecto === "entrada") saldo += m.cantidad;
    else if (m.efecto === "salida") saldo -= m.cantidad;
    if (saldo < minimo) minimo = saldo;
  }
  return minimo;
}

export interface ResumenNovedades {
  tipo: string;
  movimientos: number;
  cantidad: number;
  valor: number;
}

/** Totales por tipo (cuántos registros, cuántas cabezas/unidades, cuánta plata). Ignora anulados. */
export function resumirPorTipo(movs: { tipo: string; cantidad: number; valor: number | null; anulado: boolean }[]): ResumenNovedades[] {
  const m = new Map<string, ResumenNovedades>();
  for (const x of movs) {
    if (x.anulado) continue;
    const r = m.get(x.tipo) ?? { tipo: x.tipo, movimientos: 0, cantidad: 0, valor: 0 };
    r.movimientos += 1;
    r.cantidad += x.cantidad;
    r.valor += x.valor ?? 0;
    m.set(x.tipo, r);
  }
  return [...m.values()];
}

/**
 * Fecha del hecho a partir de "YYYY-MM-DD" (día de Bogotá). Si es hoy se usa la hora actual
 * (queda después de lo ya registrado hoy); si es un día anterior, el mediodía de ese día.
 * null si el texto no es una fecha válida o es futura.
 */
export function fechaDelHecho(dia: string, hoyBogota: string, ahora: Date = new Date()): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia ?? "")) return null;
  if (dia > hoyBogota) return null;
  if (dia === hoyBogota) return ahora;
  const f = new Date(`${dia}T12:00:00-05:00`);
  return Number.isNaN(f.getTime()) ? null : f;
}
