"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reportarFalla } from "@/app/admin/equipos/mantenimiento/actions";
import FotosEvidencia from "@/components/FotosEvidencia";
import ResumenFallaWhatsApp from "@/components/ResumenFallaWhatsApp";
import type { DatosResumenFalla } from "@/lib/equipos/resumen-falla";

interface EquipoOpcion { id: string; nombre: string; codigo: string | null; grupo: string; ubicacion: string | null; estado: string }
interface Mio { id: string; equipo: string; codigo: string | null; grupo: string; ubicacion: string | null; descripcion: string; estado: string; prioridad: string; detenido: boolean; fotos: number; fecha: string }

const PRIORIDADES = [
  { id: "baja", label: "Baja", ayuda: "Detalle estético o menor" },
  { id: "media", label: "Media", ayuda: "Funciona, pero con problemas" },
  { id: "alta", label: "Alta", ayuda: "Funciona mal o con riesgo de daño" },
  { id: "critica", label: "Crítica", ayuda: "No funciona o hay riesgo para personas" },
];
const ESTADO: Record<string, string> = { abierta: "Recibida", en_atencion: "En reparación", resuelta: "Resuelta", descartada: "Descartada" };
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function ReportarFallaClient({ equipos, mias, usuario }: { equipos: EquipoOpcion[]; mias: Mio[]; usuario: string }) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [equipo, setEquipo] = useState<EquipoOpcion | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [detenido, setDetenido] = useState(false);
  const [fotos, setFotos] = useState<File[]>([]);
  const [claveFotos, setClaveFotos] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  // Resumen para WhatsApp: el del reporte recién enviado (con su primera foto) o uno de "Mis reportes".
  const [resumen, setResumen] = useState<{ datos: DatosResumenFalla; foto: File | null } | null>(null);
  const refResumen = useRef<HTMLDivElement>(null);
  useEffect(() => { if (resumen) refResumen.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [resumen]);

  const resultados = useMemo(() => {
    const q = norm(buscar.trim());
    if (!q) return [];
    return equipos.filter((e) => norm(`${e.nombre} ${e.codigo ?? ""} ${e.grupo} ${e.ubicacion ?? ""}`).includes(q)).slice(0, 12);
  }, [buscar, equipos]);

  async function enviar() {
    if (!equipo) { setMsg({ ok: false, t: "Escoge el equipo." }); return; }
    setEnviando(true); setMsg(null);
    const fd = new FormData();
    fd.set("equipo_id", equipo.id); fd.set("descripcion", descripcion); fd.set("prioridad", prioridad); fd.set("detenido", detenido ? "si" : "no");
    fotos.forEach((f) => fd.append("fotos", f));
    const r = await reportarFalla(fd);
    setEnviando(false);
    if (r.ok) {
      if (r.id) setResumen({
        datos: { id: r.id, equipo: equipo.nombre, codigo: equipo.codigo, grupo: equipo.grupo, ubicacion: equipo.ubicacion, descripcion: descripcion.trim(),
          prioridad, detenido, reportadoPor: usuario, fecha: new Date().toISOString(), fotos: fotos.length },
        foto: fotos[0] ?? null,
      });
      setMsg({ ok: true, t: `Falla reportada: ${equipo.nombre}. Mantenimiento ya la ve.` });
      setEquipo(null); setBuscar(""); setDescripcion(""); setPrioridad("media"); setDetenido(false); setFotos([]); setClaveFotos((k) => k + 1);
      router.refresh();
    } else setMsg({ ok: false, t: r.error ?? "No se pudo enviar." });
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Reportar falla</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">¿Un equipo o atracción no funciona bien? Repórtalo aquí y el equipo de mantenimiento lo recibe de inmediato.</p>

      <section className="space-y-4 rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
        <div>
          <label htmlFor="buscar-equipo" className="block text-sm text-ranch-marron/70">1. ¿Qué equipo?</label>
          {equipo ? (
            <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-ranch-crema/60 px-3 py-2">
              <span><b className="text-ranch-marron">{equipo.nombre}</b> <span className="text-xs text-ranch-marron/60">{[equipo.codigo, equipo.grupo, equipo.ubicacion].filter(Boolean).join(" · ")}</span></span>
              <button type="button" onClick={() => setEquipo(null)} className="text-sm text-ranch-marron underline">Cambiar</button>
            </div>
          ) : (
            <>
              <input id="buscar-equipo" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Escribe el nombre, código o grupo (p. ej. «kart 3»)" className="mt-1 w-full rounded-xl border px-3 py-3 text-base" autoComplete="off" />
              {resultados.length > 0 && (
                <ul className="mt-1 max-h-72 overflow-y-auto rounded-xl border border-ranch-marron/15">
                  {resultados.map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => { setEquipo(e); setBuscar(""); }} className="w-full border-b border-ranch-marron/10 px-3 py-3 text-left last:border-0 hover:bg-ranch-crema/50">
                        <span className="font-semibold text-ranch-marron">{e.nombre}</span>
                        <span className="block text-xs text-ranch-marron/60">{[e.codigo, e.grupo, e.ubicacion].filter(Boolean).join(" · ")}{e.estado !== "operativo" ? ` · ${e.estado.replace("_", " ")}` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {buscar.trim() && !resultados.length && <p className="mt-1 text-xs text-ranch-marron/50">No encontré equipos con «{buscar}».</p>}
            </>
          )}
        </div>

        <label className="block text-sm">
          <span className="text-ranch-marron/70">2. ¿Qué le pasa?</span>
          <textarea id="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} placeholder="Ej.: el kart no arranca, se apaga al acelerar" className="mt-1 w-full rounded-xl border px-3 py-2 text-base" />
        </label>

        <fieldset>
          <legend className="text-sm text-ranch-marron/70">3. ¿Qué tan grave es?</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {PRIORIDADES.map((p) => (
              <button key={p.id} type="button" onClick={() => setPrioridad(p.id)} aria-pressed={prioridad === p.id}
                className={`rounded-xl border-2 px-3 py-2 text-left ${prioridad === p.id ? (p.id === "critica" ? "border-red-500 bg-red-50" : "border-ranch-marron bg-ranch-crema/60") : "border-ranch-marron/15"}`}>
                <span className="block font-bold text-ranch-marron">{p.label}</span>
                <span className="block text-xs text-ranch-marron/60">{p.ayuda}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-3 rounded-xl border-2 border-ranch-marron/15 px-3 py-3 text-sm">
          <input type="checkbox" checked={detenido} onChange={(e) => setDetenido(e.target.checked)} className="h-5 w-5" />
          <span><b className="text-ranch-marron">El equipo quedó detenido</b><span className="block text-xs text-ranch-marron/60">Se marca «fuera de servicio» hasta que lo reparen.</span></span>
        </label>

        <FotosEvidencia key={claveFotos} onCambio={setFotos} etiqueta="4. Fotos (opcional, hasta 3)" />

        <button type="button" onClick={enviar} disabled={enviando} className="w-full rounded-xl bg-ranch-marron py-3 text-lg font-bold text-ranch-crema disabled:opacity-50">
          {enviando ? "Enviando…" : "Reportar falla"}
        </button>
        {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
        {resumen && <div ref={refResumen}><ResumenFallaWhatsApp key={resumen.datos.id} datos={resumen.datos} foto={resumen.foto} onCerrar={() => setResumen(null)} /></div>}
      </section>

      {mias.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ranch-marron/50">Mis reportes</h2>
          <ul className="space-y-2">
            {mias.map((m) => (
              <li key={m.id} className="rounded-xl border border-ranch-marron/15 bg-white px-3 py-2 text-sm">
                <div className="flex justify-between gap-2"><b className="text-ranch-marron">{m.equipo}</b><span className={`text-xs ${m.estado === "resuelta" ? "text-green-700" : m.estado === "descartada" ? "text-ranch-marron/40" : "text-amber-700"}`}>{ESTADO[m.estado] ?? m.estado}</span></div>
                <p className="text-ranch-marron/70">{m.descripcion}</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-ranch-marron/40">{new Date(m.fecha).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}</p>
                  <button type="button" className="text-xs font-semibold text-green-700 underline"
                    onClick={() => setResumen({ datos: { ...m, reportadoPor: usuario }, foto: null })}>
                    Compartir por WhatsApp
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
