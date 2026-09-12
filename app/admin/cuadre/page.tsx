import { redirect } from "next/navigation";
import Link from "next/link";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { cuadreDiario } from "@/lib/caja/cuadreDiario";
import { formatearCOP } from "@/lib/dinero/cop";
import { fechaBogota } from "@/lib/tiempo";
import DiaNav from "./DiaNav";

export const dynamic = "force-dynamic";

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default async function CuadreDiaPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden ver el cuadre consolidado.</p></main>;
  }

  const sp = await searchParams;
  const fecha = sp.fecha && ES_FECHA.test(sp.fecha) ? sp.fecha : fechaBogota();
  const c = await cuadreDiario(fecha);

  const Fila = ({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) => (
    <div className={`flex justify-between py-1 text-sm ${fuerte ? "font-bold text-ranch-marron" : "text-ranch-marron/80"}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  );

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <style>{`@media print { .no-print { display:none !important } @page { margin: 12mm } }`}</style>

      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Cuadre diario consolidado</h1>
      <p className="mb-3 text-sm text-ranch-marron/60">Ventas y efectivo recaudado el {fecha}, por fecha de la venta (hora Bogotá).</p>

      <DiaNav fecha={fecha} />

      {c.turnos === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ranch-marron/30 bg-white p-8 text-center text-ranch-marron/60">
          No hubo ventas ese día.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { t: "Total ventas", v: formatearCOP(c.totalVentas) },
              { t: "Asistentes", v: String(c.asistentes) },
              { t: "N.° ventas", v: String(c.numVentas) },
              { t: "Turnos con actividad", v: String(c.turnos) },
            ].map((k) => (
              <div key={k.t} className="rounded-xl border-2 border-ranch-marron/15 bg-white p-3">
                <p className="text-xs text-ranch-marron/50">{k.t}</p>
                <p className="text-lg font-black text-ranch-marron">{k.v}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
              <h2 className="mb-1 border-b border-ranch-marron/15 pb-1 text-sm font-bold text-ranch-marron">Ventas por medio de pago</h2>
              {c.ventasPorMedio.length === 0 ? <p className="py-1 text-sm text-ranch-marron/50">—</p> :
                c.ventasPorMedio.map((m) => <Fila key={m.codigo} k={m.medio} v={formatearCOP(m.total)} />)}
              <Fila k="Total ventas" v={formatearCOP(c.totalVentas)} fuerte />
            </section>

            <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
              <h2 className="mb-1 border-b border-ranch-marron/15 pb-1 text-sm font-bold text-ranch-marron">Ventas por tipo</h2>
              {c.ventasPorTipo.length === 0 ? <p className="py-1 text-sm text-ranch-marron/50">—</p> :
                c.ventasPorTipo.map((t) => <Fila key={t.tipo} k={`${t.tipo} (${t.cantidad})`} v={formatearCOP(t.total)} />)}
            </section>
          </div>

          <section className="mt-4 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
            <h2 className="mb-1 border-b border-ranch-marron/15 pb-1 text-sm font-bold text-ranch-marron">Efectivo recaudado en el día</h2>
            <Fila k="Ventas en efectivo" v={formatearCOP(c.ventasEfectivo)} />
            <Fila k="+ Otros ingresos" v={formatearCOP(c.otrosIngresos)} />
            <Fila k="− Egresos" v={formatearCOP(c.egresos)} />
            <div className="flex justify-between border-t border-ranch-marron/15 py-1 text-base font-black text-ranch-marron">
              <span>Efectivo recaudado</span>
              <span>{formatearCOP(c.efectivoRecaudado)}</span>
            </div>
            <p className="mt-1 text-xs text-ranch-marron/50">El arqueo del cajón (base, contado, diferencia) se hace por turno, en su cuadre.</p>
            {(c.cortesias > 0 || c.descuentos > 0 || c.anuladas > 0) && (
              <div className="mt-2 border-t border-ranch-marron/15 pt-2">
                {c.cortesias > 0 && <Fila k="Cortesías (entraron gratis)" v={formatearCOP(c.cortesias)} />}
                {c.descuentos > 0 && <Fila k="Descuentos de tarifa (no cobrado)" v={formatearCOP(c.descuentos)} />}
                {c.anuladas > 0 && <Fila k="Ventas anuladas" v={String(c.anuladas)} />}
              </div>
            )}
          </section>

          {/* Detalle por turno */}
          <section className="mt-4 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
            <h2 className="mb-2 text-sm font-bold text-ranch-marron">Detalle por turno ({c.turnos})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ranch-marron/60">
                    <th className="py-1">Caja</th><th>Cajero</th><th>Estado</th>
                    <th className="text-right">Ventas del día</th><th className="text-right">Efectivo</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {c.detalle.map((d) => (
                    <tr key={d.turnoId} className="border-t border-ranch-marron/10">
                      <td className="py-2">{d.caja}</td>
                      <td className="text-ranch-marron/70">{d.usuario}</td>
                      <td>
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${d.estado === "cerrado" ? "bg-ranch-verde/15 text-ranch-verde" : "bg-amber-100 text-amber-800"}`}>
                          {d.estado}
                        </span>
                      </td>
                      <td className="text-right">{formatearCOP(d.totalVentas)}</td>
                      <td className="text-right text-ranch-marron/70">{formatearCOP(d.ventasEfectivo)}</td>
                      <td className="text-right">
                        <Link href={`/caja/cuadre/${d.turnoId}`} className="no-print text-xs text-ranch-dorado hover:underline">ver</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
