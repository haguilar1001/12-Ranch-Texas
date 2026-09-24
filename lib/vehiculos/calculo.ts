// Lógica pura de Control Vehículo (sin BD), para poder probarla y compartirla
// entre cliente y servidor. El servidor SIEMPRE vuelve a validar: no confía en el cliente.

export type Prioridad = "baja" | "media" | "alta" | "urgente";
export const PRIORIDADES: Prioridad[] = ["baja", "media", "alta", "urgente"];

export interface EntradaSolicitud {
  solicitante_id: string;
  hora_inicio: Date | null;
  hora_fin: Date | null;
  prioridad: Prioridad;
  descripcion: string;
}

/** Valida los datos de una solicitud de vehículo (antes de crearla). */
export function validarSolicitud(e: EntradaSolicitud): string[] {
  const errores: string[] = [];
  if (!e.solicitante_id) errores.push("Selecciona quién solicita el vehículo.");
  if (!e.descripcion?.trim()) errores.push("Describe para qué es el viaje.");
  if (!PRIORIDADES.includes(e.prioridad)) errores.push("La prioridad no es válida.");

  const inicioValido = e.hora_inicio instanceof Date && !isNaN(e.hora_inicio.getTime());
  const finValido = e.hora_fin instanceof Date && !isNaN(e.hora_fin.getTime());
  if (!inicioValido) errores.push("La hora de inicio no es válida.");
  if (!finValido) errores.push("La hora de fin no es válida.");
  if (inicioValido && finValido && (e.hora_fin as Date) <= (e.hora_inicio as Date)) {
    errores.push("La hora de fin debe ser después de la hora de inicio.");
  }
  return errores;
}

/** Valida el cierre del viaje: el chofer registra los dos kilometrajes en un solo paso. */
export function validarCierre(kmInicial: number, kmFinal: number): string[] {
  const errores: string[] = [];
  if (!Number.isInteger(kmInicial) || kmInicial < 0) errores.push("El kilometraje inicial debe ser un entero mayor o igual a 0.");
  if (!Number.isInteger(kmFinal) || kmFinal < 0) errores.push("El kilometraje final debe ser un entero mayor o igual a 0.");
  if (Number.isInteger(kmInicial) && Number.isInteger(kmFinal) && kmInicial >= 0 && kmFinal < kmInicial) {
    errores.push("El kilometraje final no puede ser menor que el inicial.");
  }
  return errores;
}

/** Kilómetros recorridos en un viaje ya cerrado; 0 si falta algún dato. */
export function kmRecorridos(kmInicial: number | null, kmFinal: number | null): number {
  if (kmInicial === null || kmFinal === null || kmFinal < kmInicial) return 0;
  return kmFinal - kmInicial;
}
