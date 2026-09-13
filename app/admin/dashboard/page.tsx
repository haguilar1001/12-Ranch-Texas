import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { indicadoresVentas, ventasPorMes, type FiltrosVentas } from "@/lib/reportes/ventas";
import { comparativoAnual } from "@/lib/reportes/comparativo";
import { variacionPct, formatearVariacion } from "@/lib/reportes/util";
import { fechaBogota } from "@/lib/tiempo";
import { rangoDe } from "../reportes/periodo";
import FiltroPeriodo from "../reportes/FiltroPeriodo";
import { formatearCOP } from "@/lib/dinero/cop";
import Barras from "@/components/Barras";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_ABR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{label}</p>
      <p className="mt-1 text-2xl font-black text-ranch-marron">{valor}</p>
      {sub && <p className="text-xs text-ranch-marron/50">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ anio?: string; mes?: string; fecha?: string; caja?: string; cajero?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const hoy = fechaBogota();
  const sp = await searchParams;
  const periodo = rangoDe({ fecha: sp.fecha, anio: sp.anio, mes: sp.mes }, hoy);
  const { anio, mes } = periodo;
  const filtros: FiltrosVentas = { cajaId: sp.caja || undefined, cajeroId: sp.cajero || undefined };

  const [ind, comp, porMes, cajas, cajeros] = await Promise.all([
    indicadoresVentas(periodo.inicio, periodo.fin, filtros),
    comparativoAnual(anio),
    ventasPorMes(anio, filtros),
    prisma.caja.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    prisma.usuario.findMany({ where: { activo: true, rol: { in: ["cajero", "supervisor", "administrador"] } }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
  ]);
  const varAnual = variacionPct(comp.totalActual, comp.totalAnterior);

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-3 text-2xl font-black text-ranch-marron">Dashboard de ventas</h1>

      {/* Filtros */}
      <form className="mb-4 flex flex-wrap gap-2 text-sm">
        <FiltroPeriodo anio={anio} mes={mes} fecha={periodo.fecha} hoy={hoy} />
        <select name="caja" defaultValue={sp.caja ?? ""} className="rounded-lg border px-2 py-1">
          <option value="">Todas las cajas</option>
          {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select name="cajero" defaultValue={sp.cajero ?? ""} className="rounded-lg border px-2 py-1">
          <option value="">Todos los cajeros</option>
          {cajeros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button className="rounded-lg bg-ranch-marron px-3 py-1 font-semibold text-ranch-crema">Ver</button>
      </form>

      <p className="mb-2 text-sm capitalize text-ranch-marron/60">{periodo.etiqueta}</p>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* El rótulo sigue al período: decir "del mes" mirando un día es mentir. */}
        <Kpi label={periodo.fecha ? "Ingreso del día" : "Ingreso del mes"} valor={formatearCOP(ind.ingreso)} />
        <Kpi label="Entradas" valor={String(ind.asistentes)} sub={`${ind.numVentas} ventas`} />
        <Kpi label="Ticket promedio" valor={formatearCOP(ind.ticketPromedio)} />
        <Kpi label="% cortesías" valor={`${ind.pctCortesias.toFixed(1)}%`} sub={formatearCOP(ind.valorNoCobrado)} />
      </div>

      {/* Tendencia mensual del año (en vivo) */}
      <section className="mb-4 rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
        <h2 className="mb-3 font-bold text-ranch-marron">Ventas por mes — {anio} (app)</h2>
        <Barras datos={porMes.map((v, i) => ({ etiqueta: MESES_ABR[i], valor: v }))} vacio="Aún no hay ventas registradas en la app este año." />
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
          <h2 className="mb-3 font-bold text-ranch-marron">Por día de la semana</h2>
          <Barras datos={ind.porDiaSemana.map((d) => ({ etiqueta: d.dia, valor: d.total }))} />
        </section>
        <section className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
          <h2 className="mb-3 font-bold text-ranch-marron">Por hora</h2>
          <Barras datos={ind.porHora.map((h) => ({ etiqueta: `${String(h.hora).padStart(2, "0")}:00`, valor: h.total }))} />
        </section>
        <section className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
          <h2 className="mb-3 font-bold text-ranch-marron">Por tipo de visitante</h2>
          <Barras datos={ind.porTipo.map((t) => ({ etiqueta: t.tipo, valor: t.total }))} />
        </section>
        <section className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
          <h2 className="mb-3 font-bold text-ranch-marron">Por medio de pago</h2>
          <Barras datos={ind.porMedio.map((m) => ({ etiqueta: m.medio, valor: m.total }))} />
        </section>
      </div>

      {/* Comparativo anual (histórico) */}
      <section className="rounded-2xl border-4 border-ranch-marron bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-bold text-ranch-marron">Comparativo {anio} vs {anio - 1} (histórico)</h2>
          <div className={`text-right ${varAnual != null && varAnual >= 0 ? "text-ranch-verde" : "text-red-600"}`}>
            <span className="text-xl font-black">{formatearVariacion(varAnual)}</span>
            <span className="ml-2 text-sm text-ranch-marron/60">{formatearCOP(comp.totalActual)} vs {formatearCOP(comp.totalAnterior)}</span>
          </div>
        </div>
        <div className="space-y-1">
          {(() => {
            const max = Math.max(1, ...comp.meses.map((m) => Math.max(m.actual, m.anterior)));
            return comp.meses.map((m) => (
              <div key={m.mes} className="flex items-center gap-2 text-xs">
                <span className="w-8 shrink-0 text-ranch-marron/60">{MESES_ABR[m.mes - 1]}</span>
                <div className="flex-1 space-y-0.5">
                  <div className="h-2.5 rounded bg-ranch-marron/25" style={{ width: `${(m.anterior / max) * 100}%` }} />
                  <div className="h-2.5 rounded bg-ranch-dorado" style={{ width: `${(m.actual / max) * 100}%` }} />
                </div>
              </div>
            ));
          })()}
        </div>
        <p className="mt-2 text-xs text-ranch-marron/50">Barra clara = {anio - 1} · barra dorada = {anio} · <Link href="/admin/reportes/comparativo" className="underline">ver detalle</Link></p>
      </section>
    </main>
  );
}
