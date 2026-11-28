import { prisma, type Tx } from "@/lib/db";
import { normalizar } from "@/lib/equipos/importar";
import { etiquetaCondicion } from "./validar";
import { ETIQUETA_CATEGORIA, type CategoriaInsumo } from "@/lib/granja/insumos";
import { DEFS, type Existentes, type FilaCatalogo, type TipoCatalogo } from "./importar";

// Acceso a BD de la carga de catálogos: qué existe hoy (para decidir crear o actualizar), los datos
// actuales para la plantilla "con datos" y la escritura de la carga (todo o nada).

type Fila = { id: string } & Record<string, unknown>;
const porNombre = (xs: Fila[]) => new Map(xs.map((x) => [normalizar(String(x.nombre)), x]));

/** Rutas "grupo|rubro|subrubro" normalizadas → id, y su nombre legible. */
async function rutasRubros() {
  const rubros = await prisma.rubroGasto.findMany({ where: { activo: true }, select: { id: true, nombre: true, padre_id: true, orden: true } });
  const mapa = new Map(rubros.map((r) => [r.id, r]));
  const ruta = (id: string): string[] => {
    const partes: string[] = [];
    let a: string | null = id;
    for (let i = 0; a && i < 5; i++) { const r = mapa.get(a); if (!r) break; partes.unshift(r.nombre); a = r.padre_id; }
    return partes;
  };
  return rubros.map((r) => ({ id: r.id, orden: r.orden, partes: ruta(r.id) }));
}

export async function existentesDe(tipo: TipoCatalogo): Promise<Existentes> {
  switch (tipo) {
    case "proveedores": return { registros: porNombre(await prisma.proveedor.findMany()) };
    case "materias": {
      const [m, p] = await Promise.all([prisma.materiaPrima.findMany(), prisma.proveedor.findMany({ where: { activo: true }, select: { id: true, nombre: true } })]);
      return { registros: porNombre(m), proveedores: new Map(p.map((x) => [normalizar(x.nombre), x.id])) };
    }
    case "alimentos": return { registros: porNombre(await prisma.alimento.findMany()) };
    case "grupos": return { registros: porNombre(await prisma.categoriaEquipo.findMany()) };
    case "areas": return { registros: porNombre(await prisma.areaTrabajo.findMany()) };
    case "insumos":
      // Los Decimal se pasan a número para poder comparar con lo que trae el Excel.
      return { registros: porNombre((await prisma.insumoGranja.findMany()).map((i) => ({ ...i, stock_minimo: i.stock_minimo === null ? null : Number(i.stock_minimo), existencia: Number(i.existencia) }))) };
    case "rubros": {
      const r = await rutasRubros();
      return { registros: new Map(), rutasRubros: new Map(r.map((x) => [x.partes.map(normalizar).join("|"), x.id])) };
    }
  }
}

/** Filas actuales del catálogo, en el orden de las columnas de su plantilla. */
export async function filasActuales(tipo: TipoCatalogo): Promise<(string | number | null)[][]> {
  const cols = DEFS[tipo].columnas.map((c) => c.clave);
  const fila = (o: Record<string, unknown>) => cols.map((k) => (o[k] === undefined || o[k] === null ? null : (o[k] as string | number)));
  const activos = { where: { activo: true }, orderBy: { nombre: "asc" as const } };
  switch (tipo) {
    case "proveedores":
      return (await prisma.proveedor.findMany(activos)).map((p) => fila({ ...p, condiciones_pago: etiquetaCondicion(p.condiciones_pago) || null }));
    case "materias":
      return (await prisma.materiaPrima.findMany({ ...activos, include: { proveedor: { select: { nombre: true } } } })).map((m) => fila({ ...m, proveedor: m.proveedor?.nombre }));
    case "alimentos": return (await prisma.alimento.findMany(activos)).map(fila);
    case "grupos": return (await prisma.categoriaEquipo.findMany(activos)).map(fila);
    case "areas": return (await prisma.areaTrabajo.findMany(activos)).map(fila);
    case "insumos":
      return (await prisma.insumoGranja.findMany(activos)).map((i) => fila({
        ...i, categoria: ETIQUETA_CATEGORIA[i.categoria as CategoriaInsumo], stock_minimo: i.stock_minimo === null ? null : Number(i.stock_minimo), existencia: Number(i.existencia),
      }));
    case "rubros":
      return (await rutasRubros())
        .sort((a, b) => a.partes.join(" ").localeCompare(b.partes.join(" "), "es"))
        .map((r) => [r.partes[0] ?? null, r.partes[1] ?? null, r.partes[2] ?? null, r.orden || null]);
  }
}

