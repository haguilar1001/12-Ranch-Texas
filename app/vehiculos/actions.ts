"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeConducir } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { validarSolicitud, validarCierre, horaFinDe, type Prioridad } from "@/lib/vehiculos/calculo";

interface Resultado {
  ok: boolean;
  error?: string;
}

async function sesionSupervisor() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "supervisor") ? s : null;
}

// ==================================================================== SOLICITAR
// Quien esté en oficina (supervisor/administrador) registra la solicitud a nombre del
// jefe que la pide; el jefe no necesita login.

export interface EntradaCrearSolicitud {
  solicitante_id: string;
  fecha: string; // YYYY-MM-DD
  hora_inicio: string; // HH:MM
  duracion_minutos: number; // la hora de fin se calcula: hora_inicio + esto
  prioridad: Prioridad;
  descripcion: string;
  origen: string;
  destino: string;
  viaje_redondo: boolean;
}

export async function crearSolicitud(input: EntradaCrearSolicitud): Promise<Resultado> {
  const s = await sesionSupervisor();
  if (!s) return { ok: false, error: "Solo un supervisor o administrador puede registrar una solicitud." };

  if (!input.fecha || !input.hora_inicio || !input.duracion_minutos) {
    return { ok: false, error: "Indica la fecha, la hora de inicio y la duración aproximada." };
  }
  const horaInicio = new Date(`${input.fecha}T${input.hora_inicio}:00-05:00`);
  const horaFin = horaFinDe(horaInicio, input.duracion_minutos);

  const errores = validarSolicitud({
    solicitante_id: input.solicitante_id,
    hora_inicio: horaInicio,
    hora_fin: horaFin,
    prioridad: input.prioridad,
    descripcion: input.descripcion,
    origen: input.origen,
    destino: input.destino,
  });
  if (errores.length) return { ok: false, error: errores.join(" ") };

  const solicitante = await prisma.solicitanteVehiculo.findUnique({ where: { id: input.solicitante_id } });
  if (!solicitante || !solicitante.activo) return { ok: false, error: "Ese solicitante no existe o está inactivo." };

  const sol = await prisma.solicitudVehiculo.create({
    data: {
      solicitante_id: input.solicitante_id,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      prioridad: input.prioridad,
      descripcion: input.descripcion.trim(),
      origen: input.origen.trim(),
      destino: input.destino.trim(),
      viaje_redondo: !!input.viaje_redondo,
      creado_por: s.id,
    },
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "solicitud_vehiculo", entidad_id: sol.id, accion: "crear", datos_despues: JSON.parse(JSON.stringify(input)) });
  revalidatePath("/vehiculos/aprobar");
  revalidatePath("/vehiculos/solicitar");
  return { ok: true };
}

// ===================================================================== APROBAR

export async function aprobarSolicitud(id: string, vehiculoId: string, choferId: string): Promise<Resultado> {
  const s = await sesionSupervisor();
  if (!s) return { ok: false, error: "Solo un supervisor o administrador puede aprobar." };
  if (!vehiculoId || !choferId) return { ok: false, error: "Asigna un vehículo y un chofer." };

  const sol = await prisma.solicitudVehiculo.findUnique({ where: { id } });
  if (!sol) return { ok: false, error: "Solicitud no encontrada." };
  if (sol.estado !== "pendiente") return { ok: false, error: "Esa solicitud ya no está pendiente." };

  const [vehiculo, chofer] = await Promise.all([
    prisma.vehiculo.findUnique({ where: { id: vehiculoId } }),
    prisma.usuario.findUnique({ where: { id: choferId } }),
  ]);
  if (!vehiculo || !vehiculo.activo) return { ok: false, error: "Ese vehículo no existe o está inactivo." };
  if (!chofer || !chofer.activo || chofer.rol !== "chofer") return { ok: false, error: "Ese usuario no es un chofer activo." };

  await prisma.solicitudVehiculo.update({
    where: { id },
    data: {
      estado: "aprobada", vehiculo_id: vehiculoId, chofer_id: choferId,
      aprobado_por: s.id, aprobado_en: new Date(), actualizado_por: s.id,
    },
  });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "solicitud_vehiculo", entidad_id: id, accion: "aprobar",
    datos_despues: { vehiculo_id: vehiculoId, chofer_id: choferId },
  });
  revalidatePath("/vehiculos/aprobar");
  revalidatePath("/vehiculos/mis-viajes");
  return { ok: true };
}

