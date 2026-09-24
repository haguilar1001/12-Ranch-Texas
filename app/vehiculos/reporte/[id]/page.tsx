import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { obtenerSesion, puedeConducir, tieneRol } from "@/lib/auth/sesion";
import { formatearFechaHoraBogota } from "@/lib/tiempo";
import { kmRecorridos } from "@/lib/vehiculos/calculo";
import ReporteServicioForm from "./ReporteServicioForm";

export const dynamic = "force-dynamic";

export default async function ReporteServicioPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!puedeConducir(s.rol)) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Esta pantalla es para choferes.</p></main>;
  }

  const { id } = await params;
  const sol = await prisma.solicitudVehiculo.findUnique({
    where: { id },
    include: { solicitante: { select: { nombre: true } }, vehiculo: { select: { placa: true } }, chofer: { select: { nombre: true } } },
  });
  if (!sol) return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Viaje no encontrado.</p></main>;
  if (sol.chofer_id !== s.id && !tieneRol(s.rol, "administrador")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Este viaje no te fue asignado a ti.</p></main>;
  }

  const contexto = {
    solicitante: sol.solicitante.nombre,
    vehiculo: sol.vehiculo?.placa ?? "—",
    chofer: sol.chofer?.nombre ?? "—",
    horaInicio: formatearFechaHoraBogota(sol.hora_inicio),
    horaFin: formatearFechaHoraBogota(sol.hora_fin),
    origen: sol.origen,
    destino: sol.destino,
    viajeRedondo: sol.viaje_redondo,
    descripcion: sol.descripcion,
  };

  if (sol.estado === "completada") {
    const km = kmRecorridos(sol.km_inicial, sol.km_final);
    return (
      <main className="mx-auto max-w-lg p-4 sm:p-6">
        <h1 className="mb-1 text-2xl font-black text-ranch-marron">Reporte del servicio</h1>
        <p className="mb-4 text-sm text-ranch-marron/60">Este viaje ya quedó cerrado. Esto fue lo que se reportó.</p>
        <Contexto {...contexto} />
        <div className="mt-4 space-y-2 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4 text-sm">
          <p><strong className="text-ranch-marron">Kilometraje:</strong> {sol.km_inicial ?? "—"} → {sol.km_final ?? "—"} ({km} km)</p>
          <p><strong className="text-ranch-marron">Hora real:</strong> {sol.hora_inicio_real ? formatearFechaHoraBogota(sol.hora_inicio_real) : "—"} → {sol.hora_fin_real ? formatearFechaHoraBogota(sol.hora_fin_real) : "—"}</p>
          <p><strong className="text-ranch-marron">Observaciones:</strong> {sol.observaciones || "Sin observaciones."}</p>
        </div>
        <Link href="/vehiculos/mis-viajes" className="mt-4 inline-block text-sm font-semibold text-ranch-dorado hover:underline">← Volver a Mis viajes</Link>
      </main>
    );
  }

  if (sol.estado !== "aprobada") {
    return <main className="p-6"><p className="rounded bg-amber-50 px-4 py-3 text-amber-800">Este viaje no está aprobado: no hay nada que reportar todavía.</p></main>;
  }

  return (
    <main className="mx-auto max-w-lg p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Reporte del servicio</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Llénalo al devolver el vehículo.</p>
      <Contexto {...contexto} />
      <ReporteServicioForm id={sol.id} />
    </main>
  );
}

function Contexto({
  solicitante, vehiculo, chofer, horaInicio, horaFin, origen, destino, viajeRedondo, descripcion,
}: {
  solicitante: string; vehiculo: string; chofer: string; horaInicio: string; horaFin: string;
  origen: string; destino: string; viajeRedondo: boolean; descripcion: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-ranch-marron/15 bg-ranch-crema/40 p-4 text-sm">
      <p className="font-semibold text-ranch-marron">{solicitante} — {vehiculo} · {chofer}</p>
      <p className="text-xs text-ranch-marron/60">Planeado: {horaInicio} → {horaFin}</p>
      {(origen || destino) && (
        <p className="text-xs text-ranch-marron/60">📍 {origen || "—"} → {destino || "—"}{viajeRedondo ? " (redondo)" : ""}</p>
      )}
      <p className="mt-1 text-ranch-marron/80">{descripcion}</p>
    </div>
  );
}
