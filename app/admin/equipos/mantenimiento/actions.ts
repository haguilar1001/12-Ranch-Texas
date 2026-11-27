"use server";

import { revalidatePath } from "next/cache";
import { prisma, type Tx } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { programarPreventivos, registrarLectura, subtotalRepuesto, horasFuera } from "@/lib/equipos/mantenimiento";
import { fechaBogota } from "@/lib/tiempo";

export interface Resultado { ok: boolean; error?: string; aviso?: string; id?: string }

const SIN_PERMISO = "Necesitas rol de supervisor.";
const RUTAS = ["/admin/equipos", "/admin/equipos/mantenimiento", "/admin/equipos/planes", "/reportar-falla", "/"];
const refrescar = (...extra: string[]) => [...RUTAS, ...extra].forEach((r) => revalidatePath(r));

async function supervisor() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "supervisor") ? s : null;
}
const texto = (v: FormDataEntryValue | string | null | undefined) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t || null;
};
function entero(v: FormDataEntryValue | string | number | null | undefined): number | null | "error" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isInteger(n) ? n : "error";
}
/** "YYYY-MM-DD" → mediodía de Bogotá. */
function fecha(v: FormDataEntryValue | string | null | undefined): Date | null | "error" {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "error";
  const d = new Date(`${t}T12:00:00-05:00`);
  return Number.isNaN(d.getTime()) ? "error" : d;
}

// ------------------------------------------------------------------ fotos

const MIME_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FOTO = 1.5 * 1024 * 1024; // ya vienen comprimidas desde el celular
const MAX_FOTOS = 3;

async function leerFotos(form: FormData): Promise<{ ok: true; fotos: { mime: string; datos: Uint8Array<ArrayBuffer> }[] } | { ok: false; error: string }> {
  const archivos = form.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  if (archivos.length > MAX_FOTOS) return { ok: false, error: `Máximo ${MAX_FOTOS} fotos.` };
  const fotos = [];
  for (const f of archivos) {
    if (!MIME_FOTO.has(f.type)) return { ok: false, error: "Las fotos deben ser JPG, PNG o WEBP." };
    if (f.size > MAX_FOTO) return { ok: false, error: "Una foto pesa demasiado (máximo 1,5 MB)." };
    fotos.push({ mime: f.type, datos: new Uint8Array(await f.arrayBuffer()) });
  }
  return { ok: true, fotos };
}

// ------------------------------------------------------------------ fallas

/** Cualquier usuario reporta una falla. Si el equipo quedó detenido, pasa a "fuera de servicio". */
export async function reportarFalla(form: FormData): Promise<Resultado> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada. Vuelve a ingresar." };
  const equipo = await prisma.equipo.findFirst({ where: { id: String(form.get("equipo_id") ?? ""), activo: true } });
  if (!equipo) return { ok: false, error: "Escoge el equipo." };
  const descripcion = texto(form.get("descripcion"));
  if (!descripcion) return { ok: false, error: "Cuenta qué le pasa al equipo." };
  const prioridad = String(form.get("prioridad") ?? "media");
  if (!["baja", "media", "alta", "critica"].includes(prioridad)) return { ok: false, error: "Escoge la prioridad." };
  const detenido = form.get("detenido") === "si";
  const f = await leerFotos(form);
  if (!f.ok) return f;

  const falla = await prisma.$transaction(async (tx) => {
    const r = await tx.reporteFalla.create({
      data: { equipo_id: equipo.id, descripcion, prioridad: prioridad as "media", equipo_detenido: detenido, creado_por: s.id,
        fotos: { create: f.fotos.map((x) => ({ tipo: "falla" as const, mime: x.mime, tamano: x.datos.length, contenido: x.datos, creado_por: s.id })) } },
    });
    if (detenido && equipo.estado === "operativo") await tx.equipo.update({ where: { id: equipo.id }, data: { estado: "fuera_servicio", actualizado_por: s.id } });
    return r;
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "reporte_falla", entidad_id: falla.id, accion: "crear", datos_despues: { equipo: equipo.nombre, prioridad, detenido } });
  refrescar();
  return { ok: true, id: falla.id };
}

