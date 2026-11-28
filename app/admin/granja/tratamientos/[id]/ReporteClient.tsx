"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FotosEvidencia from "@/components/FotosEvidencia";
import { formatearCantidad } from "@/lib/granja/insumos";
import { ETIQUETA_ESTADO_TRATAMIENTO, diasDeTratamiento } from "@/lib/granja/tratamientos";
import { agregarSeguimiento, finalizarTratamiento, anularTratamiento } from "../../tratamientos-actions";
import LineasMedicamentos, { lineaVacia, type InsumoMed, type LineaMed } from "../LineasMedicamentos";

interface T {
  id: string; numero: string; fecha: string; estado: "en_curso" | "finalizado" | "anulado";
  animal: { nombre: string; codigo: string | null; categoria: string; especie: string | null; raza: string | null; sexo: string; cantidad: number; recinto: string | null; estado: string };
  sintomas: string | null; diagnostico: string; indicaciones: string | null; veterinario: string | null; cuida: string | null; proxima: string | null;
  resultado: string | null; motivo_anulacion: string | null; registro: string | null; fotos: string[];
  seguimientos: { id: string; fecha: string; nota: string; quien: string | null }[];
  medicamentos: { id: string; fecha: string; nombre: string; unidad: string; cantidad: number; detalle: string | null; anulado: boolean }[];
}

const input = "w-full rounded-lg border border-ranch-marron/30 px-3 py-2 text-base sm:text-sm";
const boton = "rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema disabled:opacity-50";
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white print:border-0";
const fechaLarga = (f: string) => new Date(`${f}T12:00:00-05:00`).toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

