"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import IconoTipo from "@/components/IconoTipo";
import { formatearCOP } from "@/lib/dinero/cop";
import {
  crearTipo, editarTipo, cambiarEstadoTipo, cambiarTarifa,
  crearMotivo, editarMotivo, cambiarEstadoMotivo,
  crearAutorizador, editarAutorizador, cambiarEstadoAutorizador,
} from "./actions";

interface HistLinea { valor: number; desde: string; hasta: string | null; motivo: string }
type Disponibilidad = "todos" | "semana" | "fin_semana_festivo";
interface Tipo {
  id: string;
  codigo: string;
  nombre: string;
  requiere_pago: boolean;
  edad_min: number | null;
  edad_max: number | null;
  orden: number;
  activo: boolean;
  icono: string | null;
  requiere_carnet: boolean;
  requiere_escaneo: boolean;
  /** Solo estos tipos muestran el botón de descuento unitario en taquilla. */
  permite_descuento: boolean;
  /** Qué días se ve este tipo en taquilla. */
  disponible_dias: Disponibilidad;
  /** Solo administrador ve y puede vender este tipo en taquilla. */
  solo_administrador: boolean;
  valorVigente: number;
  vigenteDesde: string;
  historial: HistLinea[];
}

const ETIQUETA_DISPONIBILIDAD: Record<Disponibilidad, string> = {
  todos: "Todos los días",
  semana: "📅 Solo entre semana",
  fin_semana_festivo: "🎉 Solo fin de semana/festivo",
};

export interface Autorizador {
  id: string;
  nombre: string;
  cargo: string | null;
  activo: boolean;
  /** Vino de un usuario de la app al sembrar el catálogo. */
  esUsuario: boolean;
}

const rangoEdad = (min: number | null, max: number | null) => {
  if (min !== null && max !== null) return `${min}–${max} años`;
  if (min !== null) return `+${min} años`;
  if (max !== null) return `≤${max} años`;
  return "—";
};

/** Ventana modal genérica: fondo oscuro + tarjeta centrada, se cierra con clic afuera o con ✕. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ranch-marron/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-lg font-black text-ranch-marron">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-full text-ranch-marron/50 hover:bg-ranch-crema hover:text-ranch-marron">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface Motivo {
  id: string;
  nombre: string;
  activo: boolean;
  /** Cuántas líneas de venta lo usaron. Sirve para saber si vale la pena conservarlo. */
  usos: number;
}

