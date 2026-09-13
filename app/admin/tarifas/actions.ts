"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { parseCOP } from "@/lib/dinero/cop";

interface Resultado {
  ok: boolean;
  error?: string;
}

async function admin() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "administrador") ? s : null;
}

/** Convierte un nombre en un código estable (slug): minúsculas, sin tildes, con "_". */
function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function codigoUnico(base: string): Promise<string> {
  const raiz = base || "tipo";
  let candidato = raiz;
  let n = 1;
  while (await prisma.tipoVisitante.findUnique({ where: { codigo: candidato } })) {
    n += 1;
    candidato = `${raiz}_${n}`;
  }
  return candidato;
}

/**
 * Valida el número entero COP de una tarifa.
 *
 * La TARIFA es la fuente de verdad: si vale más de 0, el tipo cobra; si vale 0, no cobra.
 * Antes `requiere_pago` era un dato independiente y había que cuadrarlo a mano, lo que
 * dejaba tipos atrapados (no se podía subir la tarifa sin marcar "cobra", ni marcar
 * "cobra" sin tener tarifa). Ahora se deriva y no puede quedar incoherente.
 */
function validarTarifa(valorTexto: string | number): { ok: true; valor: number } | { ok: false; error: string } {
  const valor = parseCOP(String(valorTexto));
  if (!Number.isInteger(valor) || valor < 0) return { ok: false, error: "La tarifa debe ser un entero mayor o igual a 0." };
  return { ok: true, valor };
}

/** ¿Este valor de tarifa implica que el tipo cobra entrada? */
const cobra = (valor: number) => valor > 0;

function normalizarEdad(v: number | string | null | undefined): number | null | "error" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d]/g, ""), 10);
  if (!Number.isInteger(n) || n < 0 || n > 120) return "error";
  return n;
}

interface EntradaCrearTipo {
  nombre: string;
  requiere_pago: boolean;
  valor: string | number;
  edad_min?: number | string | null;
  edad_max?: number | string | null;
}

export async function crearTipo(e: EntradaCrearTipo): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador puede gestionar tipos y tarifas." };

  const nombre = e.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };

  const tarifa = validarTarifa(e.valor);
  if (!tarifa.ok) return { ok: false, error: tarifa.error };
  const requierePago = cobra(tarifa.valor);
  if (e.requiere_pago && !requierePago) {
    return { ok: false, error: "Marcaste que este tipo cobra entrada: ponle una tarifa mayor a $ 0." };
  }

  const edadMin = normalizarEdad(e.edad_min);
  const edadMax = normalizarEdad(e.edad_max);
  if (edadMin === "error" || edadMax === "error") return { ok: false, error: "Las edades deben ser números entre 0 y 120." };
  if (edadMin !== null && edadMax !== null && edadMin > edadMax) return { ok: false, error: "La edad mínima no puede ser mayor que la máxima." };

  const codigo = await codigoUnico(slugify(nombre));
  const ultimo = await prisma.tipoVisitante.findFirst({ orderBy: { orden: "desc" }, select: { orden: true } });
  const orden = (ultimo?.orden ?? 0) + 1;

  const tipo = await prisma.$transaction(async (tx) => {
    const t = await tx.tipoVisitante.create({
      data: { codigo, nombre, requiere_pago: requierePago, edad_min: edadMin, edad_max: edadMax, orden, creado_por: s.id },
    });
    await tx.tarifa.create({
      data: { tipo_visitante_id: t.id, valor: tarifa.valor, vigente_desde: new Date(), motivo_cambio: "Tarifa inicial", creado_por: s.id },
    });
    return t;
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "tipo_visitante", entidad_id: tipo.id, accion: "crear",
    datos_despues: { codigo, nombre, requiere_pago: requierePago, valor: tarifa.valor, edad_min: edadMin, edad_max: edadMax },
  });
  revalidatePath("/admin/tarifas");
  return { ok: true };
}

