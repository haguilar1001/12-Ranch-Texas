import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, puedeConducir, tieneRol } from "@/lib/auth/sesion";
import { formatearFechaHoraBogota } from "@/lib/tiempo";
import MisViajesClient from "./MisViajesClient";

export const dynamic = "force-dynamic";

export default async function MisViajesPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!puedeConducir(s.rol)) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Esta pantalla es para choferes.</p></main>;
  }

  // Un administrador/supervisor que entra aquí a revisar ve TODOS los viajes activos;
  // un chofer solo ve los suyos.
  const filtroChofer = tieneRol(s.rol, "supervisor") ? {} : { chofer_id: s.id };

  const [aprobadosRaw, completadosRaw] = await Promise.all([
    prisma.solicitudVehiculo.findMany({
      where: { estado: "aprobada", ...filtroChofer },
      orderBy: { hora_inicio: "asc" },
      include: { solicitante: { select: { nombre: true } }, vehiculo: { select: { placa: true } }, chofer: { select: { nombre: true } } },
    }),
    prisma.solicitudVehiculo.findMany({
      where: { estado: "completada", ...filtroChofer },
      orderBy: { cerrado_en: "desc" },
      take: 20,
      include: { solicitante: { select: { nombre: true } }, vehiculo: { select: { placa: true } } },
    }),
  ]);

  return (
    <MisViajesClient
      aprobados={aprobadosRaw.map((v) => ({
        id: v.id, solicitante: v.solicitante.nombre, vehiculo: v.vehiculo?.placa ?? "—", chofer: v.chofer?.nombre ?? "—",
        horaInicio: formatearFechaHoraBogota(v.hora_inicio), horaFin: formatearFechaHoraBogota(v.hora_fin), descripcion: v.descripcion,
      }))}
      completados={completadosRaw.map((v) => ({
        id: v.id, solicitante: v.solicitante.nombre, vehiculo: v.vehiculo?.placa ?? "—",
        km: v.km_final !== null && v.km_inicial !== null ? v.km_final - v.km_inicial : null,
        cerrado: v.cerrado_en ? formatearFechaHoraBogota(v.cerrado_en) : "—",
      }))}
    />
  );
}
