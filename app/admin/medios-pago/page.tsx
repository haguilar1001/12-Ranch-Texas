import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import MediosPagoClient from "./MediosPagoClient";

export const dynamic = "force-dynamic";

export default async function MediosPagoPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "administrador")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo los administradores pueden gestionar los medios de pago.</p></main>;
  }

  const medios = await prisma.medioPago.findMany({
    orderBy: [{ activo: "desc" }, { orden: "asc" }, { nombre: "asc" }],
    include: { _count: { select: { pagos: true } } },
  });

  return (
    <MediosPagoClient
      medios={medios.map((m) => ({
        id: m.id,
        nombre: m.nombre,
        codigo: m.codigo,
        icono: m.icono,
        es_efectivo: m.es_efectivo,
        afecta_recaudo: m.afecta_recaudo,
        orden: m.orden,
        activo: m.activo,
        usos: m._count.pagos,
      }))}
    />
  );
}
