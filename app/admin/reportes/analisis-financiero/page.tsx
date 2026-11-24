import Link from "next/link";
import { redirect } from "next/navigation";
import FormularioFiltros from "../FormularioFiltros";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { aniosConEstadoResultados } from "@/lib/reportes/estado-resultados";
import { analisisFinanciero } from "@/lib/analisis/financiero";
import { formatearCOP } from "@/lib/dinero/cop";
import { ResultadoMensual, LineaMargenes, Medidor, millones } from "@/components/graficos";

export const dynamic = "force-dynamic";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const pct = (v: number) => `${(v * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const pp = (v: number) => `${v >= 0 ? "▲ +" : "▼ −"}${Math.abs(v * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pp`;
const varPct = (v: number | null) => (v == null ? "" : `${v >= 0 ? "▲ +" : "▼ "}${pct(v)}`);

function Indicador({ titulo, valor, completo, nota, tono = "neutro" }: { titulo: string; valor: string; completo?: string; nota?: React.ReactNode; tono?: "bueno" | "malo" | "neutro" }) {
  return (
    <div className={`rounded-2xl border-2 bg-white p-4 shadow-sm ${tono === "malo" ? "border-red-300" : "border-ranch-marron/15"}`}>
      <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{titulo}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tono === "malo" ? "text-red-600" : tono === "bueno" ? "text-ranch-verde" : "text-ranch-marron"}`} title={completo}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-ranch-marron/60">{nota}</p>}
    </div>
  );
}

