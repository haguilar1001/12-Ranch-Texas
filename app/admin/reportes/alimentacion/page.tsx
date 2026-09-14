import { redirect } from "next/navigation";
import FormularioFiltros from "../FormularioFiltros";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import { formatearCOP } from "@/lib/dinero/cop";
import { variacionPct, formatearVariacion } from "@/lib/reportes/util";
import Barras from "@/components/Barras";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Rango [inicio, fin) de un mes calendario, en hora Bogotá. */
function rangoDelMes(anio: number, mes: number) {
  const inicio = new Date(`${anio}-${String(mes).padStart(2, "0")}-01T00:00:00-05:00`);
  const nAnio = mes === 12 ? anio + 1 : anio;
  const nMes = mes === 12 ? 1 : mes + 1;
  const fin = new Date(`${nAnio}-${String(nMes).padStart(2, "0")}-01T00:00:00-05:00`);
  return { inicio, fin };
}

/** Costo (no anulado) del periodo, agrupado por categoría de animal. */
async function costoPorCategoria(desde: Date, hasta: Date): Promise<Map<string, { nombre: string; monto: number }>> {
  const registros = await prisma.registroAlimentacion.findMany({
    where: { anulado: false, fecha: { gte: desde, lt: hasta }, costo: { not: null } },
    select: {
      costo: true,
      categoria_animal_id: true,
      categoria: { select: { nombre: true } },
      animal: { select: { categoria_id: true, categoria: { select: { nombre: true } } } },
    },
  });

  const mapa = new Map<string, { nombre: string; monto: number }>();
  for (const r of registros) {
    if (!r.costo) continue;
    // La ración cuelga de la categoría directo o de un animal/grupo puntual: cualquiera
    // de los dos manda a la misma categoría para efectos de este reporte.
    const id = r.categoria_animal_id ?? r.animal?.categoria_id;
    const nombre = r.categoria?.nombre ?? r.animal?.categoria.nombre;
    if (!id || !nombre) continue;
    const acc = mapa.get(id) ?? { nombre, monto: 0 };
    acc.monto += r.costo;
    mapa.set(id, acc);
  }
  return mapa;
}

export default async function ReporteAlimentacionPage({ searchParams }: { searchParams: Promise<{ anio?: string; mes?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const hoy = fechaBogota();
  const sp = await searchParams;
  const anio = parseInt(sp.anio ?? hoy.slice(0, 4), 10);
  const mes = parseInt(sp.mes ?? hoy.slice(5, 7), 10);

  const actual = rangoDelMes(anio, mes);
  const anioAnt = mes === 1 ? anio - 1 : anio;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anterior = rangoDelMes(anioAnt, mesAnt);

  const [actualMap, anteriorMap] = await Promise.all([
    costoPorCategoria(actual.inicio, actual.fin),
    costoPorCategoria(anterior.inicio, anterior.fin),
  ]);

  const ids = new Set([...actualMap.keys(), ...anteriorMap.keys()]);
  const filas = [...ids]
    .map((id) => {
      const act = actualMap.get(id)?.monto ?? 0;
      const ant = anteriorMap.get(id)?.monto ?? 0;
      return {
        nombre: actualMap.get(id)?.nombre ?? anteriorMap.get(id)?.nombre ?? "—",
        actual: act,
        anterior: ant,
        variacion: variacionPct(act, ant),
      };
    })
    .sort((a, b) => b.actual - a.actual);

  const totalActual = filas.reduce((a, f) => a + f.actual, 0);
  const totalAnterior = filas.reduce((a, f) => a + f.anterior, 0);
  const variacionTotal = variacionPct(totalActual, totalAnterior);

  // Es un COSTO: que suba es la mala noticia, al revés que en un reporte de ventas.
  const colorVariacion = (v: number | null) => (v === null ? "text-ranch-marron/40" : v > 0 ? "text-red-600" : "text-ranch-verde");

  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Alimentación de los animales</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">Costo del mes por categoría, contra el mes anterior</p>

      <FormularioFiltros className="mb-4 flex gap-2 text-sm">
        <select name="mes" defaultValue={mes} className="rounded border px-2 py-1">
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select name="anio" defaultValue={anio} className="rounded border px-2 py-1">
          {[2024, 2025, 2026].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </FormularioFiltros>

      {/* Totales */}
      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border-2 border-ranch-marron/20 bg-white p-3">
          <p className="text-xs text-ranch-marron/60">{MESES[mesAnt - 1]}</p>
          <p className="text-lg font-black text-ranch-marron">{formatearCOP(totalAnterior)}</p>
        </div>
        <div className="rounded-xl border-2 border-ranch-dorado bg-white p-3">
          <p className="text-xs text-ranch-marron/60">{MESES[mes - 1]}</p>
          <p className="text-lg font-black text-ranch-marron">{formatearCOP(totalActual)}</p>
        </div>
        <div className={`rounded-xl border-2 p-3 ${variacionTotal !== null && variacionTotal > 0 ? "border-red-400" : "border-ranch-verde"}`}>
          <p className="text-xs text-ranch-marron/60">Variación</p>
          <p className={`text-lg font-black ${colorVariacion(variacionTotal)}`}>{formatearVariacion(variacionTotal)}</p>
        </div>
      </div>

      <section className="mb-4 overflow-x-auto rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-2 font-bold text-ranch-marron">Costo por categoría de animal</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ranch-marron/60">
              <th className="py-1">Categoría</th>
              <th className="text-right">{MESES[mesAnt - 1]}</th>
              <th className="text-right">{MESES[mes - 1]}</th>
              <th className="text-right">Var.</th>
              <th className="text-right">% del mes</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.nombre} className="border-t border-ranch-marron/10">
                <td className="py-1 font-medium text-ranch-marron">{f.nombre}</td>
                <td className="text-right text-ranch-marron/60">{f.anterior ? formatearCOP(f.anterior) : "—"}</td>
                <td className="text-right font-semibold text-ranch-marron">{f.actual ? formatearCOP(f.actual) : "—"}</td>
                <td className={`text-right ${colorVariacion(f.variacion)}`}>{formatearVariacion(f.variacion)}</td>
                <td className="text-right text-ranch-marron/45">{totalActual > 0 ? `${((f.actual / totalActual) * 100).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—"}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={5} className="py-2 text-ranch-marron/40">Sin alimentación registrada en el periodo.</td></tr>}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-ranch-marron/20 font-black text-ranch-marron">
                <td className="py-1">Total</td>
                <td className="text-right">{formatearCOP(totalAnterior)}</td>
                <td className="text-right">{formatearCOP(totalActual)}</td>
                <td className={`text-right ${colorVariacion(variacionTotal)}`}>{formatearVariacion(variacionTotal)}</td>
                <td className="text-right">100,0%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {filas.length > 0 && (
        <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
          <h2 className="font-bold text-ranch-marron">¿Qué categoría concentra el gasto de {MESES[mes - 1]}?</h2>
          <p className="mb-3 text-sm text-ranch-marron/60">
            {filas[0].nombre} pesa {totalActual > 0 ? ((filas[0].actual / totalActual) * 100).toLocaleString("es-CO", { maximumFractionDigits: 0 }) : 0}% del gasto del mes.
          </p>
          <Barras datos={filas.map((f) => ({ etiqueta: f.nombre, valor: f.actual }))} />
        </section>
      )}
    </main>
  );
}
