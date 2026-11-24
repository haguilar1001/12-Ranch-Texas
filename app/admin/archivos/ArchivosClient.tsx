"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cargarArchivo, anularArchivoAccion } from "./actions";
import { formatearCOP } from "@/lib/dinero/cop";

interface Tipo { id: string; nombre: string; extensiones: string[]; ayuda: string }
interface Archivo {
  id: string; tipo: string; nombre: string; tamano: number; anio: number | null; mes: number | null; estado: string;
  resumen: Record<string, unknown>; cargado: string; cargadoPor: string; motivo: string | null;
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ESTADO: Record<string, string> = { procesado: "Vigente", reemplazado: "Reemplazado", anulado: "Anulado" };
const n = (v: unknown) => (typeof v === "number" ? v : 0);

/** Lo que se cargó, en una frase corta según el tipo. */
function describir(tipo: string, r: Record<string, unknown>): string {
  if (tipo === "estado_resultados") {
    const t = (r.totales ?? {}) as Record<string, number>;
    return `${n(r.cuentas)} cuentas · ingresos ${formatearCOP(n(t.ingresos))} · utilidad operacional ${formatearCOP(n(t.utilidad_operacional))}`;
  }
  if (tipo === "cuadro_mes_producto") return `${n(r.meses)} meses · venta ${formatearCOP(n(r.total))} · ${n(r.ajustes)} ajustes al histórico`;
  if (tipo === "venta_historica") return `${n(r.filas).toLocaleString("es-CO")} filas del ${r.desde} al ${r.hasta} · ${formatearCOP(n(r.total))}`;
  if (tipo === "presupuesto") return `${n(r.cuentas)} cuentas · gastos/mes ${formatearCOP(n(r.gastosMes))}` + (r.empleados ? ` · nómina de ${n(r.empleados)} empleados (${formatearCOP(n(r.nominaMes))}/mes)` : "");
  return "";
}
const periodo = (a: Archivo) => (a.mes ? `${MESES[a.mes - 1]} ${a.anio}` : a.anio ? String(a.anio) : "Todo el histórico");
const kb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

export default function ArchivosClient({ tipos, archivos, todos }: { tipos: Tipo[]; archivos: Archivo[]; todos: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string; avisos?: string[] } | null>(null);
  const [anulando, setAnulando] = useState<{ id: string; motivo: string } | null>(null);
  const def = tipos.find((t) => t.id === tipo);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setEnviando(true);
    const r = await cargarArchivo(new FormData(e.currentTarget));
    setEnviando(false);
    if (r.ok) {
      setMsg({ ok: true, t: `Archivo cargado. ${describir(tipo, r.resumen ?? {})}`, avisos: (r.resumen?.avisos as string[]) ?? [] });
      form.current?.reset();
      setTipo("");
      router.refresh();
    } else setMsg({ ok: false, t: r.error ?? "No se pudo cargar." });
  }

  async function anular() {
    if (!anulando) return;
    const r = await anularArchivoAccion(anulando.id, anulando.motivo);
    if (r.ok) { setAnulando(null); router.refresh(); } else setMsg({ ok: false, t: r.error ?? "No se pudo anular." });
  }

  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Carga de archivos</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">
        La app lee cada archivo y carga sus datos en los reportes. Si subes otro del mismo periodo, reemplaza al anterior.
      </p>

      <form ref={form} onSubmit={enviar} className="mb-6 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Subir un archivo</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block text-ranch-marron/70">Qué archivo es</span>
            <select id="tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded border px-2 py-1.5">
              <option value="">Selecciona…</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-ranch-marron/70">Archivo {def ? `(${def.extensiones.join(", ")})` : ""}</span>
            <input id="archivo" name="archivo" type="file" accept={def?.extensiones.join(",")} className="w-full rounded border px-2 py-1 text-sm" />
          </label>
        </div>
        {def && <p className="mt-2 text-xs text-ranch-marron/60">{def.ayuda}</p>}
        <div className="mt-3 flex justify-end">
          <button disabled={enviando} className="rounded-lg bg-ranch-marron px-5 py-2 font-semibold text-ranch-crema disabled:opacity-50">
            {enviando ? "Leyendo el archivo…" : "Cargar"}
          </button>
        </div>
        {msg && (
          <div className={`mt-3 rounded px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
            <p>{msg.t}</p>
            {msg.avisos && msg.avisos.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-amber-800">{msg.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
            )}
          </div>
        )}
      </form>

      <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-ranch-marron">{todos ? "Todos los archivos" : "Archivos vigentes"}</h2>
          <a href={todos ? "/admin/archivos" : "/admin/archivos?ver=todos"} className="text-sm text-ranch-marron underline">
            {todos ? "Ver solo los vigentes" : "Ver también reemplazados y anulados"}
          </a>
        </div>
        {tipos.map((t) => {
          const lista = archivos.filter((a) => a.tipo === t.id);
          return (
            <div key={t.id} className="mb-5">
              <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-ranch-marron/60">{t.nombre}</h3>
              {lista.length === 0 ? (
                <p className="text-sm text-ranch-marron/40">Aún no se ha cargado ninguno.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-ranch-marron/50"><th className="py-1">Periodo</th><th>Archivo</th><th>Qué cargó</th><th>Cargó</th><th>Estado</th><th></th></tr></thead>
                    <tbody>
                      {lista.map((a) => (
                        <tr key={a.id} className={`border-t border-ranch-marron/10 align-top ${a.estado !== "procesado" ? "text-ranch-marron/40" : ""}`}>
                          <td className="whitespace-nowrap py-1.5 pr-2 font-medium">{periodo(a)}</td>
                          <td className="pr-2"><a href={`/admin/archivos/${a.id}/descargar`} className="underline" title="Descargar el original">{a.nombre}</a> <span className="text-xs text-ranch-marron/40">{kb(a.tamano)}</span></td>
                          <td className="pr-2">
                            {describir(a.tipo, a.resumen)}
                            {Array.isArray(a.resumen.avisos) && (a.resumen.avisos as string[]).length > 0 && (
                              <details className="text-xs text-amber-800"><summary>{(a.resumen.avisos as string[]).length} aviso(s)</summary><ul className="list-disc pl-4">{(a.resumen.avisos as string[]).map((x) => <li key={x}>{x}</li>)}</ul></details>
                            )}
                            {a.motivo && <span className="block text-xs">Motivo: {a.motivo}</span>}
                          </td>
                          <td className="whitespace-nowrap pr-2 text-xs">{a.cargadoPor}<br />{new Date(a.cargado).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}</td>
                          <td className="whitespace-nowrap pr-2">{ESTADO[a.estado] ?? a.estado}</td>
                          <td className="text-right">
                            {a.estado === "procesado" && (anulando?.id === a.id ? (
                              <span className="flex justify-end gap-1">
                                <input autoFocus value={anulando.motivo} onChange={(e) => setAnulando({ id: a.id, motivo: e.target.value })} placeholder="Motivo" className="w-28 rounded border px-1 py-0.5 text-xs" />
                                <button onClick={anular} className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Anular</button>
                                <button onClick={() => setAnulando(null)} className="rounded border px-2 py-0.5 text-xs">✕</button>
                              </span>
                            ) : (
                              <button onClick={() => setAnulando({ id: a.id, motivo: "" })} className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600">Anular</button>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