interface CambiosTipo {
  nombre?: string;
  edad_min?: number | string | null;
  edad_max?: number | string | null;
  orden?: number;
  /** Emoji ("🤠") o ruta de imagen ("/logos/campbell.png"); vacío = sin icono. */
  icono?: string | null;
  requiere_carnet?: boolean;
  /** El bono/QR se verifica en la aplicación de bonos antes de vender. */
  requiere_escaneo?: boolean;
}

export async function editarTipo(id: string, cambios: CambiosTipo): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const tipo = await prisma.tipoVisitante.findUnique({
    where: { id },
    include: { tarifas: { where: { vigente_hasta: null }, orderBy: { vigente_desde: "desc" }, take: 1 } },
  });
  if (!tipo) return { ok: false, error: "Tipo no encontrado." };

  const data: Record<string, unknown> = { actualizado_por: s.id };

  if (cambios.nombre !== undefined) {
    if (!cambios.nombre.trim()) return { ok: false, error: "El nombre no puede quedar vacío." };
    data.nombre = cambios.nombre.trim();
  }

  // `requiere_pago` NO se edita aquí: se deriva de la tarifa (ver cambiarTarifa).

  if (cambios.edad_min !== undefined) {
    const v = normalizarEdad(cambios.edad_min);
    if (v === "error") return { ok: false, error: "La edad mínima debe ser un número entre 0 y 120." };
    data.edad_min = v;
  }
  if (cambios.edad_max !== undefined) {
    const v = normalizarEdad(cambios.edad_max);
    if (v === "error") return { ok: false, error: "La edad máxima debe ser un número entre 0 y 120." };
    data.edad_max = v;
  }
  const nuevaMin = data.edad_min !== undefined ? (data.edad_min as number | null) : tipo.edad_min;
  const nuevaMax = data.edad_max !== undefined ? (data.edad_max as number | null) : tipo.edad_max;
  if (nuevaMin !== null && nuevaMax !== null && nuevaMin > nuevaMax) {
    return { ok: false, error: "La edad mínima no puede ser mayor que la máxima." };
  }

  if (cambios.orden !== undefined) {
    if (!Number.isInteger(cambios.orden) || cambios.orden < 0) return { ok: false, error: "El orden debe ser un entero." };
    data.orden = cambios.orden;
  }

  if (cambios.icono !== undefined) {
    const icono = cambios.icono?.trim() ?? "";
    if (icono.length > 80) return { ok: false, error: "El icono debe ser un emoji o una ruta corta (máx. 80 caracteres)." };
    // Solo se admite un emoji o una ruta interna: nada de URLs externas ni HTML.
    if (icono && icono.startsWith("/") === false && /[<>"'\\]/.test(icono)) {
      return { ok: false, error: "El icono debe ser un emoji o una ruta que empiece por / (por ejemplo /logos/campbell.png)." };
    }
    data.icono = icono || null;
  }

  if (cambios.requiere_carnet !== undefined) data.requiere_carnet = !!cambios.requiere_carnet;
  if (cambios.requiere_escaneo !== undefined) data.requiere_escaneo = !!cambios.requiere_escaneo;

  await prisma.tipoVisitante.update({ where: { id }, data });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "tipo_visitante", entidad_id: id, accion: "editar",
    datos_antes: {
      nombre: tipo.nombre, requiere_pago: tipo.requiere_pago, edad_min: tipo.edad_min,
      edad_max: tipo.edad_max, orden: tipo.orden, icono: tipo.icono, requiere_carnet: tipo.requiere_carnet,
      requiere_escaneo: tipo.requiere_escaneo,
    },
    datos_despues: JSON.parse(JSON.stringify(cambios)),
  });
  revalidatePath("/admin/tarifas");
  revalidatePath("/taquilla");
  return { ok: true };
}

export async function cambiarEstadoTipo(id: string, activo: boolean): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };
  const tipo = await prisma.tipoVisitante.findUnique({ where: { id } });
  if (!tipo) return { ok: false, error: "Tipo no encontrado." };
  await prisma.tipoVisitante.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "tipo_visitante", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath("/admin/tarifas");
  return { ok: true };
}

