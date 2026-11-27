"use server";

// Catálogos (Configuración → Catálogos): proveedores, materias primas, rubros y áreas se manejan
// aquí. Alimentos y grupos de equipos reutilizan las acciones de sus módulos, para que la regla
// sea una sola.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import {
  validarProveedor, validarMateriaPrima, validarRubro, validarArea,
  type EntradaProveedor, type EntradaMateriaPrima, type EntradaRubro, type NivelRubro,
} from "@/lib/catalogos/validar";
import * as XLSX from "xlsx";
import { normalizar, type Celda } from "@/lib/equipos/importar";
import { DEFS, esTipoCatalogo, leerCatalogo, type LecturaCatalogo } from "@/lib/catalogos/importar";
import { existentesDe, aplicarCarga } from "@/lib/catalogos/carga-bd";
import { crearAlimento as crearAlimentoAnimales, editarAlimento as editarAlimentoAnimales, cambiarEstadoAlimento as estadoAlimentoAnimales } from "@/app/admin/animales/actions";
import { crearGrupoEquipo as crearGrupo, editarGrupoEquipo as editarGrupo, cambiarEstadoGrupoEquipo as estadoGrupo } from "@/app/admin/equipos/actions";

export interface Resultado { ok: boolean; error?: string }

const RUTA = "/admin/catalogos";
const SIN_PERMISO = "Necesitas rol de supervisor.";

async function supervisor() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "supervisor") ? s : null;
}
const refrescar = () => revalidatePath(RUTA);

// ============================================================ proveedores

