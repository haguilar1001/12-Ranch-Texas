"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { aBase, costoCOP, type AlimentoUnidad } from "@/lib/animales/unidades";
import { cantidadPorEntrega, type FrecuenciaRacion, type ModoRacion } from "@/lib/animales/racion";
import { recalcularExistencia, registrarEntregaConKardex } from "@/lib/animales/alimentacion";
import { calcularLineasCompra, preciosQueCambian } from "@/lib/animales/compras";
import type { Tx } from "@/lib/db";
import type { Prisma } from "@prisma/client";

interface Resultado {
  ok: boolean;
  error?: string;
  aviso?: string;
}

const RUTA = "/admin/animales";

/** Maestros: recintos, alimentos y dieta. Decisiones de parámetro. */
async function supervisor() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "supervisor") ? s : null;
}

/** Operación diaria: alimentar, trasladar, mover inventario de alimento. */
async function granja() {
  const s = await obtenerSesion();
  return s && puedeOperarGranja(s.rol) ? s : null;
}

const SIN_PERMISO_GRANJA = "Tu rol no puede operar el módulo de Animales.";

async function admin() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "administrador") ? s : null;
}

/** Acepta "0,8", "0.8", "1.500" y devuelve el número. null si no es válido. */
function parseCantidad(texto: string | number): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  const limpio = texto.trim().replace(/\s/g, "");
  if (!limpio) return null;
  // "1.500,5" → "1500.5" ; "0,8" → "0.8" ; "1500" → "1500"
  const normalizado = limpio.includes(",")
    ? limpio.replace(/\./g, "").replace(",", ".")
    : limpio;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function entero(v: string | number | null | undefined): number | null | "error" {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  if (!Number.isInteger(n)) return "error";
  return n;
}

const texto = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

// ============================================================ RECINTOS (ubicación)

interface EntradaRecinto {
  nombre: string;
  tipo?: string | null;
  ubicacion?: string | null;
  capacidad?: string | number | null;
  descripcion?: string | null;
}

export async function crearRecinto(e: EntradaRecinto): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const nombre = e.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre del recinto es obligatorio." };

  const repetido = await prisma.recinto.findFirst({ where: { nombre } });
  if (repetido) return { ok: false, error: `Ya existe un recinto llamado "${nombre}".` };

  const cap = entero(e.capacidad);
  if (cap === "error" || (cap !== null && cap < 0)) return { ok: false, error: "La capacidad debe ser un entero mayor o igual a 0." };

  const r = await prisma.recinto.create({
    data: {
      nombre,
      tipo: texto(e.tipo),
      ubicacion: texto(e.ubicacion),
      capacidad: cap,
      descripcion: texto(e.descripcion),
      creado_por: s.id,
    },
  });

  await registrarAuditoria({ usuario_id: s.id, entidad: "recinto", entidad_id: r.id, accion: "crear", datos_despues: { nombre } });
  revalidatePath(RUTA);
  return { ok: true };
}

export async function editarRecinto(id: string, cambios: EntradaRecinto): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const antes = await prisma.recinto.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Recinto no encontrado." };

  const nombre = cambios.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };

  const cap = entero(cambios.capacidad);
  if (cap === "error" || (cap !== null && cap < 0)) return { ok: false, error: "La capacidad debe ser un entero mayor o igual a 0." };

  await prisma.recinto.update({
    where: { id },
    data: {
      nombre,
      tipo: texto(cambios.tipo),
      ubicacion: texto(cambios.ubicacion),
      capacidad: cap,
      descripcion: texto(cambios.descripcion),
      actualizado_por: s.id,
    },
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "recinto", entidad_id: id, accion: "editar",
    datos_antes: { nombre: antes.nombre, tipo: antes.tipo, ubicacion: antes.ubicacion, capacidad: antes.capacidad },
    datos_despues: { nombre, tipo: texto(cambios.tipo), ubicacion: texto(cambios.ubicacion), capacidad: cap },
  });
  revalidatePath(RUTA);
  return { ok: true };
}

/** Baja lógica. No se permite si todavía hay animales adentro. */
export async function cambiarEstadoRecinto(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  if (!activo) {
    const dentro = await prisma.animal.count({ where: { recinto_id: id, activo: true } });
    if (dentro > 0) return { ok: false, error: `No puedes desactivar el recinto: todavía hay ${dentro} grupo(s) adentro. Trasládalos primero.` };
  }

  await prisma.recinto.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "recinto", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath(RUTA);
  return { ok: true };
}

// ============================================================ ANIMALES (inventario + ubicación)

interface EntradaAnimal {
  nombre: string;
  categoria_id: string;
  recinto_id?: string | null;
  cantidad?: string | number;
  codigo?: string | null;
  especie?: string | null;
  raza?: string | null;
  sexo?: string;
  observaciones?: string | null;
}

const SEXOS = ["macho", "hembra", "desconocido"] as const;
const ESTADOS_ANIMAL = ["activo", "enfermo", "cuarentena", "fallecido", "trasladado"] as const;

