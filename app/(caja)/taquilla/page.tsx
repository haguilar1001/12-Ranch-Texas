import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { obtenerSesion } from "@/lib/auth/sesion";
import { turnoAbiertoDe } from "@/lib/caja/turno";
import TaquillaClient from "./TaquillaClient";

export const dynamic = "force-dynamic";

export default async function TaquillaPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!["cajero", "supervisor", "administrador"].includes(s.rol)) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="rounded-lg bg-red-50 px-4 py-3 text-red-700">
          Tu rol ({s.rol}) no tiene acceso a taquilla.
        </p>
      </main>
    );
  }

  const turno = await turnoAbiertoDe(s.id);
  if (!turno) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="mb-2 text-2xl font-black text-ranch-marron">Taquilla</h1>
        <p className="mb-4 text-ranch-marron/70">Debes abrir un turno de caja para vender.</p>
        <Link
          href="/caja/turno"
          className="inline-block rounded-lg bg-ranch-marron px-5 py-3 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro"
        >
          Abrir turno →
        </Link>
      </main>
    );
  }

  const [tiposRaw, medios, motivos, autorizadores] = await Promise.all([
    prisma.tipoVisitante.findMany({
      where: { activo: true },
      orderBy: { orden: "asc" },
      include: { tarifas: { where: { vigente_hasta: null }, orderBy: { vigente_desde: "desc" }, take: 1 } },
    }),
    prisma.medioPago.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    prisma.motivoCortesia.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    // Catálogo editable en /admin/tarifas: no todos son usuarios de la app.
    prisma.autorizadorCortesia.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, cargo: true },
      orderBy: { nombre: "asc" },
    }),
  ]);

  const tipos = tiposRaw.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    codigo: t.codigo,
    requiere_pago: t.requiere_pago,
    valor: t.tarifas[0]?.valor ?? 0,
    icono: t.icono,
    requiere_carnet: t.requiere_carnet,
  }));

  return (
    <TaquillaClient
      cajero={s.nombre}
      caja={turno.caja.nombre}
      tipos={tipos}
      medios={medios.map((m) => ({ id: m.id, nombre: m.nombre, es_efectivo: m.es_efectivo }))}
      motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre }))}
      autorizadores={autorizadores}
    />
  );
}
