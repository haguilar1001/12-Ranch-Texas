"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FotosEvidencia from "@/components/FotosEvidencia";
import { ETIQUETA_ESTADO_TRATAMIENTO, diasDeTratamiento } from "@/lib/granja/tratamientos";
import { registrarTratamiento } from "../tratamientos-actions";
import LineasMedicamentos, { lineaVacia, type InsumoMed, type LineaMed } from "./LineasMedicamentos";

interface Animal { id: string; nombre: string; codigo: string | null; cantidad: number; estado: string; categoria: string }
interface Trat {
  id: string; fecha: string; animal: string; codigo: string | null; categoria: string; diagnostico: string; veterinario: string | null;
  estado: "en_curso" | "finalizado" | "anulado"; proxima: string | null; resultado: string | null; seguimientos: number; fotos: number;
}
interface Props { hoy: string; animales: Animal[]; empleados: { id: string; nombre: string }[]; insumos: InsumoMed[]; tratamientos: Trat[] }

const input = "w-full rounded-lg border border-ranch-marron/30 px-3 py-2 text-base sm:text-sm";
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white";
const fechaCorta = (f: string) => new Date(`${f}T12:00:00-05:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
const COLOR = { en_curso: "bg-amber-100 text-amber-800", finalizado: "bg-green-100 text-green-800", anulado: "bg-ranch-marron/10 text-ranch-marron/50" };

export default function TratamientosClient(p: Props) {
  const router = useRouter();
  const vacio = { fecha: p.hoy, animal_id: "", sintomas: "", diagnostico: "", indicaciones: "", veterinario: "", empleado_id: "", proxima_revision: "", marcar_enfermo: true };
  const [abrir, setAbrir] = useState(false);
  const [f, setF] = useState(vacio);
  const [meds, setMeds] = useState<LineaMed[]>([lineaVacia()]);
  const [fotos, setFotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [filtro, setFiltro] = useState<"en_curso" | "todos">("en_curso");

  const enCurso = p.tratamientos.filter((t) => t.estado === "en_curso");
  const revisar = enCurso.filter((t) => t.proxima && t.proxima <= p.hoy);
  const mes = p.hoy.slice(0, 7);
  const finalizadosMes = p.tratamientos.filter((t) => t.estado === "finalizado" && t.fecha.startsWith(mes)).length;
  const visibles = filtro === "en_curso" ? enCurso : p.tratamientos;
  const set = (k: keyof typeof vacio) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const categorias = [...new Set(p.animales.map((a) => a.categoria))];

  async function guardar() {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.set(k, typeof v === "boolean" ? (v ? "si" : "no") : v));
    fd.set("medicamentos", JSON.stringify(meds));
    fotos.forEach((x) => fd.append("fotos", x));
    const r = await registrarTratamiento(fd);
    setBusy(false);
    if (r.ok && r.id) router.push(`/admin/granja/tratamientos/${r.id}`);
    else setMsg({ ok: false, t: r.error ?? "No se pudo registrar." });
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="text-3xl font-black text-ranch-marron">Tratamientos</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">El reporte médico de cada animal: síntomas, diagnóstico, medicamentos (salen del inventario), fotos y seguimiento hasta que se cierra.</p>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi label="En curso" valor={enCurso.length} />
        <Kpi label="Revisión hoy o vencida" valor={revisar.length} alerta={revisar.length > 0} />
        <Kpi label="Cerrados este mes" valor={finalizadosMes} />
      </div>

      {!abrir ? (
        <button onClick={() => { setAbrir(true); setMsg(null); }} className="mb-5 w-full rounded-xl bg-ranch-marron py-3 text-lg font-bold text-ranch-crema">+ Nuevo tratamiento</button>
      ) : (
        <section className={`mb-5 space-y-3 ${card} p-4`}>
          <div className="flex items-center justify-between"><h2 className="font-bold text-ranch-marron">Nuevo tratamiento</h2><button className="text-sm underline" onClick={() => setAbrir(false)}>Cerrar</button></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Animal *" span>
              <select className={input} value={f.animal_id} onChange={set("animal_id")}>
                <option value="">Escoge el animal…</option>
                {categorias.map((c) => (
                  <optgroup key={c} label={c}>
                    {p.animales.filter((a) => a.categoria === c).map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre}{a.codigo ? ` (${a.codigo})` : ""}{a.cantidad > 1 ? ` · lote de ${a.cantidad}` : ""}{a.estado !== "activo" ? ` · ${a.estado}` : ""}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Campo>
            <Campo label="Fecha"><input type="date" max={p.hoy} className={input} value={f.fecha} onChange={set("fecha")} /></Campo>
            <Campo label="Síntomas (qué se ve)" span3><textarea rows={2} className={input} value={f.sintomas} onChange={set("sintomas")} placeholder="Ej.: no come, cojea de la pata delantera derecha" /></Campo>
            <Campo label="Diagnóstico *" span3><input className={input} value={f.diagnostico} onChange={set("diagnostico")} placeholder="Ej.: cólico leve / herida en el casco" /></Campo>
            <Campo label="Tratamiento indicado" span3><textarea rows={2} className={input} value={f.indicaciones} onChange={set("indicaciones")} placeholder="Ej.: antibiótico cada 12 h por 5 días, curar la herida a diario" /></Campo>
            <Campo label="Veterinario"><input className={input} value={f.veterinario} onChange={set("veterinario")} placeholder="Nombre" /></Campo>
            <Campo label="Quién lo cuida">
              <select className={input} value={f.empleado_id} onChange={set("empleado_id")}>
                <option value="">—</option>{p.empleados.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Próxima revisión"><input type="date" min={f.fecha} className={input} value={f.proxima_revision} onChange={set("proxima_revision")} /></Campo>
          </div>
          <LineasMedicamentos insumos={p.insumos} lineas={meds} onCambio={setMeds} />
          <FotosEvidencia max={4} onCambio={setFotos} etiqueta="Fotos (hasta 4)" />
          <label className="flex items-center gap-2 text-sm text-ranch-marron">
            <input type="checkbox" className="h-5 w-5" checked={f.marcar_enfermo} onChange={(e) => setF({ ...f, marcar_enfermo: e.target.checked })} />
            Marcar el animal como <b>enfermo</b> mientras dura el tratamiento
          </label>
          <button onClick={guardar} disabled={busy} className="w-full rounded-xl bg-ranch-marron py-3 text-lg font-bold text-ranch-crema disabled:opacity-50">{busy ? "Guardando…" : "Abrir tratamiento"}</button>
          {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
        </section>
      )}

      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-bold text-ranch-marron">{filtro === "en_curso" ? "En curso" : "Todos"}</h2>
        <div className="flex gap-1">
          {(["en_curso", "todos"] as const).map((x) => (
            <button key={x} onClick={() => setFiltro(x)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filtro === x ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/25 text-ranch-marron"}`}>{x === "en_curso" ? "En curso" : "Todos"}</button>
          ))}
        </div>
      </div>
      {!visibles.length && <p className="text-sm text-ranch-marron/50">{filtro === "en_curso" ? "No hay tratamientos en curso." : "Todavía no hay tratamientos."}</p>}
      <ul className="space-y-2">
        {visibles.map((t) => (
          <li key={t.id}>
            <a href={`/admin/granja/tratamientos/${t.id}`} className={`block ${card} p-3 text-sm hover:border-ranch-marron/40`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-ranch-marron">{t.animal}{t.codigo ? ` (${t.codigo})` : ""} <span className="font-normal text-ranch-marron/60">· {t.categoria}</span></b>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${COLOR[t.estado]}`}>{ETIQUETA_ESTADO_TRATAMIENTO[t.estado]}</span>
              </div>
              <p className="text-ranch-marron/80">{t.diagnostico}</p>
              <p className="text-xs text-ranch-marron/50">
                Desde {fechaCorta(t.fecha)}{t.estado === "en_curso" ? ` · día ${diasDeTratamiento(t.fecha, p.hoy)}` : ""}
                {t.veterinario ? ` · Vet. ${t.veterinario}` : ""} · {t.seguimientos} seguimiento(s) · {t.fotos} foto(s)
                {t.estado === "en_curso" && t.proxima && <b className={t.proxima <= p.hoy ? " text-red-700" : ""}> · revisión {fechaCorta(t.proxima)}</b>}
                {t.resultado && ` · ${t.resultado}`}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Campo({ label, span, span3, children }: { label: string; span?: boolean; span3?: boolean; children: React.ReactNode }) {
  return <label className={`block text-xs text-ranch-marron/70 ${span ? "sm:col-span-2" : ""} ${span3 ? "sm:col-span-3" : ""}`}>{label}<div className="mt-1">{children}</div></label>;
}
function Kpi({ label, valor, alerta }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <div className={`${card} p-3 text-center ${alerta ? "border-red-300" : ""}`}>
      <p className={`text-2xl font-black ${alerta ? "text-red-700" : "text-ranch-marron"}`}>{valor}</p>
      <p className="text-xs uppercase text-ranch-marron/60">{label}</p>
    </div>
  );
}
