// Tratamientos (reporte médico) de los animales. Lógica PURA.

import { cantidad } from "./insumos";

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };
const texto = (v: unknown) => { const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""; return t || null; };
const esFecha = (t: string) => /^\d{4}-\d{2}-\d{2}$/.test(t);

export interface EntradaTratamiento {
  fecha?: string | null; animal_id: string; sintomas?: string | null; diagnostico: string; indicaciones?: string | null;
  veterinario?: string | null; empleado_id?: string | null; proxima_revision?: string | null; marcar_enfermo?: boolean;
}
export interface DatosTratamiento {
  fecha: string; animal_id: string; sintomas: string | null; diagnostico: string; indicaciones: string | null;
  veterinario: string | null; empleado_id: string | null; proxima_revision: string | null; marcar_enfermo: boolean;
}

export function validarTratamiento(e: EntradaTratamiento, hoy: string): Resultado<DatosTratamiento> {
  const fecha = texto(e.fecha) ?? hoy;
  if (!esFecha(fecha) || fecha > hoy) return { ok: false, error: "La fecha no es válida (no puede ser futura)." };
  const animal_id = texto(e.animal_id);
  if (!animal_id) return { ok: false, error: "Escoge el animal." };
  const diagnostico = texto(e.diagnostico);
  if (!diagnostico) return { ok: false, error: "Escribe el diagnóstico (o lo que se sospecha)." };
  const proxima = texto(e.proxima_revision);
  if (proxima && (!esFecha(proxima) || proxima < fecha)) return { ok: false, error: "La próxima revisión debe ser una fecha igual o posterior al tratamiento." };
  return {
    ok: true,
    datos: {
      fecha, animal_id, sintomas: texto(e.sintomas), diagnostico, indicaciones: texto(e.indicaciones), veterinario: texto(e.veterinario),
      empleado_id: texto(e.empleado_id), proxima_revision: proxima, marcar_enfermo: !!e.marcar_enfermo,
    },
  };
}

export function validarSeguimiento(e: { fecha?: string | null; nota?: string | null }, fechaTratamiento: string, hoy: string, conMedicamentos: boolean): Resultado<{ fecha: string; nota: string }> {
  const fecha = texto(e.fecha) ?? hoy;
  if (!esFecha(fecha) || fecha > hoy) return { ok: false, error: "La fecha no es válida (no puede ser futura)." };
  if (fecha < fechaTratamiento) return { ok: false, error: "El seguimiento no puede ser antes del inicio del tratamiento." };
  const nota = texto(e.nota) ?? (conMedicamentos ? "APLICACIÓN DE MEDICAMENTO" : null);
  if (!nota) return { ok: false, error: "Cuenta cómo sigue el animal." };
  return { ok: true, datos: { fecha, nota } };
}

/** Medicamentos aplicados: cantidad que sale del inventario + dosis/vía como texto. */
export function validarMedicamentos(
  lineas: { insumo_id: string; cantidad: string | number; dosis?: string | null }[],
  existencias: Map<string, { nombre: string; existencia: number; unidad: string }>,
): Resultado<{ insumo_id: string; cantidad: number; dosis: string | null }[]> {
  const out: { insumo_id: string; cantidad: number; dosis: string | null }[] = [];
  const vistos = new Set<string>();
  for (const l of lineas.filter((x) => x.insumo_id)) {
    const ins = existencias.get(l.insumo_id);
    if (!ins) return { ok: false, error: "Uno de los medicamentos no existe." };
    if (vistos.has(l.insumo_id)) return { ok: false, error: `${ins.nombre} está dos veces: súmalo en una sola línea.` };
    vistos.add(l.insumo_id);
    const c = cantidad(l.cantidad);
    if (c === null || c === "error" || c <= 0) return { ok: false, error: `Escribe cuánto se usó de ${ins.nombre}.` };
    if (c > ins.existencia) return { ok: false, error: `No alcanza ${ins.nombre}: hay ${ins.existencia} ${ins.unidad}.` };
    out.push({ insumo_id: l.insumo_id, cantidad: c, dosis: texto(l.dosis) });
  }
  return { ok: true, datos: out };
}

/** Días desde el inicio (contando el primero). */
export function diasDeTratamiento(inicio: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86400000) + 1;
}

export const ETIQUETA_ESTADO_TRATAMIENTO = { en_curso: "En curso", finalizado: "Finalizado", anulado: "Anulado" } as const;