export default function ReporteClient({ t, hoy, esSupervisor, insumos }: { t: T; hoy: string; esSupervisor: boolean; insumos: InsumoMed[] }) {
  const router = useRouter();
  const [seg, setSeg] = useState({ fecha: hoy, nota: "", proxima_revision: "" });
  const [meds, setMeds] = useState<LineaMed[]>([lineaVacia()]);
  const [fotos, setFotos] = useState<File[]>([]);
  const [clave, setClave] = useState(0);
  const [fin, setFin] = useState<{ resultado: string; volver: boolean } | null>(null);
  const [anular, setAnular] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const abierto = t.estado === "en_curso";
  const dias = diasDeTratamiento(t.fecha, abierto ? hoy : (t.seguimientos.at(-1)?.fecha ?? t.fecha));

  // Línea de tiempo: inicio, seguimientos y medicamentos, por fecha.
  const eventos = [
    ...t.seguimientos.map((s) => ({ fecha: s.fecha, tipo: "seg" as const, texto: s.nota, quien: s.quien })),
    ...t.medicamentos.map((m) => ({ fecha: m.fecha, tipo: "med" as const, texto: `${m.nombre} ${formatearCantidad(m.cantidad, m.unidad)}${m.detalle?.includes("·") ? ` · ${m.detalle.split("·").slice(1).join("·").trim()}` : ""}`, quien: null, anulado: m.anulado })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  async function correr(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: ok } : { ok: false, t: r.error ?? "No se pudo." });
    if (r.ok) router.refresh();
    return r.ok;
  }

  async function guardarSeguimiento() {
    const fd = new FormData();
    fd.set("tratamiento_id", t.id); fd.set("fecha", seg.fecha); fd.set("nota", seg.nota); fd.set("proxima_revision", seg.proxima_revision);
    fd.set("medicamentos", JSON.stringify(meds));
    fotos.forEach((x) => fd.append("fotos", x));
    if (await correr(() => agregarSeguimiento(fd), "Seguimiento registrado.")) {
      setSeg({ fecha: hoy, nota: "", proxima_revision: "" }); setMeds([lineaVacia()]); setFotos([]); setClave((k) => k + 1);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6 print:p-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <a href="/admin/granja/tratamientos" className="text-sm text-ranch-marron underline">← Tratamientos</a>
        <button onClick={() => window.print()} className={boton}>🖨 Imprimir reporte</button>
      </div>

      <article className={`${card} p-5`}>
        <header className="mb-4 flex items-start justify-between gap-3 border-b-2 border-ranch-marron/15 pb-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Ranch Texas" className="h-14 w-auto" />
            <div>
              <h1 className="text-2xl font-black text-ranch-marron">Reporte médico</h1>
              <p className="text-xs text-ranch-marron/60">N.° {t.numero} · Granja Ranch Texas</p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${t.estado === "en_curso" ? "bg-amber-100 text-amber-800" : t.estado === "finalizado" ? "bg-green-100 text-green-800" : "bg-ranch-marron/10 text-ranch-marron/60"}`}>
            {ETIQUETA_ESTADO_TRATAMIENTO[t.estado]}
          </span>
        </header>

        <dl className="mb-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Dato k="Animal" v={`${t.animal.nombre}${t.animal.codigo ? ` (${t.animal.codigo})` : ""}${t.animal.cantidad > 1 ? ` · lote de ${t.animal.cantidad}` : ""}`} />
          <Dato k="Categoría" v={[t.animal.categoria, t.animal.especie, t.animal.raza].filter(Boolean).join(" · ")} />
          <Dato k="Sexo" v={t.animal.sexo} />
          <Dato k="Recinto" v={t.animal.recinto ?? "—"} />
          <Dato k="Inicio" v={`${fechaLarga(t.fecha)} · ${dias} día(s)`} />
          <Dato k="Veterinario" v={t.veterinario ?? "—"} />
          <Dato k="Lo cuida" v={t.cuida ?? "—"} />
          <Dato k="Próxima revisión" v={t.proxima ? fechaLarga(t.proxima) : "—"} alerta={!!t.proxima && t.proxima <= hoy && abierto} />
        </dl>

        <Bloque titulo="Síntomas">{t.sintomas ?? "—"}</Bloque>
        <Bloque titulo="Diagnóstico">{t.diagnostico}</Bloque>
        <Bloque titulo="Tratamiento indicado">{t.indicaciones ?? "—"}</Bloque>
        {t.resultado && <Bloque titulo="Resultado">{t.resultado}</Bloque>}
        {t.motivo_anulacion && <Bloque titulo="Anulado">{t.motivo_anulacion}</Bloque>}

        <h2 className="mb-2 mt-4 text-sm font-bold uppercase text-ranch-marron/60">Evolución</h2>
        <ol className="mb-4 space-y-1 border-l-2 border-ranch-dorado pl-4 text-sm">
          <li><b>{fechaLarga(t.fecha)}</b> · Se abre el caso{t.registro ? ` (registró ${t.registro})` : ""}</li>
          {eventos.map((e, i) => (
            <li key={i} className={"anulado" in e && e.anulado ? "text-ranch-marron/40 line-through" : ""}>
              <b>{fechaLarga(e.fecha)}</b> · {e.tipo === "med" ? "💉 " : ""}{e.texto}{e.quien ? <span className="text-ranch-marron/50"> — {e.quien}</span> : null}
            </li>
          ))}
        </ol>

        {t.fotos.length > 0 && (
          <>
            <h2 className="mb-2 text-sm font-bold uppercase text-ranch-marron/60">Fotos</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {t.fotos.map((id) => (
                <a key={id} href={`/admin/granja/fotos/${id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/admin/granja/fotos/${id}`} alt="Foto del tratamiento" className="aspect-square w-full rounded-lg object-cover" />
                </a>
              ))}
            </div>
          </>
        )}
      </article>

      {msg && <p className={`mt-3 rounded-lg px-3 py-2 text-sm print:hidden ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}

      {abierto && (
        <section className={`mt-4 space-y-3 ${card} p-4 print:hidden`}>
          <h2 className="font-bold text-ranch-marron">Agregar seguimiento</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs text-ranch-marron/70">Fecha<input type="date" min={t.fecha} max={hoy} className={`${input} mt-1`} value={seg.fecha} onChange={(e) => setSeg({ ...seg, fecha: e.target.value })} /></label>
            <label className="block text-xs text-ranch-marron/70 sm:col-span-2">Próxima revisión (opcional)<input type="date" min={seg.fecha} className={`${input} mt-1`} value={seg.proxima_revision} onChange={(e) => setSeg({ ...seg, proxima_revision: e.target.value })} /></label>
            <label className="block text-xs text-ranch-marron/70 sm:col-span-3">Cómo sigue<textarea rows={2} className={`${input} mt-1`} value={seg.nota} onChange={(e) => setSeg({ ...seg, nota: e.target.value })} placeholder="Ej.: ya come, la herida cerrando" /></label>
          </div>
          <LineasMedicamentos insumos={insumos} lineas={meds} onCambio={setMeds} />
          <FotosEvidencia key={clave} max={4} onCambio={setFotos} etiqueta="Fotos (hasta 4)" />
          <button className={boton} disabled={busy} onClick={guardarSeguimiento}>{busy ? "Guardando…" : "Guardar seguimiento"}</button>
        </section>
      )}

      {abierto && (
        <section className={`mt-4 ${card} p-4 print:hidden`}>
          {!fin ? (
            <button className="text-sm font-semibold text-green-800 underline" onClick={() => setFin({ resultado: "", volver: t.animal.estado === "enfermo" })}>✔ Finalizar tratamiento</button>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs text-ranch-marron/70">Cómo terminó *<input className={`${input} mt-1`} value={fin.resultado} onChange={(e) => setFin({ ...fin, resultado: e.target.value })} placeholder="Ej.: recuperado / crónico, sigue en control" /></label>
              {t.animal.estado === "enfermo" && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={fin.volver} onChange={(e) => setFin({ ...fin, volver: e.target.checked })} /> Volver a poner el animal como <b>activo</b></label>
              )}
              <div className="flex gap-2">
                <button className={boton} disabled={busy} onClick={async () => { if (await correr(() => finalizarTratamiento(t.id, fin.resultado, fin.volver), "Tratamiento finalizado.")) setFin(null); }}>Finalizar</button>
                <button className="rounded-lg border px-3 text-sm" onClick={() => setFin(null)}>Cancelar</button>
              </div>
            </div>
          )}
        </section>
      )}

      {esSupervisor && t.estado !== "anulado" && (
        <div className="mt-4 print:hidden">
          {anular === null ? (
            <button className="text-xs text-red-700 underline" onClick={() => setAnular("")}>Anular tratamiento (devuelve los medicamentos al inventario)</button>
          ) : (
            <span className="flex flex-wrap gap-1">
              <input autoFocus className="rounded border px-2 py-1 text-sm" placeholder="Motivo" value={anular} onChange={(e) => setAnular(e.target.value)} />
              <button disabled={busy} className="rounded bg-red-600 px-2 text-sm font-semibold text-white" onClick={async () => { if (await correr(() => anularTratamiento(t.id, anular), "Tratamiento anulado.")) setAnular(null); }}>Anular</button>
              <button className="rounded border px-2 text-sm" onClick={() => setAnular(null)}>✕</button>
            </span>
          )}
        </div>
      )}
    </main>
  );
}

function Dato({ k, v, alerta }: { k: string; v: string; alerta?: boolean }) {
  return <div className="flex gap-2 border-b border-ranch-marron/10 py-1"><dt className="w-32 shrink-0 text-ranch-marron/60">{k}</dt><dd className={`font-semibold ${alerta ? "text-red-700" : "text-ranch-marron"}`}>{v}</dd></div>;
}
function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-lg bg-ranch-crema/40 px-3 py-2 print:bg-transparent print:px-0">
      <p className="text-xs font-bold uppercase text-ranch-marron/60">{titulo}</p>
      <p className="whitespace-pre-line text-sm text-ranch-marron">{children}</p>
    </div>
  );
}
