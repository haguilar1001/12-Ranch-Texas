"use client";

import Link from "next/link";

interface Aprobado {
  id: string; solicitante: string; vehiculo: string; chofer: string; horaInicio: string; horaFin: string; descripcion: string;
  origen: string; destino: string; viajeRedondo: boolean;
}
interface Completado {
  id: string; solicitante: string; vehiculo: string; km: number | null; cerrado: string;
}
interface ResumenDia { fecha: string; viajes: number; km: number }

export default function MisViajesClient({
  aprobados, completados, resumenPorDia,
}: {
  aprobados: Aprobado[]; completados: Completado[]; resumenPorDia: ResumenDia[];
}) {
  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Mis viajes</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Al volver, llena el reporte del servicio: kilometraje, horas reales y observaciones.</p>

      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Por hacer / en curso ({aprobados.length})</h2>
        {aprobados.length === 0 && <p className="text-sm text-ranch-marron/50">No tienes viajes aprobados pendientes de reportar.</p>}
        <div className="space-y-3">
          {aprobados.map((v) => (
            <div key={v.id} className="rounded-xl border-2 border-ranch-marron/15 p-3">
              <p className="font-semibold text-ranch-marron">{v.solicitante} — {v.vehiculo}</p>
              <p className="text-xs text-ranch-marron/60">{v.horaInicio} → {v.horaFin} · {v.chofer}</p>
              {(v.origen || v.destino) && (
                <p className="text-xs text-ranch-marron/60">
                  📍 {v.origen || "—"} → {v.destino || "—"}{v.viajeRedondo ? " (redondo)" : ""}
                </p>
              )}
              <p className="mt-1 text-sm text-ranch-marron/80">{v.descripcion}</p>

              <Link
                href={`/vehiculos/reporte/${v.id}`}
                className="mt-2 inline-block rounded-lg border-t border-ranch-marron/10 pt-2 text-xs font-semibold text-ranch-dorado hover:underline"
              >
                📋 Llenar reporte del servicio
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Resumen por día</h2>
        {resumenPorDia.length === 0 ? (
          <p className="text-sm text-ranch-marron/50">Sin viajes cerrados todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {resumenPorDia.map((r) => (
                <tr key={r.fecha} className="border-t border-ranch-marron/10">
                  <td className="py-1.5 capitalize text-ranch-marron">{r.fecha}</td>
                  <td className="py-1.5 text-right text-ranch-marron/60">{r.viajes} {r.viajes === 1 ? "viaje" : "viajes"}</td>
                  <td className="py-1.5 text-right font-semibold text-ranch-marron">{r.km} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Últimos cerrados</h2>
        {completados.length === 0 && <p className="text-sm text-ranch-marron/50">Aún no has cerrado ningún viaje.</p>}
        <table className="w-full text-sm">
          <tbody>
            {completados.map((c) => (
              <tr key={c.id} className="border-t border-ranch-marron/10">
                <td className="py-1.5">
                  <Link href={`/vehiculos/reporte/${c.id}`} className="hover:underline">{c.solicitante} — {c.vehiculo}</Link>
                </td>
                <td className="py-1.5 text-right text-ranch-marron/60">{c.km !== null ? `${c.km} km` : "—"}</td>
                <td className="py-1.5 text-right text-xs text-ranch-marron/45">{c.cerrado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