/**
 * Quien reportó la falla (o un supervisor) la corrige y le agrega fotos mientras no esté cerrada.
 * La descripción y la prioridad solo cambian si sigue "abierta" (aún no tiene orden); fotos se
 * pueden agregar también "en atención". Las fotos existentes no se quitan (nada se borra).
 */
export async function editarFalla(form: FormData): Promise<Resultado> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada. Vuelve a ingresar." };
  const falla = await prisma.reporteFalla.findUnique({
    where: { id: String(form.get("falla_id") ?? "") },
    include: { equipo: true, _count: { select: { fotos: true } } },
  });
  if (!falla) return { ok: false, error: "El reporte no existe." };
  if (falla.creado_por !== s.id && !tieneRol(s.rol, "supervisor")) return { ok: false, error: "Solo quien reportó la falla o un supervisor puede editarla." };
  if (falla.estado === "resuelta" || falla.estado === "descartada") return { ok: false, error: "El reporte ya está cerrado; no se puede editar." };

  const f = await leerFotos(form);
  if (!f.ok) return f;
  if (falla._count.fotos + f.fotos.length > MAX_FOTOS) return { ok: false, error: `El reporte ya tiene ${falla._count.fotos} foto(s); el máximo es ${MAX_FOTOS}.` };

  const data: { descripcion?: string; prioridad?: "media"; equipo_detenido?: boolean } = {};
  if (falla.estado === "abierta") {
    const descripcion = texto(form.get("descripcion"));
    if (!descripcion) return { ok: false, error: "Cuenta qué le pasa al equipo." };
    const prioridad = String(form.get("prioridad") ?? falla.prioridad);
    if (!["baja", "media", "alta", "critica"].includes(prioridad)) return { ok: false, error: "Escoge la prioridad." };
    if (descripcion !== falla.descripcion) data.descripcion = descripcion;
    if (prioridad !== falla.prioridad) data.prioridad = prioridad as "media";
    // Solo se puede marcar como detenido: devolverlo a operativo lo decide mantenimiento.
    if (form.get("detenido") === "si" && !falla.equipo_detenido) data.equipo_detenido = true;
  }
  if (!Object.keys(data).length && !f.fotos.length) return { ok: false, error: "No hay cambios para guardar." };

  await prisma.$transaction(async (tx) => {
    await tx.reporteFalla.update({
      where: { id: falla.id },
      data: { ...data, actualizado_por: s.id,
        fotos: { create: f.fotos.map((x) => ({ tipo: "falla" as const, mime: x.mime, tamano: x.datos.length, contenido: x.datos, creado_por: s.id })) } },
    });
    if (data.equipo_detenido && falla.equipo.estado === "operativo") await tx.equipo.update({ where: { id: falla.equipo_id }, data: { estado: "fuera_servicio", actualizado_por: s.id } });
  });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "reporte_falla", entidad_id: falla.id, accion: "editar",
    datos_antes: { descripcion: falla.descripcion, prioridad: falla.prioridad, detenido: falla.equipo_detenido, fotos: falla._count.fotos },
    datos_despues: { ...data, fotos_agregadas: f.fotos.length },
  });
  refrescar();
  return { ok: true, id: falla.id };
}

/** La falla se vuelve orden correctiva (queda "en atención"). */
export async function crearOrdenDesdeFalla(fallaId: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const f = await prisma.reporteFalla.findUnique({ where: { id: fallaId } });
  if (!f || f.estado !== "abierta") return { ok: false, error: "La falla ya no está abierta." };
  const orden = await prisma.$transaction(async (tx) => {
    const o = await tx.mantenimientoEquipo.create({
      data: { equipo_id: f.equipo_id, tipo: "correctivo", descripcion: f.descripcion, fecha_programada: new Date(), estado: "programado", creado_por: s.id },
    });
    await tx.reporteFalla.update({ where: { id: f.id }, data: { estado: "en_atencion", mantenimiento_id: o.id, actualizado_por: s.id } });
    await tx.fotoMantenimiento.updateMany({ where: { falla_id: f.id }, data: { mantenimiento_id: o.id } });
    return o;
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "mantenimiento_equipo", entidad_id: orden.id, accion: "crear_desde_falla", datos_despues: { falla: f.id } });
  refrescar();
  return { ok: true, id: orden.id };
}