export async function crearAnimal(e: EntradaAnimal): Promise<Resultado> {
  const s = await granja();
  if (!s) return { ok: false, error: SIN_PERMISO_GRANJA };

  const nombre = e.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre del grupo o animal es obligatorio." };
  if (!e.categoria_id) return { ok: false, error: "Elige la categoría." };

  const cantidad = entero(e.cantidad ?? 1);
  if (cantidad === "error" || cantidad === null || cantidad < 0) return { ok: false, error: "La cantidad de cabezas debe ser un entero mayor o igual a 0." };

  const sexo = SEXOS.includes(e.sexo as (typeof SEXOS)[number]) ? (e.sexo as (typeof SEXOS)[number]) : "desconocido";
  const recinto_id = texto(e.recinto_id);

  const aviso = recinto_id ? await avisoDeCapacidad(recinto_id, cantidad) : undefined;

  const a = await prisma.$transaction(async (tx) => {
    const creado = await tx.animal.create({
      data: {
        nombre,
        categoria_id: e.categoria_id,
        recinto_id,
        cantidad,
        codigo: texto(e.codigo),
        especie: texto(e.especie),
        raza: texto(e.raza),
        sexo,
        observaciones: texto(e.observaciones),
        creado_por: s.id,
      },
    });
    // La primera ubicación también queda en el historial.
    if (recinto_id) {
      await tx.trasladoAnimal.create({
        data: { animal_id: creado.id, recinto_destino_id: recinto_id, cantidad, motivo: "Ubicación inicial", creado_por: s.id },
      });
    }
    return creado;
  });

  await registrarAuditoria({ usuario_id: s.id, entidad: "animal", entidad_id: a.id, accion: "crear", datos_despues: { nombre, cantidad, recinto_id } });
  revalidatePath(RUTA);
  return { ok: true, aviso };
}

export async function editarAnimal(id: string, cambios: Partial<EntradaAnimal> & { estado?: string }): Promise<Resultado> {
  const s = await granja();
  if (!s) return { ok: false, error: SIN_PERMISO_GRANJA };

  const antes = await prisma.animal.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Grupo no encontrado." };

  const data: Prisma.AnimalUpdateInput = { actualizado_por: s.id };

  if (cambios.nombre !== undefined) {
    if (!cambios.nombre.trim()) return { ok: false, error: "El nombre no puede quedar vacío." };
    data.nombre = cambios.nombre.trim();
  }
  if (cambios.cantidad !== undefined) {
    const c = entero(cambios.cantidad);
    if (c === "error" || c === null || c < 0) return { ok: false, error: "La cantidad de cabezas debe ser un entero mayor o igual a 0." };
    data.cantidad = c;
  }
  if (cambios.categoria_id) data.categoria = { connect: { id: cambios.categoria_id } };
  if (cambios.codigo !== undefined) data.codigo = texto(cambios.codigo);
  if (cambios.especie !== undefined) data.especie = texto(cambios.especie);
  if (cambios.raza !== undefined) data.raza = texto(cambios.raza);
  if (cambios.observaciones !== undefined) data.observaciones = texto(cambios.observaciones);
  if (cambios.sexo !== undefined && SEXOS.includes(cambios.sexo as (typeof SEXOS)[number])) {
    data.sexo = cambios.sexo as (typeof SEXOS)[number];
  }
  if (cambios.estado !== undefined) {
    if (!ESTADOS_ANIMAL.includes(cambios.estado as (typeof ESTADOS_ANIMAL)[number])) return { ok: false, error: "Estado no válido." };
    data.estado = cambios.estado as (typeof ESTADOS_ANIMAL)[number];
  }

  await prisma.animal.update({ where: { id }, data });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "animal", entidad_id: id, accion: "editar",
    datos_antes: { nombre: antes.nombre, cantidad: antes.cantidad, estado: antes.estado },
    datos_despues: JSON.parse(JSON.stringify(cambios)),
  });
  revalidatePath(RUTA);
  return { ok: true };
}

/** Aviso (no bloqueo) si el recinto se pasa de su capacidad declarada. */
async function avisoDeCapacidad(recintoId: string, entran: number, excluirAnimalId?: string): Promise<string | undefined> {
  const recinto = await prisma.recinto.findUnique({ where: { id: recintoId } });
  if (!recinto?.capacidad) return undefined;
  const dentro = await prisma.animal.aggregate({
    where: { recinto_id: recintoId, activo: true, ...(excluirAnimalId ? { id: { not: excluirAnimalId } } : {}) },
    _sum: { cantidad: true },
  });
  const total = (dentro._sum.cantidad ?? 0) + entran;
  if (total > recinto.capacidad) {
    return `Ojo: ${recinto.nombre} quedaría con ${total} cabezas y su capacidad es ${recinto.capacidad}.`;
  }
  return undefined;
}

