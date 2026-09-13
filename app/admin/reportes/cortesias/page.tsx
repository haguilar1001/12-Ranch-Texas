import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { relacionCortesias, type TipoCortesia } from "@/lib/reportes/cortesias";
import { diasDelMes, queryDe, rangoDe } from "../periodo";
import { fechaBogota, formatearFechaHoraCortaBogota } from "@/lib/tiempo";
import { formatearCOP } from "@/lib/dinero/cop";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const ETIQUETA: Record<TipoCortesia, string> = {
  atencion: "Atención",
  invitacion: "Invitación",
  cortesia: "Cortesía",
  descuento: "Descuento",
};
const COLOR: Record<TipoCortesia, string> = {
  atencion: "bg-ranch-dorado/25 text-ranch-marron",
  invitacion: "bg-ranch-verde/15 text-ranch-verde",
  cortesia: "bg-ranch-marron/15 text-ranch-marron",
  descuento: "bg-amber-100 text-amber-700",
};

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border-2 border-ranch-marron/20 bg-white p-3 text-center">
      <p className="text-xs text-ranch-marron/60">{label}</p>
      <p className="text-lg font-black text-ranch-marron">{valor}</p>
      {sub && <p className="text-xs text-ranch-marron/45">{sub}</p>}
    </div>
  );
}

/**
 * Un agrupado del informe (por tipo, por motivo, por quién autorizó).
 *
 * Lleva barra de participación a propósito: la pregunta de estos cuadros no es
 * "cuánto", sino "cuál pesa más". Con tres renglones de cifras parecidas eso no se
 * ve; con la barra se ve de una. El porcentaje es sobre el total del propio cuadro.
 */
