import { redirect } from "next/navigation";
import FormularioFiltros from "../FormularioFiltros";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { relacionAnulaciones } from "@/lib/reportes/anulaciones";
import { rangoDe } from "../periodo";
import FiltroPeriodo from "../FiltroPeriodo";
import { fechaBogota, formatearFechaHoraCortaBogota } from "@/lib/tiempo";
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

/** Un agrupado (por usuario que anuló, por motivo), con barra de participación. */
function Agrupado({ titulo, filas }: { titulo: string; filas: { etiqueta: string; ventas: number; valor: number }[] }) {
  const total = filas.reduce((a, f) => a + f.valor, 0);

  return (
    <section className="flex flex-col rounded-xl border-2 border-ranch-marron/20 bg-white">
      <header className="border-b border-ranch-marron/15 px-4 py-2.5">
        <h2 className="font-bold text-ranch-marron">{titulo}</h2>
      </header>
      {filas.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ranch-marron/40">Sin datos.</p>
      ) : (
        <ul className="divide-y divide-ranch-marron/10">
          {filas.map((f) => {
            const parte = total > 0 ? (f.valor / total) * 100 : 0;
            return (
              <li key={f.etiqueta} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm leading-snug text-ranch-marron/85">{f.etiqueta}</span>
                  <span className="whitespace-nowrap text-sm font-bold tabular-nums text-ranch-marron">{formatearCOP(f.valor)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ranch-marron/10">
                    <div className="h-full rounded-full bg-red-400" style={{ width: `${parte}%` }} />
                  </div>
                  <span className="w-24 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-ranch-marron/50">
                    {f.ventas} {f.ventas === 1 ? "venta" : "ventas"} · {parte.toFixed(0)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default async function ReporteAnulacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; mes?: string; fecha?: string; dia?: string; caja?: string; anulo?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden ver el informe de anulaciones.</p></main>;
  }

  const hoy = fechaBogota();
  const sp = await searchParams;
  const cajaId = sp.caja || undefined;
  const anuloId = sp.anulo || undefined;

  const rango = rangoDe({ fecha: sp.fecha, anio: sp.anio, mes: sp.mes, dia: sp.dia }, hoy);

  const [r, cajas, usuarios] = await Promise.all([
    relacionAnulaciones(rango.inicio, rango.fin, { cajaId, anuloId }),
    prisma.caja.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);

  // Query propia (no `queryDe`): esa utilidad da por hecho un filtro de "cajero"
  // (quién vendió); aquí el filtro es "quién anuló", que es otro parámetro.
  const qs = [
    rango.fecha ? `fecha=${rango.fecha}` : `anio=${rango.anio}&mes=${rango.mes}`,
    cajaId ? `caja=${cajaId}` : "",
    anuloId ? `anulo=${anuloId}` : "",
  ].filter(Boolean).join("&");

  return (
    <main className="mx-auto max-w-[100rem] p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Ventas anuladas</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">
        Quién anuló, quién había vendido, con qué motivo y por cuánto. Se filtra por cuándo se ANULÓ, no por cuándo se vendió.
      </p>

      <FormularioFiltros className="mb-4 flex flex-wrap gap-2 text-sm">
        <FiltroPeriodo anio={rango.anio} mes={rango.mes} fecha={rango.fecha} hoy={hoy} />
        <select name="caja" defaultValue={cajaId ?? ""} className="rounded border px-2 py-1">
          <option value="">Todas las cajas</option>
          {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select name="anulo" defaultValue={anuloId ?? ""} className="rounded border px-2 py-1">
          <option value="">Quien haya anulado</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
        <a href={`/admin/reportes/anulaciones/csv?${qs}`} className="rounded bg-ranch-verde px-3 py-1 font-semibold text-white">⬇️ Excel</a>
      </FormularioFiltros>

      <p className="mb-2 text-sm capitalize text-ranch-marron/60">{rango.etiqueta}</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Valor anulado" valor={formatearCOP(r.totalAnulado)} />
        <Kpi label="Ventas anuladas" valor={String(r.totalVentas)} />
        <Kpi label="Asistentes" valor={String(r.totalAsistentes)} />
        <Kpi label="Quién más anuló" valor={r.porUsuario[0]?.usuario ?? "—"} sub={r.porUsuario[0] ? formatearCOP(r.porUsuario[0].valor) : undefined} />
      </div>

      <div className="mb-4 grid items-start gap-4 md:grid-cols-2">
        <Agrupado titulo="Por quién anuló" filas={r.porUsuario.map((u) => ({ etiqueta: u.usuario, ventas: u.ventas, valor: u.valor }))} />
        <Agrupado titulo="Por motivo" filas={r.porMotivo.map((m) => ({ etiqueta: m.motivo, ventas: m.ventas, valor: m.valor }))} />
      </div>

      <h2 className="mb-2 font-bold text-ranch-marron">Detalle</h2>
      <div className="overflow-x-auto rounded-2xl border-2 border-ranch-marron/15 bg-white">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="bg-ranch-crema/60 text-xs uppercase text-ranch-marron/60">
            <tr>
              <th className="px-3 py-2">Anulada</th>
              <th className="px-3 py-2">Venta</th>
              <th className="px-3 py-2">Comprador</th>
              <th className="px-3 py-2 text-right">Asist.</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">Motivo</th>
              <th className="px-3 py-2">Vendió</th>
              <th className="px-3 py-2">Anuló</th>
              <th className="px-3 py-2">Caja</th>
              <th className="px-3 py-2">Reemplazada por</th>
            </tr>
          </thead>
          <tbody>
            {r.lineas.map((l) => (
              <tr key={l.numero_venta} className="border-t border-ranch-marron/10">
                <td className="px-3 py-2 text-ranch-marron/60">{formatearFechaHoraCortaBogota(l.fecha)}</td>
                <td className="px-3 py-2 text-ranch-marron/70">#{l.numero_venta}</td>
                <td className="px-3 py-2 font-semibold text-ranch-marron">{l.comprador}</td>
                <td className="px-3 py-2 text-right text-ranch-marron/70">{l.cantidad_asistentes}</td>
                <td className="px-3 py-2 text-right font-bold text-ranch-marron">{formatearCOP(l.total_cobrado)}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{l.motivo}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{l.vendio}</td>
                <td className="px-3 py-2 font-semibold text-ranch-marron">{l.anulo}</td>
                <td className="px-3 py-2 text-xs text-ranch-marron/50">{l.caja}</td>
                <td className="px-3 py-2 text-ranch-marron/50">{l.reemplazada_por ? `#${l.reemplazada_por}` : "—"}</td>
              </tr>
            ))}
            {r.lineas.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-6 text-center text-ranch-marron/50">No hubo anulaciones en el período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