export async function rechazarSolicitud(id: string, motivo: string): Promise<Resultado> {
  const s = await sesionSupervisor();
  if (!s) return { ok: false, error: "Solo un supervisor o administrador puede rechazar." };

  const limpio = motivo?.trim();
  if (!limpio) return { ok: false, error: "Indica el motivo del rechazo." };

  const sol = await prisma.solicitudVehiculo.findUnique({ where: { id } });
  if (!sol) return { ok: false, error: "Solicitud no encontrada." };
  if (sol.estado !== "pendiente") return { ok: false, error: "Esa solicitud ya no está pendiente." };

  await prisma.solicitudVehiculo.update({
    where: { id },
    data: { estado: "rechazada", motivo_rechazo: limpio, aprobado_por: s.id, aprobado_en: new Date(), actualizado_por: s.id },
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "solicitud_vehiculo", entidad_id: id, accion: "rechazar", datos_despues: { motivo: limpio } });
  revalidatePath("/vehiculos/aprobar");
  return { ok: true };
}

export async function cancelarSolicitud(id: string, motivo: string): Promise<Resultado> {
  const s = await sesionSupervisor();
  if (!s) return { ok: false, error: "Solo un supervisor o administrador puede cancelar." };

  const limpio = motivo?.trim();
  if (!limpio) return { ok: false, error: "Indica el motivo de la cancelación." };

  const sol = await prisma.solicitudVehiculo.findUnique({ where: { id } });
  if (!sol) return { ok: false, error: "Solicitud no encontrada." };
  if (!["pendiente", "aprobada"].includes(sol.estado)) return { ok: false, error: "Esa solicitud ya no se puede cancelar." };

  await prisma.solicitudVehiculo.update({
    where: { id },
    data: { estado: "cancelada", motivo_cancelacion: limpio, actualizado_por: s.id },
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "solicitud_vehiculo", entidad_id: id, accion: "cancelar", datos_despues: { motivo: limpio } });
  revalidatePath("/vehiculos/aprobar");
  revalidatePath("/vehiculos/mis-viajes");
  return { ok: true };
}

// ============================================================= CERRAR EL VIAJE
// El chofer entra con su usuario y, al volver, pone los dos kilometrajes de una vez.

export async function cerrarViaje(id: string, kmInicial: number | string, kmFinal: number | string): Promise<Resultado> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };

  const sol = await prisma.solicitudVehiculo.findUnique({ where: { id } });
  if (!sol) return { ok: false, error: "Solicitud no encontrada." };
  if (sol.estado !== "aprobada") return { ok: false, error: "Ese viaje no está aprobado ni pendiente de cerrar." };
  // Lo cierra el chofer asignado, o un administrador si hace falta corregir.
  if (sol.chofer_id !== s.id && !tieneRol(s.rol, "administrador")) {
    return { ok: false, error: "Solo el chofer asignado (o un administrador) puede cerrar este viaje." };
  }

  const ki = typeof kmInicial === "string" ? parseInt(kmInicial.replace(/\D/g, ""), 10) : kmInicial;
  const kf = typeof kmFinal === "string" ? parseInt(kmFinal.replace(/\D/g, ""), 10) : kmFinal;
  const errores = validarCierre(ki, kf);
  if (errores.length) return { ok: false, error: errores.join(" ") };

  const ahora = new Date();
  await prisma.solicitudVehiculo.update({
    where: { id },
    data: { estado: "completada", km_inicial: ki, km_final: kf, cerrado_en: ahora, actualizado_por: s.id },
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "solicitud_vehiculo", entidad_id: id, accion: "cerrar_viaje", datos_despues: { km_inicial: ki, km_final: kf } });
  revalidatePath("/vehiculos/mis-viajes");
  revalidatePath("/vehiculos/aprobar");
  revalidatePath("/admin/reportes/vehiculos");
  return { ok: true };
}

/** Choferes activos (rol "chofer"), para el selector al aprobar. */
export async function listarChoferes() {
  return prisma.usuario.findMany({
    where: { rol: "chofer", activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}
