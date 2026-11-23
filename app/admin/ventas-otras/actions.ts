"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { fechaBogota } from "@/lib/tiempo";
import { validarVentaOtra, type EntradaVentaOtra } from "@/lib/ventas-otras/validar";

export interface ResultadoVentaOtra {
  ok: boolean;
  error?: string;
}

const RUTAS = ["/admin/ventas-otras", "/admin/reportes/comparativo", "/admin/dashboard", "/"];
const refrescar = () => RUTAS.forEach((r) => revalidatePath(r));

export async function registrarVentaOtra(e: EntradaVentaOtra): Promise<ResultadoVentaOtra> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  if (!tieneRol(s.rol, "supervisor")) return { ok: false, error: "No autorizado para cargar ventas." };

  const v = validarVentaOtra(e, fechaBogota());
  if (!v.ok) return v;

  const creada = await prisma.ventaOtra.create({ data: { ...v.datos, creado_por: s.id } });
  await registrarAuditoria({
    usuario_id: s.id,
    entidad: "venta_otra",
    entidad_id: creada.id,
    accion: "crear",
    datos_despues: { fecha: e.fecha, linea: creada.linea, valor: creada.valor, descripcion: creada.descripcion },
  });
  refrescar();
  return { ok: true };
}

export async function anularVentaOtra(id: string, motivo: string): Promise<ResultadoVentaOtra> {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "supervisor")) return { ok: false, error: "No autorizado." };
  if (!motivo?.trim()) return { ok: false, error: "Indica el motivo." };

  const actual = await prisma.ventaOtra.findUnique({ where: { id } });
  if (!actual) return { ok: false, error: "No existe." };
  if (actual.estado === "anulada") return { ok: false, error: "Ya estaba anulada." };

  await prisma.ventaOtra.update({
    where: { id },
    data: { estado: "anulada", motivo_anulacion: motivo.trim(), anulada_por: s.id, anulada_en: new Date(), actualizado_por: s.id },
  });
  await registrarAuditoria({
    usuario_id: s.id,
    entidad: "venta_otra",
    entidad_id: id,
    accion: "anular",
    datos_antes: { estado: "activa", linea: actual.linea, valor: actual.valor },
    datos_despues: { motivo: motivo.trim() },
  });
  refrescar();
  return { ok: true };
}