export async function guardarProveedor(id: string | null, e: EntradaProveedor): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const v = validarProveedor(e);
  if (!v.ok) return v;
  const repetido = await prisma.proveedor.findFirst({ where: { nombre: { equals: v.datos.nombre, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (repetido) return { ok: false, error: `Ya existe el proveedor "${repetido.nombre}".` };
  if (id) {
    const antes = await prisma.proveedor.findUnique({ where: { id } });
    if (!antes) return { ok: false, error: "Proveedor no encontrado." };
    await prisma.proveedor.update({ where: { id }, data: { ...v.datos, actualizado_por: s.id } });
    await registrarAuditoria({ usuario_id: s.id, entidad: "proveedor", entidad_id: id, accion: "editar", datos_antes: { nombre: antes.nombre, nit: antes.nit_cedula }, datos_despues: { ...v.datos } });
  } else {
    const p = await prisma.proveedor.create({ data: { ...v.datos, creado_por: s.id } });
    await registrarAuditoria({ usuario_id: s.id, entidad: "proveedor", entidad_id: p.id, accion: "crear", datos_despues: { ...v.datos } });
  }
  refrescar();
  return { ok: true };
}

export async function cambiarEstadoProveedor(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  await prisma.proveedor.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "proveedor", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  refrescar();
  return { ok: true };
}

// ============================================================ materias primas

export async function guardarMateriaPrima(id: string | null, e: EntradaMateriaPrima): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const v = validarMateriaPrima(e);
  if (!v.ok) return v;
  if (v.datos.proveedor_id && !(await prisma.proveedor.findUnique({ where: { id: v.datos.proveedor_id } }))) return { ok: false, error: "El proveedor no existe." };
  const repetido = await prisma.materiaPrima.findFirst({ where: { nombre: { equals: v.datos.nombre, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (repetido) return { ok: false, error: `Ya existe la materia prima "${repetido.nombre}".` };
  if (id) {
    const antes = await prisma.materiaPrima.findUnique({ where: { id } });
    if (!antes) return { ok: false, error: "Materia prima no encontrada." };
    await prisma.materiaPrima.update({ where: { id }, data: { ...v.datos, actualizado_por: s.id } });
    await registrarAuditoria({ usuario_id: s.id, entidad: "materia_prima", entidad_id: id, accion: "editar",
      datos_antes: { nombre: antes.nombre, unidad: antes.unidad_medida, costo: antes.costo_referencia, proveedor: antes.proveedor_id }, datos_despues: { ...v.datos } });
  } else {
    const m = await prisma.materiaPrima.create({ data: { ...v.datos, creado_por: s.id } });
    await registrarAuditoria({ usuario_id: s.id, entidad: "materia_prima", entidad_id: m.id, accion: "crear", datos_despues: { ...v.datos } });
  }
  refrescar();
  return { ok: true };
}

export async function cambiarEstadoMateriaPrima(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  await prisma.materiaPrima.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "materia_prima", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  refrescar();
  return { ok: true };
}

// ============================================================ rubros de gasto

export async function guardarRubro(id: string | null, e: EntradaRubro): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  if (id && e.padre_id === id) return { ok: false, error: "Un rubro no puede ir dentro de sí mismo." };
  const padre = e.padre_id ? await prisma.rubroGasto.findUnique({ where: { id: e.padre_id } }) : null;
  if (e.padre_id && !padre) return { ok: false, error: "El rubro padre no existe." };
  const v = validarRubro(e, (padre?.nivel as NivelRubro | undefined) ?? null);
  if (!v.ok) return v;
  const repetido = await prisma.rubroGasto.findFirst({
    where: { nombre: { equals: v.datos.nombre, mode: "insensitive" }, padre_id: v.datos.padre_id, activo: true, ...(id ? { id: { not: id } } : {}) },
  });
  if (repetido) return { ok: false, error: `Ya existe "${repetido.nombre}" en ese mismo lugar.` };
  if (id) {
    const antes = await prisma.rubroGasto.findUnique({ where: { id }, include: { _count: { select: { hijos: true } } } });
    if (!antes) return { ok: false, error: "Rubro no encontrado." };
    if (antes.nivel !== v.datos.nivel && antes._count.hijos > 0) return { ok: false, error: "No se puede cambiar el nivel: tiene rubros dentro." };
    await prisma.rubroGasto.update({ where: { id }, data: { ...v.datos, actualizado_por: s.id } });
    await registrarAuditoria({ usuario_id: s.id, entidad: "rubro_gasto", entidad_id: id, accion: "editar",
      datos_antes: { nombre: antes.nombre, nivel: antes.nivel, padre_id: antes.padre_id }, datos_despues: { ...v.datos } });
  } else {
    const r = await prisma.rubroGasto.create({ data: { ...v.datos, creado_por: s.id } });
    await registrarAuditoria({ usuario_id: s.id, entidad: "rubro_gasto", entidad_id: r.id, accion: "crear", datos_despues: { ...v.datos } });
  }
  refrescar();
  revalidatePath("/admin/gastos");
  return { ok: true };
}

export async function cambiarEstadoRubro(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const r = await prisma.rubroGasto.findUnique({ where: { id }, include: { padre: true } });
  if (!r) return { ok: false, error: "Rubro no encontrado." };
  if (!activo) {
    const hijos = await prisma.rubroGasto.count({ where: { padre_id: id, activo: true } });
    if (hijos > 0) return { ok: false, error: `Primero desactiva los ${hijos} rubro(s) que tiene dentro.` };
  } else if (r.padre && !r.padre.activo) {
    return { ok: false, error: `Primero activa "${r.padre.nombre}", que es donde está este rubro.` };
  }
  await prisma.rubroGasto.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "rubro_gasto", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  refrescar();
  revalidatePath("/admin/gastos");
  return { ok: true };
}

// ============================================================ áreas de trabajo

export async function guardarArea(id: string | null, e: { nombre: string; descripcion?: string | null }): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const v = validarArea(e);
  if (!v.ok) return v;
  const repetido = await prisma.areaTrabajo.findFirst({ where: { nombre: { equals: v.datos.nombre, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (repetido) return { ok: false, error: `Ya existe el área "${repetido.nombre}".` };
  if (id) {
    const antes = await prisma.areaTrabajo.findUnique({ where: { id } });
    if (!antes) return { ok: false, error: "Área no encontrada." };
    await prisma.areaTrabajo.update({ where: { id }, data: { ...v.datos, actualizado_por: s.id } });
    await registrarAuditoria({ usuario_id: s.id, entidad: "area_trabajo", entidad_id: id, accion: "editar", datos_antes: { nombre: antes.nombre }, datos_despues: { ...v.datos } });
  } else {
    const a = await prisma.areaTrabajo.create({ data: { ...v.datos, creado_por: s.id } });
    await registrarAuditoria({ usuario_id: s.id, entidad: "area_trabajo", entidad_id: a.id, accion: "crear", datos_despues: { ...v.datos } });
  }
  refrescar();
  return { ok: true };
}

export async function cambiarEstadoArea(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  if (!activo) {
    const n = await prisma.empleado.count({ where: { area_id: id, activo: true } });
    if (n > 0) return { ok: false, error: `No se puede desactivar: tiene ${n} empleado(s) activos. Cámbialos de área primero.` };
  }
  await prisma.areaTrabajo.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "area_trabajo", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  refrescar();
  return { ok: true };
}

// ============================================================ alimentos y grupos de equipos (reglas de su módulo)

type EntradaAlimento = Parameters<typeof crearAlimentoAnimales>[0];

export async function guardarAlimento(id: string | null, e: EntradaAlimento): Promise<Resultado> {
  const r = id ? await editarAlimentoAnimales(id, e) : await crearAlimentoAnimales(e);
  refrescar();
  return r;
}
export async function cambiarEstadoAlimento(id: string, activo: boolean): Promise<Resultado> {
  const r = await estadoAlimentoAnimales(id, activo);
  refrescar();
  return r;
}
export async function guardarGrupoEquipo(id: string | null, e: { nombre: string; descripcion?: string | null }): Promise<Resultado> {
  const r = id ? await editarGrupo(id, e) : await crearGrupo(e);
  refrescar();
  return r;
}
export async function cambiarEstadoGrupoEquipo(id: string, activo: boolean): Promise<Resultado> {
  const r = await estadoGrupo(id, activo);
  refrescar();
  return r;
}

// ============================================================ carga desde Excel

export interface ResultadoCargaCatalogo {
  ok: boolean;
  error?: string;
  confirmado?: boolean;
  titulo?: string;
  nuevos?: number;
  actualizar?: number;
  /** Primeros nombres de cada grupo, para que la persona vea qué va a pasar. */
  muestraNuevos?: string[];
  muestraActualizar?: string[];
  errores?: { fila: number; errores: string[] }[];
  avisos?: string[];
}

const MAX_BYTES = 3.5 * 1024 * 1024; // por debajo del límite de 4 MB de las Server Actions

/**
 * Sin `confirmar` solo REVISA (no guarda nada). Con `confirmar` vuelve a revisar y, si no hay
 * errores, crea y actualiza todo en una sola transacción.
 */
export async function cargarCatalogoExcel(form: FormData): Promise<ResultadoCargaCatalogo> {
  const s = await supervisor();
  if (!s) return { ok: false, error: SIN_PERMISO };
  const tipo = String(form.get("tipo") ?? "");
  if (!esTipoCatalogo(tipo)) return { ok: false, error: "Escoge qué catálogo vas a subir." };
  const def = DEFS[tipo];
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elige el archivo de Excel." };
  if (archivo.size > MAX_BYTES) return { ok: false, error: "El archivo pesa más de 3,5 MB." };
  if (!/\.xlsx?$/i.test(archivo.name)) return { ok: false, error: "El archivo debe ser de Excel (.xlsx)." };
  const confirmar = form.get("confirmar") === "1";

  let lectura: LecturaCatalogo;
  try {
    const libro = XLSX.read(Buffer.from(await archivo.arrayBuffer()), { type: "buffer", cellDates: true });
    const hoja = libro.SheetNames.find((n) => normalizar(n) === normalizar(def.hoja)) ?? libro.SheetNames[0];
    const filas = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[hoja], { header: 1, raw: true, defval: null, blankrows: true });
    lectura = leerCatalogo(tipo, filas, await existentesDe(tipo));
  } catch {
    return { ok: false, error: `No se pudo leer el archivo. ¿Es la plantilla de ${def.titulo.toLowerCase()} descargada de la app?` };
  }

  const resumen = {
    titulo: def.titulo,
    nuevos: lectura.nuevos.length,
    actualizar: lectura.actualizar.length,
    muestraNuevos: lectura.nuevos.slice(0, 12).map((f) => f.nombre),
    muestraActualizar: lectura.actualizar.slice(0, 12).map((f) => f.nombre),
    errores: lectura.errores,
    avisos: lectura.avisos,
  };
  if (lectura.faltanColumnas.length) {
    return { ok: false, ...resumen, error: `No es la plantilla de ${def.titulo.toLowerCase()}: faltan las columnas ${lectura.faltanColumnas.join(", ")}.` };
  }
  if (!resumen.nuevos && !resumen.actualizar && !lectura.errores.length) {
    return { ok: false, ...resumen, error: "No hay nada que cargar: el archivo está vacío o todo ya está igual en la app." };
  }
  if (!confirmar || lectura.errores.length) {
    return {
      ok: lectura.errores.length === 0, confirmado: false, ...resumen,
      error: confirmar && lectura.errores.length ? "Corrige las filas con error y vuelve a subir el archivo; no se cargó nada." : undefined,
    };
  }

  const r = await prisma.$transaction((tx) => aplicarCarga(tx, tipo, lectura.nuevos, lectura.actualizar, s.id), { timeout: 120000 });
  await registrarAuditoria({
    usuario_id: s.id, entidad: tipo, entidad_id: "carga_excel", accion: "carga_masiva",
    datos_despues: { archivo: archivo.name, creados: r.creados, actualizados: r.actualizados },
  });
  refrescar();
  revalidatePath("/admin/subir");
  return { ok: true, confirmado: true, ...resumen, nuevos: r.creados, actualizar: r.actualizados };
}