/** Mueve un grupo a otro recinto y deja el movimiento en el historial. */
export async function trasladarAnimal(
  animalId: string,
  recintoDestinoId: string,
  opciones: { cantidad?: string | number; motivo?: string } = {},
): Promise<Resultado> {
  const s = await granja();
  if (!s) return { ok: false, error: SIN_PERMISO_GRANJA };

  const animal = await prisma.animal.findUnique({ where: { id: animalId } });
  if (!animal) return { ok: false, error: "Grupo no encontrado." };
  if (!recintoDestinoId) return { ok: false, error: "Elige el recinto de destino." };
  if (animal.recinto_id === recintoDestinoId) return { ok: false, error: "El grupo ya está en ese recinto." };

  const destino = await prisma.recinto.findUnique({ where: { id: recintoDestinoId } });
  if (!destino || !destino.activo) return { ok: false, error: "El recinto de destino no existe o está inactivo." };

  const cant = entero(opciones.cantidad ?? animal.cantidad);
  if (cant === "error" || cant === null || cant < 0) return { ok: false, error: "La cantidad trasladada debe ser un entero mayor o igual a 0." };
  if (cant > animal.cantidad) return { ok: false, error: `El grupo tiene ${animal.cantidad} cabezas; no puedes trasladar ${cant}.` };

  const aviso = await avisoDeCapacidad(recintoDestinoId, cant, animalId);

  await prisma.$transaction(async (tx) => {
    await tx.trasladoAnimal.create({
      data: {
        animal_id: animalId,
        recinto_origen_id: animal.recinto_id,
        recinto_destino_id: recintoDestinoId,
        cantidad: cant,
        motivo: texto(opciones.motivo),
        creado_por: s.id,
      },
    });
    await tx.animal.update({ where: { id: animalId }, data: { recinto_id: recintoDestinoId, actualizado_por: s.id } });
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "animal", entidad_id: animalId, accion: "trasladar",
    datos_antes: { recinto_id: animal.recinto_id },
    datos_despues: { recinto_id: recintoDestinoId, cantidad: cant, motivo: texto(opciones.motivo) },
  });
  revalidatePath(RUTA);
  return { ok: true, aviso };
}

export async function cambiarEstadoAnimal(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };
  await prisma.animal.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "animal", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath(RUTA);
  return { ok: true };
}

// ============================================================ ALIMENTOS + KARDEX

interface EntradaAlimento {
  nombre: string;
  tipo?: string | null;
  unidad_medida: string;
  costo_unitario?: string | number | null;
  equivalencia_g?: string | number | null;
}

export async function crearAlimento(e: EntradaAlimento): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const nombre = e.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre del alimento es obligatorio." };
  const unidad = e.unidad_medida?.trim();
  if (!unidad) return { ok: false, error: "Indica la unidad de compra (bulto, kg, litro, unidad...)." };

  const repetido = await prisma.alimento.findFirst({ where: { nombre } });
  if (repetido) return { ok: false, error: `Ya existe un alimento llamado "${nombre}".` };

  const costo = entero(e.costo_unitario);
  if (costo === "error" || (costo !== null && costo < 0)) return { ok: false, error: "El costo debe ser un entero en pesos." };
  const equiv = entero(e.equivalencia_g);
  if (equiv === "error" || (equiv !== null && equiv <= 0)) return { ok: false, error: "La equivalencia debe ser un entero mayor a 0." };

  const a = await prisma.alimento.create({
    data: { nombre, tipo: texto(e.tipo), unidad_medida: unidad, costo_unitario: costo, equivalencia_g: equiv, creado_por: s.id },
  });

  await registrarAuditoria({ usuario_id: s.id, entidad: "alimento", entidad_id: a.id, accion: "crear", datos_despues: { nombre, unidad, costo, equiv } });
  revalidatePath(RUTA);
  return { ok: true };
}

export async function editarAlimento(id: string, cambios: EntradaAlimento): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const antes = await prisma.alimento.findUnique({ where: { id } });
  if (!antes) return { ok: false, error: "Alimento no encontrado." };

  const nombre = cambios.nombre?.trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };
  const unidad = cambios.unidad_medida?.trim();
  if (!unidad) return { ok: false, error: "Indica la unidad de compra." };

  const costo = entero(cambios.costo_unitario);
  if (costo === "error" || (costo !== null && costo < 0)) return { ok: false, error: "El costo debe ser un entero en pesos." };
  const equiv = entero(cambios.equivalencia_g);
  if (equiv === "error" || (equiv !== null && equiv <= 0)) return { ok: false, error: "La equivalencia debe ser un entero mayor a 0." };

  await prisma.alimento.update({
    where: { id },
    data: { nombre, tipo: texto(cambios.tipo), unidad_medida: unidad, costo_unitario: costo, equivalencia_g: equiv, actualizado_por: s.id },
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "alimento", entidad_id: id, accion: "editar",
    datos_antes: { nombre: antes.nombre, unidad: antes.unidad_medida, costo: antes.costo_unitario, equiv: antes.equivalencia_g },
    datos_despues: { nombre, unidad, costo, equiv },
  });
  revalidatePath(RUTA);
  return { ok: true };
}

