"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verificarPassword, hashPassword } from "./password";
import { guardarSesion, limpiarSesion, obtenerSesion } from "./sesion";

interface EstadoLogin {
  error?: string;
}

interface EstadoClave {
  error?: string;
  ok?: boolean;
}

/** Cambio de contraseña del propio usuario (verifica la actual). */
export async function cambiarPassword(_prev: EstadoClave | null, formData: FormData): Promise<EstadoClave> {
  const s = await obtenerSesion();
  if (!s) return { error: "Sesión expirada." };

  const actual = String(formData.get("actual") ?? "");
  const nueva = String(formData.get("nueva") ?? "");
  const confirmar = String(formData.get("confirmar") ?? "");
  if (nueva.length < 6) return { error: "La nueva contraseña debe tener al menos 6 caracteres." };
  if (nueva !== confirmar) return { error: "Las contraseñas no coinciden." };

  const u = await prisma.usuario.findUnique({ where: { id: s.id } });
  if (!u || !(await verificarPassword(actual, u.hash_password))) {
    return { error: "La contraseña actual es incorrecta." };
  }

  await prisma.usuario.update({ where: { id: s.id }, data: { hash_password: await hashPassword(nueva), actualizado_por: s.id } });
  return { ok: true };
}

export async function login(_prev: EstadoLogin | null, formData: FormData): Promise<EstadoLogin> {
  const usuario = String(formData.get("usuario") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!usuario || !password) return { error: "Ingresa usuario y contraseña." };

  // El usuario (o correo) no distingue mayúsculas: el teclado del celular pone la primera
  // letra en mayúscula y "Hector@..." debe entrar igual que "hector@...". Si por datos viejos
  // hubiera dos que solo difieren en mayúsculas, manda el que coincide exacto.
  const candidatos = await prisma.usuario.findMany({ where: { usuario: { equals: usuario, mode: "insensitive" } } });
  const u = candidatos.find((c) => c.usuario === usuario) ?? (candidatos.length === 1 ? candidatos[0] : null);
  if (!u || !u.activo || !(await verificarPassword(password, u.hash_password))) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  await prisma.usuario.update({ where: { id: u.id }, data: { ultimo_ingreso: new Date() } });
  await guardarSesion({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol });
  redirect("/");
}

export async function logout(): Promise<void> {
  await limpiarSesion();
  redirect("/login");
}
