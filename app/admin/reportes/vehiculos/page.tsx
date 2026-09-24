import { redirect } from "next/navigation";
import FormularioFiltros from "../FormularioFiltros";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { indicadoresVehiculos } from "@/lib/reportes/vehiculos";
import { rangoDe, queryDe } from "../periodo";
import FiltroPeriodo from "../FiltroPeriodo";
import { fechaBogota } from "@/lib/tiempo";

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
  const ind = await indicadoresVehiculos(rango.inicio, rango.fin);
  const qs = queryDe(rango);

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

      <div className="grid gap-4 sm:grid-cols-2">
        <Agrupado titulo="Por solicitante" filas={ind.porSolicitante} />
        <Agrupado titulo="Por chofer" filas={ind.porChofer} />
        <Agrupado titulo="Por vehículo" filas={ind.porVehiculo} />
      </div>
    </main>
  );
}
