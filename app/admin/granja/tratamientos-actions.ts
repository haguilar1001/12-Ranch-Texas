"use server";

// Tratamientos (reporte médico): abrir el caso, aplicar medicamentos (salen del inventario de
// insumos), seguimiento con fotos, finalizar y anular. Nada se borra.

import { revalidatePath } from "next/cache";
import { prisma, type Tx } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { fechaBogota } from "@/lib/tiempo";
import { recalcularInsumo, SaldoNegativo } from "@/lib/granja/insumos-bd";
import { validarTratamiento, validarSeguimiento, validarMedicamentos } from "@/lib/granja/tratamientos";

export interface Resultado { ok: boolean; error?: string; id?: string }

const refrescar = (id?: string) => {
  ["/admin/granja/tratamientos", "/admin/granja/insumos", "/admin/animales"].forEach((r) => revalidatePath(r));
  if (id) revalidatePath(`/admin/granja/tratamientos/${id}`);
};
async function operador() { const s = await obtenerSesion(); return s && puedeOperarGranja(s.rol) ? s : null; }
async function supervisor() { const s = await obtenerSesion(); return s && tieneRol(s.rol, "supervisor") ? s : null; }
const SIN_PERMISO = "No tienes permiso para registrar en la granja.";
const diaUTC = (t: string) => new Date(`${t}T00:00:00Z`);
const diaBogota = (t: string) => new Date(`${t}T12:00:00-05:00`);

const MIME_FOTO = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FOTO = 1.5 * 1024 * 1024;
const MAX_FOTOS = 4;
type Foto = { mime: string; tamano: number; contenido: Uint8Array<ArrayBuffer>; creado_por: string };

async function leerFotos(form: FormData, usuario: string): Promise<Foto[] | string> {
  const archivos = form.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  if (archivos.length > MAX_FOTOS) return `Máximo ${MAX_FOTOS} fotos por registro.`;
  const fotos: Foto[] = [];
  for (const f of archivos) {
    if (!MIME_FOTO.has(f.type)) return "Las fotos deben ser JPG, PNG o WEBP.";
    if (f.size > MAX_FOTO) return "Una foto pesa demasiado (máximo 1,5 MB).";
    fotos.push({ mime: f.type, tamano: f.size, contenido: new Uint8Array(await f.arrayBuffer()), creado_por: usuario });
  }
  return fotos;
}

async function leerMedicamentos(form: FormData) {
  let lineas: { insumo_id: string; cantidad: string; dosis?: string }[];
  try { lineas = JSON.parse(String(form.get("medicamentos") || "[]")); } catch { return { ok: false as const, error: "Medicamentos no válidos." }; }
  const ins = await prisma.insumoGranja.findMany({ where: { id: { in: lineas.map((l) => l.insumo_id).filter(Boolean) }, activo: true } });
  return validarMedicamentos(lineas, new Map(ins.map((i) => [i.id, { nombre: i.nombre, existencia: Number(i.existencia), unidad: i.unidad }])));
}

/** Movimientos de salida de los medicamentos aplicados, y recálculo de cada insumo. */
async function aplicarMedicamentos(tx: Tx, tratamientoId: string, fecha: string, diagnostico: string, meds: { insumo_id: string; cantidad: number; dosis: string | null }[], usuario: string) {
  for (const m of meds) {
    await tx.movimientoInsumo.create({
      data: { insumo_id: m.insumo_id, tipo: "tratamiento", cantidad: m.cantidad, fecha: diaBogota(fecha), tratamiento_id: tratamientoId, motivo: `TRATAMIENTO: ${diagnostico}${m.dosis ? ` · ${m.dosis}` : ""}`, creado_por: usuario },
    });
    await recalcularInsumo(tx, m.insumo_id, usuario);
  }
}

export async function registrarTratamiento(form: FormData): Promise<Resultado> {
  const s = await operador();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const v = validarTratamiento({
    fecha: String(form.get("fecha") ?? ""), animal_id: String(form.get("animal_id") ?? ""), sintomas: String(form.get("sintomas") ?? ""),
    diagnostico: String(form.get("diagnostico") ?? ""), indicaciones: String(form.get("indicaciones") ?? ""), veterinario: String(form.get("veterinario") ?? ""),
    empleado_id: String(form.get("empleado_id") ?? ""), proxima_revision: String(form.get("proxima_revision") ?? ""), marcar_enfermo: form.get("marcar_enfermo") === "si",
  }, fechaBogota());
  if (!v.ok) return v;
  const animal = await prisma.animal.findUnique({ where: { id: v.datos.animal_id } });
  if (!animal || !animal.activo) return { ok: false, error: "El animal no existe o está dado de baja." };
  const meds = await leerMedicamentos(form);
  if (!meds.ok) return meds;
  const fotos = await leerFotos(form, s.id);
  if (typeof fotos === "string") return { ok: false, error: fotos };
  const { marcar_enfermo, ...d } = v.datos;

  let id: string;
  try {
    id = await prisma.$transaction(async (tx) => {
      const t = await tx.tratamiento.create({
        data: { ...d, fecha: diaUTC(d.fecha), proxima_revision: d.proxima_revision ? diaUTC(d.proxima_revision) : null, creado_por: s.id, fotos: { create: fotos } },
      });
      await aplicarMedicamentos(tx, t.id, d.fecha, d.diagnostico, meds.datos, s.id);
      if (marcar_enfermo && animal.estado === "activo") await tx.animal.update({ where: { id: animal.id }, data: { estado: "enfermo", actualizado_por: s.id } });
      return t.id;
    });
  } catch (err) {
    if (err instanceof SaldoNegativo) return { ok: false, error: `No se registró: ${err.message}` };
    throw err;
  }
  await registrarAuditoria({ usuario_id: s.id, entidad: "tratamiento", entidad_id: id, accion: "crear",
    datos_despues: { animal: animal.nombre, ...d, medicamentos: meds.datos, fotos: fotos.length, marcar_enfermo } });
  refrescar(id);
  return { ok: true, id };
}