export default async function AnalisisFinancieroPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const anios = await aniosConEstadoResultados();
  const sp = await searchParams;
  const anio = anios.includes(+(sp.anio ?? 0)) ? +sp.anio! : anios[0];
  const a = anio ? await analisisFinanciero(anio) : null;
  if (!a) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-2xl font-black text-ranch-marron">Análisis financiero</h1>
        <p className="rounded-xl border-2 border-dashed border-ranch-marron/20 bg-white p-6 text-ranch-marron/70">
          Aún no hay estados de resultados cargados. Súbelos en {tieneRol(s.rol, "administrador") ? <Link href="/admin/archivos" className="underline">Configuración → Carga de archivos</Link> : "Configuración → Carga de archivos"} y aquí aparecen los indicadores y el análisis.
        </p>
      </main>
    );
  }
  const periodo = `${MESES[a.meses[0].mes - 1].toLowerCase()}–${MESES[a.ultimo.mes - 1].toLowerCase()} ${a.anio}`;
  const eq = a.equilibrio, u = a.ultimo;

  return (
    <main className="mx-auto max-w-[96rem] p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Análisis financiero {a.anio}</h1>
      <p className="mb-3 text-sm text-ranch-marron/60">
        {periodo}: ingresos {millones(a.acum.ingresos)}, utilidad operacional {millones(a.acum.utilidad)} ({pct(a.acum.margen_op)}). Se recalcula solo con cada estado de resultados que se cargue.
      </p>
      <FormularioFiltros className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <select name="anio" defaultValue={a.anio} className="rounded border px-2 py-1" aria-label="Año">
          {anios.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span className="text-ranch-marron/50">{a.meses.length} meses con estado de resultados</span>
      </FormularioFiltros>

      {/* ---------- Indicadores ---------- */}
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ranch-marron/50">Indicadores del periodo</h2>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Margen bruto" valor={pct(a.acum.margen_bruto)} nota={`costo de ventas ${millones(a.acum.costo_ventas)}`} />
        <Indicador titulo="Margen operacional" valor={pct(a.acum.margen_op)} tono={a.acum.margen_op < 0.1 ? "malo" : "neutro"} nota={`utilidad ${millones(a.acum.utilidad)}`} />
        <Indicador titulo="Personal / ingresos" valor={pct(a.acum.personal / (a.acum.ingresos || 1))} tono={a.acum.personal / (a.acum.ingresos || 1) > 0.4 ? "malo" : "neutro"} nota={`${millones(a.acum.personal)} · extra ${pct(a.personalExtra.tasa)}`} />
        <Indicador titulo="Gastos / ingresos" valor={pct(a.acum.gastos / (a.acum.ingresos || 1))} nota={`3 grupos mayores = ${pct(a.concentracionTop3)} del gasto`} />
      </div>
      {eq && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador titulo="Punto de equilibrio mensual" valor={millones(eq.pe_alto)} completo={formatearCOP(eq.pe_alto)} nota={`rango desde ${millones(eq.pe_bajo)} · ${eq.meses_bajo_pe.length} ${eq.meses_bajo_pe.length === 1 ? "mes" : "meses"} por debajo`} />
          <Indicador titulo="Costo fijo mensual" valor={millones(eq.fijo_mes)} nota={`variable ${pct(eq.tasa_var)} de cada peso · R² ${eq.r2.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`} />
          <Indicador titulo="Margen de seguridad" valor={pct(eq.margen_seguridad)} tono={eq.margen_seguridad < 0.15 ? "malo" : "bueno"} nota="cuánto puede caer la venta promedio antes de perder" />
          <Indicador titulo="Apalancamiento operativo" valor={eq.apalancamiento ? `${eq.apalancamiento.toLocaleString("es-CO", { maximumFractionDigits: 2 })}x` : "—"} nota={eq.apalancamiento ? `10% menos venta ≈ ${pct(Math.min(1, eq.apalancamiento * 0.1))} menos utilidad` : "sin utilidad acumulada"} />
        </div>
      )}

      {/* ---------- Conclusiones y alertas ---------- */}
      <div className="mb-6 grid gap-4 xl:grid-cols-[3fr_2fr]">
        <section className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-ranch-marron">Qué dicen los números</h2>
          <ol className="space-y-3">
            {a.conclusiones.map((c, i) => (
              <li key={i} className="flex gap-3">
                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black ${c.tono === "malo" ? "bg-red-100 text-red-700" : c.tono === "bueno" ? "bg-green-100 text-green-700" : "bg-ranch-marron/10 text-ranch-marron"}`}>{i + 1}</span>
                <div>
                  <p className="font-bold leading-snug text-ranch-marron">{c.titulo}</p>
                  <p className="text-sm text-ranch-marron/70">{c.detalle}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-ranch-marron">Señales de alerta · {MESES[u.mes - 1].toLowerCase()}</h2>
          <ul className="space-y-2">
            {a.alertas.map((al) => (
              <li key={al.senal} className={`rounded-lg border px-3 py-2 ${al.disparada ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
                <p className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold text-ranch-marron">{al.disparada ? "⚠" : "✓"} {al.senal}</span>
                  <span className={`shrink-0 font-bold tabular-nums ${al.disparada ? "text-red-700" : "text-green-700"}`}>{al.valor}</span>
                </p>
                <p className="text-xs text-ranch-marron/60">Alerta si {al.umbral}. {al.disparada ? al.significa : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* ---------- Gráficos ---------- */}
      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <section className="min-w-0 rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-ranch-marron">Resultado de cada mes</h2>
          <p className="mb-2 text-xs text-ranch-marron/60">Ingresos (dorado) contra costos y gastos (gris); la etiqueta es la utilidad operacional.{eq ? ` Para no perder hay que vender ${millones(eq.pe_alto)} al mes.` : ""}</p>
          <ResultadoMensual meses={a.meses.map((m) => ({ mes: m.mes, ingresos: m.ingresos, costos: m.costos, utilidad: m.utilidad }))} />
        </section>
        <section className="min-w-0 rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-ranch-marron">Márgenes por mes</h2>
          <p className="mb-2 text-xs text-ranch-marron/60">Margen operacional (dorado) y margen bruto (gris). Por debajo de 0% el mes perdió plata.</p>
          <LineaMargenes meses={a.meses} />
        </section>
      </div>

      {/* ---------- Comparativos ---------- */}
      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <section className="min-w-0 rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold text-ranch-marron">Comparativo por trimestre</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ranch-marron/60"><th className="py-1">Trimestre</th><th className="text-right">Ingresos</th><th className="text-right">Var.</th><th className="text-right">Utilidad</th><th className="text-right">Margen</th><th className="text-right">Var. margen</th></tr></thead>
              <tbody>
                {a.trimestres.map((t) => (
                  <tr key={t.nombre} className="border-t border-ranch-marron/10">
                    <td className="py-1.5 pr-2">{t.nombre}</td>
                    <td className="text-right tabular-nums">{millones(t.ingresos)}</td>
                    <td className={`text-right tabular-nums ${t.var_ingresos == null ? "" : t.var_ingresos >= 0 ? "text-ranch-verde" : "text-red-600"}`}>{varPct(t.var_ingresos)}</td>
                    <td className={`text-right tabular-nums ${t.utilidad < 0 ? "text-red-600" : ""}`}>{millones(t.utilidad)}</td>
                    <td className="text-right tabular-nums">{pct(t.margen_op)}</td>
                    <td className={`text-right tabular-nums ${t.var_margen_pp == null ? "" : t.var_margen_pp >= 0 ? "text-ranch-verde" : "text-red-600"}`}>{t.var_margen_pp == null ? "" : pp(t.var_margen_pp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {u.prev && (
            <div className="mt-4 rounded-xl bg-ranch-crema/50 p-3 text-sm">
              <p className="mb-1 font-semibold text-ranch-marron">{MESES[u.mes - 1]} contra {MESES[u.prev.mes - 1].toLowerCase()}</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                <li>Ingresos {millones(u.ingresos)} <span className={u.ingresos >= u.prev.ingresos ? "text-ranch-verde" : "text-red-600"}>{varPct(u.prev.ingresos ? u.ingresos / u.prev.ingresos - 1 : null)}</span></li>
                <li>Gastos {millones(u.gastos)} <span className={u.gastos <= u.prev.gastos ? "text-ranch-verde" : "text-red-600"}>{varPct(u.prev.gastos ? u.gastos / u.prev.gastos - 1 : null)}</span></li>
                <li>Utilidad {millones(u.utilidad)} <span className="text-ranch-marron/60">(antes {millones(u.prev.utilidad)})</span></li>
                <li>Margen {pct(u.margen_op)} <span className={u.margen_op >= u.prev.margen_op ? "text-ranch-verde" : "text-red-600"}>{pp(u.margen_op - u.prev.margen_op)}</span></li>
              </ul>
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-ranch-marron">Estructura de gastos{a.presupuesto ? " contra presupuesto" : ""}</h2>
          <p className="mb-2 text-xs text-ranch-marron/60">
            Peso de cada grupo sobre los ingresos.{a.presupuesto ? ` En total los gastos van al ${pct(a.presupuesto.ejecucion)} de lo presupuestado para ${a.meses.length} meses.` : " Sin presupuesto cargado."}
          </p>
          <div className="space-y-2.5">
            {a.estructura.map((e) => (
              <div key={e.grupo} title={`${e.grupo}: ${formatearCOP(e.total)}${e.presupuesto ? ` · presupuesto ${formatearCOP(e.presupuesto)}` : ""}`}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-ranch-marron/80">{e.grupo}</span>
                  <span className="tabular-nums text-ranch-marron">{millones(e.total)} <span className="text-ranch-marron/40">{pct(e.pct_ingresos)} de ingresos</span>
                    {e.presupuesto ? <span className={e.total > e.presupuesto ? " text-red-600" : " text-ranch-verde"}> · {pct(e.total / e.presupuesto)} del ppto.</span> : null}
                  </span>
                </div>
                {e.presupuesto ? <Medidor valor={e.total} limite={e.presupuesto} invertido /> : (
                  <div className="mt-2 h-3 rounded-full bg-ranch-marron/10"><div className="h-3 rounded-full bg-ranch-dorado" style={{ width: `${Math.min(100, (e.total / (a.estructura[0]?.total || 1)) * 100)}%` }} /></div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <details className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 text-sm text-ranch-marron/70">
        <summary className="cursor-pointer font-semibold text-ranch-marron">Cómo se calcula y qué no se puede concluir</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Fuente: los estados de resultados mensuales cargados en Configuración → Carga de archivos{a.presupuesto ? " y el presupuesto de gastos" : ""}.</li>
          <li>Punto de equilibrio en rango: el valor bajo sale de una regresión de los costos totales contra los ingresos de cada mes; el alto toma como variables solo el costo de ventas, comisiones, datáfono, impuestos e IVA (todo el personal como fijo). Con pocos meses es indicativo.</li>
          <li>Apalancamiento operativo = margen de contribución ÷ utilidad operacional del periodo.</li>
          <li>El estado no trae depreciación, gastos financieros ni impuesto de renta: la utilidad operacional no es lo que le queda al dueño. Sin balance ni flujo de caja no se puede hablar de liquidez, cartera ni endeudamiento.</li>
        </ul>
      </details>
    </main>
  );
}
