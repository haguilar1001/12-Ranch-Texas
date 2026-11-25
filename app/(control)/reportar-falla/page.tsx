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
      select: { id: true, descripcion: true, estado: true, prioridad: true, creado_en: true, equipo: { select: { nombre: true } } },
    }),
  ]);
  return (
    <ReportarFallaClient
      equipos={equipos.map((e) => ({ id: e.id, nombre: e.nombre, codigo: e.codigo, grupo: e.categoria.nombre, ubicacion: e.ubicacion, estado: e.estado }))}
      mias={mias.map((m) => ({ id: m.id, equipo: m.equipo.nombre, descripcion: m.descripcion, estado: m.estado, prioridad: m.prioridad, fecha: m.creado_en.toISOString() }))}
    />
  );
}
