"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";

interface Resultado {
  ok: boolean;
  error?: string;
}

export interface EntradaBeneficiario {
  nombre: string;
  /** Cédula o NIT: sale bajo la firma de "Recibió" en el comprobante de egreso. */
  documento?: string | null;
}

async function supervisor() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "supervisor") ? s : null;
}

function refrescar() {
  revalidatePath("/admin/beneficiarios");
  revalidatePath("/caja/turno");
}

function limpiar(e: EntradaBeneficiario) {
  return { nombre: e.nombre?.trim() ?? "", documento: e.documento?.trim() || null };
}

export async function crearBeneficiario(e: EntradaBeneficiario): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const { nombre, documento } = limpiar(e);
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  const repetido = await prisma.beneficiarioCaja.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" } } });
  if (repetido) {
    return {
      ok: false,
      error: repetido.activo ? `Ya existe "${repetido.nombre}".` : `"${repetido.nombre}" ya existe pero está inactivo: actívalo en vez de crearlo de nuevo.`,
    };
  }

  const b = await prisma.beneficiarioCaja.create({ data: { nombre, documento, creado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "beneficiario_caja", entidad_id: b.id, accion: "crear", datos_despues: { nombre, documento } });
  refrescar();
  return { ok: true };
}

/** Renombrar no cambia los comprobantes ya impresos: guardan el nombre con el que salieron. */
export async function editarBeneficiario(id: string, e: EntradaBeneficiario): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const antes = await prisma.beneficiarioCaja.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Beneficiario no encontrado." };

  const { nombre, documento } = limpiar(e);
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };
  const repetido = await prisma.beneficiarioCaja.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" }, id: { not: id } },
  });
  if (repetido) return { ok: false, error: `Ya existe otro beneficiario llamado "${repetido.nombre}".` };

  await prisma.beneficiarioCaja.update({ where: { id }, data: { nombre, documento, actualizado_por: s.id } });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "beneficiario_caja", entidad_id: id, accion: "editar",
    datos_antes: { nombre: antes.nombre, documento: antes.documento }, datos_despues: { nombre, documento },
  });
  refrescar();
  return { ok: true };
}

/** Baja lógica: deja de salir en la lista de egresos, pero sus comprobantes se conservan. */
export async function cambiarEstadoBeneficiario(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const b = await prisma.beneficiarioCaja.findUnique({ where: { id } });
  if (!b) return { ok: false, error: "Beneficiario no encontrado." };

  await prisma.beneficiarioCaja.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "beneficiario_caja", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  refrescar();
  return { ok: true };
}
