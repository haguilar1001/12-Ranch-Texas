import { redirect } from "next/navigation";
import FormularioFiltros from "../FormularioFiltros";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { resumenAnual, ventaPorProductoMes } from "@/lib/reportes/comparativo";
import { variacionPct, formatearVariacion } from "@/lib/reportes/util";
import { formatearCOP } from "@/lib/dinero/cop";

export const dynamic = "force-dynamic";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const pct = (v: number) => `${(v * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export default async function VentaProductosPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const anios = (await resumenAnual()).map((r) => r.anio).sort((a, b) => b - a);
  const sp = await searchParams;
  const anio = anios.includes(+(sp.anio ?? 0)) ? +sp.anio! : anios[0] ?? new Date().getFullYear();
  const { filas, mesesTranscurridos, mesesCerrados } = await ventaPorProductoMes(anio);
  const meses = Array.from({ length: mesesTranscurridos }, (_, i) => i);
  const total = filas.reduce((t, f) => t + f.total, 0), totalAnt = filas.reduce((t, f) => t + f.totalAnterior, 0), totalComp = filas.reduce((t, f) => t + f.totalComparable, 0);
  const cerrados = mesesCerrados === 12 ? `${anio}` : mesesCerrados ? `ene–${MESES[mesesCerrados - 1].toLowerCase()}` : "";
  const totMes = meses.map((i) => filas.reduce((t, f) => t + f.meses[i], 0));
  const periodo = mesesTranscurridos === 12 ? `${anio}` : `ene–${MESES[mesesTranscurridos - 1].toLowerCase()} ${anio}`;
  const lider = filas[0];
  const varT = variacionPct(totalComp, totalAnt);
  const colorVar = (v: number | null) => (v == null ? "text-ranch-marron/40" : v >= 0 ? "text-ranch-verde" : "text-red-600");

  return (
    <main className="mx-auto max-w-[96rem] p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Venta por producto y mes</h1>
      <p className="mb-3 text-sm text-ranch-marron/60">
        {periodo}: {formatearCOP(total)}.{cerrados ? ` En los meses cerrados (${cerrados}) va ${formatearVariacion(varT)} frente a ${anio - 1}.` : ""}
        {lider ? ` ${lider.producto} aporta ${pct(lider.total / (total || 1))}.` : ""} Fuente: venta histórica, ventas fuera de taquilla y taquilla en vivo.
      </p>

      <FormularioFiltros className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <select name="anio" defaultValue={anio} className="rounded border px-2 py-1" aria-label="Año">
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </FormularioFiltros>

      <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ranch-marron/60">
                <th className="py-1 pr-2">Producto</th>
                {meses.map((i) => <th key={i} className="px-1 text-right">{MESES[i]}</th>)}
                <th className="px-1 text-right">Total</th><th className="px-1 text-right">% part.</th>
                <th className="px-1 text-right">{anio} {cerrados}</th><th className="px-1 text-right">{anio - 1} {cerrados}</th><th className="px-1 text-right">Var.</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const v = variacionPct(f.totalComparable, f.totalAnterior);
                return (
                  <tr key={f.producto} className="border-t border-ranch-marron/10">
                    <td className="whitespace-nowrap py-1 pr-2 font-medium">{f.producto}</td>
                    {meses.map((i) => (
                      <td key={i} className="whitespace-nowrap px-1 text-right tabular-nums" title={f.taquilla[i] ? "Sale de la taquilla en vivo" : undefined}>
                        {f.meses[i] ? formatearCOP(f.meses[i]) : "—"}{f.taquilla[i] && <sup className="ml-0.5 font-bold text-ranch-verde">T</sup>}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-1 text-right font-bold tabular-nums">{formatearCOP(f.total)}</td>
                    <td className="whitespace-nowrap px-1 text-right tabular-nums text-ranch-marron/50">{total ? pct(f.total / total) : ""}</td>
                    <td className="whitespace-nowrap px-1 text-right tabular-nums text-ranch-marron/60">{f.totalComparable ? formatearCOP(f.totalComparable) : "—"}</td>
                    <td className="whitespace-nowrap px-1 text-right tabular-nums text-ranch-marron/60">{f.totalAnterior ? formatearCOP(f.totalAnterior) : "—"}</td>
                    <td className={`whitespace-nowrap px-1 text-right tabular-nums ${colorVar(v)}`}>{formatearVariacion(v)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ranch-marron/30 font-bold">
                <td className="py-1 pr-2">Total</td>
                {totMes.map((t, i) => <td key={i} className="whitespace-nowrap px-1 text-right tabular-nums">{formatearCOP(t)}</td>)}
                <td className="whitespace-nowrap px-1 text-right tabular-nums">{formatearCOP(total)}</td>
                <td className="px-1 text-right">100,00%</td>
                <td className="whitespace-nowrap px-1 text-right tabular-nums">{formatearCOP(totalComp)}</td>
                <td className="whitespace-nowrap px-1 text-right tabular-nums">{formatearCOP(totalAnt)}</td>
                <td className={`whitespace-nowrap px-1 text-right tabular-nums ${colorVar(varT)}`}>{formatearVariacion(varT)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-ranch-marron/50">
          <sup className="font-bold text-ranch-verde">T</sup> = el valor sale de la taquilla en vivo (entradas y eventos desde el primer mes completo de taquilla).
          La comparación con {anio - 1} usa solo meses cerrados: el mes en curso no entra porque está a medias.
        </p>
      </section>
    </main>
  );
}
