import Link from "next/link";
import { redirect } from "next/navigation";
import FormularioFiltros from "../reportes/FormularioFiltros";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { analisisFinanciero } from "@/lib/analisis/financiero";
import { GRUPOS_GASTO, grupoGasto, cuentaComparable, normalizarCuenta } from "@/lib/pyg/cuentas";
import { formatearCOP } from "@/lib/dinero/cop";
import { Medidor, millones } from "@/components/graficos";

export const dynamic = "force-dynamic";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const pct = (v: number) => `${(v * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

// Presupuesto de gastos del año (P&G presupuestado cargado en Carga de archivos): cuánto se
// presupuestó, cuánto se lleva gastado según los estados de resultados y con qué cuenta real se
// compara cada cuenta del presupuesto.
export default async function PresupuestoPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const archivos = await prisma.archivoCargado.findMany({ where: { tipo: "presupuesto", estado: "procesado" }, select: { id: true, anio: true, nombre: true, creado_en: true }, orderBy: { anio: "desc" } });
  if (!archivos.length) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-2xl font-black text-ranch-marron">Presupuesto de gastos</h1>
        <p className="rounded-xl border-2 border-dashed border-ranch-marron/20 bg-white p-6 text-ranch-marron/70">
          Aún no hay presupuesto cargado. Sube el P&G presupuestado en {tieneRol(s.rol, "administrador") ? <Link href="/admin/archivos" className="underline">Financiero → Carga de archivos</Link> : "Financiero → Carga de archivos (administrador)"}.
        </p>
      </main>
    );
  }
  const sp = await searchParams;
  const arch = archivos.find((a) => a.anio === +(sp.anio ?? 0)) ?? archivos[0];
  const anio = arch.anio!;
  const [lineas, an] = await Promise.all([
    prisma.presupuestoPygLinea.findMany({ where: { archivo_id: arch.id, seccion: "gasto" }, orderBy: { orden: "asc" } }),
    analisisFinanciero(anio),
  ]);
  const mensual = lineas.reduce((t, l) => t + l.valor, 0);
  const meses = an?.meses.length ?? 0;
  const presPeriodo = mensual * meses;
  const real = an?.acum.gastos ?? 0;
  const proyeccion = meses ? (real / meses) * 12 : 0;

  // Por grupo: presupuesto mensual (de las líneas) y real del periodo (del análisis)
  const grupos = GRUPOS_GASTO.map((g) => {
    const m = lineas.filter((l) => grupoGasto(l.cuenta) === g).reduce((t, l) => t + l.valor, 0);
    const r = an?.estructura.find((e) => e.grupo === g)?.total ?? 0;
    return { grupo: g, mensual: m, periodo: m * meses, real: r };
  }).filter((g) => g.mensual || g.real).sort((a, b) => b.mensual - a.mensual || b.real - a.real);

  return (
    <main className="mx-auto max-w-[90rem] p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Presupuesto de gastos {anio}</h1>
      <p className="mb-3 text-sm text-ranch-marron/60">
        {millones(mensual)} al mes ({millones(mensual * 12)} al año) en {lineas.length} cuentas.
        {meses ? ` Con ${meses} meses de estado de resultados, el gasto va al ${pct(presPeriodo ? real / presPeriodo : 0)} de lo presupuestado.` : " Aún no hay estados de resultados del año para comparar."}
        {" "}Fuente: {arch.nombre}.
      </p>
      {archivos.length > 1 && (
        <FormularioFiltros className="mb-4 text-sm">
          <select name="anio" defaultValue={anio} className="rounded border px-2 py-1" aria-label="Año">
            {archivos.map((a) => <option key={a.id} value={a.anio!}>{a.anio}</option>)}
          </select>
        </FormularioFiltros>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4"><p className="text-xs uppercase tracking-wide text-ranch-marron/50">Presupuesto mensual</p><p className="mt-1 text-2xl font-black tabular-nums text-ranch-marron" title={formatearCOP(mensual)}>{millones(mensual)}</p><p className="text-xs text-ranch-marron/50">{millones(mensual * 12)} al año</p></div>
        <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4"><p className="text-xs uppercase tracking-wide text-ranch-marron/50">Presupuesto {meses ? `${MESES[0]}–${MESES[an!.ultimo.mes - 1]}` : "del periodo"}</p><p className="mt-1 text-2xl font-black tabular-nums text-ranch-marron">{millones(presPeriodo)}</p><p className="text-xs text-ranch-marron/50">{meses} meses × {millones(mensual)}</p></div>
        <div className={`rounded-2xl border-2 bg-white p-4 ${real > presPeriodo && meses ? "border-red-300" : "border-ranch-marron/15"}`}>
          <p className="text-xs uppercase tracking-wide text-ranch-marron/50">Gastado (estado de resultados)</p>
          <p className={`mt-1 text-2xl font-black tabular-nums ${real > presPeriodo && meses ? "text-red-600" : "text-ranch-marron"}`}>{meses ? pct(real / (presPeriodo || 1)) : "—"}</p>
          {meses > 0 && <><p className="text-xs text-ranch-marron/60">{millones(real)} · {real > presPeriodo ? "+" : ""}{millones(real - presPeriodo)} vs presupuesto</p><Medidor valor={real} limite={presPeriodo} invertido /></>}
        </div>
        <div className={`rounded-2xl border-2 bg-white p-4 ${proyeccion > mensual * 12 ? "border-red-300" : "border-ranch-marron/15"}`}>
          <p className="text-xs uppercase tracking-wide text-ranch-marron/50">Proyección del año</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-ranch-marron">{meses ? millones(proyeccion) : "—"}</p>
          {meses > 0 && <p className={`text-xs ${proyeccion > mensual * 12 ? "text-red-600" : "text-ranch-verde"}`}>al ritmo actual: {proyeccion > mensual * 12 ? "+" : ""}{millones(proyeccion - mensual * 12)} contra el presupuesto anual</p>}
        </div>
      </div>

      <section className="mb-5 rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-bold text-ranch-marron">Ejecución por grupo</h2>
        <p className="mb-3 text-xs text-ranch-marron/60">Real de los meses con estado de resultados contra el presupuesto de esos mismos meses. Verde = por debajo de lo presupuestado.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ranch-marron/60"><th className="py-1">Grupo</th><th className="text-right">Mensual</th><th className="text-right">Presupuesto periodo</th><th className="text-right">Real periodo</th><th className="text-right">Diferencia</th><th className="w-40 pl-3">Ejecución</th></tr></thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.grupo} className="border-t border-ranch-marron/10">
                  <td className="py-1.5">{g.grupo}</td>
                  <td className="text-right tabular-nums">{g.mensual ? formatearCOP(g.mensual) : "—"}</td>
                  <td className="text-right tabular-nums text-ranch-marron/60">{g.periodo ? formatearCOP(g.periodo) : "—"}</td>
                  <td className="text-right tabular-nums">{meses ? formatearCOP(g.real) : "—"}</td>
                  <td className={`text-right tabular-nums ${g.real - g.periodo > 0 ? "text-red-600" : "text-ranch-verde"}`}>{meses ? `${g.real - g.periodo > 0 ? "+" : ""}${formatearCOP(g.real - g.periodo)}` : ""}</td>
                  <td className="pl-3 text-xs">{meses && g.periodo ? <><span className={g.real > g.periodo ? "text-red-600" : "text-ranch-verde"}>{pct(g.real / g.periodo)}</span><Medidor valor={g.real} limite={g.periodo} invertido /></> : meses && g.real ? <span className="text-ranch-marron/50">sin presupuesto</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold text-ranch-marron">Cuentas del presupuesto</h2>
          {tieneRol(s.rol, "administrador") && <Link href={`/admin/nomina-presupuesto?anio=${anio}`} className="text-xs text-ranch-marron/60 underline">Ver la nómina por empleado</Link>}
        </div>
        <p className="mb-3 text-xs text-ranch-marron/60">Cada cuenta del presupuesto se compara con una cuenta del estado de resultados. Si una equivalencia no te parece, dímelo y la ajusto.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ranch-marron/60"><th className="py-1">Cuenta del presupuesto</th><th>Se compara con</th><th>Grupo</th><th className="text-right">Mensual</th><th className="text-right">Anual</th></tr></thead>
            <tbody>
              {lineas.map((l) => {
                const eq = cuentaComparable(l.cuenta);
                return (
                  <tr key={l.id} className="border-t border-ranch-marron/10">
                    <td className="py-1.5">{l.cuenta}</td>
                    <td className={eq === normalizarCuenta(l.cuenta) ? "text-ranch-marron/40" : "text-ranch-marron/80"}>{eq === normalizarCuenta(l.cuenta) ? "la misma" : eq}</td>
                    <td className="text-ranch-marron/60">{grupoGasto(l.cuenta)}</td>
                    <td className="text-right tabular-nums">{formatearCOP(l.valor)}</td>
                    <td className="text-right tabular-nums text-ranch-marron/60">{formatearCOP(l.valor * 12)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="border-t-2 border-ranch-marron/30 font-bold"><td className="py-1" colSpan={3}>Total</td><td className="text-right tabular-nums">{formatearCOP(mensual)}</td><td className="text-right tabular-nums">{formatearCOP(mensual * 12)}</td></tr></tfoot>
          </table>
        </div>
      </section>
    </main>
  );
}