export async function descartarFalla(fallaId: string, motivo: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  if (!motivo?.trim()) return { ok: false, error: "Indica por qué se descarta." };
  const f = await prisma.reporteFalla.findUnique({ where: { id: fallaId }, include: { equipo: true } });
  if (!f || f.estado !== "abierta") return { ok: false, error: "La falla ya no está abierta." };
  await prisma.$transaction(async (tx) => {
    await tx.reporteFalla.update({ where: { id: f.id }, data: { estado: "descartada", motivo_cierre: motivo.trim(), actualizado_por: s.id } });
    // Si la había detenido y no hay otra falla ni orden abierta, el equipo vuelve a operar.
    if (f.equipo_detenido && f.equipo.estado === "fuera_servicio") {
      const otras = await tx.reporteFalla.count({ where: { equipo_id: f.equipo_id, estado: { in: ["abierta", "en_atencion"] }, equipo_detenido: true } });
      if (!otras) await tx.equipo.update({ where: { id: f.equipo_id }, data: { estado: "operativo", actualizado_por: s.id } });
    }
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "reporte_falla", entidad_id: f.id, accion: "descartar", datos_despues: { motivo: motivo.trim() } });
  refrescar();
  return { ok: true };
}

// ------------------------------------------------------------------ órdenes

export async function crearOrden(e: { equipo_id: string; tipo: string; descripcion: string; fecha_programada?: string | null }): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const eq = await prisma.equipo.findFirst({ where: { id: e.equipo_id ?? "", activo: true } });
  if (!eq) return { ok: false, error: "Escoge el equipo." };
  if (!["preventivo", "correctivo"].includes(e.tipo)) return { ok: false, error: "Escoge preventivo o correctivo." };
  const descripcion = texto(e.descripcion);
  if (!descripcion) return { ok: false, error: "Describe qué hay que hacer." };
  const fp = fecha(e.fecha_programada);
  if (fp === "error") return { ok: false, error: "Revisa la fecha." };
  const o = await prisma.mantenimientoEquipo.create({
    data: { equipo_id: eq.id, tipo: e.tipo as "preventivo", descripcion, fecha_programada: fp ?? new Date(), estado: "programado", creado_por: s.id },
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "mantenimiento_equipo", entidad_id: o.id, accion: "crear", datos_despues: { equipo: eq.nombre, tipo: e.tipo, descripcion } });
  refrescar();
  return { ok: true, id: o.id };
}

/** Empieza el trabajo: el equipo queda "en mantenimiento". */
export async function iniciarOrden(id: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const o = await prisma.mantenimientoEquipo.findUnique({ where: { id }, include: { equipo: true } });
  if (!o || o.estado !== "programado") return { ok: false, error: "Solo se inicia una orden programada." };
  await prisma.$transaction(async (tx) => {
    await tx.mantenimientoEquipo.update({ where: { id }, data: { estado: "en_proceso", fecha_inicio: new Date(), actualizado_por: s.id } });
    if (o.equipo.estado === "operativo" || o.equipo.estado === "fuera_servicio") await tx.equipo.update({ where: { id: o.equipo_id }, data: { estado: "en_mantenimiento", actualizado_por: s.id } });
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "mantenimiento_equipo", entidad_id: id, accion: "iniciar" });
  refrescar(`/admin/equipos/mantenimiento/${id}`);
  return { ok: true };
}

