import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { formatearFechaHoraBogota } from "@/lib/tiempo";
import TarifasClient from "./TarifasClient";

export const dynamic = "force-dynamic";

export default async function TarifasPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "administrador")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo los administradores pueden gestionar tipos y tarifas.</p></main>;
  }

  const [tiposRaw, motivosRaw, autorizadores] = await Promise.all([
    prisma.tipoVisitante.findMany({
      orderBy: [{ activo: "desc" }, { orden: "asc" }],
      include: { tarifas: { orderBy: { vigente_desde: "desc" } } },
    }),
    prisma.motivoCortesia.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      include: { _count: { select: { detalle: true } } },
    }),
    prisma.autorizadorCortesia.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, cargo: true, activo: true, usuario_id: true },
    }),
  ]);

  const motivos = motivosRaw.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    activo: m.activo,
    usos: m._count.detalle,
  }));

  const tipos = tiposRaw.map((t) => {
    const vigente = t.tarifas.find((x) => x.vigente_hasta === null) ?? t.tarifas[0] ?? null;
    return {
      id: t.id,
      codigo: t.codigo,
      nombre: t.nombre,
      requiere_pago: t.requiere_pago,
      edad_min: t.edad_min,
      edad_max: t.edad_max,
      orden: t.orden,
      activo: t.activo,
      icono: t.icono,
      requiere_carnet: t.requiere_carnet,
      valorVigente: vigente?.valor ?? 0,
      vigenteDesde: vigente ? formatearFechaHoraBogota(vigente.vigente_desde) : "—",
      historial: t.tarifas.map((x) => ({
        valor: x.valor,
        desde: formatearFechaHoraBogota(x.vigente_desde),
        hasta: x.vigente_hasta ? formatearFechaHoraBogota(x.vigente_hasta) : null,
        motivo: x.motivo_cambio ?? "",
      })),
    };
  });

  return (
    <TarifasClient
      tipos={tipos}
      motivos={motivos}
      autorizadores={autorizadores.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        cargo: a.cargo,
        activo: a.activo,
        esUsuario: a.usuario_id !== null,
      }))}
    />
  );
}
