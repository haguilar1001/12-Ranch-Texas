import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import SolicitarClient from "./SolicitarClient";

export const dynamic = "force-dynamic";

export default async function SolicitarVehiculoPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden registrar una solicitud de vehículo.</p></main>;
  }

  const solicitantes = await prisma.solicitanteVehiculo.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, cargo: true },
    orderBy: { nombre: "asc" },
  });

  if (solicitantes.length === 0) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-amber-800">Todavía no hay solicitantes en el catálogo.</p>
        <Link href="/admin/vehiculos" className="inline-block rounded-lg bg-ranch-marron px-5 py-3 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro">
          Agregar solicitantes →
        </Link>
      </main>
    );
  }

  return <SolicitarClient solicitantes={solicitantes} hoy={fechaBogota()} />;
}
