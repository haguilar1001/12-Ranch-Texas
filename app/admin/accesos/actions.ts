"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

interface Resultado {
  ok: boolean;
  error?: string;
  aviso?: string;
}

const RUTA = "/admin/accesos";

async function supervisor() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "supervisor") ? s : null;
}

const texto = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** Entero opcional dentro de un rango. Devuelve "error" si no sirve. */
function entero(v: string | number | null | undefined, min: number, max: number): number | null | "error" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d]/g, ""), 10);
  if (!Number.isInteger(n) || n < min || n > max) return "error";
  return n;
}

const REGLAS = ["un_ingreso", "reingreso", "entrada_salida"] as const;
type Regla = (typeof REGLAS)[number];

// ============================================================ ATRACCIONES

export interface EntradaAtraccion {
  nombre: string;
  descripcion?: string | null;
  edad_minima?: string | number | null;
  estatura_minima?: string | number | null;
  requiere_consentimiento: boolean;
  /** Al crear: también genera su punto de control (el lector de la atracción). */
  crear_punto?: boolean;
  tipo_regla?: string;
}

export async function crearAtraccion(e: EntradaAtraccion): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const nombre = e.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre de la atracción es obligatorio." };

  const repetida = await prisma.atraccion.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" } } });
  if (repetida) {
    return {
      ok: false,
      error: repetida.activa ? `Ya existe la atracción "${repetida.nombre}".` : `"${repetida.nombre}" ya existe pero está inactiva: actívala en vez de crearla de nuevo.`,
    };
  }

  const edad = entero(e.edad_minima, 0, 120);
  if (edad === "error") return { ok: false, error: "La edad mínima debe ser un número entre 0 y 120." };
  const estatura = entero(e.estatura_minima, 30, 250);
  if (estatura === "error") return { ok: false, error: "La estatura mínima debe estar en centímetros, entre 30 y 250." };

  const regla: Regla = REGLAS.includes(e.tipo_regla as Regla) ? (e.tipo_regla as Regla) : "reingreso";

  const a = await prisma.$transaction(async (tx) => {
    const atr = await tx.atraccion.create({
      data: {
        nombre,
        descripcion: texto(e.descripcion),
        edad_minima: edad,
        estatura_minima: estatura,
        requiere_consentimiento: e.requiere_consentimiento,
        creado_por: s.id,
      },
    });
    // Sin punto de control no hay dónde escanear, así que por defecto se crea uno.
    if (e.crear_punto !== false) {
      await tx.puntoControl.create({
        data: {
          nombre: `Control ${nombre}`,
          atraccion_id: atr.id,
          tipo_regla: regla,
          requiere_consentimiento: e.requiere_consentimiento,
          edad_minima: edad,
          estatura_minima: estatura,
          creado_por: s.id,
        },
      });
    }
    return atr;
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "atraccion", entidad_id: a.id, accion: "crear",
    datos_despues: { nombre, requiere_consentimiento: e.requiere_consentimiento, edad_minima: edad, estatura_minima: estatura },
  });
  revalidatePath(RUTA);
  return { ok: true };
}

export async function editarAtraccion(id: string, cambios: EntradaAtraccion): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const antes = await prisma.atraccion.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Atracción no encontrada." };

  const nombre = cambios.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };

  const repetida = await prisma.atraccion.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" }, id: { not: id } },
  });
  if (repetida) return { ok: false, error: `Ya existe otra atracción llamada "${repetida.nombre}".` };

  const edad = entero(cambios.edad_minima, 0, 120);
  if (edad === "error") return { ok: false, error: "La edad mínima debe ser un número entre 0 y 120." };
  const estatura = entero(cambios.estatura_minima, 30, 250);
  if (estatura === "error") return { ok: false, error: "La estatura mínima debe estar en centímetros, entre 30 y 250." };

  await prisma.atraccion.update({
    where: { id },
    data: {
      nombre,
      descripcion: texto(cambios.descripcion),
      edad_minima: edad,
      estatura_minima: estatura,
      requiere_consentimiento: cambios.requiere_consentimiento,
      actualizado_por: s.id,
    },
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "atraccion", entidad_id: id, accion: "editar",
    datos_antes: {
      nombre: antes.nombre, edad_minima: antes.edad_minima, estatura_minima: antes.estatura_minima,
      requiere_consentimiento: antes.requiere_consentimiento,
    },
    datos_despues: { nombre, edad_minima: edad, estatura_minima: estatura, requiere_consentimiento: cambios.requiere_consentimiento },
  });
  revalidatePath(RUTA);
  return { ok: true };
}

/**
 * Baja lógica. Los accesos y consentimientos ya registrados se conservan: la atracción
 * simplemente deja de ofrecerse. Sus puntos de control se desactivan con ella, porque
 * un lector abierto de una atracción retirada dejaría entrar gente.
 */
