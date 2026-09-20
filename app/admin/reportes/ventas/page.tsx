import { redirect } from "next/navigation";
import FormularioFiltros from "../FormularioFiltros";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { indicadoresVentas } from "@/lib/reportes/ventas";
import { fechaBogota } from "@/lib/tiempo";
import { formatearPct } from "@/lib/reportes/util";
import { queryDe, rangoDe } from "../periodo";
import FiltroPeriodo from "../FiltroPeriodo";
import { formatearCOP } from "@/lib/dinero/cop";

export const dynamic = "force-dynamic";

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border-2 border-ranch-marron/20 bg-white p-3 text-center">
      <p className="text-xs text-ranch-marron/60">{label}</p>
      <p className="text-lg font-black text-ranch-marron">{valor}</p>
      {sub && <p className="text-xs text-ranch-marron/45">{sub}</p>}
    </div>
  );
}

export default async function ReporteVentasPage({ searchParams }: { searchParams: Promise<{ anio?: string; mes?: string; fecha?: string; dia?: string; caja?: string; cajero?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const hoy = fechaBogota();
  const sp = await searchParams;
  const cajaId = sp.caja || undefined;
  const cajeroId = sp.cajero || undefined;

  const periodo = rangoDe({ fecha: sp.fecha, anio: sp.anio, mes: sp.mes, dia: sp.dia }, hoy);

  const [ind, cajas, cajeros] = await Promise.all([
    indicadoresVentas(periodo.inicio, periodo.fin, { cajaId, cajeroId }),
    prisma.caja.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  const qs = queryDe(periodo, cajaId, cajeroId);

  return (
    <main className="mx-auto max-w-4xl p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Reporte de ventas</h1>
      <FormularioFiltros className="mb-4 flex flex-wrap gap-2 text-sm">
        <FiltroPeriodo anio={periodo.anio} mes={periodo.mes} fecha={periodo.fecha} hoy={hoy} />
        <select name="caja" defaultValue={cajaId ?? ""} className="rounded border px-2 py-1">
          <option value="">Todas las cajas</option>
          {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select name="cajero" defaultValue={cajeroId ?? ""} className="rounded border px-2 py-1">
          <option value="">Todos los cajeros</option>
          {cajeros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <a href={`/admin/reportes/ventas/csv?${qs}`} className="rounded bg-ranch-verde px-3 py-1 font-semibold text-white">⬇️ Excel</a>
        <a href={`/admin/reportes/cortesias?${qs}`} className="rounded border border-ranch-marron/25 px-3 py-1 font-semibold text-ranch-marron">Ver cortesías</a>
      </FormularioFiltros>

      <p className="mb-2 text-sm capitalize text-ranch-marron/60">{periodo.etiqueta}</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Entradas (asistentes)" valor={String(ind.asistentes)} />
        <Kpi label="Ventas" valor={String(ind.numVentas)} />
        <Kpi label="Ingreso total" valor={formatearCOP(ind.ingreso)} />
        <Kpi label="Ticket promedio" valor={formatearCOP(ind.ticketPromedio)} sub={`${ind.numClientes} ${ind.numClientes === 1 ? "cliente" : "clientes"}`} />
        <Kpi label="Entradas de cortesía" valor={String(ind.personasCortesia)} />
        <Kpi label="Valor no cobrado" valor={formatearCOP(ind.valorNoCobrado)} />
        <Kpi label="% cortesías/desc." valor={formatearPct(ind.pctCortesias)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
          <h2 className="mb-2 font-bold text-ranch-marron">Por tipo de visitante</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-ranch-marron/45">
                <th className="pb-1 text-left font-semibold">Tipo</th>
                <th className="pb-1 text-right font-semibold">Entradas</th>
                <th className="pb-1 text-right font-semibold">Cortesía</th>
                <th className="pb-1 text-right font-semibold">Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {ind.porTipo.map((t) => (
                <tr key={t.tipo} className="border-t border-ranch-marron/10">
                  <td className="py-1">{t.tipo}</td>
                  <td className="py-1 text-right tabular-nums">{t.cantidad}</td>
                  <td className="py-1 text-right tabular-nums text-ranch-dorado">{t.cortesias || <span className="text-ranch-marron/25">—</span>}</td>
                  <td className="py-1 text-right tabular-nums">{formatearCOP(t.total)}</td>
                </tr>
              ))}
              {ind.porTipo.length === 0 && <tr><td className="py-1 text-ranch-marron/40">Sin datos.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
          <h2 className="mb-1 font-bold text-ranch-marron">Cómo entraron</h2>
          <p className="mb-2 text-xs text-ranch-marron/50">Personas por clase de entrada, y lo que se dejó de cobrar en cada una.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-ranch-marron/45">
                <th className="pb-1 text-left font-semibold">Clase</th>
                <th className="pb-1 text-right font-semibold">Personas</th>
                <th className="pb-1 text-right font-semibold">No cobrado</th>
              </tr>
            </thead>
            <tbody>
              {ind.porClase.map((c) => (
                <tr key={c.clase} className="border-t border-ranch-marron/10">
                  <td className="py-1">{c.clase}</td>
                  <td className="py-1 text-right font-semibold tabular-nums">{c.personas}</td>
                  <td className="py-1 text-right tabular-nums">{c.noCobrado > 0 ? formatearCOP(c.noCobrado) : <span className="text-ranch-marron/25">—</span>}</td>
                </tr>
              ))}
              {ind.porClase.length === 0 && <tr><td className="py-1 text-ranch-marron/40">Sin datos.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
          <h2 className="mb-2 font-bold text-ranch-marron">Por medio de pago</h2>
          <table className="w-full text-sm"><tbody>
            {ind.porMedio.map((m) => <tr key={m.medio} className="border-t border-ranch-marron/10"><td className="py-1">{m.medio}</td><td className="py-1 text-right">{formatearCOP(m.total)}</td></tr>)}
            {ind.porMedio.length === 0 && <tr><td className="py-1 text-ranch-marron/40">Sin datos.</td></tr>}
          </tbody></table>
        </section>
        <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
          <h2 className="mb-2 font-bold text-ranch-marron">Por día de la semana</h2>
          <table className="w-full text-sm"><tbody>
            {ind.porDiaSemana.map((d) => <tr key={d.dia} className="border-t border-ranch-marron/10"><td className="py-1 capitalize">{d.dia}</td><td className="py-1 text-right">{formatearCOP(d.total)}</td></tr>)}
            {ind.porDiaSemana.length === 0 && <tr><td className="py-1 text-ranch-marron/40">Sin datos.</td></tr>}
          </tbody></table>
        </section>
        <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
          <h2 className="mb-2 font-bold text-ranch-marron">Por hora</h2>
          <table className="w-full text-sm"><tbody>
            {ind.porHora.map((h) => <tr key={h.hora} className="border-t border-ranch-marron/10"><td className="py-1">{String(h.hora).padStart(2, "0")}:00</td><td className="py-1 text-right">{formatearCOP(h.total)}</td></tr>)}
            {ind.porHora.length === 0 && <tr><td className="py-1 text-ranch-marron/40">Sin datos.</td></tr>}
          </tbody></table>
        </section>
      </div>
    </main>
  );
}
