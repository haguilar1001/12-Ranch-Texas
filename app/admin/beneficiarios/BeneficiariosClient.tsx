"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearBeneficiario, editarBeneficiario, cambiarEstadoBeneficiario } from "./actions";

interface Beneficiario {
  id: string;
  nombre: string;
  documento: string | null;
  activo: boolean;
  /** Egresos entregados a esta persona. */
  usos: number;
}

const VACIO = { nombre: "", documento: "" };

export default function BeneficiariosClient({ beneficiarios }: { beneficiarios: Beneficiario[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState(VACIO);
  const [edicion, setEdicion] = useState<({ id: string } & typeof VACIO) | null>(null);
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
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ranch-marron">Beneficiarios de caja</h1>
        <p className="text-sm text-ranch-marron/60">
          A quién se le puede entregar plata de la caja en un egreso: empleados, proveedores, domiciliarios…
          El cajero lo elige de esta lista y su nombre y cédula salen bajo la firma de “Recibió”.
        </p>
      </div>

      {msg && (
        <p className={`mb-4 rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-50 text-red-700"}`}>{msg.t}</p>
      )}

      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Nuevo beneficiario</h2>
        <div className="flex flex-wrap gap-2">
          <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre completo o razón social" className={`${input} min-w-[14rem] flex-1`} />
          <input value={nuevo.documento} onChange={(e) => setNuevo({ ...nuevo, documento: e.target.value })} placeholder="Cédula o NIT" className={`${input} w-44`} />
          <button
            disabled={busy}
            onClick={async () => {
              const r = await ejecutar(() => crearBeneficiario(nuevo), "Beneficiario agregado.");
              if (r?.ok) setNuevo(VACIO);
            }}
            className="rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ranch-marron/50">
                <th className="py-1">Nombre</th>
                <th className="py-1">Cédula / NIT</th>
                <th className="py-1 text-right">Egresos</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {beneficiarios.map((b) => {
                const ed = edicion?.id === b.id ? edicion : null;
                return (
                  <tr key={b.id} className={`border-t border-ranch-marron/10 ${b.activo ? "" : "opacity-50"}`}>
                    <td className="py-2 pr-2">
                      {ed ? (
                        <input value={ed.nombre} onChange={(e) => setEdicion({ ...ed, nombre: e.target.value })} className="w-full min-w-[12rem] rounded border border-ranch-marron/30 px-2 py-1" />
                      ) : <span className="font-semibold text-ranch-marron">{b.nombre}</span>}
                    </td>
                    <td className="py-2 pr-2 text-ranch-marron/70">
                      {ed ? (
                        <input value={ed.documento} onChange={(e) => setEdicion({ ...ed, documento: e.target.value })} className="w-36 rounded border border-ranch-marron/30 px-2 py-1" />
                      ) : (b.documento ?? <span className="text-xs text-ranch-marron/40">—</span>)}
                    </td>
                    <td className="py-2 text-right text-xs text-ranch-marron/50">{b.usos || "—"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {ed ? (
                          <>
                            <button
                              disabled={busy}
                              onClick={async () => {
                                const r = await ejecutar(() => editarBeneficiario(b.id, ed), "Beneficiario actualizado.");
                                if (r?.ok) setEdicion(null);
                              }}
                              className="rounded bg-ranch-marron px-2 py-0.5 text-xs font-semibold text-ranch-crema disabled:opacity-50"
                            >Guardar</button>
                            <button onClick={() => setEdicion(null)} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs text-ranch-marron">Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEdicion({ id: b.id, nombre: b.nombre, documento: b.documento ?? "" })}
                              className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60"
                            >✏️ Editar</button>
                            <button
                              disabled={busy}
                              onClick={() => ejecutar(() => cambiarEstadoBeneficiario(b.id, !b.activo), b.activo ? "Beneficiario desactivado." : "Beneficiario activado.")}
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${b.activo ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-100 text-red-700"}`}
                            >{b.activo ? "Activo" : "Inactivo"}</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {beneficiarios.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-ranch-marron/50">Todavía no hay beneficiarios. Agrega el primero arriba.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
