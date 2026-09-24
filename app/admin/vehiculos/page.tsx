import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import VehiculosClient from "./VehiculosClient";

export const dynamic = "force-dynamic";

export default async function VehiculosPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "administrador")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo los administradores pueden gestionar vehículos y solicitantes.</p></main>;
  }

  const [vehiculosRaw, solicitantesRaw, choferes] = await Promise.all([
    prisma.vehiculo.findMany({
      orderBy: [{ activo: "desc" }, { placa: "asc" }],
      include: { chofer_habitual: { select: { nombre: true } } },
    }),
    prisma.solicitanteVehiculo.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      include: { _count: { select: { solicitudes: true } } },
    }),
    prisma.usuario.findMany({ where: { rol: "chofer", activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  return (
    <VehiculosClient
      vehiculos={vehiculosRaw.map((v) => ({
        id: v.id, placa: v.placa, marca: v.marca, modelo: v.modelo, activo: v.activo,
        chofer_habitual_id: v.chofer_habitual_id, choferHabitualNombre: v.chofer_habitual?.nombre ?? null,
      }))}
      solicitantes={solicitantesRaw.map((sol) => ({ id: sol.id, nombre: sol.nombre, cargo: sol.cargo, activo: sol.activo, usos: sol._count.solicitudes }))}
      choferes={choferes}
    />
  );
}