/** Rubro de gasto de las órdenes de mantenimiento: MANTENIMIENTO › EQUIPOS (se crea la primera vez). */
async function rubroMantenimientoEquipos(tx: Tx, usuarioId: string): Promise<string> {
  const grupo = await tx.rubroGasto.findFirst({ where: { nombre: { equals: "MANTENIMIENTO", mode: "insensitive" }, nivel: "grupo" } });
  const existente = await tx.rubroGasto.findFirst({ where: { nombre: { equals: "EQUIPOS", mode: "insensitive" }, ...(grupo ? { padre_id: grupo.id } : {}) } });
  if (existente) return existente.id;
  return (await tx.rubroGasto.create({
    data: grupo ? { nombre: "EQUIPOS", nivel: "rubro", padre_id: grupo.id, orden: 99, creado_por: usuarioId } : { nombre: "MANTENIMIENTO DE EQUIPOS", nivel: "grupo", orden: 99, creado_por: usuarioId },
  })).id;
}

export interface RepuestoEntrada { descripcion: string; cantidad: string; unidad?: string; precio_unitario: string }

/**
 * Cierra la orden: quién la hizo, qué se hizo, repuestos y mano de obra. Si tiene costo nace el
 * gasto pendiente de pago. El equipo vuelve a operar, la falla queda resuelta, se guarda la lectura
 * del horómetro y se programa el siguiente preventivo.
 */
