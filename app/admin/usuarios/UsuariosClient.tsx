"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearUsuario, editarUsuario, cambiarEstadoUsuario, resetearPasswordUsuario } from "./actions";

interface Usuario { id: string; nombre: string; usuario: string; rol: string; activo: boolean; ultimo: string }

const PERFILES: { value: string; label: string; desc: string }[] = [
  { value: "administrador", label: "Administrador", desc: "Acceso total" },
  { value: "supervisor", label: "Supervisor", desc: "Anula, reimprime, reabre, cortesías, gastos" },
  { value: "cajero", label: "Cajero", desc: "Vende y cierra su caja" },
  { value: "control_acceso", label: "Control de acceso", desc: "Solo escanea accesos" },
  { value: "granja", label: "Granja", desc: "Solo animales: alimentar y trasladar" },
  { value: "consulta", label: "Consulta", desc: "Solo reportes" },
  { value: "chofer", label: "Chofer", desc: "Solo Control Vehículo: sus viajes aprobados" },
];
const labelRol = (v: string) => PERFILES.find((p) => p.value === v)?.label ?? v;

export default function UsuariosClient({ miId, usuarios }: { miId: string; usuarios: Usuario[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState({ nombre: "", usuario: "", rol: "cajero", password: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [editNombre, setEditNombre] = useState<{ id: string; v: string } | null>(null);
  const [reset, setReset] = useState<{ id: string; v: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const aviso = (r: { ok: boolean; error?: string }, exito: string) => {
    setMsg({ ok: r.ok, t: r.ok ? exito : r.error ?? "Error" });
    if (r.ok) router.refresh();
  };

  async function crear() {
    setBusy(true);
    const r = await crearUsuario(nuevo);
    setBusy(false);
    if (r.ok) setNuevo({ nombre: "", usuario: "", rol: "cajero", password: "" });
    aviso(r, "Usuario creado.");
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Usuarios y perfiles</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Crea, edita el perfil, activa/desactiva y resetea contraseñas.</p>

      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {/* Crear */}
      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Crear usuario</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre completo" className="rounded-lg border border-ranch-marron/30 px-3 py-2" />
          <input value={nuevo.usuario} onChange={(e) => setNuevo({ ...nuevo, usuario: e.target.value })} placeholder="Usuario o correo" className="sin-mayusculas rounded-lg border border-ranch-marron/30 px-3 py-2" />
          <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })} className="rounded-lg border border-ranch-marron/30 px-3 py-2">
            {PERFILES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} placeholder="Contraseña inicial (mín. 6)" className="rounded-lg border border-ranch-marron/30 px-3 py-2" />
        </div>
        <p className="mt-2 text-xs text-ranch-marron/50">{PERFILES.find((p) => p.value === nuevo.rol)?.desc}</p>
        <button onClick={crear} disabled={busy} className="mt-3 rounded-lg bg-ranch-marron px-5 py-2 font-semibold text-ranch-crema disabled:opacity-50">Crear usuario</button>
      </section>

      {/* Lista */}
      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Usuarios ({usuarios.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ranch-marron/60"><th className="py-1">Nombre</th><th>Usuario</th><th>Perfil</th><th>Estado</th><th>Último ingreso</th><th></th></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className={`border-t border-ranch-marron/10 ${!u.activo ? "opacity-50" : ""}`}>
                  <td className="py-2">
                    {editNombre?.id === u.id ? (
                      <span className="flex gap-1">
                        <input value={editNombre.v} onChange={(e) => setEditNombre({ id: u.id, v: e.target.value })} className="w-32 rounded border px-1 py-0.5" />
                        <button onClick={async () => { aviso(await editarUsuario(u.id, { nombre: editNombre.v }), "Nombre actualizado."); setEditNombre(null); }} className="text-ranch-verde">✓</button>
                        <button onClick={() => setEditNombre(null)} className="text-red-500">✕</button>
                      </span>
                    ) : (
                      <span>{u.nombre} <button onClick={() => setEditNombre({ id: u.id, v: u.nombre })} className="text-ranch-marron/40 hover:text-ranch-marron">✏️</button></span>
                    )}
                  </td>
                  <td className="text-ranch-marron/70">{u.usuario}</td>
                  <td>
                    <select
                      defaultValue={u.rol}
                      onChange={async (e) => aviso(await editarUsuario(u.id, { rol: e.target.value }), "Perfil actualizado.")}
                      className="rounded border px-1 py-0.5 text-xs"
                    >
                      {PERFILES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <button
                      onClick={async () => aviso(await cambiarEstadoUsuario(u.id, !u.activo), u.activo ? "Usuario desactivado." : "Usuario activado.")}
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${u.activo ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-100 text-red-700"}`}
                    >
                      {u.activo ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td className="text-xs text-ranch-marron/50">{u.ultimo}</td>
                  <td className="text-right">
                    {reset?.id === u.id ? (
                      <span className="flex justify-end gap-1">
                        <input value={reset.v} onChange={(e) => setReset({ id: u.id, v: e.target.value })} placeholder="nueva clave" className="w-28 rounded border px-1 py-0.5 text-xs" />
                        <button onClick={async () => { aviso(await resetearPasswordUsuario(u.id, reset.v), "Contraseña reseteada."); setReset(null); }} className="rounded bg-ranch-dorado px-2 py-0.5 text-xs font-semibold text-white">Guardar</button>
                        <button onClick={() => setReset(null)} className="text-red-500">✕</button>
                      </span>
                    ) : (
                      <button onClick={() => setReset({ id: u.id, v: "" })} className="rounded border border-ranch-marron/20 px-2 py-0.5 text-xs text-ranch-marron/70 hover:bg-ranch-crema">Reset clave</button>
                    )}
                    {u.id === miId && <span className="ml-1 text-[10px] text-ranch-dorado">(tú)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Leyenda de perfiles */}
      <section className="mt-6 rounded-2xl border-2 border-ranch-marron/15 bg-ranch-crema/40 p-4">
        <h2 className="mb-2 font-bold text-ranch-marron">Perfiles del sistema</h2>
        <ul className="space-y-1 text-sm">
          {PERFILES.map((p) => <li key={p.value}><strong className="text-ranch-marron">{p.label}:</strong> <span className="text-ranch-marron/70">{p.desc}</span></li>)}
        </ul>
      </section>
    </main>
  );
}
