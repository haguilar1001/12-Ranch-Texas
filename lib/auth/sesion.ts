import { cookies } from "next/headers";
import { crearToken, leerToken, type SesionUsuario } from "./session";

// Helpers de sesión sobre cookie httpOnly (lado servidor).
const COOKIE = "rt_sesion";
const MAX_AGE = 60 * 60 * 8; // 8 horas (jornada)

export async function guardarSesion(sesion: SesionUsuario): Promise<void> {
  const token = await crearToken(sesion);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
  });
}

export async function limpiarSesion(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function obtenerSesion(): Promise<SesionUsuario | null> {
  const c = (await cookies()).get(COOKIE);
  if (!c) return null;
  return leerToken(c.value);
}

// `granja` y `chofer` van por DEBAJO de consulta a propósito: ni el operario de granja
// ni el chofer deben ver ventas, caja ni gastos. Su acceso a su módulo (Animales /
// Control Vehículo) se concede aparte, con `puedeOperarGranja` / `puedeConducir`, no
// por nivel jerárquico.
const JERARQUIA = ["granja", "chofer", "consulta", "control_acceso", "cajero", "supervisor", "administrador"];

/** ¿El rol tiene al menos el nivel requerido? (administrador incluye todo). */
export function tieneRol(rol: string, minimo: string): boolean {
  const a = JERARQUIA.indexOf(rol);
  const b = JERARQUIA.indexOf(minimo);
  return a >= 0 && b >= 0 && a >= b;
}

/**
 * ¿Puede operar el módulo de Animales (alimentar, trasladar, ajustar el censo)?
 * El operario de granja sí; de los demás roles, solo supervisor hacia arriba.
 * Los MAESTROS (recintos, alimentos, dieta) siguen siendo de supervisor.
 */
export function puedeOperarGranja(rol: string): boolean {
  return rol === "granja" || tieneRol(rol, "supervisor");
}

/**
 * ¿Puede ver y cerrar SUS PROPIOS viajes en Control Vehículo? El chofer sí; de los
 * demás roles, solo supervisor hacia arriba (para poder revisar/ayudar si hace falta).
 * Solicitar y aprobar una solicitud es otro permiso (`tieneRol(rol, "supervisor")`).
 */
export function puedeConducir(rol: string): boolean {
  return rol === "chofer" || tieneRol(rol, "supervisor");
}
