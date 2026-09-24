"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";

interface Resultado {
  ok: boolean;
  error?: string;
}

async function admin() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "administrador") ? s : null;
}

// ==================================================================== VEHÍCULOS

export async function crearVehiculo(input: { placa: string; marca: string; modelo: string; chofer_habitual_id: string }): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador puede gestionar vehículos." };

  const placa = input.placa?.trim();
  if (!placa) return { ok: false, error: "La placa es obligatoria." };

  const repetida = await prisma.vehiculo.findFirst({ where: { placa: { equals: placa, mode: "insensitive" } } });
  if (repetida) return { ok: false, error: `Ya existe un vehículo con placa "${repetida.placa}".` };

  const v = await prisma.vehiculo.create({
    data: {
      placa, marca: input.marca?.trim() || null, modelo: input.modelo?.trim() || null,
      chofer_habitual_id: input.chofer_habitual_id || null, creado_por: s.id,
    },
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "vehiculo", entidad_id: v.id, accion: "crear", datos_despues: input });
  revalidatePath("/admin/vehiculos");
  revalidatePath("/vehiculos/aprobar");
  return { ok: true };
}

export async function editarVehiculo(id: string, input: { placa?: string; marca?: string; modelo?: string; chofer_habitual_id?: string }): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const v = await prisma.vehiculo.findUnique({ where: { id } });
  if (!v) return { ok: false, error: "Vehículo no encontrado." };

  const data: Record<string, unknown> = { actualizado_por: s.id };
  if (input.placa !== undefined) {
    const placa = input.placa.trim();
    if (!placa) return { ok: false, error: "La placa no puede quedar vacía." };
    const repetida = await prisma.vehiculo.findFirst({ where: { placa: { equals: placa, mode: "insensitive" }, id: { not: id } } });
    if (repetida) return { ok: false, error: `Ya existe otro vehículo con placa "${repetida.placa}".` };
    data.placa = placa;
  }
  if (input.marca !== undefined) data.marca = input.marca.trim() || null;
  if (input.modelo !== undefined) data.modelo = input.modelo.trim() || null;
  if (input.chofer_habitual_id !== undefined) data.chofer_habitual_id = input.chofer_habitual_id || null;

  await prisma.vehiculo.update({ where: { id }, data });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "vehiculo", entidad_id: id, accion: "editar",
    datos_antes: { placa: v.placa, marca: v.marca, modelo: v.modelo, chofer_habitual_id: v.chofer_habitual_id },
    datos_despues: input,
  });
  revalidatePath("/admin/vehiculos");
  revalidatePath("/vehiculos/aprobar");
  return { ok: true };
}

export async function cambiarEstadoVehiculo(id: string, activo: boolean): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };
  const v = await prisma.vehiculo.findUnique({ where: { id } });
  if (!v) return { ok: false, error: "Vehículo no encontrado." };
  await prisma.vehiculo.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "vehiculo", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath("/admin/vehiculos");
  return { ok: true };
}

// =============================================================== SOLICITANTES
// Los ~200 "jefes" que piden el vehículo. Catálogo sin login, como AutorizadorCortesia.

export async function crearSolicitante(nombre: string, cargo: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador puede gestionar los solicitantes." };

  const limpio = nombre?.trim();
  if (!limpio) return { ok: false, error: "El nombre es obligatorio." };

  const repetido = await prisma.solicitanteVehiculo.findFirst({ where: { nombre: { equals: limpio, mode: "insensitive" } } });
  if (repetido) {
    return {
      ok: false,
      error: repetido.activo ? `"${repetido.nombre}" ya está en el catálogo.` : `"${repetido.nombre}" ya existe pero está inactivo: actívalo en vez de crearlo de nuevo.`,
    };
  }

  const sol = await prisma.solicitanteVehiculo.create({ data: { nombre: limpio, cargo: cargo?.trim() || null, creado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "solicitante_vehiculo", entidad_id: sol.id, accion: "crear", datos_despues: { nombre: limpio, cargo } });
  revalidatePath("/admin/vehiculos");
  revalidatePath("/vehiculos/solicitar");
  return { ok: true };
}

export async function editarSolicitante(id: string, nombre: string, cargo: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const limpio = nombre?.trim();
  if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío." };

  const antes = await prisma.solicitanteVehiculo.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Solicitante no encontrado." };

  const repetido = await prisma.solicitanteVehiculo.findFirst({ where: { nombre: { equals: limpio, mode: "insensitive" }, id: { not: id } } });
  if (repetido) return { ok: false, error: `Ya existe otro solicitante llamado "${repetido.nombre}".` };

  await prisma.solicitanteVehiculo.update({ where: { id }, data: { nombre: limpio, cargo: cargo?.trim() || null, actualizado_por: s.id } });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "solicitante_vehiculo", entidad_id: id, accion: "editar",
    datos_antes: { nombre: antes.nombre, cargo: antes.cargo }, datos_despues: { nombre: limpio, cargo },
  });
  revalidatePath("/admin/vehiculos");
  revalidatePath("/vehiculos/solicitar");
  return { ok: true };
}

export async function cambiarEstadoSolicitante(id: string, activo: boolean): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };
  const sol = await prisma.solicitanteVehiculo.findUnique({ where: { id } });
  if (!sol) return { ok: false, error: "Solicitante no encontrado." };
  await prisma.solicitanteVehiculo.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "solicitante_vehiculo", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath("/admin/vehiculos");
  revalidatePath("/vehiculos/solicitar");
  return { ok: true };
}
