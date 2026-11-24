import Link from "next/link";
import { redirect } from "next/navigation";
import FormularioFiltros from "../FormularioFiltros";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { aniosConEstadoResultados, estadoResultados, type FilaEr } from "@/lib/reportes/estado-resultados";
import { formatearCOP } from "@/lib/dinero/cop";

export const dynamic = "force-dynamic";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const pct = (v: number | null | undefined) => (v == null || !isFinite(v) ? "" : `${(v * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
/** "$4.632 M" para las tarjetas; el valor completo va en el title. */
const millones = (v: number) => (v < 0 ? "-" : "") + "$" + (Math.abs(v) / 1e6).toLocaleString("es-CO", { maximumFractionDigits: Math.abs(v) < 1e7 ? 1 : 0 }) + " M";
const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pp`;

/** Color según la dirección deseada: en gastos, quedar por debajo del presupuesto es verde. */
function semaforo(real: number, pres: number | null, sentido: number) {
  if (pres == null || pres === 0 || sentido === 0) return { txt: "", cls: "text-ranch-marron/40" };
  const dif = real - pres, rel = dif / Math.abs(pres);
  if (Math.abs(rel) < 0.005) return { txt: `▬ ${pct(real / pres)}`, cls: "text-ranch-marron/60" };
  const bueno = dif * sentido > 0;
  return { txt: `${dif > 0 ? "▲" : "▼"} ${pct(real / pres)}`, cls: bueno ? "text-ranch-verde" : "text-red-600" };
}

export default async function EstadoResultadosPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const anios = await aniosConEstadoResultados();
  if (!anios.length) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-2xl font-black text-ranch-marron">Estado de resultados</h1>
        <p className="rounded-xl border-2 border-dashed border-ranch-marron/20 bg-white p-6 text-ranch-marron/70">
          Aún no hay estados de resultados cargados. Súbelos en PDF desde{" "}
          {tieneRol(s.rol, "administrador") ? <Link href="/admin/archivos" className="underline">Configuración → Carga de archivos</Link> : "Configuración → Carga de archivos (administrador)"}.
        </p>
      </main>
    );
  }
  const sp = await searchParams;
  const anio = anios.includes(+(sp.anio ?? 0)) ? +sp.anio! : anios[0];
  const er = await estadoResultados(anio);
  const f = (k: string) => er.filas.find((x) => x.clave === k)!;
  const ing = f("ingresos"), uo = f("utilidad_operacional"), gas = f("gastos"), mOp = f("margen_operacional");
  const periodo = er.mesesCargados.length ? `${MESES[er.mesesCargados[0] - 1].toLowerCase()}–${MESES[er.mesesCargados[er.mesesCargados.length - 1] - 1].toLowerCase()} ${anio}` : String(anio);
  const mesesPerdida = uo.meses.filter((v) => v != null && v < 0).length;
  const mesesVisibles = Array.from({ length: 12 }, (_, i) => i).filter((i) => er.mesesCargados.includes(i + 1));
  const mOpPres = ing.presupuesto ? (uo.presupuesto ?? 0) / ing.presupuesto : null;

  const celda = (fl: FilaEr, v: number | null) => (v == null ? "" : fl.nivel === "pct" ? pct(v) : formatearCOP(v));

  return (
    <main className="mx-auto max-w-[96rem] p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Estado de resultados {anio}</h1>
      <p className="mb-3 text-sm text-ranch-marron/60">
        {periodo}: ingresos {formatearCOP(ing.acumulado)}, utilidad operacional {formatearCOP(uo.acumulado)} ({pct(mOp.acumulado)}).{" "}
        {mesesPerdida ? `${mesesPerdida} ${mesesPerdida === 1 ? "mes cerró" : "meses cerraron"} en pérdida.` : "Ningún mes cerró en pérdida."}
        {" "}Fuente: estados de pérdidas y ganancias cargados{er.hayPresupuesto ? " y P&G presupuestado" : ""}.
      </p>

      <FormularioFiltros className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <select name="anio" defaultValue={anio} className="rounded border px-2 py-1" aria-label="Año">
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-ranch-marron/50">{er.mesesCargados.length} de 12 meses cargados</span>
      </FormularioFiltros>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: "Ingresos", v: ing.acumulado, p: ing.presupuesto, s: 1 },
          { t: "Gastos operacionales", v: gas.acumulado, p: gas.presupuesto, s: -1 },
          { t: "Utilidad operacional", v: uo.acumulado, p: uo.presupuesto, s: 1 },
        ].map((k) => {
          const sem = semaforo(k.v, k.p, k.s);
          return (
            <div key={k.t} className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{k.t}</p>
              <p className={`mt-1 text-2xl font-black tabular-nums ${k.v < 0 ? "text-red-600" : "text-ranch-marron"}`} title={formatearCOP(k.v)}>{millones(k.v)}</p>
              {k.p != null && <p className={`text-xs tabular-nums ${sem.cls}`} title={formatearCOP(k.p)}>{sem.txt} del presupuesto ({millones(k.p)})</p>}
            </div>
          );
        })}
        <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-ranch-marron/50">Margen operacional</p>
          <p className={`mt-1 text-2xl font-black tabular-nums ${mOp.acumulado < 0 ? "text-red-600" : "text-ranch-marron"}`}>{pct(mOp.acumulado)}</p>
          {mOpPres != null && <p className={`text-xs tabular-nums ${mOp.acumulado >= mOpPres ? "text-ranch-verde" : "text-red-600"}`}>{pp(mOp.acumulado - mOpPres)} vs presupuesto ({pct(mOpPres)})</p>}
        </div>
      </div>

      {/* Mes a mes */}
      <section className="mb-5 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-1 font-bold text-ranch-marron">Mes a mes</h2>
        <p className="mb-2 text-xs text-ranch-marron/50">Con el acumulado, el peso sobre los ingresos y el presupuesto de los meses cargados. Verde = mejor que el presupuesto (en gastos, gastar menos).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ranch-marron/60">
                <th className="py-1 pr-2">Concepto</th>
                {mesesVisibles.map((i) => <th key={i} className="px-1 text-right">{MESES[i]}</th>)}
                <th className="px-1 text-right">Acumulado</th><th className="px-1 text-right">% ing.</th>
                {er.hayPresupuesto && <><th className="px-1 text-right">Presupuesto</th><th className="px-1 text-right">Ejecución</th></>}
              </tr>
            </thead>
            <tbody>
              {er.filas.map((fl) => {
                const sem = semaforo(fl.acumulado, fl.presupuesto, fl.sentido);
                return (
                  <tr key={fl.clave} className={`border-t border-ranch-marron/10 ${fl.nivel === "total" ? "font-bold" : ""}`}>
                    <td className={`whitespace-nowrap py-1 pr-2 ${fl.nivel === "grupo" ? "pl-4 text-ranch-marron/70" : ""}`}>{fl.concepto}</td>
                    {mesesVisibles.map((i) => <td key={i} className={`whitespace-nowrap px-1 text-right tabular-nums ${(fl.meses[i] ?? 0) < 0 ? "text-red-600" : ""}`}>{celda(fl, fl.meses[i])}</td>)}
                    <td className={`whitespace-nowrap px-1 text-right tabular-nums ${fl.acumulado < 0 ? "text-red-600" : ""}`}>{fl.nivel === "pct" ? pct(fl.acumulado) : formatearCOP(fl.acumulado)}</td>
                    <td className="whitespace-nowrap px-1 text-right tabular-nums text-ranch-marron/50">{fl.nivel === "pct" || !ing.acumulado ? "" : pct(fl.acumulado / ing.acumulado)}</td>
                    {er.hayPresupuesto && <>
                      <td className="whitespace-nowrap px-1 text-right tabular-nums text-ranch-marron/60">{fl.presupuesto == null ? "" : formatearCOP(fl.presupuesto)}</td>
                      <td className={`whitespace-nowrap px-1 text-right tabular-nums ${sem.cls}`}>{sem.txt}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Por cuenta */}
        <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
          <h2 className="mb-2 font-bold text-ranch-marron">Gastos por cuenta ({periodo})</h2>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-ranch-marron/60"><th className="py-1">Cuenta</th><th>Grupo</th><th className="text-right">Real</th>{er.hayPresupuesto && <><th className="text-right">Presupuesto</th><th className="text-right">Ejecución</th></>}</tr></thead>
              <tbody>
                {er.cuentas.map((c) => {
                  const sem = semaforo(c.acumulado, c.presupuesto, -1);
                  return (
                    <tr key={c.cuenta} className="border-t border-ranch-marron/10">
                      <td className="py-1 pr-2">{c.cuenta}</td><td className="pr-2 text-ranch-marron/50">{c.grupo}</td>
                      <td className="text-right tabular-nums">{formatearCOP(c.acumulado)}</td>
                      {er.hayPresupuesto && <><td className="text-right tabular-nums text-ranch-marron/60">{c.presupuesto ? formatearCOP(c.presupuesto) : "—"}</td><td className={`text-right tabular-nums ${sem.cls}`}>{sem.txt}</td></>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {er.hayPresupuesto && <p className="mt-2 text-xs text-ranch-marron/50">El presupuesto usa sus propios nombres de cuenta (p. ej. «Comida caballos (heno)» frente a «Alimento»); compáralos por grupo en la tabla de arriba.</p>}
        </section>

        {/* Por unidad */}
        <section className="rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
          <h2 className="mb-2 font-bold text-ranch-marron">Por unidad de negocio ({periodo})</h2>
          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-ranch-marron/60"><th className="py-1">Unidad</th><th className="text-right">Ingresos</th><th className="text-right">Costos y gastos</th><th className="text-right">Resultado</th></tr></thead>
            <tbody>
              {er.unidades.map((u) => (
                <tr key={u.unidad} className="border-t border-ranch-marron/10">
                  <td className="py-1">{u.unidad}</td><td className="text-right tabular-nums">{formatearCOP(u.ingresos)}</td><td className="text-right tabular-nums">{formatearCOP(u.gastos)}</td>
                  <td className={`text-right tabular-nums ${u.resultado < 0 ? "text-red-600" : "text-ranch-verde"}`}>{formatearCOP(u.resultado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="mt-2 text-xs text-ranch-marron/50">Contabilidad cambió la forma de reportar unidades durante el año (por ejemplo, de 8 unidades a Administración, Operativo y Caballos en abril 2026); cada unidad suma los meses en que aparece.</p>
        </section>
      </div>
    </main>
  );
}
