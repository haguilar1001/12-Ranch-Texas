// Datos de los reportes de inventario imprimibles (Reportes → Inventarios).
// Todo sale de lo que ya guarda la app: cabezas y unidades recalculadas desde su kardex,
// existencia del alimento desde su kardex y costo de la dieta con las raciones activas.

import { prisma } from "@/lib/db";
import { consumoBaseDiario, costoMensual } from "@/lib/animales/racion";
import { baseporUnidadCompra, costoCOP } from "@/lib/animales/unidades";
import { resumirPorTipo, ETIQUETA_ANIMAL, ETIQUETA_EQUIPO, type TipoMovAnimal, type TipoMovEquipo } from "@/lib/inventario/kardex";

export interface Novedad { tipo: string; movimientos: number; cantidad: number; valor: number }

async function racionesConCalculo() {
  const [raciones, grupos] = await Promise.all([
    prisma.racion.findMany({ where: { activo: true }, include: { alimento: true, animal: true, categoria: true } }),
    prisma.animal.findMany({ where: { activo: true }, select: { categoria_id: true, cantidad: true } }),
  ]);
  const porCat = new Map<string, number>();
  for (const g of grupos) porCat.set(g.categoria_id, (porCat.get(g.categoria_id) ?? 0) + g.cantidad);
  return raciones.map((r) => {
    const cabezas = r.animal ? r.animal.cantidad : porCat.get(r.categoria_animal_id ?? "") ?? 0;
    const calc = { cantidad: r.cantidad, unidad: r.unidad, modo: r.modo, frecuencia: r.frecuencia };
    return {
      r,
      cabezas,
      diarioBase: consumoBaseDiario(calc, cabezas, r.alimento) ?? 0,
      costoMes: costoMensual(calc, cabezas, r.alimento) ?? 0,
    };
  });
}

// ------------------------------------------------------------------ ANIMALES

export async function reporteAnimales(desde: Date, hasta: Date) {
  const [animales, raciones, movs] = await Promise.all([
    prisma.animal.findMany({
      where: { activo: true },
      include: { categoria: { select: { nombre: true } }, recinto: { select: { nombre: true } } },
      orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }],
    }),
    racionesConCalculo(),
    prisma.movimientoAnimal.findMany({
      where: { fecha: { gte: desde, lt: hasta }, tipo: { notIn: ["saldo_inicial", "traslado_entrada", "traslado_salida"] } },
      select: { tipo: true, cantidad: true, valor: true, anulado: true },
    }),
  ]);

  const costoGrupo = new Map<string, number>();
  const costoCategoria = new Map<string, number>();
  for (const x of raciones) {
    if (x.r.animal_id) costoGrupo.set(x.r.animal_id, (costoGrupo.get(x.r.animal_id) ?? 0) + x.costoMes);
    else if (x.r.categoria_animal_id) costoCategoria.set(x.r.categoria_animal_id, (costoCategoria.get(x.r.categoria_animal_id) ?? 0) + x.costoMes);
  }

  // Los grupos en 0 (muertos, vendidos) no son inventario: solo se cuentan aparte.
  const vivos = animales.filter((a) => a.cantidad > 0);
  const categorias = new Map<string, { nombre: string; cabezas: number; costoMes: number; grupos: Array<{ nombre: string; especie: string | null; recinto: string | null; cabezas: number; estado: string; costoMes: number; observaciones: string | null }> }>();
  for (const a of vivos) {
    const c = categorias.get(a.categoria_id) ?? { nombre: a.categoria.nombre, cabezas: 0, costoMes: costoCategoria.get(a.categoria_id) ?? 0, grupos: [] };
    const costo = costoGrupo.get(a.id) ?? 0;
    c.cabezas += a.cantidad;
    c.costoMes += costo;
    c.grupos.push({ nombre: a.nombre, especie: a.especie, recinto: a.recinto?.nombre ?? null, cabezas: a.cantidad, estado: a.estado, costoMes: costo, observaciones: a.observaciones });
    categorias.set(a.categoria_id, c);
  }

  const novedades: Novedad[] = resumirPorTipo(movs).map((n) => ({ ...n, tipo: ETIQUETA_ANIMAL[n.tipo as TipoMovAnimal] ?? n.tipo }));
  return {
    categorias: [...categorias.values()],
    totalCabezas: vivos.reduce((t, a) => t + a.cantidad, 0),
    totalGrupos: vivos.length,
    enCero: animales.length - vivos.length,
    costoMes: raciones.reduce((t, x) => t + x.costoMes, 0),
    novedades,
  };
}

// ----------------------------------------------------------------- ALIMENTOS