export async function cerrarOrden(id: string, form: FormData): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const o = await prisma.mantenimientoEquipo.findUnique({ where: { id }, include: { equipo: true, falla: true } });
  if (!o || !["programado", "en_proceso"].includes(o.estado)) return { ok: false, error: "Esta orden ya está cerrada." };

  const fr = fecha(form.get("fecha_realizada"));
  if (fr === "error") return { ok: false, error: "Revisa la fecha en que se hizo." };
  // Cerrada hoy: cuenta hasta este momento (para el tiempo parado); otro día: el mediodía de ese día.
  const fechaRealizada = fr && fechaBogota(fr) !== fechaBogota() ? fr : new Date();
  if (fechaRealizada.getTime() > Date.now() + 86_400_000) return { ok: false, error: "La fecha no puede ser futura." };
  const ejecutor = String(form.get("ejecutor") ?? "");
  if (!["interno", "externo"].includes(ejecutor)) return { ok: false, error: "Indica si lo hizo alguien del parque o un proveedor." };
  const empleadoId = texto(form.get("empleado_id"));
  const proveedorNombre = texto(form.get("proveedor_nombre"));
  if (ejecutor === "interno" && !empleadoId) return { ok: false, error: "Escoge quién del parque lo hizo." };
  if (ejecutor === "externo" && !proveedorNombre) return { ok: false, error: "Escribe el proveedor o técnico que lo hizo." };
  const trabajos = texto(form.get("trabajos_realizados"));
  if (!trabajos) return { ok: false, error: "Describe qué se le hizo al equipo." };
  const manoObra = entero(form.get("mano_obra"));
  if (manoObra === "error" || (manoObra ?? 0) < 0) return { ok: false, error: "La mano de obra debe ser un valor en pesos." };
  const horometro = entero(form.get("horometro"));
  if (horometro === "error" || (horometro != null && horometro < 0)) return { ok: false, error: "La lectura del horómetro debe ser un número de horas." };
  if (horometro != null && o.equipo.horometro != null && horometro < o.equipo.horometro) return { ok: false, error: `El horómetro no puede bajar: la última lectura es ${o.equipo.horometro} h.` };

  let repuestos: { descripcion: string; cantidad: number; unidad: string | null; precio_unitario: number; subtotal: number }[] = [];
  try {
    const crudos = JSON.parse(String(form.get("repuestos") ?? "[]")) as RepuestoEntrada[];
    for (const r of crudos) {
      const d = r.descripcion?.trim();
      if (!d) continue;
      const cant = Number(String(r.cantidad ?? "").replace(",", "."));
      const precio = entero(r.precio_unitario);
      if (!Number.isFinite(cant) || cant <= 0) return { ok: false, error: `Revisa la cantidad de «${d}».` };
      if (precio === null || precio === "error" || precio < 0) return { ok: false, error: `Revisa el precio de «${d}».` };
      repuestos.push({ descripcion: d, cantidad: cant, unidad: r.unidad?.trim() || null, precio_unitario: precio, subtotal: subtotalRepuesto(cant, precio) });
    }
  } catch { repuestos = []; }
  const repuestosTotal = repuestos.reduce((t, r) => t + r.subtotal, 0);
  const costo = repuestosTotal + (manoObra ?? 0);
  const factura = texto(form.get("numero_factura"));
  const f = await leerFotos(form);
  if (!f.ok) return f;

  // Desde cuándo estuvo parado: falla con equipo detenido, o el inicio de la orden.
  const desde = o.falla?.equipo_detenido ? o.falla.creado_en : o.fecha_inicio;
  const horas = horasFuera(desde, fechaRealizada);

  await prisma.$transaction(async (tx) => {
    let proveedorId: string | null = null;
    if (ejecutor === "externo") {
      const p = await tx.proveedor.findFirst({ where: { nombre: { equals: proveedorNombre!, mode: "insensitive" } } });
      proveedorId = p ? p.id : (await tx.proveedor.create({ data: { nombre: proveedorNombre!, creado_por: s.id } })).id;
    }
    let gastoId: string | null = null;
    if (costo > 0) {
      const g = await tx.gasto.create({
        data: {
          rubro_gasto_id: await rubroMantenimientoEquipos(tx, s.id), proveedor_id: proveedorId,
          descripcion: `Mantenimiento ${o.tipo} · ${o.equipo.nombre}${factura ? ` · factura ${factura}` : ""}`,
          fecha_gasto: fechaRealizada, base_gravable: costo, total: costo, estado: "pendiente", creado_por: s.id,
        },
      });
      gastoId = g.id;
    }
    await tx.mantenimientoEquipo.update({
      where: { id },
      data: {
        estado: "realizado", fecha_realizada: fechaRealizada, fecha_inicio: o.fecha_inicio ?? fechaRealizada,
        ejecutor: ejecutor as "interno", empleado_id: ejecutor === "interno" ? empleadoId : null, proveedor_id: proveedorId,
        trabajos_realizados: trabajos, observaciones: texto(form.get("observaciones")),
        repuestos_total: repuestosTotal, mano_obra: manoObra ?? 0, costo, numero_factura: factura,
        horometro: horometro ?? o.equipo.horometro, horas_fuera_servicio: horas, gasto_id: gastoId, actualizado_por: s.id,
        repuestos: { create: repuestos.map((r) => ({ ...r, creado_por: s.id })) },
        fotos: { create: f.fotos.map((x, i) => ({ tipo: (i === 0 && factura ? "factura" : "despues") as "despues", mime: x.mime, tamano: x.datos.length, contenido: x.datos, creado_por: s.id })) },
      },
    });
    if (horometro != null && horometro !== o.equipo.horometro) await registrarLectura(tx, o.equipo_id, horometro, s.id, "mantenimiento");
    if (o.falla) await tx.reporteFalla.update({ where: { id: o.falla.id }, data: { estado: "resuelta", actualizado_por: s.id } });
    // El equipo vuelve a operar si no le queda otra orden en proceso.
    const otras = await tx.mantenimientoEquipo.count({ where: { equipo_id: o.equipo_id, estado: "en_proceso", id: { not: id } } });
    if (!otras && o.equipo.estado !== "dado_de_baja") await tx.equipo.update({ where: { id: o.equipo_id }, data: { estado: "operativo", actualizado_por: s.id } });
    if (o.plan_id) await programarPreventivos(tx, { planId: o.plan_id, equipoId: o.equipo_id }, s.id);
  }, { timeout: 60_000, maxWait: 15_000 });

  await registrarAuditoria({ usuario_id: s.id, entidad: "mantenimiento_equipo", entidad_id: id, accion: "cerrar", datos_despues: { costo, repuestos: repuestos.length, ejecutor, horas_fuera: horas } });
  refrescar(`/admin/equipos/mantenimiento/${id}`, `/admin/equipos/${o.equipo_id}`, "/admin/gastos");
  return { ok: true, aviso: costo > 0 ? "Se creó el gasto pendiente de pago." : undefined };
}

