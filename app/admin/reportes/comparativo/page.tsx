import { redirect } from "next/navigation";
import FormularioFiltros from "../FormularioFiltros";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { comparativoAnual, productosVentaHistorica, resumenAnual } from "@/lib/reportes/comparativo";
import { variacionPct, formatearVariacion } from "@/lib/reportes/util";
import { formatearCOP } from "@/lib/dinero/cop";

export const dynamic = "force-dynamic";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default async function ComparativoPage({ searchParams }: { searchParams: Promise<{ anio?: string; producto?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const sp = await searchParams;
  const producto = sp.producto && sp.producto !== "__todos" ? sp.producto : undefined;
  const [productos, resumen] = await Promise.all([productosVentaHistorica(), resumenAnual(producto)]);
  const aniosDisponibles = resumen.map((r) => r.anio);
  const anio = parseInt(sp.anio ?? String(aniosDisponibles[aniosDisponibles.length - 1] ?? 2026), 10);

  const comp = await comparativoAnual(anio, producto);
  const max = Math.max(1, ...comp.meses.map((m) => Math.max(m.actual, m.anterior)));
  const totalVar = variacionPct(comp.totalActual, comp.totalAnterior);

  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Comparativo año vs. año</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Venta histórica del parque</p>

      <FormularioFiltros className="mb-4 flex flex-wrap gap-2 text-sm">
        <select name="anio" defaultValue={anio} className="rounded border px-2 py-1">
          {aniosDisponibles.map((a) => <option key={a} value={a}>{a} vs {a - 1}</option>)}
        </select>
        <select name="producto" defaultValue={producto ?? "__todos"} className="rounded border px-2 py-1">
          <option value="__todos">Todos los productos</option>
          {productos.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <a href={`/admin/reportes/comparativo/csv?anio=${anio}${producto ? `&producto=${encodeURIComponent(producto)}` : ""}`} className="rounded bg-ranch-verde px-3 py-1 font-semibold text-white">⬇️ Excel</a>
      </FormularioFiltros>

      {/* Totales */}
      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border-2 border-ranch-marron/20 bg-white p-3">
          <p className="text-xs text-ranch-marron/60">{anio - 1}</p>
          <p className="text-lg font-black text-ranch-marron">{formatearCOP(comp.totalAnterior)}</p>
        </div>
        <div className="rounded-xl border-2 border-ranch-dorado bg-white p-3">
          <p className="text-xs text-ranch-marron/60">{anio}</p>
          <p className="text-lg font-black text-ranch-marron">{formatearCOP(comp.totalActual)}</p>
        </div>
        <div className={`rounded-xl border-2 p-3 ${totalVar != null && totalVar >= 0 ? "border-ranch-verde" : "border-red-400"}`}>
          <p className="text-xs text-ranch-marron/60">Variación</p>
          <p className={`text-lg font-black ${totalVar != null && totalVar >= 0 ? "text-ranch-verde" : "text-red-600"}`}>{formatearVariacion(totalVar)}</p>
        </div>
      </div>

      {/* Tabla + barras */}
      <div className="overflow-x-auto rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ranch-marron/60"><th className="py-1">Mes</th><th className="text-right">{anio - 1}</th><th className="text-right">{anio}</th><th className="text-right">Var.</th><th className="w-1/3">Comparación</th></tr></thead>
          <tbody>
            {comp.meses.map((m) => {
              const v = variacionPct(m.actual, m.anterior);
              return (
                <tr key={m.mes} className="border-t border-ranch-marron/10">
                  <td className="py-1 font-medium">{MESES[m.mes - 1]}</td>
                  <td className="text-right text-ranch-marron/60">{m.anterior ? formatearCOP(m.anterior) : "—"}</td>
                  <td className="text-right font-medium">{m.actual ? formatearCOP(m.actual) : "—"}</td>
                  <td className={`text-right ${v != null && v >= 0 ? "text-ranch-verde" : v != null ? "text-red-600" : "text-ranch-marron/40"}`}>{formatearVariacion(v)}</td>
                  <td className="py-1">
                    <div className="flex flex-col gap-0.5">
                      <div className="h-2 rounded bg-ranch-marron/20" style={{ width: `${(m.anterior / max) * 100}%` }} />
                      <div className="h-2 rounded bg-ranch-dorado" style={{ width: `${(m.actual / max) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ranch-marron/30 font-bold">
              <td className="py-1">Total</td>
              <td className="text-right">{formatearCOP(comp.totalAnterior)}</td>
              <td className="text-right">{formatearCOP(comp.totalActual)}</td>
              <td className="text-right">{formatearVariacion(totalVar)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-xs text-ranch-marron/50">Barra clara = {anio - 1} · barra dorada = {anio}</p>
      </div>
    </main>
  );
}