export async function reporteAlimentos(diasCompra: number) {
  const [alimentos, raciones] = await Promise.all([
    prisma.alimento.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    racionesConCalculo(),
  ]);
  const diario = new Map<string, number>();
  for (const x of raciones) diario.set(x.r.alimento_id, (diario.get(x.r.alimento_id) ?? 0) + x.diarioBase);

  const filas = alimentos.map((a) => {
    const porUnidad = baseporUnidadCompra(a) ?? 0;
    const existencia = a.existencia_base ?? 0;
    const consumoDia = diario.get(a.id) ?? 0;
    const necesario = consumoDia * diasCompra;
    const faltante = Math.max(0, necesario - Math.max(0, existencia));
    const comprar = porUnidad > 0 ? Math.ceil(faltante / porUnidad) : 0; // unidades de compra enteras
    return {
      nombre: a.nombre,
      tipo: a.tipo,
      presentacion: a.unidad_medida,
      porUnidad,
      costoUnitario: a.costo_unitario,
      existencia,
      existenciaUnidades: porUnidad > 0 ? existencia / porUnidad : null,
      valor: existencia > 0 ? costoCOP(existencia, a) ?? 0 : 0,
      consumoDia,
      consumoDiaUnidades: porUnidad > 0 ? consumoDia / porUnidad : null,
      dias: consumoDia > 0 ? Math.floor(Math.max(0, existencia) / consumoDia) : null,
      comprar,
      costoCompra: comprar * (a.costo_unitario ?? 0),
    };
  });
  return {
    filas,
    valorBodega: filas.reduce((t, f) => t + f.valor, 0),
    costoDia: raciones.reduce((t, x) => t + x.costoMes, 0) / 30,
    totalCompra: filas.reduce((t, f) => t + f.costoCompra, 0),
  };
}

// -------------------------------------------------------------------- DIETAS

export async function reporteDietas() {
  const raciones = await racionesConCalculo();
  const filas = raciones
    .map((x) => ({
      destino: x.r.animal ? x.r.animal.nombre : `${x.r.categoria?.nombre ?? "?"} (categoría)`,
      cabezas: x.cabezas,
      alimento: x.r.alimento.nombre,
      cantidad: x.r.cantidad,
      unidad: x.r.unidad,
      modo: x.r.modo === "individual" ? "por animal" : "al lote",
      frecuencia: x.r.frecuencia,
      consumoLibre: (x.r.horario ?? "").trim().toUpperCase() === "CONSUMO LIBRE",
      diarioBase: x.diarioBase,
      costoMes: x.costoMes,
      obs: x.r.observaciones,
    }))
    .sort((a, b) => a.destino.localeCompare(b.destino) || a.alimento.localeCompare(b.alimento));
  return { filas, costoMes: filas.reduce((t, f) => t + f.costoMes, 0) };
}

// ------------------------------------------------------------------- EQUIPOS

export async function reporteEquipos(desde: Date, hasta: Date) {
  const [equipos, movs] = await Promise.all([
    prisma.equipo.findMany({
      where: { activo: true, cantidad: { gt: 0 } },
      include: {
        categoria: { select: { nombre: true } },
        area: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
      },
      orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }],
    }),
    prisma.movimientoEquipo.findMany({
      where: { fecha: { gte: desde, lt: hasta }, tipo: { notIn: ["saldo_inicial", "traslado_entrada", "traslado_salida", "traslado"] } },
      select: { tipo: true, cantidad: true, valor: true, anulado: true },
    }),
  ]);

  const grupos = new Map<string, { nombre: string; unidades: number; valor: number; equipos: Array<{
    codigo: string | null; nombre: string; marcaRef: string; ubicacion: string; estado: string; cantidad: number;
    valorUnitario: number | null; valorTotal: number; responsable: string | null; garantia: Date | null;
  }> }>();
  for (const e of equipos) {
    const g = grupos.get(e.categoria_id) ?? { nombre: e.categoria.nombre, unidades: 0, valor: 0, equipos: [] };
    const total = (e.valor_compra ?? 0) * e.cantidad;
    g.unidades += e.cantidad;
    g.valor += total;
    g.equipos.push({
      codigo: e.codigo,
      nombre: e.nombre,
      marcaRef: [e.marca, e.referencia ?? e.modelo].filter(Boolean).join(" · "),
      ubicacion: [e.area?.nombre, e.ubicacion].filter(Boolean).join(" · "),
      estado: e.estado,
      cantidad: e.cantidad,
      valorUnitario: e.valor_compra,
      valorTotal: total,
      responsable: e.responsable?.nombre ?? null,
      garantia: e.garantia_hasta,
    });
    grupos.set(e.categoria_id, g);
  }
  const lista = [...grupos.values()];
  const porEstado = new Map<string, number>();
  for (const e of equipos) porEstado.set(e.estado, (porEstado.get(e.estado) ?? 0) + e.cantidad);
  return {
    grupos: lista,
    registros: equipos.length,
    unidades: lista.reduce((t, g) => t + g.unidades, 0),
    valor: lista.reduce((t, g) => t + g.valor, 0),
    porEstado: [...porEstado.entries()].map(([estado, unidades]) => ({ estado, unidades })),
    novedades: resumirPorTipo(movs).map((n) => ({ ...n, tipo: ETIQUETA_EQUIPO[n.tipo as TipoMovEquipo] ?? n.tipo })) as Novedad[],
  };
}
