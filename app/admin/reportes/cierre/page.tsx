import { redirect } from "next/navigation";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { cierreDelDia } from "@/lib/reportes/cierre";
import { fechaBogota } from "@/lib/tiempo";
import { formatearCOP } from "@/lib/dinero/cop";

export const dynamic = "force-dynamic";

/** "domingo, 6 de septiembre de 2026" a partir de un YYYY-MM-DD. */
function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00-05:00`));
}

function Fila({
  concepto, cantidad, unitario, total, fuerte,
}: {
  concepto: string; cantidad: number | null; unitario: number | null; total: number | null; fuerte?: boolean;
}) {
  const celda = `border border-ranch-marron/25 px-3 py-1.5 ${fuerte ? "font-bold text-ranch-marron" : "text-ranch-marron/85"}`;
  return (
    <tr className={fuerte ? "bg-ranch-crema/70" : ""}>
      <td className={`${celda} uppercase`}>{concepto}</td>
      <td className={`${celda} text-right tabular-nums`}>{cantidad === null ? "" : cantidad.toLocaleString("es-CO")}</td>
      <td className={`${celda} text-right tabular-nums`}>{unitario === null ? "" : unitario > 0 ? formatearCOP(unitario) : "—"}</td>
      <td className={`${celda} text-right tabular-nums`}>{total === null ? "" : formatearCOP(total)}</td>
    </tr>
  );
}

export default async function CierreDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden ver el cierre del día.</p></main>;
  }

  const sp = await searchParams;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? sp.fecha! : fechaBogota();
  const desde = new Date(`${fecha}T00:00:00-05:00`);
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);

  const r = await cierreDelDia(desde, hasta);
  const hayMovimiento = r.ventas.length > 0 || r.sinCobro.length > 0;

  return (
    <main className="mx-auto max-w-3xl p-4 print:max-w-none print:p-0">
      {/* Barra de control: no se imprime. */}
      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm print:hidden">
        <label className="text-ranch-marron/70">Día</label>
        <input type="date" name="fecha" defaultValue={fecha} className="rounded border border-ranch-marron/30 px-2 py-1" />
        <button className="rounded bg-ranch-marron px-3 py-1 font-semibold text-ranch-crema">Ver</button>
        <a href={`/admin/reportes/cierre/csv?fecha=${fecha}`} className="rounded bg-ranch-verde px-3 py-1 font-semibold text-white">⬇️ Excel</a>
        <span className="ml-auto text-xs text-ranch-marron/50">Ctrl+P para imprimir o guardar en PDF</span>
      </form>

      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-5 print:rounded-none print:border-0 print:p-0">
        <header className="mb-4 text-center">
          <h1 className="text-lg font-black uppercase tracking-wide text-ranch-marron">
            Parque Ranch Texas — Informe de cierre día
          </h1>
          <p className="text-sm text-ranch-marron/70">
            <span className="font-semibold">Fecha:</span> {fechaLarga(fecha)}
          </p>
        </header>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-ranch-crema">
              <th className="border border-ranch-marron/25 px-3 py-1.5 text-left font-bold uppercase text-ranch-marron">Concepto</th>
              <th className="border border-ranch-marron/25 px-3 py-1.5 text-right font-bold uppercase text-ranch-marron">Cant</th>
              <th className="border border-ranch-marron/25 px-3 py-1.5 text-right font-bold uppercase text-ranch-marron">Vr Unit</th>
              <th className="border border-ranch-marron/25 px-3 py-1.5 text-right font-bold uppercase text-ranch-marron">Vr Total</th>
            </tr>
          </thead>
          <tbody>
            {r.ventas.map((f) => (
              <Fila key={`${f.concepto}-${f.valorUnitario}`} concepto={f.concepto} cantidad={f.cantidad} unitario={f.valorUnitario} total={f.valorTotal} />
            ))}
            {r.sinCobro.map((f) => (
              <Fila key={f.concepto} concepto={f.concepto} cantidad={f.cantidad} unitario={0} total={0} />
            ))}
            {!hayMovimiento && (
              <tr><td colSpan={4} className="border border-ranch-marron/25 px-3 py-6 text-center text-ranch-marron/50">Ese día no hubo ventas.</td></tr>
            )}

            <Fila concepto="Total venta día" cantidad={r.totalCantidad} unitario={null} total={r.totalVenta} fuerte />
          </tbody>
        </table>
        {r.descuentoTotal > 0 && (
          <p className="mt-1 text-xs text-ranch-marron/55">
            Los valores unitarios ya vienen netos. A tarifa plena el día habría sido {formatearCOP(r.totalLista)}:
            se rebajaron {formatearCOP(r.descuentoTotal)}, con el detalle abajo.
          </p>
        )}

        {/* El detalle por caja vive en su propia pantalla, que es ancha: aquí no cabía. */}
        {r.porCaja.cajas.length > 1 && (
          <a
            href={`/admin/reportes/cierre/por-caja?fecha=${fecha}`}
            className="mt-4 block rounded-xl border-2 border-ranch-marron/20 bg-ranch-crema/40 px-4 py-3 text-center font-semibold text-ranch-marron hover:border-ranch-dorado print:hidden"
          >
            Ver cierre detallado por caja ({r.porCaja.cajas.join(" · ")}) →
          </a>
        )}

        {/* Agrupación por tipo de manilla */}
        <h2 className="mb-2 mt-6 font-bold uppercase text-ranch-marron">Manillas por tipo</h2>
        <table className="w-full border-collapse text-sm sm:w-2/3">
          <thead>
            <tr className="bg-ranch-crema">
              <th className="border border-ranch-marron/25 px-3 py-1.5 text-left font-bold uppercase text-ranch-marron">Clase</th>
              <th className="border border-ranch-marron/25 px-3 py-1.5 text-right font-bold uppercase text-ranch-marron">Manillas</th>
              <th className="border border-ranch-marron/25 px-3 py-1.5 text-right font-bold uppercase text-ranch-marron">Personas</th>
            </tr>
          </thead>
          <tbody>
            {r.porManilla.map((g) => (
              <tr key={g.tipo}>
                <td className="border border-ranch-marron/25 px-3 py-1.5 uppercase text-ranch-marron/85">{g.tipo}</td>
                <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">{g.manillas.toLocaleString("es-CO")}</td>
                <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums text-ranch-marron/60">{g.asistentes.toLocaleString("es-CO")}</td>
              </tr>
            ))}
            <tr className="bg-ranch-crema/70 font-bold text-ranch-marron">
              <td className="border border-ranch-marron/25 px-3 py-1.5 uppercase">Total</td>
              <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">{r.totalManillas.toLocaleString("es-CO")}</td>
              <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">{r.totalCantidad.toLocaleString("es-CO")}</td>
            </tr>
          </tbody>
        </table>
        {r.totalCantidad !== r.totalManillas && (
          <p className="mt-1 text-xs text-ranch-marron/55">
            Las personas superan las manillas en {(r.totalCantidad - r.totalManillas).toLocaleString("es-CO")}: los bebés
            entran en brazos y no llevan manilla.
          </p>
        )}

        {/* Descuentos: control de caja, no de cortesías. Quién autorizó cobrar por debajo. */}
        {r.descuentos.length > 0 && (
          <>
            <h2 className="mb-2 mt-6 font-bold uppercase text-ranch-marron">Descuentos autorizados</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-ranch-crema">
                  <th className="border border-ranch-marron/25 px-3 py-1.5 text-left font-bold uppercase text-ranch-marron">Concepto</th>
                  <th className="border border-ranch-marron/25 px-3 py-1.5 text-left font-bold uppercase text-ranch-marron">Motivo</th>
                  <th className="border border-ranch-marron/25 px-3 py-1.5 text-left font-bold uppercase text-ranch-marron">Autoriza</th>
                  <th className="border border-ranch-marron/25 px-3 py-1.5 text-right font-bold uppercase text-ranch-marron">Pers.</th>
                  <th className="border border-ranch-marron/25 px-3 py-1.5 text-right font-bold uppercase text-ranch-marron">Lista</th>
                  <th className="border border-ranch-marron/25 px-3 py-1.5 text-right font-bold uppercase text-ranch-marron">Cobrado</th>
                  <th className="border border-ranch-marron/25 px-3 py-1.5 text-right font-bold uppercase text-ranch-marron">No cobrado</th>
                </tr>
              </thead>
              <tbody>
                {r.descuentos.map((d, i) => (
                  <tr key={i}>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-ranch-marron/85">{d.concepto}</td>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-ranch-marron/85">{d.motivo}</td>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-ranch-marron/70">{d.autoriza}</td>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">{d.personas}</td>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums text-ranch-marron/60">{formatearCOP(d.valorLista)}</td>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">{formatearCOP(d.valorCobrado)}</td>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">{formatearCOP(d.noCobrado)}</td>
                  </tr>
                ))}
                <tr className="bg-ranch-crema/70 font-bold text-ranch-marron">
                  <td className="border border-ranch-marron/25 px-3 py-1.5 uppercase" colSpan={3}>Total</td>
                  <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">
                    {r.descuentos.reduce((a, d) => a + d.personas, 0)}
                  </td>
                  <td className="border border-ranch-marron/25 px-3 py-1.5" colSpan={2}></td>
                  <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">{formatearCOP(r.descuentoTotal)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* Respaldo del cierre: contra qué se cuadra la caja. */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 font-bold uppercase text-ranch-marron">Recaudo del día</h2>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {r.porMedioPago.map((m) => (
                  <tr key={m.medio}>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-ranch-marron/85">{m.medio}</td>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">{formatearCOP(m.monto)}</td>
                  </tr>
                ))}
                {r.porMedioPago.length === 0 && (
                  <tr><td className="border border-ranch-marron/25 px-3 py-1.5 text-ranch-marron/50">Sin recaudo.</td></tr>
                )}
              </tbody>
            </table>
            {r.yaRecaudado.length > 0 && (
              <>
                <h2 className="mb-2 mt-4 font-bold uppercase text-ranch-marron">Ya estaba en banco</h2>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {r.yaRecaudado.map((m) => (
                      <tr key={m.medio}>
                        <td className="border border-ranch-marron/25 px-3 py-1.5 text-ranch-marron/85">{m.medio}</td>
                        <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">{formatearCOP(m.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-xs text-ranch-marron/55">
                  Bonos de convenio y compras por la página web: suman a la venta del día, pero el cajero no
                  recibió esa plata — ya estaba en el banco, y no entra al arqueo.
                </p>
              </>
            )}
          </div>

          <div>
            <h2 className="mb-2 font-bold uppercase text-ranch-marron">Turnos del día</h2>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {r.turnos.map((t, i) => (
                  <tr key={i}>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-ranch-marron/85">
                      {t.caja}
                      <span className="block text-xs text-ranch-marron/50">{t.cajero} · {t.ventas} ventas</span>
                    </td>
                    <td className="border border-ranch-marron/25 px-3 py-1.5 text-right tabular-nums">{formatearCOP(t.recaudado)}</td>
                  </tr>
                ))}
                {r.turnos.length === 0 && (
                  <tr><td className="border border-ranch-marron/25 px-3 py-1.5 text-ranch-marron/50">Sin turnos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-ranch-marron/55">
          {r.ventasCompletadas} venta(s) completada(s)
          {r.ventasAnuladas > 0 && ` · ${r.ventasAnuladas} anulada(s), que no entran en este informe`}.
        </p>

        <div className="mt-10 hidden grid-cols-2 gap-10 print:grid">
          <p className="border-t border-ranch-marron/40 pt-1 text-center text-xs">Cajero</p>
          <p className="border-t border-ranch-marron/40 pt-1 text-center text-xs">Supervisor</p>
        </div>
      </section>
    </main>
  );
}
