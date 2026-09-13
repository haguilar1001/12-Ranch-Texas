import { redirect } from "next/navigation";
import Link from "next/link";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { cierreDelDia } from "@/lib/reportes/cierre";
import { fechaBogota } from "@/lib/tiempo";
import { formatearCOP } from "@/lib/dinero/cop";

export const dynamic = "force-dynamic";

function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(`${iso}T12:00:00-05:00`));
}

/** Las cifras nunca parten en dos líneas: una columna de plata se lee de un golpe. */
const NUM = "whitespace-nowrap border border-ranch-marron/25 px-2 py-1.5 text-right tabular-nums";
const TXT = "border border-ranch-marron/25 px-3 py-1.5";
const VACIO = <span className="text-ranch-marron/25">—</span>;

export default async function CierrePorCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden ver el cierre.</p></main>;
  }

  const sp = await searchParams;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? sp.fecha! : fechaBogota();
  const desde = new Date(`${fecha}T00:00:00-05:00`);
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);

  const r = await cierreDelDia(desde, hasta);
  const m = r.porCaja;

  return (
    <main className="mx-auto max-w-[100rem] p-4 print:max-w-none print:p-0">
      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm print:hidden">
        <label className="text-ranch-marron/70">Día</label>
        <input type="date" name="fecha" defaultValue={fecha} className="rounded border border-ranch-marron/30 px-2 py-1" />
        <button className="rounded bg-ranch-marron px-3 py-1 font-semibold text-ranch-crema">Ver</button>
        <a href={`/admin/reportes/cierre/csv?fecha=${fecha}`} className="rounded bg-ranch-verde px-3 py-1 font-semibold text-white">⬇️ Excel</a>
        <Link href={`/admin/reportes/cierre?fecha=${fecha}`} className="rounded border border-ranch-marron/25 px-3 py-1 font-semibold text-ranch-marron">
          ← Informe de cierre
        </Link>
        <span className="ml-auto text-xs text-ranch-marron/50">Imprime en horizontal (Ctrl+P → Horizontal)</span>
      </form>

      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-5 print:rounded-none print:border-0 print:p-0">
        <header className="mb-4 text-center">
          <h1 className="text-lg font-black uppercase tracking-wide text-ranch-marron">
            Parque Ranch Texas — Cierre detallado por caja
          </h1>
          <p className="text-sm text-ranch-marron/70">
            <span className="font-semibold">Fecha:</span> {fechaLarga(fecha)}
          </p>
        </header>

        {m.cajas.length === 0 ? (
          <p className="py-10 text-center text-ranch-marron/50">Ese día no hubo ventas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-ranch-crema">
                  <th rowSpan={2} className="whitespace-nowrap border border-ranch-marron/25 px-3 py-2 text-left font-bold uppercase text-ranch-marron">
                    Concepto
                  </th>
                  <th rowSpan={2} className="whitespace-nowrap border border-ranch-marron/25 px-2 py-2 text-right font-bold uppercase text-ranch-marron">
                    Vr Unit
                  </th>
                  {m.cajas.map((c) => (
                    <th key={c} colSpan={2} className="whitespace-nowrap border border-ranch-marron/25 px-3 py-1 text-center font-bold uppercase text-ranch-marron">
                      {c}
                    </th>
                  ))}
                  <th colSpan={2} className="whitespace-nowrap border border-ranch-marron/25 bg-ranch-dorado/20 px-3 py-1 text-center font-bold uppercase text-ranch-marron">
                    Total
                  </th>
                </tr>
                <tr className="bg-ranch-crema text-[11px] uppercase text-ranch-marron/70">
                  {[...m.cajas, "total"].map((c, i) => [
                    <th key={`${c}-c-${i}`} className="whitespace-nowrap border border-ranch-marron/25 px-2 py-1 text-right font-semibold">Cant</th>,
                    <th key={`${c}-v-${i}`} className="whitespace-nowrap border border-ranch-marron/25 px-2 py-1 text-right font-semibold">Valor</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {m.filas.map((f, fila) => (
                  <tr key={`${f.concepto}-${f.valorUnitario}-${f.cobra}`} className={fila % 2 ? "bg-ranch-crema/25" : ""}>
                    <td className={`${TXT} uppercase text-ranch-marron/85`}>{f.concepto}</td>
                    <td className={`${NUM} text-ranch-marron/70`}>{f.cobra ? formatearCOP(f.valorUnitario) : VACIO}</td>
                    {f.celdas.map((celda, i) => [
                      <td key={`c-${i}`} className={NUM}>{celda.cantidad || VACIO}</td>,
                      <td key={`v-${i}`} className={NUM}>{celda.valorTotal > 0 ? formatearCOP(celda.valorTotal) : VACIO}</td>,
                    ])}
                    <td className={`${NUM} bg-ranch-dorado/10 font-semibold`}>{f.cantidad}</td>
                    <td className={`${NUM} bg-ranch-dorado/10 font-semibold`}>{f.cobra ? formatearCOP(f.valorTotal) : VACIO}</td>
                  </tr>
                ))}
                <tr className="bg-ranch-crema font-bold text-ranch-marron">
                  <td className={`${TXT} uppercase`} colSpan={2}>Total caja</td>
                  {m.totalPorCaja.map((t, i) => [
                    <td key={`tc-${i}`} className={NUM}>{t.cantidad}</td>,
                    <td key={`tv-${i}`} className={NUM}>{formatearCOP(t.valorTotal)}</td>,
                  ])}
                  <td className={`${NUM} bg-ranch-dorado/20`}>{m.totalCantidad}</td>
                  <td className={`${NUM} bg-ranch-dorado/20`}>{formatearCOP(m.totalValor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-2 text-xs text-ranch-marron/55">
          Cant = personas. Valor = lo que se cobró, ya neto de descuentos. Las líneas sin valor
          (cortesías, bonos, bebés) suman personas pero no plata.
        </p>

        <div className="mt-8 hidden grid-cols-3 gap-10 print:grid">
          <p className="border-t border-ranch-marron/40 pt-1 text-center text-xs">Cajero</p>
          <p className="border-t border-ranch-marron/40 pt-1 text-center text-xs">Supervisor</p>
          <p className="border-t border-ranch-marron/40 pt-1 text-center text-xs">Administración</p>
        </div>
      </section>
    </main>
  );
}
