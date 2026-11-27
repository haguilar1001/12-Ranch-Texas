import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion } from "@/lib/auth/sesion";
import ReportarFallaClient from "./ReportarFallaClient";

export const dynamic = "force-dynamic";

// Cualquier usuario reporta la falla de un equipo desde el celular. El supervisor la atiende en
// Equipos → Mantenimiento.
export default async function ReportarFallaPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  const [equipos, mias] = await Promise.all([
    prisma.equipo.findMany({
      where: { activo: true, estado: { not: "dado_de_baja" }, cantidad: { gt: 0 } },
      select: { id: true, nombre: true, codigo: true, ubicacion: true, estado: true, categoria: { select: { nombre: true } } },
      orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }],
    }),
    prisma.reporteFalla.findMany({
      where: { creado_por: s.id }, orderBy: { creado_en: "desc" }, take: 8,
      select: {
        id: true, descripcion: true, solucion_sugerida: true, estado: true, prioridad: true, equipo_detenido: true, creado_en: true,
        fotos: { select: { id: true }, orderBy: { creado_en: "asc" } },
        equipo: { select: { nombre: true, codigo: true, ubicacion: true, categoria: { select: { nombre: true } } } },
      },
    }),
  ]);
  return (
    <ReportarFallaClient
      equipos={equipos.map((e) => ({ id: e.id, nombre: e.nombre, codigo: e.codigo, grupo: e.categoria.nombre, ubicacion: e.ubicacion, estado: e.estado }))}
      usuario={s.nombre}
      mias={mias.map((m) => ({
        id: m.id, equipo: m.equipo.nombre, codigo: m.equipo.codigo, grupo: m.equipo.categoria.nombre, ubicacion: m.equipo.ubicacion,
        descripcion: m.descripcion, solucion: m.solucion_sugerida, estado: m.estado, prioridad: m.prioridad, detenido: m.equipo_detenido, fotos: m.fotos.length, fotoIds: m.fotos.map((f) => f.id), fecha: m.creado_en.toISOString(),
      }))}
    />
  );
}