export async function cambiarEstadoAlimento(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };
  await prisma.alimento.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "alimento", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath(RUTA);
  return { ok: true };
}

const TIPOS_MOV = ["entrada", "salida", "ajuste"] as const;

export async function registrarMovimientoAlimento(e: {
  alimento_id: string;
  tipo: string;
  cantidad: string | number;
  unidad: string;
  motivo?: string;
  costo?: string | number | null;
}): Promise<Resultado> {
  const s = await granja();
  if (!s) return { ok: false, error: SIN_PERMISO_GRANJA };

  if (!TIPOS_MOV.includes(e.tipo as (typeof TIPOS_MOV)[number])) return { ok: false, error: "Tipo de movimiento no válido." };
  const tipo = e.tipo as (typeof TIPOS_MOV)[number];

  const alimento = await prisma.alimento.findUnique({ where: { id: e.alimento_id } });
  if (!alimento) return { ok: false, error: "Alimento no encontrado." };

  const cantidad = parseCantidad(e.cantidad);
  if (cantidad === null || cantidad < 0) return { ok: false, error: "La cantidad debe ser un número mayor o igual a 0." };

  const base = aBase(cantidad, e.unidad, alimento);
  if (base === null) {
    return { ok: false, error: `No se puede convertir "${e.unidad}" para ${alimento.nombre}. Declara cuántos gramos trae un ${alimento.unidad_medida}.` };
  }

  const costo = entero(e.costo);
  if (costo === "error" || (costo !== null && costo < 0)) return { ok: false, error: "El costo debe ser un entero en pesos." };

  const saldo = await prisma.$transaction(async (tx) => {
    await tx.movimientoAlimento.create({
      data: {
        alimento_id: alimento.id,
        tipo,
        cantidad_base: base,
        motivo: texto(e.motivo),
        costo: costo ?? (tipo === "entrada" ? costoCOP(base, alimento) : null),
        creado_por: s.id,
      },
    });
    return recalcularExistencia(tx, alimento.id, s.id);
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "alimento", entidad_id: alimento.id, accion: `movimiento_${tipo}`,
    datos_despues: { cantidad_base: base, unidad: e.unidad, saldo, motivo: texto(e.motivo) },
  });
  revalidatePath(RUTA);
  return { ok: true, aviso: saldo < 0 ? "El inventario quedó en negativo. Revisa el conteo físico." : undefined };
}

// ============================================================ COMPRAS DE ALIMENTO

/** Rubro de gasto de las compras de alimento. Se crea la primera vez, dentro de "Insumos y suministros" si existe. */
async function rubroAlimentoAnimales(tx: Tx, usuarioId: string): Promise<string> {
  const existente = await tx.rubroGasto.findFirst({
    where: { nombre: { equals: "ALIMENTO DE ANIMALES", mode: "insensitive" } },
  });
  if (existente) return existente.id;

  const insumos = await tx.rubroGasto.findFirst({
    where: { nombre: { equals: "INSUMOS Y SUMINISTROS", mode: "insensitive" }, nivel: "grupo" },
  });
  const nuevo = await tx.rubroGasto.create({
    data: insumos
      ? { nombre: "ALIMENTO DE ANIMALES", nivel: "rubro", padre_id: insumos.id, orden: 99, creado_por: usuarioId }
      : { nombre: "ALIMENTO DE ANIMALES", nivel: "grupo", orden: 99, creado_por: usuarioId },
  });
  return nuevo.id;
}