/**
 * Cambia la tarifa vigente de un tipo. Nunca sobrescribe: cierra la tarifa abierta
 * (vigente_hasta = ahora) y crea una nueva fila con vigente_desde = ahora.
 */
export async function cambiarTarifa(tipoId: string, nuevoValor: string | number, motivo: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const tipo = await prisma.tipoVisitante.findUnique({ where: { id: tipoId } });
  if (!tipo) return { ok: false, error: "Tipo no encontrado." };

  const tarifa = validarTarifa(nuevoValor);
  if (!tarifa.ok) return { ok: false, error: tarifa.error };
  const requierePago = cobra(tarifa.valor);

  const motivoLimpio = motivo?.trim();
  if (!motivoLimpio) return { ok: false, error: "Indica el motivo del cambio de tarifa (queda en la auditoría)." };

  const vigente = await prisma.tarifa.findFirst({ where: { tipo_visitante_id: tipoId, vigente_hasta: null }, orderBy: { vigente_desde: "desc" } });
  if (vigente && vigente.valor === tarifa.valor) return { ok: false, error: "La tarifa no cambió respecto a la vigente." };

  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    if (vigente) {
      await tx.tarifa.update({ where: { id: vigente.id }, data: { vigente_hasta: ahora, actualizado_por: s.id } });
    }
    await tx.tarifa.create({
      data: { tipo_visitante_id: tipoId, valor: tarifa.valor, vigente_desde: ahora, motivo_cambio: motivoLimpio, creado_por: s.id },
    });
    // El flag se deriva del valor y viaja con él: no puede quedar desfasado.
    if (tipo.requiere_pago !== requierePago) {
      await tx.tipoVisitante.update({ where: { id: tipoId }, data: { requiere_pago: requierePago, actualizado_por: s.id } });
    }
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "tarifa", entidad_id: tipoId, accion: "cambiar_tarifa",
    datos_antes: { valor: vigente?.valor ?? null, requiere_pago: tipo.requiere_pago },
    datos_despues: { valor: tarifa.valor, requiere_pago: requierePago, motivo: motivoLimpio },
  });
  revalidatePath("/admin/tarifas");
  revalidatePath("/taquilla");
  return { ok: true };
}

// ============================================================ MOTIVOS DE CORTESÍA
// Los que salen en el selector "Motivo…" de taquilla al registrar una atención
// o invitación. Nada se borra: se desactiva, y las ventas viejas conservan el suyo.

export async function crearMotivo(nombre: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador puede gestionar los motivos." };

  const limpio = nombre?.trim();
  if (!limpio) return { ok: false, error: "El nombre del motivo es obligatorio." };

  const repetido = await prisma.motivoCortesia.findFirst({ where: { nombre: { equals: limpio, mode: "insensitive" } } });
  if (repetido) {
    return {
      ok: false,
      error: repetido.activo ? `Ya existe el motivo "${repetido.nombre}".` : `"${repetido.nombre}" ya existe pero está inactivo: actívalo en vez de crearlo de nuevo.`,
    };
  }

  const m = await prisma.motivoCortesia.create({ data: { nombre: limpio, creado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "motivo_cortesia", entidad_id: m.id, accion: "crear", datos_despues: { nombre: limpio } });
  revalidatePath("/admin/tarifas");
  revalidatePath("/taquilla");
  return { ok: true };
}

export async function editarMotivo(id: string, nombre: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const limpio = nombre?.trim();
  if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío." };

  const antes = await prisma.motivoCortesia.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Motivo no encontrado." };
  if (antes.nombre === limpio) return { ok: true };

  const repetido = await prisma.motivoCortesia.findFirst({
    where: { nombre: { equals: limpio, mode: "insensitive" }, id: { not: id } },
  });
  if (repetido) return { ok: false, error: `Ya existe otro motivo llamado "${repetido.nombre}".` };

  await prisma.motivoCortesia.update({ where: { id }, data: { nombre: limpio, actualizado_por: s.id } });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "motivo_cortesia", entidad_id: id, accion: "editar",
    datos_antes: { nombre: antes.nombre }, datos_despues: { nombre: limpio },
  });
  revalidatePath("/admin/tarifas");
  revalidatePath("/taquilla");
  return { ok: true };
}

