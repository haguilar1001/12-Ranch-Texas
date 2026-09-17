"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { limpiarCelular, esCelularColombiano, esEmailValido } from "@/lib/contacto";

interface Resultado {
  ok: boolean;
  error?: string;
}

const RUTA = "/admin/clientes";

async function supervisor() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "supervisor") ? s : null;
}

interface CambiosCliente {
  nombre?: string;
  celular?: string;
  documento?: string | null;
  email?: string | null;
  razon_social?: string | null;
  nit?: string | null;
}

export async function editarCliente(id: string, cambios: CambiosCliente): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const c = await prisma.cliente.findUnique({ where: { id } });
  if (!c) return { ok: false, error: "Cliente no encontrado." };

  const data: {
    nombre?: string; celular?: string; documento?: string | null; email?: string | null;
    razon_social?: string | null; nit?: string | null; actualizado_por: string;
  } = { actualizado_por: s.id };

  if (cambios.nombre !== undefined) {
    if (!cambios.nombre.trim()) return { ok: false, error: "El nombre no puede quedar vacío." };
    data.nombre = cambios.nombre.trim();
  }
  if (cambios.celular !== undefined) {
    if (!esCelularColombiano(cambios.celular)) return { ok: false, error: "El celular debe tener 10 dígitos y empezar por 3." };
    const limpio = limpiarCelular(cambios.celular);
    if (limpio !== c.celular) {
      const choca = await prisma.cliente.findUnique({ where: { celular: limpio } });
      if (choca) return { ok: false, error: `Ese celular ya es de ${choca.nombre}.` };
    }
    data.celular = limpio;
  }
  if (cambios.documento !== undefined) data.documento = cambios.documento?.trim() || null;
  if (cambios.email !== undefined) {
    const email = cambios.email?.trim() || null;
    if (email && !esEmailValido(email)) return { ok: false, error: "El correo no es válido." };
    data.email = email;
  }
  if (cambios.razon_social !== undefined || cambios.nit !== undefined) {
    const razonSocial = (cambios.razon_social ?? c.razon_social)?.trim() || null;
    const nit = (cambios.nit ?? c.nit)?.trim() || null;
    // Ambos o ninguno: una razón social sin NIT (o al revés) no sirve para el recibo.
    if (!!razonSocial !== !!nit) return { ok: false, error: "Para empresa, indica razón social Y NIT (o borra los dos)." };
    data.razon_social = razonSocial;
    data.nit = nit;
  }

  await prisma.cliente.update({ where: { id }, data });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "cliente", entidad_id: id, accion: "editar",
    datos_antes: { nombre: c.nombre, celular: c.celular, documento: c.documento, email: c.email, razon_social: c.razon_social, nit: c.nit },
    datos_despues: JSON.parse(JSON.stringify(cambios)),
  });
  revalidatePath(RUTA);
  return { ok: true };
}

export async function cambiarEstadoCliente(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };
  await prisma.cliente.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "cliente", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath(RUTA);
  return { ok: true };
}
