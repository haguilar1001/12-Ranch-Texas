"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registrarReporteServicio } from "../../actions";

export default function ReporteServicioForm({ id }: { id: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ km_inicial: "", km_final: "", hora_inicio_real: "", hora_fin_real: "", observaciones: "" });
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function enviar() {
    setEnviando(true);
    setResultado(null);
    try {
      const r = await registrarReporteServicio(id, form);
      if (r.ok) {
        router.push("/vehiculos/mis-viajes");
        router.refresh();
      } else {
        setResultado({ ok: false, texto: r.error ?? "No se pudo guardar el reporte." });
      }
    } catch {
      setResultado({ ok: false, texto: "No se pudo guardar. Revisa la conexión e intenta de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold text-ranch-marron">
          Km inicial
          <input
            value={form.km_inicial}
            onChange={(e) => setForm({ ...form, km_inicial: e.target.value.replace(/\D/g, "") })}
            inputMode="numeric" placeholder="0"
            className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-semibold text-ranch-marron">
          Km final
          <input
            value={form.km_final}
            onChange={(e) => setForm({ ...form, km_final: e.target.value.replace(/\D/g, "") })}
            inputMode="numeric" placeholder="0"
            className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold text-ranch-marron">
          Hora real de salida
          <input type="time" value={form.hora_inicio_real} onChange={(e) => setForm({ ...form, hora_inicio_real: e.target.value })} className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2" />
        </label>
        <label className="block text-sm font-semibold text-ranch-marron">
          Hora real de llegada
          <input type="time" value={form.hora_fin_real} onChange={(e) => setForm({ ...form, hora_fin_real: e.target.value })} className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2" />
        </label>
      </div>

      <label className="block text-sm font-semibold text-ranch-marron">
        Observaciones
        <textarea
          value={form.observaciones}
          onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
          placeholder="Novedades del viaje, del vehículo, etc. (opcional)"
          rows={3}
          className="mt-1 w-full rounded-lg border border-ranch-marron/30 px-3 py-2"
        />
      </label>

      {resultado && (
        <p className={`rounded-lg px-3 py-2 text-sm ${resultado.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{resultado.texto}</p>
      )}

      <button onClick={enviar} disabled={enviando} className="w-full rounded-lg bg-ranch-marron px-4 py-3 font-semibold text-ranch-crema disabled:opacity-50">
        {enviando ? "Guardando…" : "Guardar reporte del servicio"}
      </button>
    </div>
  );
}