/** Seguimiento: nota de cómo va, y opcionalmente más medicamentos aplicados y fotos. */
export async function agregarSeguimiento(form: FormData): Promise<Resultado> {
  const s = await operador();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const id = String(form.get("tratamiento_id") ?? "");
  const t = await prisma.tratamiento.findUnique({ where: { id } });
  if (!t || t.estado !== "en_curso") return { ok: false, error: "El tratamiento no está en curso." };
  const meds = await leerMedicamentos(form);
  if (!meds.ok) return meds;
  const v = validarSeguimiento({ fecha: String(form.get("fecha") ?? ""), nota: String(form.get("nota") ?? "") }, t.fecha.toISOString().slice(0, 10), fechaBogota(), meds.datos.length > 0);
  if (!v.ok) return v;
  const fotos = await leerFotos(form, s.id);
  if (typeof fotos === "string") return { ok: false, error: fotos };
  const proxima = String(form.get("proxima_revision") ?? "").trim();
  if (proxima && (!/^\d{4}-\d{2}-\d{2}$/.test(proxima) || proxima < v.datos.fecha)) return { ok: false, error: "La próxima revisión no es válida." };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.seguimientoTratamiento.create({ data: { tratamiento_id: id, fecha: diaUTC(v.datos.fecha), nota: v.datos.nota, creado_por: s.id } });
      if (fotos.length) await tx.fotoGranja.createMany({ data: fotos.map((f) => ({ ...f, tratamiento_id: id })) });
      await aplicarMedicamentos(tx, id, v.datos.fecha, t.diagnostico, meds.datos, s.id);
      if (proxima) await tx.tratamiento.update({ where: { id }, data: { proxima_revision: diaUTC(proxima), actualizado_por: s.id } });
    });
  } catch (err) {
    if (err instanceof SaldoNegativo) return { ok: false, error: `No se registró: ${err.message}` };
    throw err;
  }
  await registrarAuditoria({ usuario_id: s.id, entidad: "tratamiento", entidad_id: id, accion: "seguimiento", datos_despues: { ...v.datos, medicamentos: meds.datos, fotos: fotos.length } });
  refrescar(id);
  return { ok: true, id };
}

export async function finalizarTratamiento(id: string, resultado: string, volverActivo: boolean): Promise<Resultado> {
  const s = await operador();
  if (!s) return { ok: false, error: SIN_PERMISO };
  if (!resultado?.trim()) return { ok: false, error: "Cuenta cómo terminó (recuperado, crónico, murió…)." };
  const t = await prisma.tratamiento.findUnique({ where: { id }, include: { animal: true } });
  if (!t || t.estado !== "en_curso") return { ok: false, error: "El tratamiento no está en curso." };
  await prisma.$transaction(async (tx) => {
    await tx.tratamiento.update({ where: { id }, data: { estado: "finalizado", resultado: resultado.trim(), proxima_revision: null, actualizado_por: s.id } });
    const otrosAbiertos = await tx.tratamiento.count({ where: { animal_id: t.animal_id, estado: "en_curso", id: { not: id } } });
    if (volverActivo && !otrosAbiertos && t.animal.estado === "enfermo") await tx.animal.update({ where: { id: t.animal_id }, data: { estado: "activo", actualizado_por: s.id } });
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "tratamiento", entidad_id: id, accion: "finalizar", datos_despues: { resultado, volverActivo } });
  refrescar(id);
  return { ok: true, id };
}

export async function anularTratamiento(id: string, motivo: string): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Anular lo hace un supervisor." };
  if (!motivo?.trim()) return { ok: false, error: "Indica por qué se anula." };
  const t = await prisma.tratamiento.findUnique({ where: { id }, include: { medicamentos: true } });
  if (!t || t.estado === "anulado") return { ok: false, error: "No existe o ya está anulado." };
  await prisma.$transaction(async (tx) => {
    await tx.tratamiento.update({ where: { id }, data: { estado: "anulado", motivo_anulacion: motivo.trim(), actualizado_por: s.id } });
    await tx.movimientoInsumo.updateMany({ where: { tratamiento_id: id, anulado: false }, data: { anulado: true, motivo_anulacion: `TRATAMIENTO ANULADO: ${motivo.trim()}`, anulado_por: s.id, anulado_en: new Date(), actualizado_por: s.id } });
    for (const insumoId of new Set(t.medicamentos.map((m) => m.insumo_id))) await recalcularInsumo(tx, insumoId, s.id);
  });
  await registrarAuditoria({ usuario_id: s.id, entidad: "tratamiento", entidad_id: id, accion: "anular", datos_despues: { motivo } });
  refrescar(id);
  return { ok: true };
}
