import Link from "next/link";
import { redirect } from "next/navigation";
import FormularioFiltros from "../reportes/FormularioFiltros";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { formatearCOP } from "@/lib/dinero/cop";

export const dynamic = "force-dynamic";

const pct = (v: number) => `${(v * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

// Nómina presupuestada: la hoja «Nomina» del P&G presupuestado que se carga en
// Configuración → Carga de archivos. Trae nombres y salarios: solo administrador.
export default async function NominaPresupuestoPage({ searchParams }: { searchParams: Promise<{ anio?: string; area?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "administrador")) return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo el administrador.</p></main>;

  const archivos = await prisma.archivoCargado.findMany({
    where: { tipo: "presupuesto", estado: "procesado", nomina_presupuesto: { some: {} } },
    select: { id: true, anio: true, nombre: true }, orderBy: { anio: "desc" },
  });
  if (!archivos.length) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-2xl font-black text-ranch-marron">Nómina presupuestada</h1>
        <p className="rounded-xl border-2 border-dashed border-ranch-marron/20 bg-white p-6 text-ranch-marron/70">
          Aún no hay presupuesto con nómina. Sube el P&G presupuestado (con su hoja «Nomina») en <Link href="/admin/archivos" className="underline">Configuración → Carga de archivos</Link>.
        </p>
      </main>
    );
  }
  const sp = await searchParams;
  const arch = archivos.find((a) => a.anio === +(sp.anio ?? 0)) ?? archivos[0];
  const anio = arch.anio!;
  const [todos, nominaReal] = await Promise.all([
    prisma.presupuestoNomina.findMany({ where: { archivo_id: arch.id }, orderBy: { orden: "asc" } }),
    // Nómina real del estado de resultados (cuenta NOMINA) en los meses cargados del mismo año.
    prisma.estadoResultadoLinea.groupBy({ by: ["mes"], where: { anio, seccion: "gasto", cuenta: "NOMINA", archivo: { estado: "procesado" } }, _sum: { valor: true } }),
  ]);
  const areas = [...new Set(todos.map((e) => e.area))].sort();
  const area = sp.area && areas.includes(sp.area) ? sp.area : "";
  const emp = area ? todos.filter((e) => e.area === area) : todos;

  const sum = (k: "salario" | "aux_transporte" | "sueldo_total" | "prestaciones" | "parafiscales" | "seguridad_social" | "total", lista = emp) => lista.reduce((t, e) => t + e[k], 0);
  const totalMes = sum("total"), totalTodos = sum("total", todos);
  const realProm = nominaReal.length ? nominaReal.reduce((t, r) => t + (r._sum.valor ?? 0), 0) / nominaReal.length : null;
  const porArea = areas.map((a) => { const l = todos.filter((e) => e.area === a); return { area: a, n: l.length, salarios: sum("sueldo_total", l), carga: sum("prestaciones", l) + sum("parafiscales", l) + sum("seguridad_social", l), total: sum("total", l) }; })
    .sort((a, b) => b.total - a.total);
  const factor = sum("sueldo_total") ? totalMes / sum("sueldo_total") : 0;

  return (
    <main className="mx-auto max-w-[90rem] p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Nómina presupuestada {anio}</h1>
      <p className="mb-3 text-sm text-ranch-marron/60">
        {todos.length} empleados cuestan {formatearCOP(totalTodos)} al mes a la empresa ({formatearCOP(totalTodos * 12)} al año). Fuente: hoja «Nomina» de {arch.nombre}.
      </p>

      <FormularioFiltros className="mb-4 flex flex-wrap gap-2 text-sm">
        <select name="anio" defaultValue={anio} className="rounded border px-2 py-1" aria-label="Año">
          {archivos.map((a) => <option key={a.id} value={a.anio!}>{a.anio}</option>)}
        </select>
        <select name="area" defaultValue={area} className="rounded border px-2 py-1" aria-label="Área">
          <option value="">Todas las áreas</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </FormularioFiltros>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4"><p className="text-xs uppercase tracking-wide text-ranch-marron/50">Empleados</p><p className="mt-1 text-2xl font-black text-ranch-marron">{emp.length}</p><p className="text-xs text-ranch-marron/50">{area || "todas las áreas"}</p></div>
        <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4"><p className="text-xs uppercase tracking-wide text-ranch-marron/50">Costo mensual empresa</p><p className="mt-1 text-xl font-black tabular-nums text-ranch-marron">{formatearCOP(totalMes)}</p><p className="text-xs text-ranch-marron/50">{formatearCOP(totalMes * 12)} al año</p></div>
        <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4"><p className="text-xs uppercase tracking-wide text-ranch-marron/50">Carga prestacional</p><p className="mt-1 text-xl font-black tabular-nums text-ranch-marron">{factor ? `${factor.toLocaleString("es-CO", { maximumFractionDigits: 2 })}x` : "—"}</p><p className="text-xs text-ranch-marron/50">costo total por cada peso de sueldo</p></div>
        <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-ranch-marron/50">Nómina real promedio/mes</p>
          {realProm != null ? (
            <>
              <p className="mt-1 text-xl font-black tabular-nums text-ranch-marron">{formatearCOP(Math.round(realProm))}</p>
              <p className={`text-xs tabular-nums ${realProm > totalTodos ? "text-red-600" : "text-ranch-verde"}`}>{realProm > totalTodos ? "▲" : "▼"} {pct(realProm / totalTodos)} del presupuesto · {nominaReal.length} meses del P&G</p>
            </>
          ) : <p className="mt-1 text-sm text-ranch-marron/50">Sin estados de resultados de {anio}</p>}
        </div>
      </div>

      <section className="mb-5 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-2 font-bold text-ranch-marron">Por área</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ranch-marron/60"><th className="py-1">Área</th><th className="text-right">Empleados</th><th className="text-right">Sueldos</th><th className="text-right">Prestaciones y aportes</th><th className="text-right">Costo mensual</th><th className="text-right">% del total</th></tr></thead>
            <tbody>
              {porArea.map((a) => (
                <tr key={a.area} className="border-t border-ranch-marron/10">
                  <td className="py-1"><Link href={`?anio=${anio}&area=${encodeURIComponent(a.area)}`} className="underline">{a.area}</Link></td>
                  <td className="text-right tabular-nums">{a.n}</td><td className="text-right tabular-nums">{formatearCOP(a.salarios)}</td>
                  <td className="text-right tabular-nums">{formatearCOP(a.carga)}</td><td className="text-right font-bold tabular-nums">{formatearCOP(a.total)}</td>
                  <td className="text-right tabular-nums text-ranch-marron/50">{pct(a.total / (totalTodos || 1))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-2 font-bold text-ranch-marron">Empleados {area ? `· ${area}` : ""}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ranch-marron/60">
                <th className="py-1 pr-2">Empleado</th><th className="pr-2">Cargo</th><th className="pr-2">Área</th>
                <th className="text-right">Salario</th><th className="text-right">Aux. transporte</th><th className="text-right">Prestaciones</th>
                <th className="text-right">Parafiscales</th><th className="text-right">Seguridad social</th><th className="text-right">Costo mensual</th>
              </tr>
            </thead>
            <tbody>
              {emp.map((e) => (
                <tr key={e.id} className="border-t border-ranch-marron/10">
                  <td className="whitespace-nowrap py-1 pr-2 font-medium">{e.nombre}</td><td className="whitespace-nowrap pr-2">{e.cargo}</td><td className="pr-2 text-ranch-marron/60">{e.area}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatearCOP(e.salario)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{e.aux_transporte ? formatearCOP(e.aux_transporte) : "—"}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatearCOP(e.prestaciones)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatearCOP(e.parafiscales)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatearCOP(e.seguridad_social)}</td>
                  <td className="whitespace-nowrap text-right font-bold tabular-nums">{formatearCOP(e.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ranch-marron/30 font-bold">
                <td className="py-1" colSpan={3}>Total ({emp.length})</td>
                <td className="text-right tabular-nums">{formatearCOP(sum("salario"))}</td><td className="text-right tabular-nums">{formatearCOP(sum("aux_transporte"))}</td>
                <td className="text-right tabular-nums">{formatearCOP(sum("prestaciones"))}</td><td className="text-right tabular-nums">{formatearCOP(sum("parafiscales"))}</td>
                <td className="text-right tabular-nums">{formatearCOP(sum("seguridad_social"))}</td><td className="text-right tabular-nums">{formatearCOP(totalMes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-ranch-marron/50">Prestaciones = cesantías, intereses, primas y vacaciones. Parafiscales = caja, ICBF y SENA. Seguridad social = EPS, pensión y ARL. Valores mensuales.</p>
      </section>
    </main>
  );
}