export default function TarifasClient({
  tipos, motivos, autorizadores,
}: {
  tipos: Tipo[]; motivos: Motivo[]; autorizadores: Autorizador[];
}) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState({ nombre: "", requiere_pago: true, valor: "", edad_min: "", edad_max: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edicion, setEdicion] = useState<
    {
      id: string; nombre: string; edad_min: string; edad_max: string; orden: string; icono: string;
      requiere_carnet: boolean; requiere_escaneo: boolean; permite_descuento: boolean; disponible_dias: Disponibilidad;
      solo_administrador: boolean;
    } | null
  >(null);

  function abrirEdicion(t: Tipo) {
    setEdicion({
      id: t.id,
      nombre: t.nombre,
      edad_min: t.edad_min === null ? "" : String(t.edad_min),
      edad_max: t.edad_max === null ? "" : String(t.edad_max),
      orden: String(t.orden),
      icono: t.icono ?? "",
      requiere_carnet: t.requiere_carnet,
      requiere_escaneo: t.requiere_escaneo,
      permite_descuento: t.permite_descuento,
      disponible_dias: t.disponible_dias,
      solo_administrador: t.solo_administrador,
    });
  }

  async function guardarEdicion() {
    if (!edicion) return;
    const r = await ejecutar(
      () => editarTipo(edicion.id, {
        nombre: edicion.nombre,
        edad_min: edicion.edad_min === "" ? null : edicion.edad_min,
        edad_max: edicion.edad_max === "" ? null : edicion.edad_max,
        orden: parseInt(edicion.orden, 10) || 0,
        icono: edicion.icono,
        requiere_carnet: edicion.requiere_carnet,
        requiere_escaneo: edicion.requiere_escaneo,
        permite_descuento: edicion.permite_descuento,
        disponible_dias: edicion.disponible_dias,
        solo_administrador: edicion.solo_administrador,
      }),
      "Tipo actualizado.",
    );
    if (r?.ok) setEdicion(null);
  }
  const [cambioTarifa, setCambioTarifa] = useState<{ id: string; valor: string; motivo: string } | null>(null);
  const [errorTarifa, setErrorTarifa] = useState<string | null>(null);
  const [nuevoMotivo, setNuevoMotivo] = useState("");
  const [editMotivo, setEditMotivo] = useState<{ id: string; v: string } | null>(null);
  const [nuevoAutorizador, setNuevoAutorizador] = useState({ nombre: "", cargo: "" });
  const [editAutorizador, setEditAutorizador] = useState<{ id: string; nombre: string; cargo: string } | null>(null);
  const [verHist, setVerHist] = useState<string | null>(null);

  const aviso = (r: { ok: boolean; error?: string }, exito: string) => {
    setMsg({ ok: r.ok, t: r.ok ? exito : r.error ?? "Error" });
    if (r.ok) router.refresh();
  };

  /**
   * Corre una acción del servidor dejando SIEMPRE los botones libres.
   *
   * Antes cada botón hacía `setBusy(true)` … `setBusy(false)` en línea recta. Si la
   * acción fallaba —se cayó la red, la sesión venció, o el servidor se estaba
   * reiniciando por un despliegue—, la promesa se rompía y el `setBusy(false)` nunca
   * corría: TODOS los botones de la pantalla quedaban deshabilitados, sin un solo
   * mensaje. Desde afuera se veía como "le doy Guardar y no hace nada", y la única
   * salida era recargar la página sin saber por qué.
   */
  async function ejecutar<T extends { ok: boolean; error?: string }>(
    accion: () => Promise<T>,
    exito: string,
  ): Promise<T | null> {
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

  async function crear() {
    const r = await ejecutar(() => crearTipo(nuevo), "Tipo de visitante creado.");
    if (r?.ok) setNuevo({ nombre: "", requiere_pago: true, valor: "", edad_min: "", edad_max: "" });
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Tipos de visitante y tarifas</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">
        Crea tipos, ajusta quién cobra y cambia tarifas. Las tarifas nunca se sobrescriben: cada cambio guarda la
        vigencia anterior y queda en la auditoría.
      </p>

      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {/* Crear */}
      <section className="mb-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Crear tipo de visitante</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre (p. ej. Estudiante)" className="rounded-lg border border-ranch-marron/30 px-3 py-2" />
          <input
            value={nuevo.valor}
            onChange={(e) => setNuevo({ ...nuevo, valor: e.target.value })}
            placeholder="Tarifa (p. ej. 60000)"
            inputMode="numeric"
            disabled={!nuevo.requiere_pago}
            className="rounded-lg border border-ranch-marron/30 px-3 py-2 disabled:bg-ranch-crema/50 disabled:text-ranch-marron/40"
          />
          <input value={nuevo.edad_min} onChange={(e) => setNuevo({ ...nuevo, edad_min: e.target.value })} placeholder="Edad mínima (opcional)" inputMode="numeric" className="rounded-lg border border-ranch-marron/30 px-3 py-2" />
          <input value={nuevo.edad_max} onChange={(e) => setNuevo({ ...nuevo, edad_max: e.target.value })} placeholder="Edad máxima (opcional)" inputMode="numeric" className="rounded-lg border border-ranch-marron/30 px-3 py-2" />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-ranch-marron">
          <input
            type="checkbox"
            checked={nuevo.requiere_pago}
            onChange={(e) => setNuevo({ ...nuevo, requiere_pago: e.target.checked, valor: e.target.checked ? nuevo.valor : "0" })}
            className="h-4 w-4"
          />
          Este tipo cobra entrada
        </label>
        <p className="mt-1 text-xs text-ranch-marron/50">Si no cobra (bebé, cortesía, adulto mayor…), la tarifa queda en $ 0 pero igual genera manilla.</p>
        <button onClick={crear} disabled={busy} className="mt-3 rounded-lg bg-ranch-marron px-5 py-2 font-semibold text-ranch-crema disabled:opacity-50">Crear tipo</button>
      </section>

      {/* Lista — solo lectura; toda la edición vive en el formulario modal (✏️ Editar). */}
      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Tipos ({tipos.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ranch-marron/60">
                <th className="py-1">Tipo</th><th>Tarifa vigente</th><th>Cobra</th><th>Edad</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.id} className={`border-t border-ranch-marron/10 align-top ${!t.activo ? "opacity-50" : ""}`}>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <IconoTipo icono={t.icono} nombre={t.nombre} className="!h-9 !w-9" />
                      <span>
                        <strong className="text-ranch-marron">{t.nombre}</strong>
                        {t.requiere_carnet && (
                          <span title="Debe presentar carnet" className="ml-1 rounded bg-ranch-dorado/15 px-1 text-[10px] font-bold text-ranch-dorado">
                            * carnet
                          </span>
                        )}
                        {t.requiere_escaneo && (
                          <span title="Se escanea en la aplicación de bonos" className="ml-1 rounded bg-ranch-verde/15 px-1 text-[10px] font-bold text-ranch-verde">
                            ☑ escaneo
                          </span>
                        )}
                        {t.permite_descuento && (
                          <span title="Admite descuento unitario en taquilla" className="ml-1 rounded bg-ranch-dorado/15 px-1 text-[10px] font-bold text-ranch-dorado">
                            % descuento
                          </span>
                        )}
                        {t.disponible_dias !== "todos" && (
                          <span title="Solo se ve en taquilla ese día" className="ml-1 rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-700">
                            {ETIQUETA_DISPONIBILIDAD[t.disponible_dias]}
                          </span>
                        )}
                        {t.solo_administrador && (
                          <span title="Solo un administrador la ve y la vende en taquilla" className="ml-1 rounded bg-red-100 px-1 text-[10px] font-bold text-red-700">
                            🔒 solo admin
                          </span>
                        )}
                        <br /><span className="text-[10px] text-ranch-marron/40">{t.codigo}</span>
                      </span>
                    </span>
                  </td>

                  {/* Tarifa — solo lectura aquí; se cambia desde el formulario. */}
                  <td>
                    <span className="font-semibold text-ranch-marron">{t.valorVigente > 0 ? formatearCOP(t.valorVigente) : "Gratis"}</span>
                  </td>

                  {/* Cobra — se deduce de la tarifa, no se marca aparte. */}
                  <td>
                    <span
                      title="Lo define la tarifa: mayor a $ 0 cobra, en $ 0 no cobra."
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${t.requiere_pago ? "bg-ranch-verde/15 text-ranch-verde" : "bg-ranch-crema text-ranch-marron/60"}`}
                    >
                      {t.requiere_pago ? "Cobra" : "No cobra"}
                    </span>
                  </td>

                  <td className="text-xs text-ranch-marron/60">{rangoEdad(t.edad_min, t.edad_max)}</td>

                  {/* Estado */}
                  <td>
                    <button
                      onClick={() => ejecutar(() => cambiarEstadoTipo(t.id, !t.activo), t.activo ? "Tipo desactivado." : "Tipo activado.")}
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${t.activo ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-100 text-red-700"}`}
                    >
                      {t.activo ? "Activo" : "Inactivo"}
                    </button>
                  </td>
                  <td className="text-right">
                    <button onClick={() => abrirEdicion(t)} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60">✏️ Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Formulario de edición — datos del tipo y sus dos franjas de tarifa, todo en un solo lugar. */}
      {edicion && (() => {
        const t = tipos.find((x) => x.id === edicion.id);
        if (!t) return null;
        return (
          <Modal title={`Editar — ${t.nombre}`} onClose={() => setEdicion(null)}>
            <div className="space-y-5">
              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ranch-marron/45">Datos básicos</p>
                <div className="flex items-center gap-2">
                  <IconoTipo icono={edicion.icono || null} nombre={edicion.nombre} className="!h-11 !w-11 shrink-0" />
                  <input
                    value={edicion.nombre}
                    onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
                    placeholder="Nombre"
                    className="w-full rounded-lg border border-ranch-marron/25 px-3 py-2"
                  />
                </div>
                <input
                  value={edicion.icono}
                  onChange={(e) => setEdicion({ ...edicion, icono: e.target.value })}
                  placeholder="Icono: 🤠 o /logos/campbell.png"
                  title="Un emoji, o la ruta de un logo dentro de /public"
                  className="mt-2 w-full rounded-lg border border-ranch-marron/25 px-3 py-2 text-sm"
                />
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="text-xs text-ranch-marron/60">
                    Edad mínima
                    <input
                      value={edicion.edad_min}
                      onChange={(e) => setEdicion({ ...edicion, edad_min: e.target.value.replace(/\D/g, "") })}
                      inputMode="numeric" placeholder="—"
                      className="mt-1 w-full rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-center text-sm text-ranch-marron"
                    />
                  </label>
                  <label className="text-xs text-ranch-marron/60">
                    Edad máxima
                    <input
                      value={edicion.edad_max}
                      onChange={(e) => setEdicion({ ...edicion, edad_max: e.target.value.replace(/\D/g, "") })}
                      inputMode="numeric" placeholder="—"
                      className="mt-1 w-full rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-center text-sm text-ranch-marron"
                    />
                  </label>
                  <label className="text-xs text-ranch-marron/60">
                    Orden en taquilla
                    <input
                      value={edicion.orden}
                      onChange={(e) => setEdicion({ ...edicion, orden: e.target.value.replace(/\D/g, "") })}
                      inputMode="numeric"
                      className="mt-1 w-full rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-center text-sm text-ranch-marron"
                    />
                  </label>
                </div>
                <div className="mt-3 space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-ranch-marron/80">
                    <input type="checkbox" checked={edicion.requiere_carnet} onChange={(e) => setEdicion({ ...edicion, requiere_carnet: e.target.checked })} className="h-4 w-4" />
                    Debe presentar carnet
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ranch-marron/80">
                    <input type="checkbox" checked={edicion.requiere_escaneo} onChange={(e) => setEdicion({ ...edicion, requiere_escaneo: e.target.checked })} className="h-4 w-4" />
                    Se escanea en la app de bonos
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ranch-marron/80">
                    <input type="checkbox" checked={edicion.permite_descuento} onChange={(e) => setEdicion({ ...edicion, permite_descuento: e.target.checked })} className="h-4 w-4" />
                    Admite descuento unitario en taquilla
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ranch-marron/80">
                    <input type="checkbox" checked={edicion.solo_administrador} onChange={(e) => setEdicion({ ...edicion, solo_administrador: e.target.checked })} className="h-4 w-4" />
                    Solo administrador puede verlo y venderlo en taquilla
                  </label>
                </div>
                <label className="mt-3 block text-xs text-ranch-marron/60">
                  Disponible en taquilla
                  <select
                    value={edicion.disponible_dias}
                    onChange={(e) => setEdicion({ ...edicion, disponible_dias: e.target.value as Disponibilidad })}
                    className="mt-1 w-full rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-sm text-ranch-marron"
                  >
                    <option value="todos">Todos los días</option>
                    <option value="semana">Solo entre semana</option>
                    <option value="fin_semana_festivo">Solo fin de semana/festivo</option>
                  </select>
                  <span className="mt-1 block text-[11px] text-ranch-marron/45">
                    El día que no corresponda, este tipo NO aparece en taquilla — así el cajero no se equivoca.
                  </span>
                </label>
              </section>

              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ranch-marron/45">Tarifa</p>
                <div className="rounded-xl border-2 border-ranch-marron/15 bg-ranch-crema/30 p-3">
                  {cambioTarifa?.id === t.id ? (
                    <div className="space-y-1.5">
                      <input
                        value={cambioTarifa.valor}
                        onChange={(e) => setCambioTarifa({ ...cambioTarifa, valor: e.target.value })}
                        placeholder="Nuevo valor"
                        inputMode="numeric"
                        autoFocus
                        className="w-full rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-sm"
                      />
                      <input
                        value={cambioTarifa.motivo}
                        onChange={(e) => setCambioTarifa({ ...cambioTarifa, motivo: e.target.value })}
                        placeholder="Motivo del cambio"
                        className="w-full rounded-lg border border-ranch-marron/25 px-2 py-1.5 text-sm"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={async () => {
                            const r = await ejecutar(() => cambiarTarifa(t.id, cambioTarifa.valor, cambioTarifa.motivo), "Tarifa actualizada.");
                            setErrorTarifa(!r ? "No se pudo guardar: revisa la conexión." : r.ok ? null : r.error ?? "Error");
                            if (r?.ok) setCambioTarifa(null);
                          }}
                          className="rounded-lg bg-ranch-dorado px-3 py-1 text-xs font-semibold text-white"
                        >Guardar</button>
                        <button onClick={() => { setCambioTarifa(null); setErrorTarifa(null); }} className="rounded-lg border border-ranch-marron/25 px-3 py-1 text-xs text-ranch-marron">Cancelar</button>
                      </div>
                      {errorTarifa && <p className="rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-700">{errorTarifa}</p>}
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg font-black text-ranch-marron">{t.valorVigente > 0 ? formatearCOP(t.valorVigente) : "Gratis"}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <button onClick={() => { setErrorTarifa(null); setCambioTarifa({ id: t.id, valor: String(t.valorVigente), motivo: "" }); }} className="font-semibold text-ranch-dorado hover:underline">Cambiar</button>
                        {t.historial.length > 1 && (
                          <button onClick={() => setVerHist(verHist === t.id ? null : t.id)} className="text-ranch-marron/50 hover:underline">
                            {verHist === t.id ? "ocultar historial" : "ver historial"}
                          </button>
                        )}
                      </div>
                      {verHist === t.id && (
                        <ul className="mt-2 space-y-0.5 border-t border-ranch-marron/10 pt-2 text-[11px] text-ranch-marron/70">
                          {t.historial.map((h, i) => (
                            <li key={i}>
                              <span className="font-semibold">{h.valor > 0 ? formatearCOP(h.valor) : "Gratis"}</span>{" "}
                              <span className="text-ranch-marron/50">desde {h.desde}{h.hasta ? ` hasta ${h.hasta}` : " (vigente)"}</span>
                              {h.motivo && <span className="text-ranch-marron/40"> · {h.motivo}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <div className="flex justify-end gap-2 border-t border-ranch-marron/10 pt-3">
                <button onClick={() => setEdicion(null)} className="rounded-lg border border-ranch-marron/25 px-4 py-2 text-sm font-semibold text-ranch-marron">Cerrar</button>
                <button onClick={guardarEdicion} disabled={busy} className="rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50">Guardar datos básicos</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Motivos de cortesía — alimentan el selector "Motivo…" de taquilla. */}
      <section className="mt-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-1 font-bold text-ranch-marron">Motivos de cortesía</h2>
        <p className="mb-3 text-xs text-ranch-marron/55">
          Son las causas que el cajero elige al registrar una atención o invitación, y por las que se
          agrupa la relación de lo no cobrado.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={nuevoMotivo}
            onChange={(e) => setNuevoMotivo(e.target.value)}
            placeholder="Nuevo motivo (p. ej. Alcaldía)"
            className="flex-1 rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm"
          />
          <button
            disabled={busy}
            onClick={async () => {
              const r = await ejecutar(() => crearMotivo(nuevoMotivo), "Motivo creado.");
              if (r?.ok) setNuevoMotivo("");
            }}
            className="rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50"
          >
            Agregar
          </button>
        </div>

        {/* Con el campo de edición abierto, un motivo largo hacía que el botón
            Guardar se saliera de la pantalla en un equipo angosto: sin este
            contenedor no había forma de confirmar el cambio. */}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ranch-marron/50">
              <th className="py-1">Motivo</th>
              <th className="py-1 text-right">Usos</th>
              <th className="py-1 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {motivos.map((m) => (
              <tr key={m.id} className={`border-t border-ranch-marron/10 ${m.activo ? "" : "opacity-50"}`}>
                <td className="py-2">
                  {editMotivo?.id === m.id ? (
                    <input
                      value={editMotivo.v}
                      onChange={(e) => setEditMotivo({ id: m.id, v: e.target.value })}
                      className="w-full min-w-[16rem] rounded border border-ranch-marron/30 px-2 py-1"
                    />
                  ) : (
                    <span className="font-semibold text-ranch-marron">{m.nombre}</span>
                  )}
                </td>
                <td className="py-2 text-right text-xs text-ranch-marron/50">{m.usos || "—"}</td>
                <td className="py-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    {editMotivo?.id === m.id ? (
                      <>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            const r = await ejecutar(() => editarMotivo(m.id, editMotivo.v), "Motivo actualizado.");
                            if (r?.ok) setEditMotivo(null);
                          }}
                          className="rounded bg-ranch-marron px-2 py-0.5 text-xs font-semibold text-ranch-crema disabled:opacity-50"
                        >Guardar</button>
                        <button onClick={() => setEditMotivo(null)} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs text-ranch-marron">Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditMotivo({ id: m.id, v: m.nombre })} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60">✏️ Editar</button>
                        <button
                          disabled={busy}
                          onClick={() => ejecutar(() => cambiarEstadoMotivo(m.id, !m.activo), m.activo ? "Motivo desactivado." : "Motivo activado.")}
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${m.activo ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-100 text-red-700"}`}
                        >{m.activo ? "Activo" : "Inactivo"}</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {motivos.length === 0 && (
              <tr><td colSpan={3} className="py-4 text-center text-ranch-marron/50">No hay motivos. Crea el primero arriba.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </section>

      {/* Autorizadores — alimentan el selector "Autoriza…" de cortesías y descuentos. */}
      <section className="mt-6 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-1 font-bold text-ranch-marron">Autorizados para dar cortesías</h2>
        <p className="mb-3 text-xs text-ranch-marron/55">
          Quienes pueden aprobar una cortesía o un descuento. No tienen que ser usuarios de la app: el
          cajero elige aquí quién autorizó, y ese nombre queda en la relación de lo no cobrado.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={nuevoAutorizador.nombre}
            onChange={(e) => setNuevoAutorizador({ ...nuevoAutorizador, nombre: e.target.value })}
            placeholder="Nombre y apellido"
            className="flex-1 rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm"
          />
          <input
            value={nuevoAutorizador.cargo}
            onChange={(e) => setNuevoAutorizador({ ...nuevoAutorizador, cargo: e.target.value })}
            placeholder="Cargo (opcional)"
            className="flex-1 rounded-lg border border-ranch-marron/30 px-3 py-2 text-sm"
          />
          <button
            disabled={busy}
            onClick={async () => {
              const r = await ejecutar(() => crearAutorizador(nuevoAutorizador.nombre, nuevoAutorizador.cargo), "Autorizador agregado.");
              if (r?.ok) setNuevoAutorizador({ nombre: "", cargo: "" });
            }}
            className="rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50"
          >
            Agregar
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ranch-marron/50">
              <th className="py-1">Persona</th>
              <th className="py-1">Cargo</th>
              <th className="py-1 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {autorizadores.map((a) => (
              <tr key={a.id} className={`border-t border-ranch-marron/10 ${a.activo ? "" : "opacity-50"}`}>
                <td className="py-2">
                  {editAutorizador?.id === a.id ? (
                    <input
                      value={editAutorizador.nombre}
                      onChange={(e) => setEditAutorizador({ ...editAutorizador, nombre: e.target.value })}
                      className="w-full min-w-[16rem] rounded border border-ranch-marron/30 px-2 py-1"
                    />
                  ) : (
                    <span className="font-semibold text-ranch-marron">
                      {a.nombre}
                      {a.esUsuario && (
                        <span title="También es usuario de la app" className="ml-1 text-[10px] font-normal text-ranch-marron/40">· usuario</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="py-2 text-xs text-ranch-marron/60">
                  {editAutorizador?.id === a.id ? (
                    <input
                      value={editAutorizador.cargo}
                      onChange={(e) => setEditAutorizador({ ...editAutorizador, cargo: e.target.value })}
                      placeholder="Cargo"
                      className="w-40 rounded border border-ranch-marron/30 px-2 py-1"
                    />
                  ) : (
                    a.cargo || "—"
                  )}
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    {editAutorizador?.id === a.id ? (
                      <>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            const r = await ejecutar(() => editarAutorizador(a.id, editAutorizador.nombre, editAutorizador.cargo), "Autorizador actualizado.");
                            if (r?.ok) setEditAutorizador(null);
                          }}
                          className="rounded bg-ranch-marron px-2 py-0.5 text-xs font-semibold text-ranch-crema disabled:opacity-50"
                        >Guardar</button>
                        <button onClick={() => setEditAutorizador(null)} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs text-ranch-marron">Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setEditAutorizador({ id: a.id, nombre: a.nombre, cargo: a.cargo ?? "" })}
                          className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60"
                        >✏️ Editar</button>
                        <button
                          disabled={busy}
                          onClick={() => ejecutar(() => cambiarEstadoAutorizador(a.id, !a.activo), a.activo ? "Autorizador desactivado." : "Autorizador activado.")}
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${a.activo ? "bg-ranch-verde/15 text-ranch-verde" : "bg-red-100 text-red-700"}`}
                        >{a.activo ? "Activo" : "Inactivo"}</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {autorizadores.length === 0 && (
              <tr><td colSpan={3} className="py-4 text-center text-ranch-marron/50">No hay autorizadores. Agrega el primero arriba.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="mt-4 text-xs text-ranch-marron/50">
        Nota: nada se borra. Para retirar un tipo, un motivo o un autorizador, desactívalo (deja de
        aparecer en taquilla pero conserva su historial).
      </p>
    </main>
  );
}
