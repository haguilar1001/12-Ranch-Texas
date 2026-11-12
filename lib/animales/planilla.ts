// Planilla de alimentación por turno. Reemplaza el reparto automático (que daba por
// entregado lo de la dieta aunque no hubiera alimento en bodega): la app propone lo
// TEÓRICO de cada ración en el turno y el operario confirma o corrige lo REAL.
//
//   · Equinos: 3 turnos (7 a.m., 12 m., 4 p.m.); el resto: 2 (7 a.m. y 4 p.m.).
//   · Cada turno lleva la cantidad del día repartida entre los turnos.
//   · Consumo libre (sal, melaza...): se registra UNA vez al día, en el primer turno.
//
// Todo en unidad base (g/ml/und) para guardar; la planilla muestra kg, pacas o litros.

import { cantidadPorEntrega, type FrecuenciaRacion, type ModoRacion } from "./racion";
import { normalizarUnidad, type AlimentoUnidad } from "./unidades";
import { franjasDeCategoria, esConsumoLibre, cantidadPorFranja, type Franja } from "./auto-alimentacion";

export const ETIQUETA_FRANJA: Record<Franja, string> = {
  "07:00": "7:00 a. m.",
  "12:00": "12:00 m.",
  "16:00": "4:00 p. m.",
};

export interface RacionPlanilla {
  id: string;
  destino: string;
  categoria: string;
  cabezas: number;
  cantidad: number;
  unidad: string;
  modo: ModoRacion;
  frecuencia: FrecuenciaRacion;
  horario: string | null;
  alimento: AlimentoUnidad & { id: string; nombre: string };
}

/** Turnos en los que aparece la ración. */
export function franjasDeRacion(r: Pick<RacionPlanilla, "categoria" | "horario">): readonly Franja[] {
  const franjas = franjasDeCategoria(r.categoria);
  return esConsumoLibre(r.horario) ? [franjas[0]] : franjas;
}

/** Lo teórico de la ración en ESE turno, en unidad base. null si no le toca o no se puede convertir. */
export function teoricoEnFranja(r: RacionPlanilla, franja: Franja): number | null {
  const franjas = franjasDeRacion(r);
  if (!franjas.includes(franja)) return null;
  const diaria = cantidadPorEntrega({ cantidad: r.cantidad, unidad: r.unidad, modo: r.modo, frecuencia: r.frecuencia }, r.cabezas, r.alimento);
  if (diaria === null) return null;
  return cantidadPorFranja(diaria, franjas.length);
}

/**
 * En qué unidad se escribe lo real en la planilla: la paca se cuenta en pacas (nadie
 * pesa el heno), lo líquido en litros, lo indivisible en unidades y lo demás en kg.
 */
export function unidadPlanilla(alimento: AlimentoUnidad): { unidad: string; base: number } {
  const u = normalizarUnidad(alimento.unidad_medida);
  if (u === "paca" && alimento.equivalencia_g) return { unidad: "paca", base: alimento.equivalencia_g };
  if (["l", "lt", "litro", "litros", "ml"].includes(u)) return { unidad: "litro", base: 1000 };
  if (["unidad", "unidades", "und", "u"].includes(u)) return { unidad: "und", base: 1 };
  return { unidad: "kg", base: 1000 };
}

/** Unidad base → número para el campo de la planilla ("12", "0,67"). */
export function aValorPlanilla(base: number, alimento: AlimentoUnidad): string {
  const { base: factor } = unidadPlanilla(alimento);
  return (base / factor).toLocaleString("es-CO", { maximumFractionDigits: 2, useGrouping: false });
}

/** Texto legible: "12 pacas", "1,33 kg". */
export function textoPlanilla(base: number, alimento: AlimentoUnidad): string {
  const { unidad, base: factor } = unidadPlanilla(alimento);
  const n = base / factor;
  const plural = unidad === "paca" && n !== 1 ? "pacas" : unidad;
  return `${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })} ${plural}`;
}

/** Estado del registro según lo real frente a lo teórico. */
export function estadoEntrega(real: number, teorico: number): "realizada" | "parcial" | "omitida" {
  if (real <= 0) return "omitida";
  return real < teorico ? "parcial" : "realizada";
}

/** Instante del registro: hoy = ahora; un día pasado = la hora del turno ese día. */
export function fechaDelTurno(fecha: string, franja: Franja, hoy: string, ahora: Date): Date {
  return fecha === hoy ? ahora : new Date(`${fecha}T${franja}:00-05:00`);
}
