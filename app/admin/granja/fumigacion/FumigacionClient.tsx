"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FotosEvidencia from "@/components/FotosEvidencia";
import { ETIQUETA_CATEGORIA, formatearCantidad } from "@/lib/granja/insumos";
import { registrarFumigacion, anularFumigacion } from "../actions";

interface Insumo { id: string; nombre: string; unidad: string; categoria: string; existencia: number }
interface Fum {
  id: string; fecha: string; donde: string; plaga: string | null; quien: string; observaciones: string | null; anulada: boolean;
  motivo_anulacion: string | null; fotos: string[]; productos: { nombre: string; unidad: string; cantidad: number }[];
}
interface Props {
  hoy: string; esSupervisor: boolean; recintos: { id: string; nombre: string }[]; empleados: { id: string; nombre: string }[];
  insumos: Insumo[]; fumigaciones: Fum[];
}

const input = "w-full rounded-lg border border-ranch-marron/30 px-3 py-2 text-base sm:text-sm";
const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white";
const PLAGAS = ["MOSCAS", "MOSQUITOS", "GARRAPATAS", "PULGAS", "ÁCAROS", "CUCARACHAS", "ROEDORES", "HORMIGAS"];
const fechaCorta = (f: string) => new Date(`${f}T12:00:00-05:00`).toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
// Primero los venenos de fumigación, luego desinfección y lo demás.
const ORDEN: Record<string, number> = { fumigacion: 0, desinfeccion: 1, aseo: 2, medicamento: 3, otro: 4 };

