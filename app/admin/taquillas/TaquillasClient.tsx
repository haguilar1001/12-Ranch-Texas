"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearTaquilla, editarTaquilla, cambiarEstadoTaquilla } from "./actions";

interface Taquilla {
  id: string;
  nombre: string;
  ubicacion: string | null;
  es_prueba: boolean;
  activo: boolean;
  /** Turnos que ha tenido (abiertos y cerrados). */
  turnos: number;
  /** Quién la tiene abierta ahora, si alguien. */
  abiertaPor: string | null;
}

interface Edicion {
  nombre: string;
  ubicacion: string;
  es_prueba: boolean;
}

const VACIO: Edicion = { nombre: "", ubicacion: "", es_prueba: false };

export default function TaquillasClient({ taquillas }: { taquillas: Taquilla[] }) {
  const router = useRouter();
  const [nueva, setNueva] = useState<Edicion>(VACIO);
  const [edicion, setEdicion] = useState<({ id: string } & Edicion) | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function ejecutar(accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
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

  const input = "rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm";

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ranch-marron">Taquillas</h1>
        <p className="text-sm text-ranch-marron/60">
          Las cajas donde se vende. Cada una abre su propio turno y tiene su propio cuadre.
        </p>
      </div>

      {msg && (
        <p className={`mb-4 rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-50 text-red-700"}`}>{msg.t}</p>
      )}

      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Nueva taquilla</h2>
        <div className="flex flex-wrap gap-2">
          <input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre (p. ej. Taquilla Principal)" className={`${input} min-w-[14rem] flex-1`} />
          <input value={nueva.ubicacion} onChange={(e) => setNueva({ ...nueva, ubicacion: e.target.value })} placeholder="Ubicación (opcional)" className={`${input} min-w-[12rem] flex-1`} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-ranch-marron">
          <input type="checkbox" className="h-4 w-4" checked={nueva.es_prueba} onChange={(e) => setNueva({ ...nueva, es_prueba: e.target.checked })} />
          Es de pruebas (sus ventas no cuentan en los indicadores del parque)
        </label>
        <button
          disabled={busy}
          onClick={async () => {
            const r = await ejecutar(() => crearTaquilla(nueva), "Taquilla creada.");
            if (r?.ok) setNueva(VACIO);
          }}
          className="mt-3 rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50"
        >
          Agregar
        </button>
      </section>

      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ranch-marron/50">
                <th className="py-1">Taquilla</th>
                <th className="py-1">Ubicación</th>
                <th className="py-1 text-center">Pruebas</th>
                <th className="py-1 text-right">Turnos</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {taquillas.map((t) => {
                const ed = edicion?.id === t.id ? edicion : null;
                return (
                  <tr key={t.id} className={`border-t border-ranch-marron/10 ${t.activo ? "" : "opacity-50"}`}>
                    <td className="py-2 pr-2">
                      {ed ? (
                        <input value={ed.nombre} onChange={(e) => setEdicion({ ...ed, nombre: e.target.value })} className="w-full min-w-[12rem] rounded border border-ranch-marron/30 px-2 py-1" />
                      ) : (
                        <>
                          <span className="font-semibold text-ranch-marron">🏛️ {t.nombre}</span>
                          {t.abiertaPor && <span className="block text-[11px] text-ranch-verde">Abierta por {t.abiertaPor}</span>}
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-ranch-marron/70">
                      {ed ? (
                        <input value={ed.ubicacion} onChange={(e) => setEdicion({ ...ed, ubicacion: e.target.value })} className="w-full min-w-[10rem] rounded border border-ranch-marron/30 px-2 py-1" />
                      ) : (t.ubicacion ?? <span className="text-xs text-ranch-marron/40">—</span>)}
                    </td>
                    <td className="py-2 text-center">
                      {ed ? (
                        <input type="checkbox" className="h-4 w-4" checked={ed.es_prueba} onChange={(e) => setEdicion({ ...ed, es_prueba: e.target.checked })} />
                      ) : t.es_prueba ? <span className="text-xs font-semibold text-ranch-dorado">🧪 Sí</span> : <span className="text-xs text-ranch-marron/40">No</span>}
                    </td>
                    <td className="py-2 text-right text-xs text-ranch-marron/50">{t.turnos || "—"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {ed ? (
                          <>
                            <button
                              disabled={busy}
                              onClick={async () => {
                                const r = await ejecutar(() => editarTaquilla(t.id, ed), "Taquilla actualizada.");
                                if (r?.ok) setEdicion(null);
                              }}
                              className="rounded bg-ranch-marron px-2 py-0.5 text-xs font-semibold text-ranch-crema disabled:opacity-50"
                            >Guardar</button>
                            <button onClick={() => setEdicion(null)} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs text-ranch-marron">Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEdicion({ id: t.id, nombre: t.nombre, ubicacion: t.ubicacion ?? "", es_prueba: t.es_prueba })}
                              className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60"
                            >✏️ Editar</button>
                            <button
                              disabled={busy}
                              onClick={() => ejecutar(() => cambiarEstadoTaquilla(t.id, !t.activo), t.activo ? "Taquilla desactivada." : "Taquilla activada.")}
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${t.activo ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-100 text-red-700"}`}
                            >{t.activo ? "Activa" : "Inactiva"}</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ranch-marron/50">
          Cambiar el nombre no altera los turnos ni las ventas ya hechas: se ven con el nombre nuevo. Una taquilla
          con turno abierto no se puede desactivar.
        </p>
      </section>
    </main>
  );
}
