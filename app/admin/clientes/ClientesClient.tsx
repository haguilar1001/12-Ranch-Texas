"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { editarCliente, cambiarEstadoCliente } from "./actions";

interface Cliente {
  id: string;
  nombre: string;
  celular: string;
  documento: string | null;
  email: string | null;
  activo: boolean;
  ventas: number;
  actualizado: string;
}

interface Edicion {
  id: string;
  nombre: string;
  celular: string;
  documento: string;
  email: string;
}

export default function ClientesClient({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [edit, setEdit] = useState<Edicion | null>(null);
  const [busy, setBusy] = useState(false);

  const aviso = (r: { ok: boolean; error?: string }, exito: string) => {
    setMsg({ ok: r.ok, t: r.ok ? exito : r.error ?? "Error" });
    if (r.ok) router.refresh();
    return r.ok;
  };

  async function guardar() {
    if (!edit) return;
    setBusy(true);
    const r = await editarCliente(edit.id, {
      nombre: edit.nombre, celular: edit.celular,
      documento: edit.documento, email: edit.email,
    });
    setBusy(false);
    if (aviso(r, "Cliente actualizado.")) setEdit(null);
  }

  if (clientes.length === 0) {
    return <p className="py-6 text-center text-sm text-ranch-marron/50">Sin clientes para esa búsqueda.</p>;
  }

  return (
    <>
      {msg && <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ranch-marron/60">
              <th className="py-1">Nombre</th><th>Celular</th><th>Documento</th><th>Correo</th>
              <th className="text-right">Ventas</th><th>Estado</th><th>Actualizado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const editando = edit?.id === c.id;
              return (
                <tr key={c.id} className={`border-t border-ranch-marron/10 ${!c.activo ? "opacity-50" : ""}`}>
                  {editando ? (
                    <>
                      <td className="py-1.5"><input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} className="w-32 rounded border px-1 py-0.5" /></td>
                      <td><input value={edit.celular} onChange={(e) => setEdit({ ...edit, celular: e.target.value })} inputMode="tel" className="w-24 rounded border px-1 py-0.5" /></td>
                      <td><input value={edit.documento} onChange={(e) => setEdit({ ...edit, documento: e.target.value })} className="w-24 rounded border px-1 py-0.5" /></td>
                      <td><input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} className="w-32 rounded border px-1 py-0.5" /></td>
                      <td className="text-right text-ranch-marron/50">{c.ventas}</td>
                      <td colSpan={2} className="text-ranch-marron/40">—</td>
                      <td className="whitespace-nowrap text-right">
                        <button onClick={guardar} disabled={busy} className="text-ranch-verde disabled:opacity-50">✓</button>
                        <button onClick={() => setEdit(null)} className="ml-1 text-red-500">✕</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 font-medium text-ranch-marron">{c.nombre}</td>
                      <td className="text-ranch-marron/70">{c.celular}</td>
                      <td className="text-ranch-marron/70">{c.documento ?? "—"}</td>
                      <td className="text-ranch-marron/70">{c.email ?? "—"}</td>
                      <td className="text-right text-ranch-marron/50">{c.ventas}</td>
                      <td>
                        <button
                          onClick={async () => aviso(await cambiarEstadoCliente(c.id, !c.activo), c.activo ? "Cliente desactivado." : "Cliente activado.")}
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${c.activo ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-100 text-red-700"}`}
                        >
                          {c.activo ? "Activo" : "Inactivo"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap text-xs text-ranch-marron/45">{c.actualizado}</td>
                      <td className="text-right">
                        <button
                          onClick={() => setEdit({ id: c.id, nombre: c.nombre, celular: c.celular, documento: c.documento ?? "", email: c.email ?? "" })}
                          className="text-ranch-marron/40 hover:text-ranch-marron"
                        >
                          ✏️
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