export async function registrarCompraAlimento(e: {
  proveedor_id?: string | null;
  /** Proveedor nuevo: se crea si no existe uno con ese nombre. */
  proveedor_nombre?: string | null;
  fecha: string; // YYYY-MM-DD (Bogotá)
  numero_factura?: string | null;
  observaciones?: string | null;
  lineas: { alimento_id: string; cantidad: string | number; precio_unitario: string | number }[];
}): Promise<Resultado> {
  const s = await granja();
  if (!s) return { ok: false, error: SIN_PERMISO_GRANJA };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha ?? "")) return { ok: false, error: "Indica la fecha de la compra." };
  const fecha = new Date(`${e.fecha}T12:00:00-05:00`);
  if (Number.isNaN(fecha.getTime())) return { ok: false, error: "Fecha no válida." };
  if (fecha.getTime() > Date.now() + 24 * 3600 * 1000) return { ok: false, error: "La fecha de la compra no puede ser futura." };

  const nombreProveedor = texto(e.proveedor_nombre);
  if (!e.proveedor_id && !nombreProveedor) return { ok: false, error: "Indica el proveedor." };

  // Cantidades y precios como los escribe la persona ("2,5" bultos, "$ 132.300").
  const entradas = [];
  for (const l of e.lineas ?? []) {
    const cantidad = parseCantidad(l.cantidad);
    const precio = entero(l.precio_unitario);
    if (cantidad === null) return { ok: false, error: "Hay una cantidad que no es un número." };
    if (precio === null || precio === "error") return { ok: false, error: "Hay un precio vacío o que no es un entero en pesos." };
    entradas.push({ alimento_id: l.alimento_id, cantidad, precio_unitario: precio });
  }

  const alimentos = await prisma.alimento.findMany({ where: { id: { in: entradas.map((x) => x.alimento_id) }, activo: true } });
  const calc = calcularLineasCompra(entradas, alimentos);
  if (!calc.ok) return { ok: false, error: calc.error };
  const cambiosPrecio = preciosQueCambian(calc.lineas, alimentos);
  const nombreDe = new Map(alimentos.map((a) => [a.id, a.nombre]));

  const { compraId, saldos } = await prisma.$transaction(async (tx) => {
    let proveedorId = e.proveedor_id || null;
    if (proveedorId) {
      if (!(await tx.proveedor.findUnique({ where: { id: proveedorId } }))) throw new Error("Proveedor no encontrado.");
    } else {
      const existente = await tx.proveedor.findFirst({ where: { nombre: { equals: nombreProveedor!, mode: "insensitive" } } });
      proveedorId = existente ? existente.id : (await tx.proveedor.create({ data: { nombre: nombreProveedor!, creado_por: s.id } })).id;
    }

    const factura = texto(e.numero_factura);
    const gasto = await tx.gasto.create({
      data: {
        rubro_gasto_id: await rubroAlimentoAnimales(tx, s.id),
        proveedor_id: proveedorId,
        descripcion: `Compra de alimento${factura ? ` · factura ${factura}` : ""} · ${calc.lineas.map((l) => nombreDe.get(l.alimento_id)).join(", ")}`,
        fecha_gasto: fecha,
        // El parque no es responsable de IVA: el IVA pagado es costo, va dentro de la base.
        base_gravable: calc.total,
        total: calc.total,
        estado: "pendiente",
        creado_por: s.id,
      },
    });

    const compra = await tx.compraAlimento.create({
      data: {
        proveedor_id: proveedorId,
        fecha_compra: fecha,
        numero_factura: factura,
        observaciones: texto(e.observaciones),
        total: calc.total,
        gasto_id: gasto.id,
        creado_por: s.id,
        detalle: { create: calc.lineas.map((l) => ({ ...l, creado_por: s.id })) },
      },
    });

    const saldos: { alimento_id: string; saldo: number }[] = [];
    for (const l of calc.lineas) {
      await tx.movimientoAlimento.create({
        data: {
          alimento_id: l.alimento_id,
          tipo: "entrada",
          cantidad_base: l.cantidad_base,
          fecha,
          costo: l.subtotal,
          motivo: `Compra${factura ? ` factura ${factura}` : ""}`,
          compra_id: compra.id,
          creado_por: s.id,
        },
      });
      saldos.push({ alimento_id: l.alimento_id, saldo: await recalcularExistencia(tx, l.alimento_id, s.id) });
    }

    // Decisión del responsable: el costo del alimento pasa a ser el de la última compra.
    for (const c of cambiosPrecio) {
      await tx.alimento.update({ where: { id: c.alimento_id }, data: { costo_unitario: c.despues, actualizado_por: s.id } });
    }

    return { compraId: compra.id, saldos };
  }).catch((err: Error) => ({ compraId: null, saldos: [], error: err.message }));

  if (!compraId) return { ok: false, error: "No se pudo registrar la compra. Revisa el proveedor e intenta de nuevo." };

  await registrarAuditoria({
    usuario_id: s.id, entidad: "compra_alimento", entidad_id: compraId, accion: "crear",
    datos_despues: { total: calc.total, lineas: calc.lineas.map((l) => ({ ...l })), cambios_precio: cambiosPrecio },
  });
  revalidatePath(RUTA);
  revalidatePath("/admin/gastos");

  const avisos: string[] = [];
  if (cambiosPrecio.length > 0) {
    avisos.push(`Costo actualizado: ${cambiosPrecio.map((c) => nombreDe.get(c.alimento_id)).join(", ")}.`);
  }
  const negativos = saldos.filter((x) => x.saldo < 0).map((x) => nombreDe.get(x.alimento_id));
  if (negativos.length > 0) avisos.push(`Siguen en negativo: ${negativos.join(", ")}. Haz un ajuste por conteo físico.`);
  return { ok: true, aviso: avisos.join(" ") || undefined };
}

