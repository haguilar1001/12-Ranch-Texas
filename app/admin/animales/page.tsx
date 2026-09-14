import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { formatearBase, costoCOP, type AlimentoUnidad } from "@/lib/animales/unidades";
import { consumoBaseDiario, costoDiario, costoMensual, describirRacion, sugerenciaDeEntrega } from "@/lib/animales/racion";
import { diasDeAutonomia } from "@/lib/animales/existencia";
import { inicioDelDiaOperativo, formatearFechaHoraCortaBogota } from "@/lib/tiempo";
import AnimalesClient from "./AnimalesClient";

export const dynamic = "force-dynamic";

export default async function AnimalesPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!puedeOperarGranja(s.rol)) return <main className="p-6">Sin acceso.</main>;

  const desdeHoy = inicioDelDiaOperativo();

  const [animalesRaw, categoriasRaw, recintosRaw, alimentosRaw, racionesRaw, bitacoraRaw, empleadosRaw] = await Promise.all([
    prisma.animal.findMany({
      where: { activo: true },
      include: {
        categoria: { select: { id: true, nombre: true } },
        recinto: { select: { id: true, nombre: true, ubicacion: true } },
        traslados: { orderBy: { fecha: "desc" }, take: 5, include: { recinto_origen: { select: { nombre: true } }, recinto_destino: { select: { nombre: true } } } },
      },
      orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }],
    }),
    prisma.categoriaAnimal.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    prisma.recinto.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
    prisma.alimento.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
    prisma.racion.findMany({
      include: {
        alimento: true,
        animal: { select: { id: true, nombre: true, cantidad: true, categoria_id: true } },
        categoria: { select: { id: true, nombre: true } },
      },
      orderBy: [{ activo: "desc" }, { id: "asc" }],
    }),
    prisma.registroAlimentacion.findMany({
      orderBy: { fecha: "desc" },
      take: 60,
      include: {
        alimento: true,
        animal: { select: { nombre: true } },
        categoria: { select: { nombre: true } },
        recinto: { select: { nombre: true } },
      },
    }),
    prisma.empleado.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  // Censo por categoría, para las raciones que se definen a nivel de categoría.
  const cabezasPorCategoria = new Map<string, number>();
  for (const a of animalesRaw) {
    cabezasPorCategoria.set(a.categoria_id, (cabezasPorCategoria.get(a.categoria_id) ?? 0) + a.cantidad);
  }

  const unidadDe = (a: { unidad_medida: string; equivalencia_g: number | null; costo_unitario: number | null }): AlimentoUnidad => ({
    unidad_medida: a.unidad_medida,
    equivalencia_g: a.equivalencia_g,
    costo_unitario: a.costo_unitario,
  });

  // ---- Raciones con su cálculo (aquí vive la regla individual vs. grupal).
  const consumoDiarioPorAlimento = new Map<string, number>();
  const raciones = racionesRaw.map((r) => {
    const cabezas = r.animal ? r.animal.cantidad : cabezasPorCategoria.get(r.categoria_animal_id ?? "") ?? 0;
    const calc = { cantidad: r.cantidad, unidad: r.unidad, modo: r.modo, frecuencia: r.frecuencia };
    const al = unidadDe(r.alimento);
    const diario = consumoBaseDiario(calc, cabezas, al);
    if (r.activo && diario) {
      consumoDiarioPorAlimento.set(r.alimento_id, (consumoDiarioPorAlimento.get(r.alimento_id) ?? 0) + diario);
    }
    return {
      id: r.id,
      destino: r.animal?.nombre ?? r.categoria?.nombre ?? "—",
      esGrupo: !!r.animal,
      destino_id: r.animal?.id ?? r.categoria?.id ?? "",
      alimento_id: r.alimento_id,
      alimento: r.alimento.nombre,
      cantidad: r.cantidad,
      unidad: r.unidad,
      modo: r.modo,
      frecuencia: r.frecuencia,
      horario: r.horario,
      observaciones: r.observaciones,
      activo: r.activo,
      cabezas,
      resumen: describirRacion(calc),
      diarioTexto: diario === null ? null : formatearBase(diario, al),
      sugerido: sugerenciaDeEntrega(calc, cabezas, al),
      costoDiario: costoDiario(calc, cabezas, al),
      costoMensual: costoMensual(calc, cabezas, al),
    };
  });

  // ---- Alimentos con existencia y autonomía.
  const alimentos = alimentosRaw.map((a) => {
    const al = unidadDe(a);
    const consumo = consumoDiarioPorAlimento.get(a.id) ?? 0;
    return {
      id: a.id,
      nombre: a.nombre,
      tipo: a.tipo,
      unidad_medida: a.unidad_medida,
      costo_unitario: a.costo_unitario,
      equivalencia_g: a.equivalencia_g,
      existencia_base: a.existencia_base,
      existenciaTexto: a.existencia_base === null ? null : formatearBase(a.existencia_base, al),
      valorExistencia: a.existencia_base === null ? null : costoCOP(a.existencia_base, al),
      consumoDiarioTexto: consumo > 0 ? formatearBase(consumo, al) : null,
      costoDiario: consumo > 0 ? costoCOP(consumo, al) : null,
      autonomiaDias: diasDeAutonomia(a.existencia_base, consumo),
      convertible: a.equivalencia_g !== null || ["kg", "g", "litro", "l", "ml", "unidad"].includes(a.unidad_medida.toLowerCase()),
      activo: a.activo,
    };
  });

  // ---- Recintos con su ocupación.
  const ocupacion = new Map<string, number>();
  for (const a of animalesRaw) {
    if (a.recinto_id) ocupacion.set(a.recinto_id, (ocupacion.get(a.recinto_id) ?? 0) + a.cantidad);
  }
  const recintos = recintosRaw.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo,
    ubicacion: r.ubicacion,
    capacidad: r.capacidad,
    descripcion: r.descripcion,
    activo: r.activo,
    ocupacion: ocupacion.get(r.id) ?? 0,
    grupos: animalesRaw.filter((a) => a.recinto_id === r.id).length,
  }));

  // ---- Animales.
  const animales = animalesRaw.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    codigo: a.codigo,
    categoria_id: a.categoria_id,
    categoria: a.categoria.nombre,
    recinto_id: a.recinto_id,
    recinto: a.recinto?.nombre ?? null,
    ubicacion: a.recinto?.ubicacion ?? null,
    cantidad: a.cantidad,
    especie: a.especie,
    raza: a.raza,
    sexo: a.sexo,
    estado: a.estado,
    observaciones: a.observaciones,
    raciones: raciones.filter((r) => (r.esGrupo && r.destino_id === a.id) || (!r.esGrupo && r.destino_id === a.categoria_id)).length,
    historial: a.traslados.map((t) => ({
      fecha: formatearFechaHoraCortaBogota(t.fecha),
      origen: t.recinto_origen?.nombre ?? null,
      destino: t.recinto_destino.nombre,
      cantidad: t.cantidad,
      motivo: t.motivo,
    })),
  }));

  // ---- Bitácora.
  const bitacora = bitacoraRaw.map((b) => {
    const al = unidadDe(b.alimento);
    return {
      id: b.id,
      fecha: formatearFechaHoraCortaBogota(b.fecha),
      destino: b.animal?.nombre ?? b.categoria?.nombre ?? "—",
      recinto: b.recinto?.nombre ?? null,
      alimento: b.alimento.nombre,
      entregadaTexto: formatearBase(b.cantidad_entregada, al),
      planeadaTexto: b.cantidad_planeada === null ? null : formatearBase(b.cantidad_planeada, al),
      cumple: b.cantidad_planeada === null ? null : b.cantidad_entregada >= b.cantidad_planeada,
      costo: b.costo,
      estado: b.estado,
      motivo: b.motivo,
      observaciones: b.observaciones,
      anulado: b.anulado,
      motivo_anulacion: b.motivo_anulacion,
      automatico: b.automatico,
      franja: b.franja,
    };
  });

  const registrosHoy = bitacoraRaw.filter((b) => b.fecha >= desdeHoy && !b.anulado);
  const racionesDiariasActivas = racionesRaw.filter((r) => r.activo && r.frecuencia === "diaria").length;

  const kpis = {
    cabezas: animalesRaw.reduce((t, a) => t + a.cantidad, 0),
    grupos: animalesRaw.length,
    sinUbicacion: animalesRaw.filter((a) => !a.recinto_id).length,
    recintos: recintosRaw.filter((r) => r.activo).length,
    costoDiario: raciones.filter((r) => r.activo).reduce((t, r) => t + (r.costoDiario ?? 0), 0),
    costoMensual: raciones.filter((r) => r.activo).reduce((t, r) => t + (r.costoMensual ?? 0), 0),
    entregasHoy: registrosHoy.length,
    costoHoy: registrosHoy.reduce((t, b) => t + (b.costo ?? 0), 0),
    racionesDiariasActivas,
  };

  return (
    <AnimalesClient
      esAdmin={tieneRol(s.rol, "administrador")}
      esSupervisor={tieneRol(s.rol, "supervisor")}
      kpis={kpis}
      animales={animales}
      categorias={categoriasRaw.map((c) => ({ id: c.id, nombre: c.nombre }))}
      recintos={recintos}
      alimentos={alimentos}
      raciones={raciones}
      bitacora={bitacora}
      empleados={empleadosRaw}
    />
  );
}
