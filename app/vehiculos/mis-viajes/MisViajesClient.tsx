"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cerrarViaje } from "../actions";

interface Aprobado {
  id: string; solicitante: string; vehiculo: string; chofer: string; horaInicio: string; horaFin: string; descripcion: string;
}
interface Completado {
  id: string; solicitante: string; vehiculo: string; km: number | null; cerrado: string;
}

export default function MisViajesClient({ aprobados, completados }: { aprobados: Aprobado[]; completados: Completado[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [cerrar, setCerrar] = useState<{ id: string; km_inicial: string; km_final: string } | null>(null);

  async function guardarCierre() {
    if (!cerrar) return;
    setBusy(true);
    try {
      const r = await cerrarViaje(cerrar.id, cerrar.km_inicial, cerrar.km_final);
      setMsg({ ok: r.ok, t: r.ok ? "Viaje cerrado." : r.error ?? "Error" });
      if (r.ok) {
        setCerrar(null);
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, t: "No se pudo guardar. Revisa la conexión y vuelve a intentarlo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Mis viajes</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Al volver, cierra el viaje con el kilometraje inicial y final.</p>

      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Por hacer / en curso ({aprobados.length})</h2>
        {aprobados.length === 0 && <p className="text-sm text-ranch-marron/50">No tienes viajes aprobados pendientes de cerrar.</p>}
        <div className="space-y-3">
          {aprobados.map((v) => (
            <div key={v.id} className="rounded-xl border-2 border-ranch-marron/15 p-3">
              <p className="font-semibold text-ranch-marron">{v.solicitante} — {v.vehiculo}</p>
              <p className="text-xs text-ranch-marron/60">{v.horaInicio} → {v.horaFin} · {v.chofer}</p>
              <p className="mt-1 text-sm text-ranch-marron/80">{v.descripcion}</p>

              {cerrar?.id === v.id ? (
                <div className="mt-2 space-y-1.5 border-t border-ranch-marron/10 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={cerrar.km_inicial}
                      onChange={(e) => setCerrar({ ...cerrar, km_inicial: e.target.value.replace(/\D/g, "") })}
                      placeholder="Km inicial" inputMode="numeric"
                      className="rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-sm"
                    />
                    <input
                      value={cerrar.km_final}
                      onChange={(e) => setCerrar({ ...cerrar, km_final: e.target.value.replace(/\D/g, "") })}
                      placeholder="Km final" inputMode="numeric"
                      className="rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={guardarCierre} disabled={busy} className="rounded-lg bg-ranch-marron px-3 py-1 text-xs font-semibold text-ranch-crema disabled:opacity-50">Cerrar viaje</button>
                    <button onClick={() => setCerrar(null)} className="rounded-lg border border-ranch-marron/25 px-3 py-1 text-xs text-ranch-marron">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setCerrar({ id: v.id, km_inicial: "", km_final: "" })} className="mt-2 rounded-lg border-t border-ranch-marron/10 pt-2 text-xs font-semibold text-ranch-dorado hover:underline">
                  Cerrar viaje (registrar kilometraje)
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Últimos cerrados</h2>
        {completados.length === 0 && <p className="text-sm text-ranch-marron/50">Aún no has cerrado ningún viaje.</p>}
        <table className="w-full text-sm">
          <tbody>
            {completados.map((c) => (
              <tr key={c.id} className="border-t border-ranch-marron/10">
                <td className="py-1.5">{c.solicitante} — {c.vehiculo}</td>
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