/** Anula la compra: devuelve el inventario con una salida de compensación y anula su gasto. Solo administrador. */
export async function anularCompraAlimento(id: string, motivo: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo el administrador puede anular compras." };

  const motivoLimpio = texto(motivo);
  if (!motivoLimpio) return { ok: false, error: "Indica el motivo de la anulación (queda en la auditoría)." };

  const compra = await prisma.compraAlimento.findUnique({ where: { id }, include: { detalle: true, gasto: true } });
  if (!compra) return { ok: false, error: "Compra no encontrada." };
  if (compra.estado === "anulada") return { ok: false, error: "Esa compra ya está anulada." };
  if (compra.gasto?.estado === "pagado") {
    return { ok: false, error: "El gasto de esta compra ya está pagado. Resuelve primero el pago en Gastos y anúlalo allá." };
  }

  const saldos = await prisma.$transaction(async (tx) => {
    await tx.compraAlimento.update({
      where: { id },
      data: { estado: "anulada", motivo_anulacion: motivoLimpio, actualizado_por: s.id },
    });
    if (compra.gasto && compra.gasto.estado !== "anulado") {
      await tx.gasto.update({ where: { id: compra.gasto.id }, data: { estado: "anulado", actualizado_por: s.id } });
    }
    // Compensación en el kardex: nunca se borra la entrada original.
    const saldos: number[] = [];
    for (const l of compra.detalle) {
      await tx.movimientoAlimento.create({
        data: {
          alimento_id: l.alimento_id,
          tipo: "salida",
          cantidad_base: l.cantidad_base,
          motivo: `Anulación de compra · ${motivoLimpio}`,
          compra_id: compra.id,
          creado_por: s.id,
        },
      });
      saldos.push(await recalcularExistencia(tx, l.alimento_id, s.id));
    }
    return saldos;
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "compra_alimento", entidad_id: id, accion: "anular",
    datos_antes: { total: compra.total, estado: compra.estado },
    datos_despues: { motivo: motivoLimpio },
  });
  if (compra.gasto) {
    await registrarAuditoria({
      usuario_id: s.id, entidad: "gasto", entidad_id: compra.gasto.id, accion: "anular",
      datos_despues: { motivo: `Anulación de compra de alimento · ${motivoLimpio}` },
    });
  }
  revalidatePath(RUTA);
  revalidatePath("/admin/gastos");
  return {
    ok: true,
    aviso: saldos.some((x) => x < 0) ? "Algún alimento quedó en negativo: ya se había consumido parte de la compra." : undefined,
  };
}

// ============================================================ RACIONES (dieta)

const MODOS = ["individual", "grupal"] as const;
const FRECUENCIAS = ["diaria", "semanal", "quincenal", "mensual"] as const;

interface EntradaRacion {
  destino: "animal" | "categoria";
  destino_id: string;
  alimento_id: string;
  cantidad: string | number;
  unidad: string;
  modo: string;
  frecuencia: string;
  horario?: string | null;
  observaciones?: string | null;
}

/**
 * Normaliza la cantidad a un ENTERO. Si el usuario escribe 0,8 kg se guarda como
 * 800 g: el modelo no usa decimales (ni para dinero ni para peso).
 */
function normalizarCantidad(cantidad: number, unidad: string, alimento: AlimentoUnidad): { cantidad: number; unidad: string } | null {
  if (Number.isInteger(cantidad)) return { cantidad, unidad };
  const base = aBase(cantidad, unidad, alimento);
  if (base === null) return null;
  return { cantidad: base, unidad: "g" };
}

export async function crearRacion(e: EntradaRacion): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  if (!e.destino_id) return { ok: false, error: "Elige a qué grupo o categoría se le da esta ración." };
  if (!e.alimento_id) return { ok: false, error: "Elige el alimento." };
  if (!MODOS.includes(e.modo as ModoRacion)) return { ok: false, error: "Indica si la ración es individual o grupal." };
  if (!FRECUENCIAS.includes(e.frecuencia as FrecuenciaRacion)) return { ok: false, error: "Frecuencia no válida." };

  const alimento = await prisma.alimento.findUnique({ where: { id: e.alimento_id } });
  if (!alimento) return { ok: false, error: "Alimento no encontrado." };

  const cantidad = parseCantidad(e.cantidad);
  if (cantidad === null || cantidad <= 0) return { ok: false, error: "La cantidad debe ser mayor a 0." };

  const unidad = e.unidad?.trim() || alimento.unidad_medida;
  const norm = normalizarCantidad(cantidad, unidad, alimento);
  if (!norm) {
    return { ok: false, error: `Para usar decimales en ${alimento.nombre} hace falta declarar cuántos gramos trae un ${alimento.unidad_medida}.` };
  }

  // Una ración individual sobre una categoría se multiplicaría por el censo de CADA grupo,
  // que es justo lo que se espera; pero avisamos porque es fácil equivocarse.
  const aviso =
    e.destino === "categoria" && e.modo === "individual"
      ? "Ración individual sobre una categoría: la cantidad se multiplicará por las cabezas de cada grupo de esa categoría."
      : undefined;

  const r = await prisma.racion.create({
    data: {
      animal_id: e.destino === "animal" ? e.destino_id : null,
      categoria_animal_id: e.destino === "categoria" ? e.destino_id : null,
      alimento_id: e.alimento_id,
      cantidad: norm.cantidad,
      unidad: norm.unidad,
      modo: e.modo as ModoRacion,
      frecuencia: e.frecuencia as FrecuenciaRacion,
      horario: texto(e.horario),
      observaciones: texto(e.observaciones),
      creado_por: s.id,
    },
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "racion", entidad_id: r.id, accion: "crear",
    datos_despues: { alimento: alimento.nombre, cantidad: norm.cantidad, unidad: norm.unidad, modo: e.modo, frecuencia: e.frecuencia },
  });
  revalidatePath(RUTA);
  return { ok: true, aviso };
}

