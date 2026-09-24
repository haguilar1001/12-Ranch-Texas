import { redirect } from "next/navigation";
import Link from "next/link";
import FormularioFiltros from "../FormularioFiltros";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { indicadoresVehiculos } from "@/lib/reportes/vehiculos";
import { kmRecorridos } from "@/lib/vehiculos/calculo";
import { rangoDe, queryDe } from "../periodo";
import FiltroPeriodo from "../FiltroPeriodo";
import { fechaBogota, formatearFechaHoraBogota } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border-2 border-ranch-marron/20 bg-white p-3 text-center">
      <p className="text-xs text-ranch-marron/60">{label}</p>
      <p className="text-lg font-black text-ranch-marron">{valor}</p>
      {sub && <p className="text-xs text-ranch-marron/45">{sub}</p>}
    </div>
  );
}

function Agrupado({ titulo, filas }: { titulo: string; filas: { nombre: string; viajes: number; km: number }[] }) {
  const maxViajes = Math.max(1, ...filas.map((f) => f.viajes));
  return (
    <section className="rounded-xl border-2 border-ranch-marron/20 bg-white">
      <header className="border-b border-ranch-marron/15 px-4 py-2.5">
        <h2 className="font-bold text-ranch-marron">{titulo}</h2>
      </header>
      {filas.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ranch-marron/40">Sin datos.</p>
      ) : (
        <ul className="divide-y divide-ranch-marron/10">
          {filas.map((f) => (
            <li key={f.nombre} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm leading-snug text-ranch-marron/85">{f.nombre}</span>
                <span className="whitespace-nowrap text-sm font-bold tabular-nums text-ranch-marron">{f.km} km</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ranch-marron/10">
                  <div className="h-full rounded-full bg-ranch-dorado" style={{ width: `${(f.viajes / maxViajes) * 100}%` }} />
                </div>
                <span className="w-20 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-ranch-marron/50">
                  {f.viajes} {f.viajes === 1 ? "viaje" : "viajes"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ReporteVehiculosPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string; fecha?: string; dia?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const hoy = fechaBogota();
  const sp = await searchParams;
  const rango = rangoDe({ fecha: sp.fecha, anio: sp.anio, mes: sp.mes, dia: sp.dia }, hoy);
  const [ind, detalleRaw] = await Promise.all([
    indicadoresVehiculos(rango.inicio, rango.fin),
    prisma.solicitudVehiculo.findMany({
      where: { estado: "completada", cerrado_en: { gte: rango.inicio, lt: rango.fin } },
      orderBy: { cerrado_en: "desc" },
      include: { solicitante: { select: { nombre: true } }, vehiculo: { select: { placa: true } }, chofer: { select: { nombre: true } } },
    }),
  ]);
  const qs = queryDe(rango);
  // El reporte individual (con observaciones del chofer) es de supervisor hacia arriba;
  // "consulta" ve el resumen y el detalle de esta tabla, pero no entra a cada reporte.
  const puedeVerReporte = tieneRol(s.rol, "supervisor");
  const detalle = detalleRaw.map((v) => ({
    id: v.id,
    cerrado: v.cerrado_en ? formatearFechaHoraBogota(v.cerrado_en) : "—",
    solicitante: v.solicitante.nombre,
    chofer: v.chofer?.nombre ?? "—",
    vehiculo: v.vehiculo?.placa ?? "—",
    km: kmRecorridos(v.km_inicial, v.km_final),
    horaReal: v.hora_inicio_real && v.hora_fin_real
      ? `${formatearFechaHoraBogota(v.hora_inicio_real)} → ${formatearFechaHoraBogota(v.hora_fin_real)}`
      : "—",
  }));

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Control Vehículo — uso</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Viajes ya cerrados por el chofer (con kilometraje), agrupados por quién más lo pide, quién más maneja y qué vehículo más rueda.</p>

      <FormularioFiltros className="mb-4 flex flex-wrap gap-2 text-sm">
        <FiltroPeriodo anio={rango.anio} mes={rango.mes} fecha={rango.fecha} hoy={hoy} />
        <a href={`/admin/reportes/vehiculos/csv?${qs}`} className="rounded bg-ranch-verde px-3 py-1 font-semibold text-white">⬇️ Excel</a>
      </FormularioFiltros>

      <p className="mb-2 text-sm capitalize text-ranch-marron/60">{rango.etiqueta}</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Viajes cerrados" valor={String(ind.totalViajes)} />
        <Kpi label="Kilómetros recorridos" valor={`${ind.kmTotales} km`} />
        <Kpi label="Quién más pide" valor={ind.porSolicitante[0]?.nombre ?? "—"} sub={ind.porSolicitante[0] ? `${ind.porSolicitante[0].viajes} viajes` : undefined} />
        <Kpi label="Quién más maneja" valor={ind.porChofer[0]?.nombre ?? "—"} sub={ind.porChofer[0] ? `${ind.porChofer[0].km} km` : undefined} />
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Agrupado titulo="Por solicitante" filas={ind.porSolicitante} />
        <Agrupado titulo="Por chofer" filas={ind.porChofer} />
        <Agrupado titulo="Por vehículo" filas={ind.porVehiculo} />
      </div>

      <h2 className="mb-2 font-bold text-ranch-marron">Detalle — reportes del servicio</h2>
      <div className="overflow-x-auto rounded-2xl border-2 border-ranch-marron/15 bg-white">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="bg-ranch-crema/60 text-xs uppercase text-ranch-marron/60">
            <tr>
              <th className="px-3 py-2">Cerrado</th>
              <th className="px-3 py-2">Solicitante</th>
              <th className="px-3 py-2">Chofer</th>
              <th className="px-3 py-2">Vehículo</th>
              <th className="px-3 py-2 text-right">Km</th>
              <th className="px-3 py-2">Hora real</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {detalle.map((d) => (
              <tr key={d.id} className="border-t border-ranch-marron/10">
                <td className="px-3 py-2 text-ranch-marron/60">{d.cerrado}</td>
                <td className="px-3 py-2 font-semibold text-ranch-marron">{d.solicitante}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{d.chofer}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{d.vehiculo}</td>
                <td className="px-3 py-2 text-right font-bold text-ranch-marron">{d.km} km</td>
                <td className="px-3 py-2 text-xs text-ranch-marron/50">{d.horaReal}</td>
                <td className="px-3 py-2">
                  {puedeVerReporte && <Link href={`/vehiculos/reporte/${d.id}`} className="text-xs font-semibold text-ranch-dorado hover:underline">Ver reporte →</Link>}
                </td>
              </tr>
            ))}
            {detalle.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-ranch-marron/50">No hubo viajes cerrados en el período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
