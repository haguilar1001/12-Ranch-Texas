// Reglas de los medios de pago (efectivo, datáfono, Nequi, prepagado...). Puras, sin BD,
// para poder probarlas: las usan las acciones de /admin/medios-pago.

export interface MedioResumen {
  id: string;
  activo: boolean;
  es_efectivo: boolean;
}

/** Convierte un nombre en un código estable: minúsculas, sin tildes, con "_" ("Tarjeta Débito" → "tarjeta_debito"). */
export function codigoDeMedio(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "medio";
}

/**
 * ¿Se puede dejar así la lista de medios activos? Siempre tiene que quedar al menos uno en
 * EFECTIVO: la taquilla arranca cada venta en efectivo (y ahí salen los billetes) y el cuadre
 * de caja cuenta el cajón con él. Devuelve el error o null si está bien.
 *
 * `cambio` es el medio que se va a crear, editar o desactivar, con su estado final.
 */
export function validarMediosActivos(actuales: MedioResumen[], cambio: MedioResumen): string | null {
  const final = [...actuales.filter((m) => m.id !== cambio.id), cambio].filter((m) => m.activo);
  if (final.length === 0) return "Debe quedar al menos un medio de pago activo.";
  if (!final.some((m) => m.es_efectivo)) {
    return "Debe quedar al menos un medio en efectivo activo: la taquilla y el cuadre de caja lo necesitan.";
  }
  return null;
}

/**
 * El medio con el que arranca cada venta en taquilla: el primer medio en efectivo (en el
 * orden configurado) y, si no hay ninguno, el primero de la lista. No depende de que el
 * efectivo quede de primero en el orden.
 */
export function medioInicial<T extends { es_efectivo: boolean }>(medios: T[]): T | undefined {
  return medios.find((m) => m.es_efectivo) ?? medios[0];
}
