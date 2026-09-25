import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import BeneficiariosClient from "./BeneficiariosClient";

export const dynamic = "force-dynamic";

export default async function BeneficiariosPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden gestionar los beneficiarios de caja.</p></main>;
  }

  const lista = await prisma.beneficiarioCaja.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    include: { _count: { select: { movimientos: true } } },
  });

  return (
    <BeneficiariosClient
      beneficiarios={lista.map((b) => ({
        id: b.id, nombre: b.nombre, documento: b.documento, activo: b.activo, usos: b._count.movimientos,
      }))}
    />
  );
}
