// Validaciones de los catálogos (proveedores, materias primas, rubros, áreas). Lógica PURA:
// recibe lo que escribió la persona y devuelve los datos limpios o el error, sin tocar la BD.

export const CONDICIONES_PAGO: { id: string; label: string }[] = [
  { id: "contado", label: "Contado" },
  { id: "credito_15", label: "Crédito 15 días" },
  { id: "credito_30", label: "Crédito 30 días" },
  { id: "credito_60", label: "Crédito 60 días" },
  { id: "otro", label: "Otro (ver observaciones)" },
];
export const etiquetaCondicion = (id: string | null | undefined) => CONDICIONES_PAGO.find((c) => c.id === id)?.label ?? "";

/** Sugerencias para el tipo de proveedor (se puede escribir otro). */
export const TIPOS_PROVEEDOR = [
  "ALIMENTOS ANIMALES", "MATERIAS PRIMAS", "REPUESTOS", "MANTENIMIENTO", "SERVICIOS", "PAPELERÍA", "ASEO", "TECNOLOGÍA", "OTRO",
];

/** Unidades sugeridas para materias primas. */
export const UNIDADES = ["unidad", "kg", "g", "litro", "ml", "bulto", "caja", "paquete", "galón", "metro"];

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

const texto = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return t ? t : null;
};

/** Entero en pesos desde "45.000", "$ 45.000" o 45000. */
export function pesos(v: unknown): number | null | "error" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : "error";
  const t = String(v).replace(/[$\s.]/g, "");
  if (!t) return null;
  if (!/^\d+$/.test(t)) return "error";
  return parseInt(t, 10);
}

// ------------------------------------------------------------------ proveedores

export interface EntradaProveedor {
  nombre: string; nit_cedula?: string | null; contacto?: string | null; telefono?: string | null; email?: string | null;
  direccion?: string | null; ciudad?: string | null; tipo?: string | null; suministra?: string | null;
  condiciones_pago?: string | null; observaciones?: string | null;
}
export type DatosProveedor = { [K in keyof EntradaProveedor]-?: K extends "nombre" ? string : string | null };

export function validarProveedor(e: EntradaProveedor): Resultado<DatosProveedor> {
  const nombre = texto(e.nombre);
  if (!nombre) return { ok: false, error: "Escribe el nombre del proveedor." };
  const email = texto(e.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "El correo no es válido." };
  const telefono = texto(e.telefono);
  if (telefono && !/^[\d\s+()-]{7,20}$/.test(telefono)) return { ok: false, error: "El teléfono solo puede tener números, espacios, + o guiones." };
  const condiciones_pago = texto(e.condiciones_pago);
  if (condiciones_pago && !CONDICIONES_PAGO.some((c) => c.id === condiciones_pago)) return { ok: false, error: "Escoge las condiciones de pago de la lista." };
  return {
    ok: true,
    datos: {
      nombre, nit_cedula: texto(e.nit_cedula), contacto: texto(e.contacto), telefono, email: email?.toLowerCase() ?? null,
      direccion: texto(e.direccion), ciudad: texto(e.ciudad), tipo: texto(e.tipo), suministra: texto(e.suministra),
      condiciones_pago, observaciones: texto(e.observaciones),
    },
  };
}

// ------------------------------------------------------------------ materias primas

export interface EntradaMateriaPrima {
  nombre: string; categoria?: string | null; unidad_medida: string; costo_referencia?: string | number | null;
  proveedor_id?: string | null; observaciones?: string | null;
}
export interface DatosMateriaPrima {
  nombre: string; categoria: string | null; unidad_medida: string; costo_referencia: number | null; proveedor_id: string | null; observaciones: string | null;
}

export function validarMateriaPrima(e: EntradaMateriaPrima): Resultado<DatosMateriaPrima> {
  const nombre = texto(e.nombre);
  if (!nombre) return { ok: false, error: "Escribe el nombre de la materia prima." };
  const unidad = texto(e.unidad_medida)?.toLowerCase();
  if (!unidad) return { ok: false, error: "Indica la unidad de medida (kg, litro, unidad…)." };
  const costo = pesos(e.costo_referencia);
  if (costo === "error") return { ok: false, error: "El costo debe ser un número entero en pesos." };
  return {
    ok: true,
    datos: { nombre, categoria: texto(e.categoria), unidad_medida: unidad, costo_referencia: costo, proveedor_id: texto(e.proveedor_id), observaciones: texto(e.observaciones) },
  };
}

// ------------------------------------------------------------------ rubros (grupo › rubro › subrubro)

export type NivelRubro = "grupo" | "rubro" | "subrubro";
const PADRE_DE: Record<NivelRubro, NivelRubro | null> = { grupo: null, rubro: "grupo", subrubro: "rubro" };

export interface EntradaRubro { nombre: string; nivel: string; padre_id?: string | null; orden?: string | number | null }
export interface DatosRubro { nombre: string; nivel: NivelRubro; padre_id: string | null; orden: number }

/** `nivelPadre`: el nivel del padre escogido (lo busca quien llama), o null si no hay padre. */
export function validarRubro(e: EntradaRubro, nivelPadre: NivelRubro | null): Resultado<DatosRubro> {
  const nombre = texto(e.nombre);
  if (!nombre) return { ok: false, error: "Escribe el nombre del rubro." };
  if (!(e.nivel in PADRE_DE)) return { ok: false, error: "Escoge el nivel: grupo, rubro o subrubro." };
  const nivel = e.nivel as NivelRubro;
  const esperado = PADRE_DE[nivel];
  const padre_id = texto(e.padre_id);
  if (esperado === null && padre_id) return { ok: false, error: "Un grupo no va dentro de otro rubro." };
  if (esperado !== null && (!padre_id || nivelPadre !== esperado)) {
    return { ok: false, error: nivel === "rubro" ? "Un rubro va dentro de un grupo: escoge el grupo." : "Un subrubro va dentro de un rubro: escoge el rubro." };
  }
  const orden = pesos(e.orden);
  if (orden === "error") return { ok: false, error: "El orden debe ser un número entero." };
  return { ok: true, datos: { nombre, nivel, padre_id: esperado ? padre_id : null, orden: orden ?? 0 } };
}

/** Ruta legible "GRUPO › RUBRO › SUBRUBRO" de un rubro, dado el mapa id → {nombre, padre_id}. */
export function rutaRubro(id: string, mapa: Map<string, { nombre: string; padre_id: string | null }>): string {
  const partes: string[] = [];
  let actual: string | null = id;
  for (let i = 0; actual && i < 5; i++) {
    const r = mapa.get(actual);
    if (!r) break;
    partes.unshift(r.nombre);
    actual = r.padre_id;
  }
  return partes.join(" › ");
}

// ------------------------------------------------------------------ áreas

export function validarArea(e: { nombre: string; descripcion?: string | null }): Resultado<{ nombre: string; descripcion: string | null }> {
  const nombre = texto(e.nombre);
  if (!nombre) return { ok: false, error: "Escribe el nombre del área." };
  return { ok: true, datos: { nombre, descripcion: texto(e.descripcion) } };
}
