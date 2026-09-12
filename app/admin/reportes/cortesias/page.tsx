import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { relacionCortesias, type TipoCortesia } from "@/lib/reportes/cortesias";
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

function Agrupado({ titulo, filas }: { titulo: string; filas: { etiqueta: string; personas: number; noCobrado: number }[] }) {
  return (
    <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
      <h2 className="mb-2 font-bold text-ranch-marron">{titulo}</h2>
      <table className="w-full text-sm">
        <tbody>
          {filas.map((f) => (
            <tr key={f.etiqueta} className="border-t border-ranch-marron/10">
              <td className="py-1">{f.etiqueta}</td>
              <td className="py-1 text-right text-ranch-marron/60">{f.personas}</td>
              <td className="py-1 text-right font-semibold">{formatearCOP(f.noCobrado)}</td>
            </tr>
          ))}
          {filas.length === 0 && <tr><td className="py-1 text-ranch-marron/40">Sin datos.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

export default async function ReporteCortesiasPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string; caja?: string; cajero?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden ver la relación de cortesías.</p></main>;
  }

  const hoy = fechaBogota();
  const sp = await searchParams;
  const anio = parseInt(sp.anio ?? hoy.slice(0, 4), 10);
  const mes = parseInt(sp.mes ?? hoy.slice(5, 7), 10);
  const cajaId = sp.caja || undefined;
  const cajeroId = sp.cajero || undefined;

  const inicio = new Date(`${anio}-${String(mes).padStart(2, "0")}-01T00:00:00-05:00`);
  const nAnio = mes === 12 ? anio + 1 : anio, nMes = mes === 12 ? 1 : mes + 1;
  const fin = new Date(`${nAnio}-${String(nMes).padStart(2, "0")}-01T00:00:00-05:00`);

  const [r, cajas, cajeros] = await Promise.all([
    relacionCortesias(inicio, fin, { cajaId, cajeroId }),
    prisma.caja.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  const qs = `anio=${anio}&mes=${mes}${cajaId ? `&caja=${cajaId}` : ""}${cajeroId ? `&cajero=${cajeroId}` : ""}`;

  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Relación de cortesías</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">
        Quién entró gratis, con qué motivo y quién lo autorizó. Las rebajas de tarifa no salen aquí: esas son del cierre del día, en "Descuentos autorizados".
      </p>

      <form className="mb-4 flex flex-wrap gap-2 text-sm">
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

      <p className="mb-2 text-sm text-ranch-marron/60">{MESES[mes - 1]} {anio}</p>
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

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Agrupado titulo="Por tipo" filas={r.porTipo.map((t) => ({ etiqueta: ETIQUETA[t.tipo], personas: t.personas, noCobrado: t.noCobrado }))} />
        <Agrupado titulo="Por motivo" filas={r.porMotivo.map((m) => ({ etiqueta: m.motivo, personas: m.personas, noCobrado: m.noCobrado }))} />
        <Agrupado titulo="Por quién autorizó" filas={r.porAutoriza.map((a) => ({ etiqueta: a.autoriza, personas: a.personas, noCobrado: a.noCobrado }))} />
      </div>

      <h2 className="mb-2 font-bold text-ranch-marron">Detalle</h2>
      <div className="overflow-x-auto rounded-2xl border-2 border-ranch-marron/15 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60 text-xs uppercase text-ranch-marron/60">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Venta</th>
              <th className="px-3 py-2">Tipo</th>
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
                <td className="px-3 py-2 text-ranch-marron/70">{l.tipo_visitante}</td>
                <td className="px-3 py-2 text-right font-semibold text-ranch-marron">{l.cantidad}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{l.motivo}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{l.autoriza}</td>
                <td className="px-3 py-2 text-xs text-ranch-marron/50">{l.cajero} · {l.caja}</td>
                <td className="px-3 py-2 text-right font-bold text-ranch-marron">{formatearCOP(l.no_cobrado)}</td>
              </tr>
            ))}
            {r.lineas.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-ranch-marron/50">No hubo cortesías en el período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
