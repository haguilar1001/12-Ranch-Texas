import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { fechaBogota, formatearFechaHoraCortaBogota } from "@/lib/tiempo";
import { resumirFila, esperaEstimada, textoEspera, type TurnoEnFila } from "@/lib/fila/calculo";
import OperarFilaClient from "./OperarFilaClient";

export const dynamic = "force-dynamic";

export default async function OperarFilaPage({
  searchParams,
}: {
  searchParams: Promise<{ atraccion?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "control_acceso")) return <main className="p-6">Sin acceso.</main>;

  const atracciones = await prisma.atraccion.findMany({
    where: { activa: true, fila_activa: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, cupo_por_tanda: true, minutos_por_tanda: true },
  });

  if (atracciones.length === 0) {
    return (
      <main className="mx-auto max-w-lg p-6 text-center">
        <h1 className="mb-2 text-2xl font-black text-ranch-marron">Fila</h1>
        <p className="rounded-xl border-2 border-ranch-marron/20 bg-white p-6 text-ranch-marron/60">
          Ninguna atracción tiene la fila activada. Se enciende en{" "}
          <Link href="/admin/accesos" className="underline">Accesos y atracciones</Link>.
        </p>
      </main>
    );
  }

  const sp = await searchParams;
  const actual = atracciones.find((a) => a.id === sp.atraccion) ?? atracciones[0];

  const turnos = await prisma.turnoFila.findMany({
    where: { atraccion_id: actual.id, fecha_operativa: fechaBogota() },
    orderBy: { numero: "asc" },
    include: { manilla: { select: { consecutivo: true } } },
  });

  const fila: TurnoEnFila[] = turnos.map((t) => ({ numero: t.numero, personas: t.personas, estado: t.estado }));
  const resumen = resumirFila(fila);
  const cfg = { cupo_por_tanda: actual.cupo_por_tanda, minutos_por_tanda: actual.minutos_por_tanda };

  return (
    <OperarFilaClient
      atracciones={atracciones.map((a) => ({ id: a.id, nombre: a.nombre }))}
      actual={{ id: actual.id, nombre: actual.nombre }}
      resumen={resumen}
      esperaActual={textoEspera(esperaEstimada(resumen.personasEsperando, cfg))}
      turnos={turnos.map((t) => ({
        id: t.id,
        numero: t.numero,
        personas: t.personas,
        estado: t.estado,
        manilla: t.manilla.consecutivo,
        tomado: formatearFechaHoraCortaBogota(t.tomado_en),
      }))}
    />
  );
}
