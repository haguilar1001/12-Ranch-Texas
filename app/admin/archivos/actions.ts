"use server";

import { revalidatePath } from "next/cache";
import type { TipoArchivo } from "@prisma/client";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { procesarArchivo, anularArchivo, TIPOS_ARCHIVO } from "@/lib/importar/procesar";

export interface ResultadoAccion { ok: boolean; error?: string; resumen?: Record<string, unknown> }

const MAX_BYTES = 8 * 1024 * 1024;
const RUTAS = ["/admin/archivos", "/admin/reportes/estado-resultados", "/admin/reportes/comparativo", "/admin/dashboard", "/"];

export async function cargarArchivo(form: FormData): Promise<ResultadoAccion> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  if (!tieneRol(s.rol, "administrador")) return { ok: false, error: "Solo el administrador carga archivos." };

  const tipo = String(form.get("tipo") ?? "") as TipoArchivo;
  const archivo = form.get("archivo");
  if (!(tipo in TIPOS_ARCHIVO)) return { ok: false, error: "Escoge qué tipo de archivo es." };
  if (!(archivo instanceof File) || !archivo.size) return { ok: false, error: "Escoge el archivo." };
  if (archivo.size > MAX_BYTES) return { ok: false, error: "El archivo pesa más de 8 MB." };

  const r = await procesarArchivo({ tipo, nombre: archivo.name, mime: archivo.type, datos: Buffer.from(await archivo.arrayBuffer()), usuarioId: s.id });
  if (!r.ok) return { ok: false, error: r.error };
  await registrarAuditoria({ usuario_id: s.id, entidad: "archivo_cargado", entidad_id: r.archivoId, accion: "cargar", datos_despues: { tipo, nombre: archivo.name } });
  RUTAS.forEach((p) => revalidatePath(p));
  return { ok: true, resumen: r.resumen };
}

export async function anularArchivoAccion(id: string, motivo: string): Promise<ResultadoAccion> {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "administrador")) return { ok: false, error: "No autorizado." };
  if (!motivo?.trim()) return { ok: false, error: "Indica el motivo." };
  const r = await anularArchivo(id, motivo.trim(), s.id);
  if (!r.ok) return { ok: false, error: r.error };
  await registrarAuditoria({ usuario_id: s.id, entidad: "archivo_cargado", entidad_id: id, accion: "anular", datos_despues: { motivo: motivo.trim() } });
  RUTAS.forEach((p) => revalidatePath(p));
  return { ok: true };
}
