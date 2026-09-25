import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import TaquillasClient from "./TaquillasClient";

export const dynamic = "force-dynamic";

export default async function TaquillasPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "administrador")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo los administradores pueden gestionar las taquillas.</p></main>;
  }

  const cajas = await prisma.caja.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    include: {
      _count: { select: { turnos: true } },
      turnos: { where: { estado: { in: ["abierto", "reabierto"] } }, select: { usuario: { select: { nombre: true } } }, take: 1 },
    },
  });

  return (
    <TaquillasClient
      taquillas={cajas.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        ubicacion: c.ubicacion,
        es_prueba: c.es_prueba,
        activo: c.activo,
        turnos: c._count.turnos,
        abiertaPor: c.turnos[0]?.usuario.nombre ?? null,
      }))}
    />
  );
}
