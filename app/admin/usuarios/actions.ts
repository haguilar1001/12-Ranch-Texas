"use server";

import { revalidatePath } from "next/cache";
import { Rol } from "@prisma/client";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { hashPassword } from "@/lib/auth/password";
import { registrarAuditoria } from "@/lib/audit";

interface EntradaUsuario {
  nombre: string;
  usuario: string;
  rol: string;
  password: string;
}
interface Resultado {
  ok: boolean;
  error?: string;
}

const ROLES = ["administrador", "supervisor", "cajero", "control_acceso", "granja", "consulta", "chofer"];

async function admin() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "administrador") ? s : null;
}

async function hayOtroAdmin(exceptoId: string): Promise<boolean> {
  const n = await prisma.usuario.count({ where: { rol: "administrador", activo: true, id: { not: exceptoId } } });
  return n >= 1;
}

export async function crearUsuario(e: EntradaUsuario): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador puede gestionar usuarios." };
  const usuario = e.usuario?.trim();
  const nombre = e.nombre?.trim();
  if (!nombre || !usuario) return { ok: false, error: "Nombre y usuario/correo son obligatorios." };
  if (!ROLES.includes(e.rol)) return { ok: false, error: "Perfil inválido." };
  if (!e.password || e.password.length < 6) return { ok: false, error: "La contraseña inicial debe tener al menos 6 caracteres." };
  if (await prisma.usuario.findUnique({ where: { usuario } })) return { ok: false, error: "Ya existe un usuario con ese identificador." };

  const u = await prisma.usuario.create({
    data: { nombre, usuario, rol: e.rol as Rol, hash_password: await hashPassword(e.password), creado_por: s.id },
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "usuario", entidad_id: u.id, accion: "crear", datos_despues: { usuario, rol: e.rol } });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function editarUsuario(id: string, cambios: { nombre?: string; usuario?: string; rol?: string }): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };
  const u = await prisma.usuario.findUnique({ where: { id } });
  if (!u) return { ok: false, error: "Usuario no encontrado." };

  const data: { nombre?: string; usuario?: string; rol?: Rol; actualizado_por?: string } = { actualizado_por: s.id };
  if (cambios.nombre !== undefined) {
    if (!cambios.nombre.trim()) return { ok: false, error: "El nombre no puede quedar vacío." };
    data.nombre = cambios.nombre.trim();
  }
  if (cambios.usuario !== undefined) {
    const nuevo = cambios.usuario.trim();
    if (!nuevo) return { ok: false, error: "El usuario o correo no puede quedar vacío." };
    if (nuevo !== u.usuario) {
      const repetido = await prisma.usuario.findUnique({ where: { usuario: nuevo } });
      if (repetido) return { ok: false, error: "Ya existe otro usuario con ese identificador." };
    }
    data.usuario = nuevo;
  }
  if (cambios.rol !== undefined) {
    if (!ROLES.includes(cambios.rol)) return { ok: false, error: "Perfil inválido." };
    if (u.id === s.id && cambios.rol !== "administrador") return { ok: false, error: "No puedes quitarte a ti mismo el perfil de administrador." };
    if (u.rol === "administrador" && cambios.rol !== "administrador" && !(await hayOtroAdmin(u.id))) {
      return { ok: false, error: "Debe quedar al menos un administrador." };
    }
    data.rol = cambios.rol as Rol;
  }
  await prisma.usuario.update({ where: { id }, data });
  await registrarAuditoria({ usuario_id: s.id, entidad: "usuario", entidad_id: id, accion: "editar", datos_antes: { nombre: u.nombre, usuario: u.usuario, rol: u.rol }, datos_despues: cambios });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function cambiarEstadoUsuario(id: string, activo: boolean): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };
  if (id === s.id && !activo) return { ok: false, error: "No puedes desactivar tu propia cuenta." };
  const u = await prisma.usuario.findUnique({ where: { id } });
  if (!u) return { ok: false, error: "Usuario no encontrado." };
  if (!activo && u.rol === "administrador" && !(await hayOtroAdmin(u.id))) {
    return { ok: false, error: "Debe quedar al menos un administrador activo." };
  }
  await prisma.usuario.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "usuario", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function resetearPasswordUsuario(id: string, nueva: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };
  if (!nueva || nueva.length < 6) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  const u = await prisma.usuario.findUnique({ where: { id } });
  if (!u) return { ok: false, error: "Usuario no encontrado." };
  await prisma.usuario.update({ where: { id }, data: { hash_password: await hashPassword(nueva), actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "usuario", entidad_id: id, accion: "reset_password" });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}