export async function cambiarEstadoAtraccion(id: string, activa: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const atr = await prisma.atraccion.findUnique({ where: { id }, include: { _count: { select: { consentimientos: true } } } });
  if (!atr) return { ok: false, error: "Atracción no encontrada." };

  await prisma.$transaction(async (tx) => {
    await tx.atraccion.update({ where: { id }, data: { activa, actualizado_por: s.id } });
    await tx.puntoControl.updateMany({ where: { atraccion_id: id }, data: { activo: activa, actualizado_por: s.id } });
  });

  await registrarAuditoria({ usuario_id: s.id, entidad: "atraccion", entidad_id: id, accion: activa ? "activar" : "desactivar" });
  revalidatePath(RUTA);
  return {
    ok: true,
    aviso: !activa && atr._count.consentimientos > 0
      ? `Se conservan ${atr._count.consentimientos} consentimiento(s) ya firmados para esta atracción.`
      : undefined,
  };
}

// ============================================================ PUNTOS DE CONTROL

export interface EntradaPunto {
  nombre: string;
  atraccion_id?: string | null;
  tipo_regla: string;
  aforo_maximo?: string | number | null;
  edad_minima?: string | number | null;
  estatura_minima?: string | number | null;
  requiere_consentimiento: boolean;
}

export async function crearPunto(e: EntradaPunto): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const nombre = e.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre del punto de control es obligatorio." };
  if (!REGLAS.includes(e.tipo_regla as Regla)) return { ok: false, error: "Elige la regla de acceso." };

  const repetido = await prisma.puntoControl.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" } } });
  if (repetido) return { ok: false, error: `Ya existe un punto de control llamado "${repetido.nombre}".` };

  const aforo = entero(e.aforo_maximo, 0, 100_000);
  if (aforo === "error") return { ok: false, error: "El aforo debe ser un entero." };
  const edad = entero(e.edad_minima, 0, 120);
  if (edad === "error") return { ok: false, error: "La edad mínima debe ser un número entre 0 y 120." };
  const estatura = entero(e.estatura_minima, 30, 250);
  if (estatura === "error") return { ok: false, error: "La estatura mínima debe estar en centímetros, entre 30 y 250." };

  const p = await prisma.puntoControl.create({
    data: {
      nombre,
      atraccion_id: texto(e.atraccion_id),
      tipo_regla: e.tipo_regla as Regla,
      aforo_maximo: aforo,
      edad_minima: edad,
      estatura_minima: estatura,
      requiere_consentimiento: e.requiere_consentimiento,
      creado_por: s.id,
    },
  });

  await registrarAuditoria({ usuario_id: s.id, entidad: "punto_control", entidad_id: p.id, accion: "crear", datos_despues: { nombre, tipo_regla: e.tipo_regla } });
  revalidatePath(RUTA);
  return { ok: true };
}

export async function editarPunto(id: string, cambios: EntradaPunto): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const antes = await prisma.puntoControl.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Punto de control no encontrado." };

  const nombre = cambios.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };
  if (!REGLAS.includes(cambios.tipo_regla as Regla)) return { ok: false, error: "Regla de acceso no válida." };

  const repetido = await prisma.puntoControl.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" }, id: { not: id } },
  });
  if (repetido) return { ok: false, error: `Ya existe otro punto de control llamado "${repetido.nombre}".` };

  const aforo = entero(cambios.aforo_maximo, 0, 100_000);
  if (aforo === "error") return { ok: false, error: "El aforo debe ser un entero." };
  const edad = entero(cambios.edad_minima, 0, 120);
  if (edad === "error") return { ok: false, error: "La edad mínima debe ser un número entre 0 y 120." };
  const estatura = entero(cambios.estatura_minima, 30, 250);
  if (estatura === "error") return { ok: false, error: "La estatura mínima debe estar en centímetros, entre 30 y 250." };

  const data: Prisma.PuntoControlUpdateInput = {
    nombre,
    tipo_regla: cambios.tipo_regla as Regla,
    aforo_maximo: aforo,
    edad_minima: edad,
    estatura_minima: estatura,
    requiere_consentimiento: cambios.requiere_consentimiento,
    actualizado_por: s.id,
  };
  const atraccionId = texto(cambios.atraccion_id);
  data.atraccion = atraccionId ? { connect: { id: atraccionId } } : { disconnect: true };

  await prisma.puntoControl.update({ where: { id }, data });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "punto_control", entidad_id: id, accion: "editar",
    datos_antes: { nombre: antes.nombre, tipo_regla: antes.tipo_regla, aforo_maximo: antes.aforo_maximo, requiere_consentimiento: antes.requiere_consentimiento },
    datos_despues: { nombre, tipo_regla: cambios.tipo_regla, aforo_maximo: aforo, requiere_consentimiento: cambios.requiere_consentimiento },
  });
  revalidatePath(RUTA);
  return { ok: true };
}

export async function cambiarEstadoPunto(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const punto = await prisma.puntoControl.findUnique({ where: { id } });
  if (!punto) return { ok: false, error: "Punto de control no encontrado." };

  // La Entrada Principal es la que alimenta el aforo del parque: apagarla ciega el conteo.
  if (!activo && !punto.atraccion_id) {
    const otrosGenerales = await prisma.puntoControl.count({ where: { atraccion_id: null, activo: true, id: { not: id } } });
    if (otrosGenerales === 0) {
      return { ok: false, error: "Es el único punto de entrada al parque: desactivarlo dejaría el aforo sin medir. Crea otro antes." };
    }
  }

  await prisma.puntoControl.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "punto_control", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath(RUTA);
  return { ok: true };
}
