import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { formatearFechaHoraBogota } from "@/lib/tiempo";
import AprobarClient from "./AprobarClient";

export const dynamic = "force-dynamic";

export default async function AprobarVehiculoPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden aprobar solicitudes de vehículo.</p></main>;
  }

  const [pendientesRaw, aprobadasRaw, vehiculos, choferes] = await Promise.all([
    prisma.solicitudVehiculo.findMany({
      where: { estado: "pendiente" },
      orderBy: [{ prioridad: "desc" }, { hora_inicio: "asc" }],
      include: { solicitante: { select: { nombre: true, cargo: true } } },
    }),
    prisma.solicitudVehiculo.findMany({
      where: { estado: "aprobada" },
      orderBy: { hora_inicio: "asc" },
      include: { solicitante: { select: { nombre: true } }, vehiculo: { select: { placa: true } }, chofer: { select: { nombre: true } } },
    }),
    prisma.vehiculo.findMany({ where: { activo: true }, select: { id: true, placa: true, marca: true, modelo: true }, orderBy: { placa: "asc" } }),
    prisma.usuario.findMany({ where: { rol: "chofer", activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  return (
    <AprobarClient
      pendientes={pendientesRaw.map((p) => ({
        id: p.id, solicitante: p.solicitante.nombre, cargo: p.solicitante.cargo,
        horaInicio: formatearFechaHoraBogota(p.hora_inicio), horaFin: formatearFechaHoraBogota(p.hora_fin),
        prioridad: p.prioridad, descripcion: p.descripcion,
        origen: p.origen, destino: p.destino, viajeRedondo: p.viaje_redondo,
      }))}
      aprobadas={aprobadasRaw.map((a) => ({
        id: a.id, solicitante: a.solicitante.nombre,
        horaInicio: formatearFechaHoraBogota(a.hora_inicio), horaFin: formatearFechaHoraBogota(a.hora_fin),
        vehiculo: a.vehiculo?.placa ?? "—", chofer: a.chofer?.nombre ?? "—",
        origen: a.origen, destino: a.destino, viajeRedondo: a.viaje_redondo,
      }))}
      vehiculos={vehiculos.map((v) => ({ id: v.id, etiqueta: `${v.placa}${v.marca ? ` · ${v.marca}` : ""}${v.modelo ? ` ${v.modelo}` : ""}` }))}
      choferes={choferes}
    />
  );
}
