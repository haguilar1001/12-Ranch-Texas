import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { fechaBogota, horaBogota } from "@/lib/tiempo";
import { diasDelMes, rangoDe } from "../../admin/reportes/periodo";
import type { Prioridad } from "@/lib/vehiculos/calculo";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const ESTILO_ESTADO: Record<string, string> = {
  pendiente: "border-amber-300 bg-amber-50 text-amber-800",
  aprobada: "border-ranch-verde/40 bg-ranch-verde/10 text-ranch-verde",
};
const PUNTO_PRIORIDAD: Record<Prioridad, string> = { baja: "", media: "", alta: "🟠", urgente: "🔴" };

/** Día de la semana (0=domingo) de la fecha Bogotá "YYYY-MM-DD", en UTC sin ambigüedad de huso. */
function diaSemanaDe(fechaIso: string): number {
  return new Date(`${fechaIso}T12:00:00-05:00`).getUTCDay();
}

export default async function CalendarioVehiculoPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores ven el calendario de vehículos.</p></main>;
  }

  const hoy = fechaBogota();
  const sp = await searchParams;
  const periodo = rangoDe({ anio: sp.anio, mes: sp.mes }, hoy);
  const { anio, mes } = periodo;

  const solicitudes = await prisma.solicitudVehiculo.findMany({
    where: { estado: { in: ["pendiente", "aprobada"] }, hora_inicio: { gte: periodo.inicio, lt: periodo.fin } },
    orderBy: { hora_inicio: "asc" },
    include: { solicitante: { select: { nombre: true } }, vehiculo: { select: { placa: true } }, chofer: { select: { nombre: true } } },
  });

  const porDia = new Map<number, typeof solicitudes>();
  for (const sol of solicitudes) {
    const dia = parseInt(fechaBogota(sol.hora_inicio).slice(8, 10), 10);
    porDia.set(dia, [...(porDia.get(dia) ?? []), sol]);
  }

  const totalDias = diasDelMes(anio, mes);
  const primerDiaSemana = diaSemanaDe(`${anio}-${String(mes).padStart(2, "0")}-01`);
  const celdas: (number | null)[] = [...Array(primerDiaSemana).fill(null), ...Array.from({ length: totalDias }, (_, i) => i + 1)];
  while (celdas.length % 7 !== 0) celdas.push(null);

  const mesAnterior = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
  const mesSiguiente = mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
  const hoyDia = periodo.fecha === null && hoy.slice(0, 7) === `${anio}-${String(mes).padStart(2, "0")}` ? parseInt(hoy.slice(8, 10), 10) : null;

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Calendario de vehículos</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Solicitudes pendientes y aprobadas del mes. Rechazadas, canceladas y completadas no salen aquí.</p>

      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/vehiculos/calendario?anio=${mesAnterior.anio}&mes=${mesAnterior.mes}`} className="rounded-lg border border-ranch-marron/25 px-3 py-1.5 text-sm font-semibold text-ranch-marron hover:bg-white">← Anterior</Link>
        <p className="text-lg font-black capitalize text-ranch-marron">{MESES[mes - 1]} {anio}</p>
        <Link href={`/vehiculos/calendario?anio=${mesSiguiente.anio}&mes=${mesSiguiente.mes}`} className="rounded-lg border border-ranch-marron/25 px-3 py-1.5 text-sm font-semibold text-ranch-marron hover:bg-white">Siguiente →</Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs text-ranch-marron/60">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-amber-300 bg-amber-50" /> Pendiente</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-ranch-verde/40 bg-ranch-verde/10" /> Aprobada</span>
        <span>🔴 urgente · 🟠 alta</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border-2 border-ranch-marron/15 bg-white">
        <div className="grid min-w-[640px] grid-cols-7 border-b border-ranch-marron/10 bg-ranch-crema/60 text-center text-xs font-bold uppercase text-ranch-marron/60">
          {DIAS_SEMANA.map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid min-w-[640px] grid-cols-7">
          {celdas.map((dia, i) => (
            <div key={i} className={`min-h-[6.5rem] border-b border-r border-ranch-marron/10 p-1.5 [&:nth-child(7n)]:border-r-0 ${dia === null ? "bg-ranch-crema/20" : ""}`}>
              {dia !== null && (
                <>
                  <p className={`mb-1 text-xs font-bold ${dia === hoyDia ? "flex h-5 w-5 items-center justify-center rounded-full bg-ranch-dorado text-white" : "text-ranch-marron/50"}`}>{dia}</p>
                  <div className="space-y-1">
                    {(porDia.get(dia) ?? []).map((sol) => (
                      <p key={sol.id} title={sol.descripcion} className={`truncate rounded border px-1 py-0.5 text-[10px] leading-tight ${ESTILO_ESTADO[sol.estado]}`}>
                        {PUNTO_PRIORIDAD[sol.prioridad]} {horaBogota(sol.hora_inicio)} {sol.solicitante.nombre}
                        {sol.estado === "aprobada" && sol.vehiculo ? ` · ${sol.vehiculo.placa}` : ""}
                      </p>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