export async function cancelarOrden(id: string, motivo: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  if (!motivo?.trim()) return { ok: false, error: "Indica por qué se cancela." };
  const o = await prisma.mantenimientoEquipo.findUnique({ where: { id }, include: { equipo: true, falla: true } });
  if (!o || !["programado", "en_proceso"].includes(o.estado)) return { ok: false, error: "Esta orden ya está cerrada." };
  await prisma.$transaction(async (tx) => {
    await tx.mantenimientoEquipo.update({ where: { id }, data: { estado: "cancelado", motivo_cancelacion: motivo.trim(), actualizado_por: s.id } });
    if (o.falla) await tx.reporteFalla.update({ where: { id: o.falla.id }, data: { estado: "abierta", mantenimiento_id: null, actualizado_por: s.id } });
    if (o.estado === "en_proceso" && o.equipo.estado === "en_mantenimiento") {
      const otras = await tx.mantenimientoEquipo.count({ where: { equipo_id: o.equipo_id, estado: "en_proceso", id: { not: id } } });
      if (!otras) await tx.equipo.update({ where: { id: o.equipo_id }, data: { estado: o.falla?.equipo_detenido ? "fuera_servicio" : "operativo", actualizado_por: s.id } });
    }
  });
  // Un preventivo cancelado no deja al equipo sin plan: se programa el siguiente desde hoy.
  if (o.plan_id) await programarPreventivos(prisma, { planId: o.plan_id, equipoId: o.equipo_id }, s.id);
  await registrarAuditoria({ usuario_id: s.id, entidad: "mantenimiento_equipo", entidad_id: id, accion: "cancelar", datos_despues: { motivo: motivo.trim() } });
  refrescar(`/admin/equipos/mantenimiento/${id}`);
  return { ok: true };
}