function Agrupado({
  titulo, filas,
}: {
  titulo: string;
  filas: { etiqueta: string; personas: number; noCobrado: number }[];
}) {
  const total = filas.reduce((a, f) => a + f.noCobrado, 0);
  const personas = filas.reduce((a, f) => a + f.personas, 0);

  return (
    <section className="flex flex-col rounded-xl border-2 border-ranch-marron/20 bg-white">
      <header className="flex items-baseline justify-between gap-2 border-b border-ranch-marron/15 px-4 py-2.5">
        <h2 className="font-bold text-ranch-marron">{titulo}</h2>
        {filas.length > 0 && (
          <span className="whitespace-nowrap text-xs text-ranch-marron/50">
            {personas.toLocaleString("es-CO")} {personas === 1 ? "persona" : "personas"}
          </span>
        )}
      </header>

      {filas.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ranch-marron/40">Sin datos.</p>
      ) : (
        <ul className="divide-y divide-ranch-marron/10">
          {filas.map((f) => {
            const parte = total > 0 ? (f.noCobrado / total) * 100 : 0;
            return (
              <li key={f.etiqueta} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm leading-snug text-ranch-marron/85">{f.etiqueta}</span>
                  <span className="whitespace-nowrap text-sm font-bold tabular-nums text-ranch-marron">
                    {formatearCOP(f.noCobrado)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ranch-marron/10">
                    <div className="h-full rounded-full bg-ranch-dorado" style={{ width: `${parte}%` }} />
                  </div>
                  <span className="w-24 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-ranch-marron/50">
                    {f.personas.toLocaleString("es-CO")} pers · {parte.toFixed(0)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {filas.length > 1 && (
        <footer className="mt-auto flex items-baseline justify-between gap-2 border-t border-ranch-marron/15 bg-ranch-crema/40 px-4 py-2">
          <span className="text-xs font-bold uppercase text-ranch-marron/60">Total</span>
          <span className="whitespace-nowrap text-sm font-black tabular-nums text-ranch-marron">{formatearCOP(total)}</span>
        </footer>
      )}
    </section>
  );
}

export default async function ReporteCortesiasPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string; dia?: string; caja?: string; cajero?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden ver la relación de cortesías.</p></main>;
  }

  const hoy = fechaBogota();
  const sp = await searchParams;
  const cajaId = sp.caja || undefined;
  const cajeroId = sp.cajero || undefined;

  const rango = rangoDe({ anio: sp.anio, mes: sp.mes, dia: sp.dia }, hoy);
  const { anio, mes, dia } = rango;

  const [r, cajas, cajeros] = await Promise.all([
    relacionCortesias(rango.inicio, rango.fin, { cajaId, cajeroId }),
    prisma.caja.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  const qs = queryDe(rango, cajaId, cajeroId);
  const dias = diasDelMes(anio, mes);

  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Relación de cortesías</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">
        Quién entró gratis, con qué motivo y quién lo autorizó. Las rebajas de tarifa no salen aquí: esas son del cierre del día, en "Descuentos autorizados".
      </p>

      <form className="mb-4 flex flex-wrap gap-2 text-sm">
        {/* "Todo el mes" primero: es la pregunta que más se hace, y un día suelto
            solo se busca cuando ya se sabe qué día revisar. */}
        <select name="dia" defaultValue={dia ?? ""} className="rounded border px-2 py-1">
          <option value="">Todo el mes</option>
          {Array.from({ length: dias }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select name="mes" defaultValue={mes} className="rounded border px-2 py-1">
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select name="anio" defaultValue={anio} className="rounded border px-2 py-1">
          {[2024, 2025, 2026].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select name="caja" defaultValue={cajaId ?? ""} className="rounded border px-2 py-1">
          <option value="">Todas las cajas</option>
          {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select name="cajero" defaultValue={cajeroId ?? ""} className="rounded border px-2 py-1">
          <option value="">Todos los cajeros</option>
          {cajeros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button className="rounded bg-ranch-marron px-3 py-1 font-semibold text-ranch-crema">Ver</button>
        <a href={`/admin/reportes/cortesias/csv?${qs}`} className="rounded bg-ranch-verde px-3 py-1 font-semibold text-white">⬇️ Excel</a>
      </form>

      <p className="mb-2 text-sm capitalize text-ranch-marron/60">{rango.etiqueta}</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Valor no cobrado" valor={formatearCOP(r.totalNoCobrado)} />
        <Kpi label="Personas" valor={String(r.totalPersonas)} />
        <Kpi label="Registros" valor={String(r.lineas.length)} />
        <Kpi
          label="Atenciones"
          valor={String(r.porTipo.find((t) => t.tipo === "atencion")?.personas ?? 0)}
          sub={formatearCOP(r.porTipo.find((t) => t.tipo === "atencion")?.noCobrado ?? 0)}
        />
      </div>

      {/* Los tres cuadros NO llevan el mismo ancho: los motivos son frases largas
          ("REDENCIÓN CUMPLEAÑOS / EVENTOS") y los tipos son una sola palabra. Repartido
          en partes iguales, el de motivos parte cada etiqueta en dos líneas mientras el
          de tipos queda medio vacío. `items-start` evita además que un cuadro de una
          fila se estire hasta la altura del más largo. */}
      <div className="mb-4 grid items-start gap-4 md:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <Agrupado titulo="Por tipo" filas={r.porTipo.map((t) => ({ etiqueta: ETIQUETA[t.tipo], personas: t.personas, noCobrado: t.noCobrado }))} />
        </div>
        <div className="lg:col-span-5">
          <Agrupado titulo="Por motivo" filas={r.porMotivo.map((m) => ({ etiqueta: m.motivo, personas: m.personas, noCobrado: m.noCobrado }))} />
        </div>
        <div className="md:col-span-2 lg:col-span-4">
          <Agrupado titulo="Por quién autorizó" filas={r.porAutoriza.map((a) => ({ etiqueta: a.autoriza, personas: a.personas, noCobrado: a.noCobrado }))} />
        </div>
      </div>

      <h2 className="mb-2 font-bold text-ranch-marron">Detalle</h2>
      <div className="overflow-x-auto rounded-2xl border-2 border-ranch-marron/15 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60 text-xs uppercase text-ranch-marron/60">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Venta</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Beneficiario</th>
              <th className="px-3 py-2">Visitante</th>
              <th className="px-3 py-2 text-right">Cant.</th>
              <th className="px-3 py-2">Motivo</th>
              <th className="px-3 py-2">Autoriza</th>
              <th className="px-3 py-2">Cajero</th>
              <th className="px-3 py-2 text-right">No cobrado</th>
            </tr>
          </thead>
          <tbody>
            {r.lineas.map((l, i) => (
              <tr key={i} className="border-t border-ranch-marron/10">
                <td className="px-3 py-2 text-ranch-marron/60">{formatearFechaHoraCortaBogota(l.fecha)}</td>
                <td className="px-3 py-2 text-ranch-marron/70">#{l.numero_venta}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR[l.tipo]}`}>{ETIQUETA[l.tipo]}</span>
                </td>
                <td className="px-3 py-2 font-semibold text-ranch-marron">{l.beneficiario}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{l.tipo_visitante}</td>
                <td className="px-3 py-2 text-right font-semibold text-ranch-marron">{l.cantidad}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{l.motivo}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{l.autoriza}</td>
                <td className="px-3 py-2 text-xs text-ranch-marron/50">{l.cajero} · {l.caja}</td>
                <td className="px-3 py-2 text-right font-bold text-ranch-marron">{formatearCOP(l.no_cobrado)}</td>
              </tr>
            ))}
            {r.lineas.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-ranch-marron/50">No hubo cortesías en el período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
