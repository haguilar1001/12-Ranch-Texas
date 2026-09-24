"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearSolicitud } from "../actions";
import { PRIORIDADES, DURACIONES, type Prioridad } from "@/lib/vehiculos/calculo";

interface Solicitante { id: string; nombre: string; cargo: string | null }

const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = { baja: "Baja", media: "Media", alta: "Alta", urgente: "🔴 Urgente" };

const FORM_VACIO = {
  solicitante_id: "", fecha: "", hora_inicio: "", duracion_minutos: 60,
  prioridad: "media" as Prioridad, descripcion: "", origen: "", destino: "", viaje_redondo: false,
};

export default function SolicitarClient({ solicitantes, hoy }: { solicitantes: Solicitante[]; hoy: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...FORM_VACIO, fecha: hoy });
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function enviar() {
    setEnviando(true);
    setResultado(null);
    try {
      const r = await crearSolicitud(form);
      if (r.ok) {
        setResultado({ ok: true, texto: "Solicitud registrada. Queda pendiente de aprobación." });
        setForm({ ...FORM_VACIO, fecha: hoy });
        router.refresh();
      } else {
        setResultado({ ok: false, texto: r.error ?? "No se pudo registrar la solicitud." });
      }
    } catch {
      setResultado({ ok: false, texto: "No se pudo registrar. Revisa la conexión e intenta de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Solicitar vehículo</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Regístrala a nombre de quien la pide. Queda pendiente hasta que un supervisor la apruebe.</p>

      <div className="space-y-3 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <label className="block text-sm font-semibold text-ranch-marron">
          Quién solicita
          <select
            value={form.solicitante_id}
            onChange={(e) => setForm({ ...form, solicitante_id: e.target.value })}
            className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2"
          >
            <option value="">Selecciona…</option>
            {solicitantes.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.cargo ? ` · ${s.cargo}` : ""}</option>)}
          </select>
        </label>

        <label className="block text-sm font-semibold text-ranch-marron">
          Día
          <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-ranch-marron">
            Hora de inicio
            <input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2" />
          </label>
          <label className="block text-sm font-semibold text-ranch-marron">
            Duración aproximada
            <select
              value={form.duracion_minutos}
              onChange={(e) => setForm({ ...form, duracion_minutos: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2"
            >
              {DURACIONES.map(([min, label]) => <option key={min} value={min}>{label}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-ranch-marron">
            Origen
            <input value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })} placeholder="Ej: Parque" className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2" />
          </label>
          <label className="block text-sm font-semibold text-ranch-marron">
            Destino
            <input value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })} placeholder="Ej: Makro Barranquilla" className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2" />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold text-ranch-marron">
          <input type="checkbox" checked={form.viaje_redondo} onChange={(e) => setForm({ ...form, viaje_redondo: e.target.checked })} className="h-4 w-4" />
          Es un viaje redondo (ida y vuelta)
        </label>

        <label className="block text-sm font-semibold text-ranch-marron">
          Prioridad
          <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value as Prioridad })} className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2">
            {PRIORIDADES.map((p) => <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>)}
          </select>
        </label>

        <label className="block text-sm font-semibold text-ranch-marron">
          Para qué es
          <textarea
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Ej: llevar insumos al centro de acopio"
            rows={3}
            className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2"
          />
        </label>

        {resultado && (
          <p className={`rounded-lg px-3 py-2 text-sm ${resultado.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{resultado.texto}</p>
        )}

        <button onClick={enviar} disabled={enviando} className="w-full rounded-lg bg-ranch-marron px-4 py-3 font-semibold text-ranch-crema disabled:opacity-50">
          {enviando ? "Registrando…" : "Registrar solicitud"}
        </button>
      </div>
    </main>
  );
}