export async function reprogramarOrden(id: string, nuevaFecha: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const f = fecha(nuevaFecha);
  if (!f || f === "error") return { ok: false, error: "Escoge la nueva fecha." };
  const o = await prisma.mantenimientoEquipo.findUnique({ where: { id } });
  if (!o || o.estado !== "programado") return { ok: false, error: "Solo se reprograma una orden programada." };
  await prisma.mantenimientoEquipo.update({ where: { id }, data: { fecha_programada: f, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "mantenimiento_equipo", entidad_id: id, accion: "reprogramar", datos_antes: { fecha: o.fecha_programada?.toISOString() ?? null }, datos_despues: { fecha: f.toISOString() } });
  refrescar(`/admin/equipos/mantenimiento/${id}`);
  return { ok: true };
}

// ------------------------------------------------------------------ horómetro

export async function configurarHorometro(equipoId: string, usa: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  await prisma.equipo.update({ where: { id: equipoId }, data: { usa_horometro: usa, actualizado_por: s.id } });
  if (usa) await programarPreventivos(prisma, { equipoId }, s.id);
  refrescar(`/admin/equipos/${equipoId}`);
  return { ok: true };
}

export async function registrarLecturaHorometro(equipoId: string, horasTexto: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const horas = entero(horasTexto);
  if (horas === null || horas === "error" || horas < 0) return { ok: false, error: "Escribe las horas del horómetro." };
  const eq = await prisma.equipo.findUnique({ where: { id: equipoId } });
  if (!eq) return { ok: false, error: "Equipo no encontrado." };
  if (eq.horometro != null && horas < eq.horometro) return { ok: false, error: `No puede ser menor a la última lectura (${eq.horometro} h).` };
  await prisma.$transaction(async (tx) => {
    if (!eq.usa_horometro) await tx.equipo.update({ where: { id: equipoId }, data: { usa_horometro: true } });
    await registrarLectura(tx, equipoId, horas, s.id);
  });
  await programarPreventivos(prisma, { equipoId }, s.id);
  refrescar(`/admin/equipos/${equipoId}`);
  return { ok: true };
}

// ------------------------------------------------------------------ planes preventivos

export interface EntradaPlan {
  nombre: string;
  instrucciones?: string;
  alcance: "grupo" | "equipo";
  categoria_id?: string;
  equipo_id?: string;
  frecuencia_dias?: string;
  frecuencia_horas?: string;
  aviso_dias?: string;
  costo_estimado?: string;
}

function validarPlan(e: EntradaPlan) {
  const nombre = texto(e.nombre);
  if (!nombre) return { error: "Escribe qué se hace (p. ej. «Cambio de aceite»)." } as const;
  if (e.alcance === "grupo" && !e.categoria_id) return { error: "Escoge el grupo de equipos." } as const;
  if (e.alcance === "equipo" && !e.equipo_id) return { error: "Escoge el equipo." } as const;
  const dias = entero(e.frecuencia_dias), horas = entero(e.frecuencia_horas), aviso = entero(e.aviso_dias), costo = entero(e.costo_estimado);
  if (dias === "error" || horas === "error" || aviso === "error" || costo === "error") return { error: "Revisa los números." } as const;
  if (!dias && !horas) return { error: "Indica cada cuántos días o cada cuántas horas de uso." } as const;
  if ((dias ?? 1) <= 0 || (horas ?? 1) <= 0) return { error: "La frecuencia debe ser mayor que cero." } as const;
  return {
    data: {
      nombre, instrucciones: texto(e.instrucciones),
      categoria_id: e.alcance === "grupo" ? e.categoria_id! : null, equipo_id: e.alcance === "equipo" ? e.equipo_id! : null,
      frecuencia_dias: dias, frecuencia_horas: horas, aviso_dias: aviso ?? 7, costo_estimado: costo,
    },
  } as const;
}

export async function crearPlan(e: EntradaPlan): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const v = validarPlan(e);
  if ("error" in v) return { ok: false, error: v.error };
  const plan = await prisma.planMantenimiento.create({ data: { ...v.data, creado_por: s.id } });
  const n = await programarPreventivos(prisma, { planId: plan.id }, s.id);
  await registrarAuditoria({ usuario_id: s.id, entidad: "plan_mantenimiento", entidad_id: plan.id, accion: "crear", datos_despues: { ...v.data } });
  refrescar();
  return { ok: true, id: plan.id, aviso: `Se programaron ${n} mantenimiento(s).` };
}

/** Editar no toca las órdenes ya programadas; las siguientes salen con la nueva frecuencia. */
export async function editarPlan(id: string, e: EntradaPlan): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const v = validarPlan(e);
  if ("error" in v) return { ok: false, error: v.error };
  await prisma.planMantenimiento.update({ where: { id }, data: { ...v.data, actualizado_por: s.id } });
  await programarPreventivos(prisma, { planId: id }, s.id);
  await registrarAuditoria({ usuario_id: s.id, entidad: "plan_mantenimiento", entidad_id: id, accion: "editar", datos_despues: { ...v.data } });
  refrescar();
  return { ok: true };
}

/** Desactivar un plan cancela sus órdenes programadas que no se han empezado. */
export async function cambiarEstadoPlan(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  await prisma.$transaction(async (tx) => {
    await tx.planMantenimiento.update({ where: { id }, data: { activo, actualizado_por: s.id } });
    if (!activo) await tx.mantenimientoEquipo.updateMany({ where: { plan_id: id, estado: "programado" }, data: { estado: "cancelado", motivo_cancelacion: "PLAN DESACTIVADO", actualizado_por: s.id } });
  });
  if (activo) await programarPreventivos(prisma, { planId: id }, s.id);
  await registrarAuditoria({ usuario_id: s.id, entidad: "plan_mantenimiento", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  refrescar();
  return { ok: true };
}
