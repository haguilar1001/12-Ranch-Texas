"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { separarTurno, cancelarMiTurno } from "./actions";

export interface AtraccionFila {
  id: string;
  nombre: string;
  descripcion: string | null;
  restricciones: string | null;
  requiere_consentimiento: boolean;
  firmado: boolean;
  personasEnFila: number;
  esperaSiEntroAhora: string;
  miTurno: { id: string; numero: number; estado: string; personas: number } | null;
  miPosicion: number | null;
  miEspera: string | null;
  llamando: number | null;
}

/** Cada cuánto se refresca la página sola, para no tener que estar pendiente. */
const REFRESCO_MS = 20_000;

export default function FilaClient({
  payload,
  manilla,
  atracciones,
}: {
  payload: string;
  manilla: { consecutivo: string; tipo: string };
  atracciones: AtraccionFila[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [personas, setPersonas] = useState<Record<string, number>>({});

  // El punto del módulo es no tener que estar pendiente: la página se actualiza sola.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESCO_MS);
    return () => clearInterval(id);
  }, [router]);

  async function correr(fn: () => Promise<{ ok: boolean; error?: string; aviso?: string }>, exito: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setMsg({ ok: r.ok, t: r.ok ? [exito, r.aviso].filter(Boolean).join(" ") : r.error ?? "Error" });
    if (r.ok) router.refresh();
  }

  const misTurnos = atracciones.filter((a) => a.miTurno);

  return (
    <main className="mx-auto max-w-lg p-4">
      <header className="mb-4 text-center">
        <h1 className="text-2xl font-black text-ranch-marron">Filas del parque</h1>
        <p className="text-sm text-ranch-marron/60">
          Manilla {manilla.consecutivo} · {manilla.tipo}
        </p>
        <p className="mt-1 text-xs text-ranch-marron/45">
          Separa tu turno y ve a hacer otra cosa. Esta página se actualiza sola.
        </p>
      </header>

      {msg && (
        <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.t}
        </p>
      )}

      {misTurnos.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ranch-marron/50">Tus turnos</h2>
          <div className="space-y-3">
            {misTurnos.map((a) => {
              const t = a.miTurno!;
              const meLlaman = t.estado === "llamado";
              return (
                <div
                  key={a.id}
                  className={`rounded-2xl border-4 p-4 ${meLlaman ? "border-ranch-verde bg-ranch-verde/10" : "border-ranch-marron bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-ranch-marron">{a.nombre}</p>
                      {meLlaman ? (
                        <p className="mt-1 text-lg font-black text-ranch-verde">¡Es tu turno! Acércate ya.</p>
                      ) : (
                        <p className="mt-1 text-sm text-ranch-marron/70">
                          Van en el <strong>{a.llamando ?? "—"}</strong> · eres el <strong>{a.miPosicion}º</strong> en la fila
                        </p>
                      )}
                      {t.personas > 1 && <p className="text-xs text-ranch-marron/50">Para {t.personas} personas</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-ranch-marron">{t.numero}</p>
                      <p className="text-[10px] uppercase text-ranch-marron/45">tu turno</p>
                    </div>
                  </div>

                  {!meLlaman && (
                    <p className="mt-2 text-sm font-semibold text-ranch-marron/70">Falta {a.miEspera}</p>
                  )}

                  {a.requiere_consentimiento && !a.firmado && (
                    <a
                      href={`/consentimiento/${encodeURIComponent(payload)}`}
                      className="mt-3 block rounded-lg bg-ranch-dorado px-4 py-3 text-center font-bold text-white"
                    >
                      ⚠️ Firma el consentimiento antes de que te llamen
                    </a>
                  )}

                  <button
                    onClick={() => correr(() => cancelarMiTurno(payload, t.id), "Turno cancelado.")}
                    disabled={busy}
                    className="mt-3 w-full rounded-lg border border-ranch-marron/25 px-3 py-2 text-sm text-ranch-marron/70 disabled:opacity-50"
                  >
                    Ya no quiero este turno
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ranch-marron/50">Atracciones con fila</h2>
      <div className="space-y-3">
        {atracciones.filter((a) => !a.miTurno).map((a) => (
          <div key={a.id} className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ranch-marron">{a.nombre}</p>
                {a.descripcion && <p className="text-xs text-ranch-marron/50">{a.descripcion}</p>}
                <p className="mt-1 text-sm text-ranch-marron/70">
                  {a.personasEnFila === 0 ? "Sin fila" : `${a.personasEnFila} en fila`} · espera {a.esperaSiEntroAhora}
                </p>
                {a.restricciones && <p className="text-xs text-ranch-marron/45">{a.restricciones}</p>}
              </div>
              {a.llamando !== null && (
                <div className="text-right">
                  <p className="text-2xl font-black text-ranch-marron/70">{a.llamando}</p>
                  <p className="text-[10px] uppercase text-ranch-marron/45">van en</p>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs text-ranch-marron/60">Personas</label>
              <select
                value={personas[a.id] ?? 1}
                onChange={(e) => setPersonas({ ...personas, [a.id]: parseInt(e.target.value, 10) })}
                className="rounded-lg border border-ranch-marron/30 px-2 py-2 text-sm"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button
                onClick={() => correr(() => separarTurno(payload, a.id, personas[a.id] ?? 1), "Turno separado.")}
                disabled={busy}
                className="flex-1 rounded-lg bg-ranch-marron px-4 py-3 font-bold text-ranch-crema disabled:opacity-50"
              >
                Separar turno
              </button>
            </div>
          </div>
        ))}

        {atracciones.length === 0 && (
          <p className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-6 text-center text-ranch-marron/50">
            Hoy no hay atracciones con fila.
          </p>
        )}
      </div>

      <p className="mt-5 text-center text-xs text-ranch-marron/40">
        Guarda esta página en tu celular. Mientras esperas puedes ir a comer, a la piscina o a la granja.
      </p>
    </main>
  );
}