export async function cambiarEstadoMotivo(id: string, activo: boolean): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const motivo = await prisma.motivoCortesia.findUnique({ where: { id } });
  if (!motivo) return { ok: false, error: "Motivo no encontrado." };

  // Desactivar el último motivo activo dejaría la taquilla sin poder registrar cortesías.
  if (!activo) {
    const activos = await prisma.motivoCortesia.count({ where: { activo: true } });
    if (activos <= 1) return { ok: false, error: "Debe quedar al menos un motivo activo: taquilla lo necesita para registrar cortesías." };
  }

  await prisma.motivoCortesia.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "motivo_cortesia", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath("/admin/tarifas");
  revalidatePath("/taquilla");
  return { ok: true };
}

// ====================================================== AUTORIZADORES DE CORTESÍA
// Quiénes pueden autorizar una cortesía o un descuento. Es un catálogo aparte de los
// usuarios de la app: el gerente o el dueño autorizan sin tener que entrar al sistema.
// Nada se borra: se desactiva, y las ventas viejas conservan a quien firmó.

export async function crearAutorizador(nombre: string, cargo: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador puede gestionar los autorizadores." };

  const limpio = nombre?.trim();
  if (!limpio) return { ok: false, error: "El nombre del autorizador es obligatorio." };

  const repetido = await prisma.autorizadorCortesia.findFirst({ where: { nombre: { equals: limpio, mode: "insensitive" } } });
  if (repetido) {
    return {
      ok: false,
      error: repetido.activo
        ? `"${repetido.nombre}" ya está en el catálogo.`
        : `"${repetido.nombre}" ya existe pero está inactivo: actívalo en vez de crearlo de nuevo.`,
    };
  }

  const a = await prisma.autorizadorCortesia.create({
    data: { nombre: limpio, cargo: cargo?.trim() || null, creado_por: s.id },
  });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "autorizador_cortesia", entidad_id: a.id, accion: "crear",
    datos_despues: { nombre: limpio, cargo: cargo?.trim() || null },
  });
  revalidatePath("/admin/tarifas");
  revalidatePath("/taquilla");
  return { ok: true };
}

export async function editarAutorizador(id: string, nombre: string, cargo: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const limpio = nombre?.trim();
  if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío." };

  const antes = await prisma.autorizadorCortesia.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Autorizador no encontrado." };

  const repetido = await prisma.autorizadorCortesia.findFirst({
    where: { nombre: { equals: limpio, mode: "insensitive" }, id: { not: id } },
  });
  if (repetido) return { ok: false, error: `Ya existe otro autorizador llamado "${repetido.nombre}".` };

  await prisma.autorizadorCortesia.update({
    where: { id },
    data: { nombre: limpio, cargo: cargo?.trim() || null, actualizado_por: s.id },
  });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "autorizador_cortesia", entidad_id: id, accion: "editar",
    datos_antes: { nombre: antes.nombre, cargo: antes.cargo },
    datos_despues: { nombre: limpio, cargo: cargo?.trim() || null },
  });
  revalidatePath("/admin/tarifas");
  revalidatePath("/taquilla");
  return { ok: true };
}

export async function cambiarEstadoAutorizador(id: string, activo: boolean): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador." };

  const a = await prisma.autorizadorCortesia.findUnique({ where: { id } });
  if (!a) return { ok: false, error: "Autorizador no encontrado." };

  // Sin autorizadores activos, taquilla no puede registrar cortesías ni descuentos.
  if (!activo) {
    const activos = await prisma.autorizadorCortesia.count({ where: { activo: true } });
    if (activos <= 1) return { ok: false, error: "Debe quedar al menos un autorizador activo: taquilla lo necesita para cortesías y descuentos." };
  }

  await prisma.autorizadorCortesia.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "autorizador_cortesia", entidad_id: id, accion: activo ? "activar" : "desactivar",
  });
  revalidatePath("/admin/tarifas");
  revalidatePath("/taquilla");
  return { ok: true };
}
