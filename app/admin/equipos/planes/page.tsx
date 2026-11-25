import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import PlanesClient from "./PlanesClient";

export const dynamic = "force-dynamic";

export default async function PlanesPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) redirect("/reportar-falla");
  const [planes, grupos, equipos] = await Promise.all([
    prisma.planMantenimiento.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      include: {
        categoria: { select: { nombre: true, _count: { select: { equipos: { where: { activo: true, estado: { not: "dado_de_baja" } } } } } } },
        equipo: { select: { nombre: true, codigo: true } },
        mantenimientos: { where: { estado: { in: ["programado", "en_proceso"] } }, select: { fecha_programada: true }, orderBy: { fecha_programada: "asc" } },
      },
    }),
    prisma.categoriaEquipo.findMany({ where: { activo: true }, select: { id: true, nombre: true, _count: { select: { equipos: { where: { activo: true } } } } }, orderBy: { nombre: "asc" } }),
    prisma.equipo.findMany({ where: { activo: true, estado: { not: "dado_de_baja" } }, select: { id: true, nombre: true, codigo: true, usa_horometro: true, categoria: { select: { nombre: true } } }, orderBy: { nombre: "asc" } }),
  ]);
  return (
    <PlanesClient
      planes={planes.map((p) => ({
        id: p.id, nombre: p.nombre, instrucciones: p.instrucciones ?? "", activo: p.activo,
        alcance: p.equipo_id ? "equipo" : "grupo", categoria_id: p.categoria_id ?? "", equipo_id: p.equipo_id ?? "",
        aplicaA: p.equipo ? `${p.equipo.nombre}${p.equipo.codigo ? ` (${p.equipo.codigo})` : ""}` : `${p.categoria?.nombre ?? "—"} (${p.categoria?._count.equipos ?? 0} equipos)`,
        frecuencia_dias: p.frecuencia_dias, frecuencia_horas: p.frecuencia_horas, aviso_dias: p.aviso_dias, costo_estimado: p.costo_estimado,
        pendientes: p.mantenimientos.length, proxima: p.mantenimientos.find((m) => m.fecha_programada)?.fecha_programada?.toISOString() ?? null,
      }))}
      grupos={grupos.map((g) => ({ id: g.id, nombre: g.nombre, equipos: g._count.equipos }))}
      equipos={equipos.map((e) => ({ id: e.id, nombre: `${e.nombre}${e.codigo ? ` (${e.codigo})` : ""}`, grupo: e.categoria.nombre, horometro: e.usa_horometro }))}
    />
  );
}