export async function editarRacion(
  id: string,
  cambios: { cantidad?: string | number; unidad?: string; modo?: string; frecuencia?: string; horario?: string | null; observaciones?: string | null },
): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };

  const antes = await prisma.racion.findUnique({ where: { id }, include: { alimento: true } });
  if (!antes) return { ok: false, error: "Ración no encontrada." };

  const data: Prisma.RacionUpdateInput = { actualizado_por: s.id };

  if (cambios.cantidad !== undefined) {
    const cantidad = parseCantidad(cambios.cantidad);
    if (cantidad === null || cantidad <= 0) return { ok: false, error: "La cantidad debe ser mayor a 0." };
    const unidad = cambios.unidad?.trim() || antes.unidad;
    const norm = normalizarCantidad(cantidad, unidad, antes.alimento);
    if (!norm) return { ok: false, error: `Falta declarar cuántos gramos trae un ${antes.alimento.unidad_medida} de ${antes.alimento.nombre}.` };
    data.cantidad = norm.cantidad;
    data.unidad = norm.unidad;
  } else if (cambios.unidad !== undefined) {
    data.unidad = cambios.unidad.trim() || antes.unidad;
  }

  if (cambios.modo !== undefined) {
    if (!MODOS.includes(cambios.modo as ModoRacion)) return { ok: false, error: "Modo no válido." };
    data.modo = cambios.modo as ModoRacion;
  }
  if (cambios.frecuencia !== undefined) {
    if (!FRECUENCIAS.includes(cambios.frecuencia as FrecuenciaRacion)) return { ok: false, error: "Frecuencia no válida." };
    data.frecuencia = cambios.frecuencia as FrecuenciaRacion;
  }
  if (cambios.horario !== undefined) data.horario = texto(cambios.horario);
  if (cambios.observaciones !== undefined) data.observaciones = texto(cambios.observaciones);

  await prisma.racion.update({ where: { id }, data });
  await registrarAuditoria({
    usuario_id: s.id, entidad: "racion", entidad_id: id, accion: "editar",
    datos_antes: { cantidad: antes.cantidad, unidad: antes.unidad, modo: antes.modo, frecuencia: antes.frecuencia },
    datos_despues: JSON.parse(JSON.stringify(cambios)),
  });
  revalidatePath(RUTA);
  return { ok: true };
}

export async function cambiarEstadoRacion(id: string, activo: boolean): Promise<Resultado> {
  const s = await supervisor();
  if (!s) return { ok: false, error: "Necesitas rol de supervisor." };
  await prisma.racion.update({ where: { id }, data: { activo, actualizado_por: s.id } });
  await registrarAuditoria({ usuario_id: s.id, entidad: "racion", entidad_id: id, accion: activo ? "activar" : "desactivar" });
  revalidatePath(RUTA);
  return { ok: true };
}

// ============================================================ BITÁCORA DE ALIMENTACIÓN

const ESTADOS_ALIM = ["realizada", "parcial", "omitida"] as const;

