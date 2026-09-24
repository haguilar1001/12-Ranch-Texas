"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearVehiculo, editarVehiculo, cambiarEstadoVehiculo,
  crearSolicitante, editarSolicitante, cambiarEstadoSolicitante,
} from "./actions";

interface Chofer { id: string; nombre: string }
interface Vehiculo {
  id: string; placa: string; marca: string | null; modelo: string | null; activo: boolean;
  chofer_habitual_id: string | null; choferHabitualNombre: string | null;
}
interface Solicitante { id: string; nombre: string; cargo: string | null; activo: boolean; usos: number }

export default function VehiculosClient({
  vehiculos, solicitantes, choferes,
}: {
  vehiculos: Vehiculo[]; solicitantes: Solicitante[]; choferes: Chofer[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const aviso = (r: { ok: boolean; error?: string }, exito: string) => {
    setMsg({ ok: r.ok, t: r.ok ? exito : r.error ?? "Error" });
    if (r.ok) router.refresh();
  };

  async function ejecutar<T extends { ok: boolean; error?: string }>(accion: () => Promise<T>, exito: string): Promise<T | null> {
    setBusy(true);
    try {
      const r = await accion();
      aviso(r, exito);
      return r;
    } catch {
      setMsg({ ok: false, t: "No se pudo guardar. Revisa la conexión y vuelve a intentarlo." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------ vehículos
  const [nuevoVehiculo, setNuevoVehiculo] = useState({ placa: "", marca: "", modelo: "", chofer_habitual_id: "" });
  const [editVehiculo, setEditVehiculo] = useState<{ id: string; placa: string; marca: string; modelo: string; chofer_habitual_id: string } | null>(null);

  async function crearVehiculoForm() {
    const r = await ejecutar(() => crearVehiculo(nuevoVehiculo), "Vehículo creado.");
    if (r?.ok) setNuevoVehiculo({ placa: "", marca: "", modelo: "", chofer_habitual_id: "" });
  }

  // ---------------------------------------------------------------- solicitantes
  const [nuevoSolicitante, setNuevoSolicitante] = useState({ nombre: "", cargo: "" });
  const [editSolicitante, setEditSolicitante] = useState<{ id: string; nombre: string; cargo: string } | null>(null);

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Vehículos</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">
        El catálogo de vehículos y de quiénes pueden solicitarlos. Las solicitudes se aprueban desde{" "}
        <a href="/vehiculos/aprobar" className="text-ranch-dorado hover:underline">Aprobar solicitudes</a>.
      </p>

      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {/* ---------------------------------------------------------------- Vehículos */}
      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Crear vehículo</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={nuevoVehiculo.placa} onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, placa: e.target.value })} placeholder="Placa" className="rounded-lg border border-ranch-marron/30 px-3 py-2" />
          <select value={nuevoVehiculo.chofer_habitual_id} onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, chofer_habitual_id: e.target.value })} className="rounded-lg border border-ranch-marron/30 px-3 py-2">
            <option value="">Chofer habitual (opcional)</option>
            {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input value={nuevoVehiculo.marca} onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, marca: e.target.value })} placeholder="Marca (opcional)" className="rounded-lg border border-ranch-marron/30 px-3 py-2" />
          <input value={nuevoVehiculo.modelo} onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, modelo: e.target.value })} placeholder="Modelo (opcional)" className="rounded-lg border border-ranch-marron/30 px-3 py-2" />
        </div>
        <button onClick={crearVehiculoForm} disabled={busy} className="mt-3 rounded-lg bg-ranch-marron px-5 py-2 font-semibold text-ranch-crema disabled:opacity-50">Crear vehículo</button>
      </section>

      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Vehículos ({vehiculos.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ranch-marron/50">
                <th className="py-1">Placa</th><th>Marca / modelo</th><th>Chofer habitual</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {vehiculos.map((v) => (
                <tr key={v.id} className={`border-t border-ranch-marron/10 align-top ${!v.activo ? "opacity-50" : ""}`}>
                  {editVehiculo?.id === v.id ? (
                    <>
                      <td className="py-2"><input value={editVehiculo.placa} onChange={(e) => setEditVehiculo({ ...editVehiculo, placa: e.target.value })} className="w-24 rounded border px-1 py-0.5" /></td>
                      <td className="py-2">
                        <span className="flex gap-1">
                          <input value={editVehiculo.marca} onChange={(e) => setEditVehiculo({ ...editVehiculo, marca: e.target.value })} placeholder="Marca" className="w-20 rounded border px-1 py-0.5" />
                          <input value={editVehiculo.modelo} onChange={(e) => setEditVehiculo({ ...editVehiculo, modelo: e.target.value })} placeholder="Modelo" className="w-20 rounded border px-1 py-0.5" />
                        </span>
                      </td>
                      <td className="py-2">
                        <select value={editVehiculo.chofer_habitual_id} onChange={(e) => setEditVehiculo({ ...editVehiculo, chofer_habitual_id: e.target.value })} className="rounded border px-1 py-0.5">
                          <option value="">—</option>
                          {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </td>
                      <td className="py-2 text-xs text-ranch-marron/50">{v.activo ? "Activo" : "Inactivo"}</td>
                      <td className="py-2 text-right">
                        <span className="flex justify-end gap-1">
                          <button
                            disabled={busy}
                            onClick={async () => {
                              const r = await ejecutar(() => editarVehiculo(editVehiculo.id, editVehiculo), "Vehículo actualizado.");
                              if (r?.ok) setEditVehiculo(null);
                            }}
                            className="rounded bg-ranch-marron px-2 py-0.5 text-xs font-semibold text-ranch-crema disabled:opacity-50"
                          >Guardar</button>
                          <button onClick={() => setEditVehiculo(null)} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs text-ranch-marron">Cancelar</button>
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 font-semibold text-ranch-marron">{v.placa}</td>
                      <td className="py-2 text-xs text-ranch-marron/60">{[v.marca, v.modelo].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="py-2 text-xs text-ranch-marron/60">{v.choferHabitualNombre ?? "—"}</td>
                      <td className="py-2">
                        <button
                          onClick={() => ejecutar(() => cambiarEstadoVehiculo(v.id, !v.activo), v.activo ? "Vehículo desactivado." : "Vehículo activado.")}
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${v.activo ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-100 text-red-700"}`}
                        >{v.activo ? "Activo" : "Inactivo"}</button>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => setEditVehiculo({ id: v.id, placa: v.placa, marca: v.marca ?? "", modelo: v.modelo ?? "", chofer_habitual_id: v.chofer_habitual_id ?? "" })}
                          className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60"
                        >✏️ Editar</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {vehiculos.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-ranch-marron/50">No hay vehículos. Crea el primero arriba.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* -------------------------------------------------------------- Solicitantes */}
      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-1 font-bold text-ranch-marron">Solicitantes</h2>
        <p className="mb-3 text-xs text-ranch-marron/55">
          Quiénes pueden pedir el vehículo. No tienen login: alguien de oficina registra la solicitud a su nombre.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={nuevoSolicitante.nombre}
            onChange={(e) => setNuevoSolicitante({ ...nuevoSolicitante, nombre: e.target.value })}
            placeholder="Nombre y apellido"
            className="flex-1 rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm"
          />
          <input
            value={nuevoSolicitante.cargo}
            onChange={(e) => setNuevoSolicitante({ ...nuevoSolicitante, cargo: e.target.value })}
            placeholder="Cargo (opcional)"
            className="flex-1 rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm"
          />
          <button
            disabled={busy}
            onClick={async () => {
              const r = await ejecutar(() => crearSolicitante(nuevoSolicitante.nombre, nuevoSolicitante.cargo), "Solicitante agregado.");
              if (r?.ok) setNuevoSolicitante({ nombre: "", cargo: "" });
            }}
            className="rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50"
          >
            Agregar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ranch-marron/50">
                <th className="py-1">Persona</th><th>Cargo</th><th className="text-right">Solicitudes</th><th className="text-right"></th>
              </tr>
            </thead>
            <tbody>
              {solicitantes.map((sol) => (
                <tr key={sol.id} className={`border-t border-ranch-marron/10 ${sol.activo ? "" : "opacity-50"}`}>
                  <td className="py-2">
                    {editSolicitante?.id === sol.id ? (
                      <input value={editSolicitante.nombre} onChange={(e) => setEditSolicitante({ ...editSolicitante, nombre: e.target.value })} className="w-full min-w-[14rem] rounded border border-ranch-marron/30 px-2 py-1" />
                    ) : (
                      <span className="font-semibold text-ranch-marron">{sol.nombre}</span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-ranch-marron/60">
                    {editSolicitante?.id === sol.id ? (
                      <input value={editSolicitante.cargo} onChange={(e) => setEditSolicitante({ ...editSolicitante, cargo: e.target.value })} placeholder="Cargo" className="w-32 rounded border border-ranch-marron/30 px-2 py-1" />
                    ) : (
                      sol.cargo || "—"
                    )}
                  </td>
                  <td className="py-2 text-right text-xs text-ranch-marron/50">{sol.usos || "—"}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      {editSolicitante?.id === sol.id ? (
                        <>
                          <button
                            disabled={busy}
                            onClick={async () => {
                              const r = await ejecutar(() => editarSolicitante(editSolicitante.id, editSolicitante.nombre, editSolicitante.cargo), "Solicitante actualizado.");
                              if (r?.ok) setEditSolicitante(null);
                            }}
                            className="rounded bg-ranch-marron px-2 py-0.5 text-xs font-semibold text-ranch-crema disabled:opacity-50"
                          >Guardar</button>
                          <button onClick={() => setEditSolicitante(null)} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs text-ranch-marron">Cancelar</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditSolicitante({ id: sol.id, nombre: sol.nombre, cargo: sol.cargo ?? "" })} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60">✏️ Editar</button>
                          <button
                            disabled={busy}
                            onClick={() => ejecutar(() => cambiarEstadoSolicitante(sol.id, !sol.activo), sol.activo ? "Solicitante desactivado." : "Solicitante activado.")}
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${sol.activo ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-100 text-red-700"}`}
                          >{sol.activo ? "Activo" : "Inactivo"}</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {solicitantes.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-ranch-marron/50">No hay solicitantes. Agrega el primero arriba.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-xs text-ranch-marron/50">
        Nota: nada se borra. Para retirar un vehículo o un solicitante, desactívalo (deja de aparecer para
        pedir/asignar pero conserva su historial).
      </p>
    </main>
  );
}
