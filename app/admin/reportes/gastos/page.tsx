import { redirect } from "next/navigation";
import FormularioFiltros from "../FormularioFiltros";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { rubrosPlano } from "@/lib/gastos/rubros";
import { fechaBogota } from "@/lib/tiempo";
import { formatearCOP } from "@/lib/dinero/cop";
import Barras from "@/components/Barras";
import { rankingConsumo, type FilaConsumo } from "@/lib/gastos/consumo";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default async function ReporteGastosPage({ searchParams }: { searchParams: Promise<{ anio?: string; mes?: string; grupo?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const hoy = fechaBogota();
  const sp = await searchParams;
  const anio = parseInt(sp.anio ?? hoy.slice(0, 4), 10);
  const mes = parseInt(sp.mes ?? hoy.slice(5, 7), 10);

  const inicio = new Date(`${anio}-${String(mes).padStart(2, "0")}-01T00:00:00-05:00`);
  const nAnio = mes === 12 ? anio + 1 : anio;
  const nMes = mes === 12 ? 1 : mes + 1;
  const fin = new Date(`${nAnio}-${String(nMes).padStart(2, "0")}-01T00:00:00-05:00`);

  const rubros = await rubrosPlano();
  const grupoDeRubro = new Map(rubros.map((r) => [r.id, { grupo: r.grupo, grupoId: r.grupoId }]));

  const [gastos, presupuestos, ventasAgg] = await Promise.all([
    prisma.gasto.findMany({
      where: { fecha_gasto: { gte: inicio, lt: fin }, estado: { not: "anulado" } },
      select: {
        rubro_gasto_id: true, total: true, area_id: true, solicitante_id: true,
        area: { select: { nombre: true } }, solicitante: { select: { nombre: true } },
      },
    }),
    prisma.presupuesto.findMany({ where: { anio, OR: [{ mes }, { mes: null }] }, select: { rubro_gasto_id: true, monto_presupuestado: true } }),
    prisma.venta.aggregate({ where: { estado: "completada", creado_en: { gte: inicio, lt: fin } }, _sum: { total_cobrado: true } }),
  ]);

  const ejec = new Map<string, { grupo: string; monto: number }>();
  for (const g of gastos) {
    const gr = grupoDeRubro.get(g.rubro_gasto_id);
    if (!gr) continue;
    const acc = ejec.get(gr.grupoId) ?? { grupo: gr.grupo, monto: 0 };
    acc.monto += g.total;
    ejec.set(gr.grupoId, acc);
  }
  const pres = new Map<string, number>();
  for (const p of presupuestos) {
    const gr = grupoDeRubro.get(p.rubro_gasto_id);
    if (!gr) continue;
    pres.set(gr.grupoId, (pres.get(gr.grupoId) ?? 0) + p.monto_presupuestado);
  }

  const grupoIds = new Set([...ejec.keys(), ...pres.keys()]);
  const filas = [...grupoIds].map((gid) => ({
    grupo: ejec.get(gid)?.grupo ?? rubros.find((r) => r.grupoId === gid)?.grupo ?? "—",
    presupuesto: pres.get(gid) ?? 0,
    ejecutado: ejec.get(gid)?.monto ?? 0,
  })).sort((a, b) => b.ejecutado - a.ejecutado);

  const totalGastos = filas.reduce((a, f) => a + f.ejecutado, 0);

  // ---- ¿Dónde se consume más y quién pide más? (opcionalmente, solo un grupo: p. ej. Insumos).
  const grupos = [...new Map(rubros.map((r) => [r.grupoId, r.grupo])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const grupoSel = sp.grupo && grupos.some(([id]) => id === sp.grupo) ? sp.grupo : "";
  const delGrupo = grupoSel ? gastos.filter((g) => grupoDeRubro.get(g.rubro_gasto_id)?.grupoId === grupoSel) : gastos;
  const porArea = rankingConsumo(delGrupo.map((g) => ({ clave: g.area_id, nombre: g.area?.nombre ?? null, total: g.total })));
  const porSolicitante = rankingConsumo(delGrupo.map((g) => ({ clave: g.solicitante_id, nombre: g.solicitante?.nombre ?? null, total: g.total })));
  const ingresos = ventasAgg._sum.total_cobrado ?? 0;
  const resultado = ingresos - totalGastos;

  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Reporte de gastos</h1>
      <FormularioFiltros className="mb-4 flex gap-2 text-sm">
        <select name="mes" defaultValue={mes} className="rounded border px-2 py-1">
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select name="anio" defaultValue={anio} className="rounded border px-2 py-1">
          {[2024, 2025, 2026].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select name="grupo" defaultValue={grupoSel} className="rounded border px-2 py-1">
          <option value="">Todos los grupos</option>
          {grupos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
      </FormularioFiltros>

      <section className="mb-4 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-2 font-bold text-ranch-marron">Presupuesto vs. ejecutado — {MESES[mes - 1]} {anio}</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ranch-marron/60"><th className="py-1">Grupo</th><th className="text-right">Presupuesto</th><th className="text-right">Ejecutado</th><th className="text-right">Diferencia</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.grupo} className="border-t border-ranch-marron/10">
                <td className="py-1">{f.grupo}</td>
                <td className="text-right">{f.presupuesto ? formatearCOP(f.presupuesto) : "—"}</td>
                <td className="text-right">{formatearCOP(f.ejecutado)}</td>
                <td className={`text-right ${f.presupuesto && f.ejecutado > f.presupuesto ? "text-red-600" : "text-ranch-marron/70"}`}>
                  {f.presupuesto ? formatearCOP(f.presupuesto - f.ejecutado) : "—"}
                </td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={4} className="py-2 text-ranch-marron/40">Sin gastos en el periodo.</td></tr>}
          </tbody>
        </table>
      </section>

      {filas.length > 0 && (
        <section className="mb-4 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
          <h2 className="mb-3 font-bold text-ranch-marron">Gasto ejecutado por grupo</h2>
          <Barras datos={filas.map((f) => ({ etiqueta: f.grupo, valor: f.ejecutado }))} />
        </section>
      )}

      <Ranking titulo="¿Dónde se consume más?" columna="Área" filas={porArea} />
      <Ranking titulo="¿Quién pide más?" columna="Pidió" filas={porSolicitante} />

      <section className="rounded-xl border-4 border-ranch-marron bg-white p-4">
        <h2 className="mb-2 font-bold text-ranch-marron">P&amp;G simplificado</h2>
        <div className="flex justify-between py-1"><span>Ingresos por entradas (ventas)</span><span className="font-semibold text-ranch-verde">{formatearCOP(ingresos)}</span></div>
        <div className="flex justify-between py-1"><span>− Gastos del mes</span><span className="font-semibold text-red-600">{formatearCOP(totalGastos)}</span></div>
        <div className="flex justify-between border-t border-ranch-marron/20 py-1 text-lg font-black text-ranch-marron"><span>Resultado</span><span>{formatearCOP(resultado)}</span></div>
      </section>
    </main>
  );
}

function Ranking({ titulo, columna, filas }: { titulo: string; columna: string; filas: FilaConsumo[] }) {
  if (filas.length === 0) return null;
  const asignadas = filas.filter((f) => f.clave !== null);
  return (
    <section className="mb-4 rounded-xl border-2 border-ranch-marron/20 bg-white p-4">
      <h2 className="mb-2 font-bold text-ranch-marron">{titulo}</h2>
      {asignadas.length > 0 && <div className="mb-3"><Barras datos={asignadas.map((f) => ({ etiqueta: f.nombre, valor: f.total }))} /></div>}
      <table className="w-full text-sm">
        <thead><tr className="text-left text-ranch-marron/60"><th className="py-1">{columna}</th><th className="text-right">Gastos</th><th className="text-right">Total</th><th className="text-right">%</th></tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave ?? "sin"} className={`border-t border-ranch-marron/10 ${f.clave === null ? "text-ranch-marron/50" : ""}`}>
              <td className="py-1">{f.nombre}</td>
              <td className="text-right">{f.gastos}</td>
              <td className="text-right">{formatearCOP(f.total)}</td>
              <td className="text-right">{f.participacion.toLocaleString("es-CO")} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