export async function registrarAlimentacion(e: {
  racion_id?: string | null;
  animal_id?: string | null;
  categoria_animal_id?: string | null;
  alimento_id?: string | null;
  cantidad?: string | number;
  unidad?: string;
  estado?: string;
  motivo?: string | null;
  empleado_id?: string | null;
  observaciones?: string | null;
}): Promise<Resultado> {
  const s = await granja();
  if (!s) return { ok: false, error: SIN_PERMISO_GRANJA };

  const estado = ESTADOS_ALIM.includes(e.estado as (typeof ESTADOS_ALIM)[number])
    ? (e.estado as (typeof ESTADOS_ALIM)[number])
    : "realizada";

  // La ración da el contexto: a quién, qué alimento y cuánto tocaba.
  const racion = e.racion_id
    ? await prisma.racion.findUnique({ where: { id: e.racion_id }, include: { alimento: true, animal: true, categoria: true } })
    : null;
  if (e.racion_id && !racion) return { ok: false, error: "Ración no encontrada." };

  const alimentoId = racion?.alimento_id ?? texto(e.alimento_id);
  if (!alimentoId) return { ok: false, error: "Elige el alimento entregado." };
  const alimento = racion?.alimento ?? (await prisma.alimento.findUnique({ where: { id: alimentoId } }));
  if (!alimento) return { ok: false, error: "Alimento no encontrado." };

  const animalId = racion?.animal_id ?? texto(e.animal_id);
  const categoriaId = racion?.categoria_animal_id ?? texto(e.categoria_animal_id);
  if (!animalId && !categoriaId) return { ok: false, error: "Indica a qué grupo o categoría se le entregó el alimento." };

  const animal = animalId ? await prisma.animal.findUnique({ where: { id: animalId } }) : null;

  // Lo que tocaba según la dieta (para comparar planeado vs. entregado).
  let planeada: number | null = null;
  if (racion) {
    const cabezas = animal?.cantidad ?? (await cabezasDeCategoria(racion.categoria_animal_id));
    planeada = cantidadPorEntrega(
      { cantidad: racion.cantidad, unidad: racion.unidad, modo: racion.modo, frecuencia: racion.frecuencia },
      cabezas,
      alimento,
    );
  }

  let entregada = 0;
  if (estado === "omitida") {
    if (!texto(e.motivo)) return { ok: false, error: "Si no se alimentó, el motivo es obligatorio." };
  } else {
    const cantidad = parseCantidad(e.cantidad ?? "");
    if (cantidad === null || cantidad <= 0) return { ok: false, error: "Indica cuánto alimento se entregó." };
    const unidad = e.unidad?.trim() || racion?.unidad || alimento.unidad_medida;
    const base = aBase(cantidad, unidad, alimento);
    if (base === null) {
      return { ok: false, error: `No se puede convertir "${unidad}" para ${alimento.nombre}. Declara cuántos gramos trae un ${alimento.unidad_medida}.` };
    }
    entregada = base;
    if (estado === "parcial" && !texto(e.motivo)) return { ok: false, error: "En una entrega parcial el motivo es obligatorio." };
  }

  const costo = entregada > 0 ? costoCOP(entregada, alimento) : 0;
  const recintoId = animal?.recinto_id ?? null;

  const { saldo } = await prisma.$transaction(async (tx) => {
    const { saldo: saldoNuevo } = await registrarEntregaConKardex(tx, {
      racion_id: racion?.id,
      animal_id: animalId,
      categoria_animal_id: categoriaId,
      recinto_id: recintoId,
      alimento_id: alimento.id,
      cantidad_planeada: planeada,
      cantidad_entregada: entregada,
      costo,
      estado,
      motivo: texto(e.motivo),
      empleado_id: texto(e.empleado_id),
      usuario_id: s.id,
      observaciones: texto(e.observaciones),
      creado_por: s.id,
      motivoMovimiento: "Entrega a los animales",
    });
    return { saldo: saldoNuevo };
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "alimentacion", entidad_id: alimento.id, accion: "registrar",
    datos_despues: { animal_id: animalId, categoria_id: categoriaId, entregada, planeada, estado, costo },
  });
  revalidatePath(RUTA);

  return {
    ok: true,
    aviso: saldo < 0 ? `${alimento.nombre} quedó con existencia negativa. Registra la compra o haz un ajuste por conteo.` : undefined,
  };
}

async function cabezasDeCategoria(categoriaId: string | null): Promise<number> {
  if (!categoriaId) return 0;
  const r = await prisma.animal.aggregate({ where: { categoria_id: categoriaId, activo: true }, _sum: { cantidad: true } });
  return r._sum.cantidad ?? 0;
}

/** Anula una entrega. No borra: marca el registro y devuelve el alimento al inventario. */
export async function anularAlimentacion(id: string, motivo: string): Promise<Resultado> {
  const s = await admin();
  if (!s) return { ok: false, error: "Solo un administrador puede anular un registro de alimentación." };

  const motivoLimpio = texto(motivo);
  if (!motivoLimpio) return { ok: false, error: "Indica el motivo de la anulación (queda en la auditoría)." };

  const reg = await prisma.registroAlimentacion.findUnique({ where: { id } });
  if (!reg) return { ok: false, error: "Registro no encontrado." };
  if (reg.anulado) return { ok: false, error: "Ese registro ya está anulado." };

  await prisma.$transaction(async (tx) => {
    await tx.registroAlimentacion.update({
      where: { id },
      data: { anulado: true, motivo_anulacion: motivoLimpio, actualizado_por: s.id },
    });
    // Compensación en el kardex: nunca se borra la salida original.
    if (reg.cantidad_entregada > 0) {
      await tx.movimientoAlimento.create({
        data: {
          alimento_id: reg.alimento_id,
          tipo: "entrada",
          cantidad_base: reg.cantidad_entregada,
          motivo: `Anulación de entrega · ${motivoLimpio}`,
          creado_por: s.id,
        },
      });
    }
    await recalcularExistencia(tx, reg.alimento_id, s.id);
  });

  await registrarAuditoria({
    usuario_id: s.id, entidad: "alimentacion", entidad_id: id, accion: "anular",
    datos_antes: { cantidad_entregada: reg.cantidad_entregada, estado: reg.estado },
    datos_despues: { motivo: motivoLimpio },
  });
  revalidatePath(RUTA);
  return { ok: true };
}