export default function FumigacionClient(p: Props) {
  const router = useRouter();
  const vacio = { fecha: p.hoy, recinto_id: "", zona: "", plaga: "", empleado_id: "", observaciones: "" };
  const [f, setF] = useState(vacio);
  const [productos, setProductos] = useState<{ insumo_id: string; cantidad: string }[]>([{ insumo_id: "", cantidad: "" }]);
  const [fotos, setFotos] = useState<File[]>([]);
  const [claveFotos, setClaveFotos] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [anulando, setAnulando] = useState<{ id: string; motivo: string } | null>(null);

  const disponibles = [...p.insumos].sort((a, b) => (ORDEN[a.categoria] ?? 9) - (ORDEN[b.categoria] ?? 9) || a.nombre.localeCompare(b.nombre));
  const set = (k: keyof typeof vacio) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function guardar() {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.set(k, v));
    fd.set("productos", JSON.stringify(productos));
    fotos.forEach((x) => fd.append("fotos", x));
    const r = await registrarFumigacion(fd);
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, t: "Fumigación registrada. Los productos ya salieron del inventario." });
      setF(vacio); setProductos([{ insumo_id: "", cantidad: "" }]); setFotos([]); setClaveFotos((k) => k + 1);
      router.refresh();
    } else setMsg({ ok: false, t: r.error ?? "No se pudo registrar." });
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="text-3xl font-black text-ranch-marron">Fumigación</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Dónde se fumigó, contra qué, con qué producto y cuánto, quién lo hizo y fotos. Lo usado sale solo del inventario de insumos.</p>

      <section className={`mb-6 space-y-4 ${card} p-4`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Fecha"><input type="date" max={p.hoy} className={input} value={f.fecha} onChange={set("fecha")} /></Campo>
          <Campo label="Recinto (corral, establo…)">
            <select className={input} value={f.recinto_id} onChange={set("recinto_id")}>
              <option value="">—</option>{p.recintos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="…o zona del parque"><input className={input} value={f.zona} onChange={set("zona")} placeholder="Ej.: bodega de alimento" /></Campo>
          <Campo label="Contra qué (plaga)">
            <input className={input} list="plagas" value={f.plaga} onChange={set("plaga")} placeholder="Ej.: moscas" />
            <datalist id="plagas">{PLAGAS.map((x) => <option key={x} value={x} />)}</datalist>
          </Campo>
          <Campo label="Quién la hizo *">
            <select className={input} value={f.empleado_id} onChange={set("empleado_id")}>
              <option value="">—</option>{p.empleados.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
          </Campo>
        </div>

        <div>
          <p className="mb-1 text-xs text-ranch-marron/70">Productos usados *</p>
          {!p.insumos.length && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No hay insumos cargados. Créalos primero en <a className="underline" href="/admin/granja/insumos">Insumos y medicamentos</a>.</p>}
          <div className="space-y-2">
            {productos.map((pr, i) => {
              const ins = p.insumos.find((x) => x.id === pr.insumo_id);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select className={`${input} min-w-0 flex-1`} value={pr.insumo_id} aria-label={`Producto ${i + 1}`}
                    onChange={(e) => setProductos(productos.map((x, j) => (j === i ? { ...x, insumo_id: e.target.value } : x)))}>
                    <option value="">Escoge el producto…</option>
                    {Object.entries(ETIQUETA_CATEGORIA).map(([c, et]) => {
                      const del = disponibles.filter((x) => x.categoria === c);
                      return del.length ? (
                        <optgroup key={c} label={et}>
                          {del.map((x) => <option key={x.id} value={x.id} disabled={x.existencia <= 0}>{x.nombre} · hay {formatearCantidad(x.existencia, x.unidad)}</option>)}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                  <input className={`${input.replace("w-full ", "")} w-28`} inputMode="decimal" placeholder="Cantidad" aria-label={`Cantidad del producto ${i + 1}`} value={pr.cantidad}
                    onChange={(e) => setProductos(productos.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} />
                  <span className="w-12 text-sm text-ranch-marron/60">{ins?.unidad ?? ""}</span>
                  {productos.length > 1 && <button type="button" aria-label="Quitar producto" className="text-red-700" onClick={() => setProductos(productos.filter((_, j) => j !== i))}>✕</button>}
                </div>
              );
            })}
          </div>
          <button type="button" className="mt-2 text-sm font-semibold text-ranch-marron underline" onClick={() => setProductos([...productos, { insumo_id: "", cantidad: "" }])}>+ Otro producto</button>
        </div>

        <Campo label="Observaciones"><textarea rows={2} className={input} value={f.observaciones} onChange={set("observaciones")} placeholder="Dosis, mezcla, clima…" /></Campo>
        <FotosEvidencia key={claveFotos} max={4} onCambio={setFotos} etiqueta="Fotos (hasta 4)" />

        <button onClick={guardar} disabled={busy} className="w-full rounded-xl bg-ranch-marron py-3 text-lg font-bold text-ranch-crema disabled:opacity-50">{busy ? "Guardando…" : "Registrar fumigación"}</button>
        {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.t}</p>}
      </section>

      <h2 className="mb-2 font-bold text-ranch-marron">Historial</h2>
      {!p.fumigaciones.length && <p className="text-sm text-ranch-marron/50">Todavía no hay fumigaciones registradas.</p>}
      <ul className="space-y-2">
        {p.fumigaciones.map((x) => (
          <li key={x.id} className={`${card} p-3 text-sm ${x.anulada ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap justify-between gap-2">
              <b className="text-ranch-marron">{fechaCorta(x.fecha)} · {x.donde}</b>
              <span className="text-xs text-ranch-marron/60">{x.anulada ? `ANULADA: ${x.motivo_anulacion}` : `Hizo: ${x.quien}`}</span>
            </div>
            {x.plaga && <p className="text-ranch-marron/80">Contra: {x.plaga}</p>}
            <p className="text-ranch-marron/80">{x.productos.map((pr) => `${pr.nombre} ${formatearCantidad(pr.cantidad, pr.unidad)}`).join(" · ")}</p>
            {x.observaciones && <p className="text-xs text-ranch-marron/60">{x.observaciones}</p>}
            {x.fotos.length > 0 && (
              <div className="mt-2 flex gap-2">
                {x.fotos.map((id) => (
                  <a key={id} href={`/admin/granja/fotos/${id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/admin/granja/fotos/${id}`} alt="Foto de la fumigación" className="h-16 w-16 rounded-lg object-cover" />
                  </a>
                ))}
              </div>
            )}
            {p.esSupervisor && !x.anulada && (
              <div className="mt-2">
                {anulando?.id === x.id ? (
                  <span className="flex flex-wrap gap-1">
                    <input autoFocus className="rounded border px-2 py-1 text-sm" placeholder="Motivo" value={anulando.motivo} onChange={(e) => setAnulando({ id: x.id, motivo: e.target.value })} />
                    <button disabled={busy} className="rounded bg-red-600 px-2 text-sm font-semibold text-white" onClick={async () => {
                      setBusy(true); const r = await anularFumigacion(x.id, anulando.motivo); setBusy(false);
                      setMsg(r.ok ? { ok: true, t: "Fumigación anulada: los productos volvieron al inventario." } : { ok: false, t: r.error ?? "No se pudo." });
                      if (r.ok) { setAnulando(null); router.refresh(); }
                    }}>Anular</button>
                    <button className="rounded border px-2 text-sm" onClick={() => setAnulando(null)}>✕</button>
                  </span>
                ) : <button className="text-xs text-red-700 underline" onClick={() => setAnulando({ id: x.id, motivo: "" })}>Anular (devuelve los productos al inventario)</button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-ranch-marron/70">{label}<div className="mt-1">{children}</div></label>;
}