/** Guarda la carga ya validada. Devuelve cuántos se crearon y actualizaron. */
export async function aplicarCarga(tx: Tx, tipo: TipoCatalogo, nuevos: FilaCatalogo[], actualizar: FilaCatalogo[], usuario: string) {
  const por = { creado_por: usuario };
  const act = { actualizado_por: usuario };

  if (tipo === "rubros") {
    // Crea los niveles que falten, de arriba hacia abajo, sin duplicar.
    const existentes = await rutasRubros();
    const ids = new Map(existentes.map((x) => [x.partes.map(normalizar).join("|"), x.id]));
    let creados = 0;
    for (const f of nuevos) {
      const partes = f.ruta!;
      for (let i = 0; i < partes.length; i++) {
        const clave = partes.slice(0, i + 1).map(normalizar).join("|");
        if (ids.has(clave)) continue;
        const padre = i ? ids.get(partes.slice(0, i).map(normalizar).join("|"))! : null;
        const hoja = i === partes.length - 1;
        const r = await tx.rubroGasto.create({
          data: { nombre: partes[i], nivel: (["grupo", "rubro", "subrubro"] as const)[i], padre_id: padre, orden: hoja ? Number(f.datos.orden ?? 0) : 0, ...por },
        });
        ids.set(clave, r.id);
        creados++;
      }
    }
    for (const f of actualizar) await tx.rubroGasto.update({ where: { id: f.id! }, data: { orden: Number(f.datos.orden), ...act } });
    return { creados, actualizados: actualizar.length };
  }

  // Proveedores nuevos que piden las materias primas.
  const provNuevos = new Map<string, string>();
  for (const f of [...nuevos, ...actualizar]) {
    if (!f.proveedor_nuevo) continue;
    const k = normalizar(f.proveedor_nuevo);
    if (provNuevos.has(k)) continue;
    const ya = await tx.proveedor.findFirst({ where: { nombre: { equals: f.proveedor_nuevo, mode: "insensitive" } } });
    provNuevos.set(k, ya?.id ?? (await tx.proveedor.create({ data: { nombre: f.proveedor_nuevo, ...por } })).id);
  }
  const datosDe = (f: FilaCatalogo) => (f.proveedor_nuevo ? { ...f.datos, proveedor_id: provNuevos.get(normalizar(f.proveedor_nuevo))! } : f.datos);

  if (tipo === "insumos") {
    // El conteo entra al kardex: saldo inicial si el insumo es nuevo, ajuste si ya existía.
    const ahora = new Date();
    for (const f of [...nuevos, ...actualizar]) {
      const id = f.id ?? (await tx.insumoGranja.create({ data: { ...(f.datos as Record<string, never>), ...por } as never })).id;
      if (f.id && Object.keys(f.datos).length) await tx.insumoGranja.update({ where: { id }, data: { ...f.datos, ...act } });
      if (f.existencia !== null && f.existencia !== undefined) {
        await tx.movimientoInsumo.create({ data: { insumo_id: id, tipo: f.id ? "ajuste" : "saldo_inicial", cantidad: f.existencia, fecha: ahora, motivo: "CONTEO CARGADO DESDE EXCEL", creado_por: usuario } });
        await tx.insumoGranja.update({ where: { id }, data: { existencia: f.existencia, ...act } });
      }
    }
    return { creados: nuevos.length, actualizados: actualizar.length };
  }

  /* eslint-disable @typescript-eslint/no-explicit-any -- los datos ya vienen validados por `leerCatalogo` */
  const modelo: any = { proveedores: tx.proveedor, materias: tx.materiaPrima, alimentos: tx.alimento, grupos: tx.categoriaEquipo, areas: tx.areaTrabajo }[tipo];
  for (const f of nuevos) await modelo.create({ data: { ...datosDe(f), ...por } });
  for (const f of actualizar) await modelo.update({ where: { id: f.id }, data: { ...datosDe(f), ...act } });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { creados: nuevos.length, actualizados: actualizar.length };
}
