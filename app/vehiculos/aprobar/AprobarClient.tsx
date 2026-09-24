"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { aprobarSolicitud, rechazarSolicitud, cancelarSolicitud } from "../actions";
import type { Prioridad } from "@/lib/vehiculos/calculo";

interface Pendiente {
  id: string; solicitante: string; cargo: string | null; horaInicio: string; horaFin: string;
  prioridad: Prioridad; descripcion: string; origen: string; destino: string; viajeRedondo: boolean;
}
interface Aprobada {
  id: string; solicitante: string; horaInicio: string; horaFin: string; vehiculo: string; chofer: string;
  origen: string; destino: string; viajeRedondo: boolean;
}
interface Opcion { id: string; etiqueta?: string; nombre?: string }

const ESTILO_PRIORIDAD: Record<Prioridad, string> = {
  baja: "bg-ranch-crema text-ranch-marron/60",
  media: "bg-sky-100 text-sky-700",
  alta: "bg-amber-100 text-amber-700",
  urgente: "bg-red-100 text-red-700",
};
const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = { baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente" };

export default function AprobarClient({
  pendientes, aprobadas, vehiculos, choferes,
}: {
  pendientes: Pendiente[]; aprobadas: Aprobada[]; vehiculos: Opcion[]; choferes: Opcion[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [asignar, setAsignar] = useState<{ id: string; vehiculo_id: string; chofer_id: string } | null>(null);
  const [rechazar, setRechazar] = useState<{ id: string; motivo: string } | null>(null);
  const [cancelar, setCancelar] = useState<{ id: string; motivo: string } | null>(null);

  async function ejecutar<T extends { ok: boolean; error?: string }>(accion: () => Promise<T>, exito: string): Promise<T | null> {
    setBusy(true);
    try {
      const r = await accion();
      setMsg({ ok: r.ok, t: r.ok ? exito : r.error ?? "Error" });
      if (r.ok) router.refresh();
      return r;
    } catch {
      setMsg({ ok: false, t: "No se pudo guardar. Revisa la conexión y vuelve a intentarlo." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Aprobar solicitudes de vehículo</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Asigna vehículo y chofer para aprobar, o rechaza con motivo.</p>

      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Pendientes ({pendientes.length})</h2>
        {pendientes.length === 0 && <p className="text-sm text-ranch-marron/50">No hay solicitudes pendientes.</p>}
        <div className="space-y-3">
          {pendientes.map((p) => (
            <div key={p.id} className="rounded-xl border-2 border-ranch-marron/15 p-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ranch-marron">{p.solicitante}{p.cargo ? ` · ${p.cargo}` : ""}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ESTILO_PRIORIDAD[p.prioridad]}`}>{ETIQUETA_PRIORIDAD[p.prioridad]}</span>
              </div>
              <p className="text-xs text-ranch-marron/60">{p.horaInicio} → {p.horaFin}</p>
              {(p.origen || p.destino) && (
                <p className="text-xs text-ranch-marron/60">
                  📍 {p.origen || "—"} → {p.destino || "—"}{p.viajeRedondo ? " (redondo)" : ""}
                </p>
              )}
              <p className="mt-1 text-sm text-ranch-marron/80">{p.descripcion}</p>

              {asignar?.id === p.id ? (
                <div className="mt-2 space-y-1.5 border-t border-ranch-marron/10 pt-2">
                  <select value={asignar.vehiculo_id} onChange={(e) => setAsignar({ ...asignar, vehiculo_id: e.target.value })} className="w-full rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-sm">
                    <option value="">Vehículo…</option>
                    {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.etiqueta}</option>)}
                  </select>
                  <select value={asignar.chofer_id} onChange={(e) => setAsignar({ ...asignar, chofer_id: e.target.value })} className="w-full rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-sm">
                    <option value="">Chofer…</option>
                    {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <div className="flex gap-1.5">
                    <button
                      disabled={busy}
                      onClick={async () => {
                        const r = await ejecutar(() => aprobarSolicitud(p.id, asignar.vehiculo_id, asignar.chofer_id), "Solicitud aprobada.");
                        if (r?.ok) setAsignar(null);
                      }}
                      className="rounded-lg bg-ranch-verde px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >Confirmar aprobación</button>
                    <button onClick={() => setAsignar(null)} className="rounded-lg border border-ranch-marron/25 px-3 py-1 text-xs text-ranch-marron">Cancelar</button>
                  </div>
                </div>
              ) : rechazar?.id === p.id ? (
                <div className="mt-2 space-y-1.5 border-t border-ranch-marron/10 pt-2">
                  <input value={rechazar.motivo} onChange={(e) => setRechazar({ ...rechazar, motivo: e.target.value })} placeholder="Motivo del rechazo" className="w-full rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-sm" />
                  <div className="flex gap-1.5">
                    <button
                      disabled={busy}
                      onClick={async () => {
                        const r = await ejecutar(() => rechazarSolicitud(p.id, rechazar.motivo), "Solicitud rechazada.");
                        if (r?.ok) setRechazar(null);
                      }}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >Confirmar rechazo</button>
                    <button onClick={() => setRechazar(null)} className="rounded-lg border border-ranch-marron/25 px-3 py-1 text-xs text-ranch-marron">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-1.5 border-t border-ranch-marron/10 pt-2">
                  <button
                    onClick={() => setAsignar({
                      id: p.id,
                      // Con un solo vehículo/chofer activo no hay nada que elegir: se precarga solo.
                      vehiculo_id: vehiculos.length === 1 ? vehiculos[0].id : "",
                      chofer_id: choferes.length === 1 ? choferes[0].id : "",
                    })}
                    className="rounded-lg bg-ranch-verde px-3 py-1 text-xs font-semibold text-white"
                  >✓ Aprobar</button>
                  <button onClick={() => setRechazar({ id: p.id, motivo: "" })} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-700">✕ Rechazar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Aprobadas, en curso ({aprobadas.length})</h2>
        {aprobadas.length === 0 && <p className="text-sm text-ranch-marron/50">No hay viajes en curso.</p>}
        <div className="space-y-2">
          {aprobadas.map((a) => (
            <div key={a.id} className="rounded-lg border border-ranch-marron/15 p-2 text-sm">
              <p className="font-semibold text-ranch-marron">{a.solicitante} — {a.vehiculo} · {a.chofer}</p>
              <p className="text-xs text-ranch-marron/60">{a.horaInicio} → {a.horaFin}</p>
              {(a.origen || a.destino) && (
                <p className="text-xs text-ranch-marron/60">
                  📍 {a.origen || "—"} → {a.destino || "—"}{a.viajeRedondo ? " (redondo)" : ""}
                </p>
              )}
              {cancelar?.id === a.id ? (
                <div className="mt-2 space-y-1.5">
                  <input value={cancelar.motivo} onChange={(e) => setCancelar({ ...cancelar, motivo: e.target.value })} placeholder="Motivo de la cancelación" className="w-full rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-sm" />
                  <div className="flex gap-1.5">
                    <button
                      disabled={busy}
                      onClick={async () => {
                        const r = await ejecutar(() => cancelarSolicitud(a.id, cancelar.motivo), "Solicitud cancelada.");
                        if (r?.ok) setCancelar(null);
                      }}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >Confirmar cancelación</button>
                    <button onClick={() => setCancelar(null)} className="rounded-lg border border-ranch-marron/25 px-3 py-1 text-xs text-ranch-marron">Volver</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setCancelar({ id: a.id, motivo: "" })} className="mt-1 text-xs font-semibold text-red-600 hover:underline">Cancelar viaje</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
