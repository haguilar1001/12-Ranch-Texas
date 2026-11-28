"use client";

import { ETIQUETA_CATEGORIA, formatearCantidad } from "@/lib/granja/insumos";

export interface InsumoMed { id: string; nombre: string; unidad: string; categoria: string; existencia: number }
export interface LineaMed { insumo_id: string; cantidad: string; dosis: string }
export const lineaVacia = (): LineaMed => ({ insumo_id: "", cantidad: "", dosis: "" });

const input = "rounded-lg border border-ranch-marron/30 px-3 py-2 text-base sm:text-sm";
// Primero medicamentos, luego desinfección y curación; lo demás al final.
const ORDEN: Record<string, number> = { medicamento: 0, desinfeccion: 1, aseo: 2, fumigacion: 3, otro: 4 };

/** Medicamentos aplicados: producto del inventario de insumos, cantidad que sale y dosis/vía. */
export default function LineasMedicamentos({ insumos, lineas, onCambio }: { insumos: InsumoMed[]; lineas: LineaMed[]; onCambio: (l: LineaMed[]) => void }) {
  const cats = Object.keys(ETIQUETA_CATEGORIA).sort((a, b) => (ORDEN[a] ?? 9) - (ORDEN[b] ?? 9));
  const set = (i: number, k: keyof LineaMed, v: string) => onCambio(lineas.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div>
      <p className="mb-1 text-xs text-ranch-marron/70">Medicamentos aplicados (salen del inventario de insumos)</p>
      {!insumos.length && <p className="mb-2 text-xs text-ranch-marron/50">No hay insumos cargados; créalos en <a className="underline" href="/admin/granja/insumos">Insumos y medicamentos</a>.</p>}
      <div className="space-y-2">
        {lineas.map((l, i) => {
          const ins = insumos.find((x) => x.id === l.insumo_id);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select className={`${input} min-w-0 flex-1`} value={l.insumo_id} onChange={(e) => set(i, "insumo_id", e.target.value)} aria-label={`Medicamento ${i + 1}`}>
                <option value="">Escoge el medicamento…</option>
                {cats.map((c) => {
                  const del = insumos.filter((x) => x.categoria === c);
                  return del.length ? (
                    <optgroup key={c} label={ETIQUETA_CATEGORIA[c as keyof typeof ETIQUETA_CATEGORIA]}>
                      {del.map((x) => <option key={x.id} value={x.id} disabled={x.existencia <= 0}>{x.nombre} · hay {formatearCantidad(x.existencia, x.unidad)}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
              <input className={`${input} w-24`} inputMode="decimal" placeholder="Cantidad" value={l.cantidad} onChange={(e) => set(i, "cantidad", e.target.value)} aria-label={`Cantidad del medicamento ${i + 1}`} />
              <span className="w-12 text-sm text-ranch-marron/60">{ins?.unidad ?? ""}</span>
              <input className={`${input} w-40`} placeholder="Dosis / vía (10 ml IM)" value={l.dosis} onChange={(e) => set(i, "dosis", e.target.value)} aria-label={`Dosis del medicamento ${i + 1}`} />
              {lineas.length > 1 && <button type="button" aria-label="Quitar medicamento" className="text-red-700" onClick={() => onCambio(lineas.filter((_, j) => j !== i))}>✕</button>}
            </div>
          );
        })}
      </div>
      <button type="button" className="mt-1 text-sm font-semibold text-ranch-marron underline" onClick={() => onCambio([...lineas, lineaVacia()])}>+ Otro medicamento</button>
    </div>
  );
}
