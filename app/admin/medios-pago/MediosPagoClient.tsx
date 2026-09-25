"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearMedio, editarMedio, cambiarEstadoMedio } from "./actions";

interface Medio {
  id: string;
  nombre: string;
  codigo: string;
  icono: string | null;
  es_efectivo: boolean;
  afecta_recaudo: boolean;
  orden: number;
  activo: boolean;
  /** Pagos de venta registrados con este medio. */
  usos: number;
}

interface Edicion {
  nombre: string;
  icono: string;
  es_efectivo: boolean;
  afecta_recaudo: boolean;
  orden: string;
}

const VACIO: Edicion = { nombre: "", icono: "", es_efectivo: false, afecta_recaudo: true, orden: "" };

export default function MediosPagoClient({ medios }: { medios: Medio[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState<Edicion>(VACIO);
  const [edicion, setEdicion] = useState<{ id: string } & Edicion | null>(null);
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

  const orden = (v: string) => (v.trim() === "" ? undefined : parseInt(v, 10));
  const input = "rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm";

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ranch-marron">Medios de pago</h1>
        <p className="text-sm text-ranch-marron/60">
          Los que el cajero elige al cobrar en taquilla y los que se usan para registrar gastos y movimientos de caja.
        </p>
      </div>

      {msg && (
        <p className={`mb-4 rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-50 text-red-700"}`}>{msg.t}</p>
      )}

      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Nuevo medio de pago</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={nuevo.icono}
            onChange={(e) => setNuevo({ ...nuevo, icono: e.target.value })}
            placeholder="💳"
            title="Ícono: un emoji"
            className={`${input} sin-mayusculas w-16 text-center`}
          />
          <input
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            placeholder="Nombre (p. ej. Bancolombia QR)"
            className={`${input} min-w-[14rem] flex-1`}
          />
          <input
            value={nuevo.orden}
            onChange={(e) => setNuevo({ ...nuevo, orden: e.target.value })}
            placeholder="Orden (opcional)"
            inputMode="numeric"
            className={`${input} w-36`}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ranch-marron">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={nuevo.es_efectivo} onChange={(e) => setNuevo({ ...nuevo, es_efectivo: e.target.checked })} />
            Es efectivo (sale con los billetes y se cuenta en el cajón)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={nuevo.afecta_recaudo} onChange={(e) => setNuevo({ ...nuevo, afecta_recaudo: e.target.checked })} />
            La plata entra hoy al parque
          </label>
        </div>
        <p className="mt-1 text-xs text-ranch-marron/50">
          Desmarca “la plata entra hoy” solo para lo que ya se pagó antes, como un bono o una compra por la página web:
          suma a la venta del día, pero no al recaudo de la caja.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            const r = await ejecutar(() => crearMedio({ ...nuevo, orden: orden(nuevo.orden) }), "Medio de pago creado.");
            if (r?.ok) setNuevo(VACIO);
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
                <th className="py-1 pr-2">Orden</th>
                <th className="py-1">Medio</th>
                <th className="py-1 text-center">Efectivo</th>
                <th className="py-1 text-center">Entra hoy</th>
                <th className="py-1 text-right">Pagos</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {medios.map((m) => {
                const ed = edicion?.id === m.id ? edicion : null;
                return (
                  <tr key={m.id} className={`border-t border-ranch-marron/10 ${m.activo ? "" : "opacity-50"}`}>
                    <td className="py-2 pr-2 text-ranch-marron/70">
                      {ed ? (
                        <input value={ed.orden} onChange={(e) => setEdicion({ ...ed, orden: e.target.value })} inputMode="numeric" className="w-14 rounded border border-ranch-marron/30 px-2 py-1 text-center" />
                      ) : m.orden}
                    </td>
                    <td className="py-2">
                      {ed ? (
                        <div className="flex gap-1">
                          <input value={ed.icono} onChange={(e) => setEdicion({ ...ed, icono: e.target.value })} title="Ícono: un emoji" className="sin-mayusculas w-12 rounded border border-ranch-marron/30 px-1 py-1 text-center" />
                          <input value={ed.nombre} onChange={(e) => setEdicion({ ...ed, nombre: e.target.value })} className="w-full min-w-[12rem] rounded border border-ranch-marron/30 px-2 py-1" />
                        </div>
                      ) : (
                        <>
                          <span className="font-semibold text-ranch-marron">{m.icono && <span className="mr-1">{m.icono}</span>}{m.nombre}</span>
                          <br /><span className="text-[10px] text-ranch-marron/40">{m.codigo}</span>
                        </>
                      )}
                    </td>
                    <td className="py-2 text-center">
                      {ed ? (
                        <input type="checkbox" className="h-4 w-4" checked={ed.es_efectivo} onChange={(e) => setEdicion({ ...ed, es_efectivo: e.target.checked })} />
                      ) : m.es_efectivo ? "💵 Sí" : <span className="text-xs text-ranch-marron/40">No</span>}
                    </td>
                    <td className="py-2 text-center">
                      {ed ? (
                        <input type="checkbox" className="h-4 w-4" checked={ed.afecta_recaudo} onChange={(e) => setEdicion({ ...ed, afecta_recaudo: e.target.checked })} />
                      ) : m.afecta_recaudo ? "Sí" : <span className="text-xs font-semibold text-ranch-dorado">Ya pagado</span>}
                    </td>
                    <td className="py-2 text-right text-xs text-ranch-marron/50">{m.usos || "—"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {ed ? (
                          <>
                            <button
                              disabled={busy}
                              onClick={async () => {
                                const r = await ejecutar(() => editarMedio(m.id, { ...ed, orden: orden(ed.orden) }), "Medio de pago actualizado.");
                                if (r?.ok) setEdicion(null);
                              }}
                              className="rounded bg-ranch-marron px-2 py-0.5 text-xs font-semibold text-ranch-crema disabled:opacity-50"
                            >Guardar</button>
                            <button onClick={() => setEdicion(null)} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs text-ranch-marron">Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEdicion({ id: m.id, nombre: m.nombre, icono: m.icono ?? "", es_efectivo: m.es_efectivo, afecta_recaudo: m.afecta_recaudo, orden: String(m.orden) })}
                              className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60"
                            >✏️ Editar</button>
                            <button
                              disabled={busy}
                              onClick={() => ejecutar(() => cambiarEstadoMedio(m.id, !m.activo), m.activo ? "Medio desactivado." : "Medio activado.")}
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${m.activo ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-100 text-red-700"}`}
                            >{m.activo ? "Activo" : "Inactivo"}</button>
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
          En taquilla los medios salen en este orden, y cada venta arranca en efectivo aunque no sea el primero.
          Un medio que ya tiene pagos no se borra: se desactiva y deja de aparecer.
        </p>
      </section>
    </main>
  );
}
