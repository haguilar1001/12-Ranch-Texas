// Gráficos del tablero de Inicio, dibujados en SVG desde el servidor (sin librerías ni JS en el
// navegador). Cada uno escala al ancho de su tarjeta (viewBox). Las etiquetas de valor van
// impresas; el detalle completo de cada barra queda en su <title> al pasar el mouse.

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** $4.632 M · $515 M · $850 K */
export function millones(v: number): string {
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toLocaleString("es-CO", { maximumFractionDigits: 2 })} MM`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toLocaleString("es-CO", { maximumFractionDigits: a < 1e7 ? 1 : 0 })} M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3).toLocaleString("es-CO")} K`;
  return `${s}$${Math.round(a).toLocaleString("es-CO")}`;
}
const completo = (v: number) => `$ ${Math.round(v).toLocaleString("es-CO")}`;
const pct = (v: number, d = 1) => `${(v * 100).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

function escalaY(max: number, alto: number, arriba: number) {
  const m = max <= 0 ? 1 : max;
  return (v: number) => arriba + alto - (Math.max(0, v) / m) * alto;
}

/** Barras mes a mes: año anterior (gris) contra este año (dorado), con la variación encima. */
export function BarrasAnioVsAnterior({ meses, anio }: { meses: { mes: number; actual: number; anterior: number; futuro: boolean }[]; anio: number }) {
  const W = 640, H = 230, ml = 6, mt = 22, mb = 22, alto = H - mt - mb;
  const max = Math.max(...meses.map((m) => Math.max(m.actual, m.anterior)), 1);
  const y = escalaY(max * 1.08, alto, mt);
  const paso = (W - ml * 2) / 12, bw = paso * 0.34;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Venta por mes ${anio} contra ${anio - 1}`}>
      <line x1={ml} x2={W - ml} y1={y(0)} y2={y(0)} className="stroke-ranch-marron/20" />
      {meses.map((m, i) => {
        const x = ml + i * paso + paso / 2;
        const v = !m.futuro && m.anterior > 0 ? m.actual / m.anterior - 1 : null;
        return (
          <g key={m.mes}>
            <title>{`${MESES[i]}: ${anio} ${completo(m.actual)} · ${anio - 1} ${completo(m.anterior)}${v != null ? ` · ${v >= 0 ? "+" : ""}${pct(v)}` : ""}`}</title>
            <rect x={x - bw - 1} y={y(m.anterior)} width={bw} height={y(0) - y(m.anterior)} rx="2" className="fill-ranch-marron/20" />
            {!m.futuro && <rect x={x + 1} y={y(m.actual)} width={bw} height={y(0) - y(m.actual)} rx="2" className="fill-ranch-dorado" />}
            {v != null && (
              <text x={x} y={y(Math.max(m.actual, m.anterior)) - 6} textAnchor="middle" fontSize="11" fontWeight="700" className={v >= 0 ? "fill-ranch-verde" : "fill-red-600"}>
                {`${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`}
              </text>
            )}
            <text x={x} y={H - 6} textAnchor="middle" fontSize="11" className="fill-ranch-marron/60">{MESES[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Ingresos de los últimos 30 días, con la línea del promedio de los días con venta. */
export function BarrasDiarias({ dias }: { dias: { fecha: string; ingreso: number; entradas: number }[] }) {
  const W = 640, H = 200, ml = 6, mt = 20, mb = 22, alto = H - mt - mb;
  const max = Math.max(...dias.map((d) => d.ingreso), 1);
  const y = escalaY(max * 1.1, alto, mt);
  const paso = (W - ml * 2) / dias.length, bw = Math.max(2, paso * 0.7);
  const conVenta = dias.filter((d) => d.ingreso > 0);
  const prom = conVenta.length ? conVenta.reduce((t, d) => t + d.ingreso, 0) / conVenta.length : 0;
  const iMax = dias.findIndex((d) => d.ingreso === max);
  const dia = (f: string) => `${+f.slice(8, 10)}/${+f.slice(5, 7)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ingresos de taquilla de los últimos 30 días">
      <line x1={ml} x2={W - ml} y1={y(0)} y2={y(0)} className="stroke-ranch-marron/20" />
      {dias.map((d, i) => {
        const x = ml + i * paso + (paso - bw) / 2;
        const hoy = i === dias.length - 1;
        return (
          <g key={d.fecha}>
            <title>{`${dia(d.fecha)}: ${completo(d.ingreso)} · ${d.entradas.toLocaleString("es-CO")} entradas`}</title>
            <rect x={x} y={y(d.ingreso)} width={bw} height={Math.max(d.ingreso ? 1 : 0, y(0) - y(d.ingreso))} rx="1.5" className={hoy ? "fill-ranch-verde" : "fill-ranch-dorado"} />
            {(i % 5 === 0 || hoy) && <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" className="fill-ranch-marron/50">{hoy ? "hoy" : dia(d.fecha)}</text>}
          </g>
        );
      })}
      {prom > 0 && (
        <>
          <line x1={ml} x2={W - ml} y1={y(prom)} y2={y(prom)} strokeDasharray="5 4" className="stroke-ranch-marron/50" />
          <text x={W - ml} y={y(prom) - 4} textAnchor="end" fontSize="10" className="fill-ranch-marron/70">{`promedio día con venta ${millones(prom)}`}</text>
        </>
      )}
      {iMax >= 0 && max > 0 && (
        <text x={ml + iMax * paso + paso / 2} y={y(max) - 5} textAnchor="middle" fontSize="10" fontWeight="700" className="fill-ranch-marron">{millones(max)}</text>
      )}
    </svg>
  );
}

/** Resultado de cada mes del estado de resultados: ingresos y costos, con la utilidad encima. */
export function ResultadoMensual({ meses }: { meses: { mes: number; ingresos: number; costos: number; utilidad: number }[] }) {
  const W = 640, H = 220, ml = 6, mt = 22, mb = 22, alto = H - mt - mb;
  const max = Math.max(...meses.map((m) => Math.max(m.ingresos, m.costos)), 1);
  const y = escalaY(max * 1.08, alto, mt);
  const paso = (W - ml * 2) / Math.max(meses.length, 1), bw = Math.min(26, paso * 0.34);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ingresos, costos y utilidad de cada mes">
      <line x1={ml} x2={W - ml} y1={y(0)} y2={y(0)} className="stroke-ranch-marron/20" />
      {meses.map((m, i) => {
        const x = ml + i * paso + paso / 2;
        return (
          <g key={m.mes}>
            <title>{`${MESES[m.mes - 1]}: ingresos ${completo(m.ingresos)} · costos y gastos ${completo(m.costos)} · utilidad ${completo(m.utilidad)}`}</title>
            <rect x={x - bw - 1} y={y(m.ingresos)} width={bw} height={y(0) - y(m.ingresos)} rx="2" className="fill-ranch-dorado" />
            <rect x={x + 1} y={y(m.costos)} width={bw} height={y(0) - y(m.costos)} rx="2" className="fill-ranch-marron/35" />
            <text x={x} y={y(Math.max(m.ingresos, m.costos)) - 6} textAnchor="middle" fontSize="10.5" fontWeight="700" className={m.utilidad < 0 ? "fill-red-600" : "fill-ranch-verde"}>{millones(m.utilidad)}</text>
            <text x={x} y={H - 6} textAnchor="middle" fontSize="11" className="fill-ranch-marron/60">{MESES[m.mes - 1]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Barras horizontales ordenadas, con valor y participación. El resto se agrupa en «Otros». */
export function BarrasH({ filas, top = 6 }: { filas: { nombre: string; valor: number }[]; top?: number }) {
  const orden = [...filas].sort((a, b) => b.valor - a.valor);
  const vis = orden.slice(0, top);
  const resto = orden.slice(top);
  if (resto.length) vis.push({ nombre: `Otros (${resto.length})`, valor: resto.reduce((t, f) => t + f.valor, 0) });
  const total = orden.reduce((t, f) => t + f.valor, 0) || 1;
  const max = Math.max(...vis.map((f) => f.valor), 1);
  return (
    <div className="space-y-1.5">
      {vis.map((f, i) => (
        <div key={f.nombre} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-xs" title={`${f.nombre}: ${completo(f.valor)} (${pct(f.valor / total, 2)})`}>
          <span className="truncate text-ranch-marron/80">{f.nombre}</span>
          <span className="h-3 rounded bg-ranch-marron/5">
            <span className={`block h-3 rounded ${i === vis.length - 1 && resto.length ? "bg-ranch-marron/25" : "bg-ranch-dorado"}`} style={{ width: `${(f.valor / max) * 100}%` }} />
          </span>
          <span className="whitespace-nowrap tabular-nums text-ranch-marron">{millones(f.valor)} <span className="text-ranch-marron/40">{pct(f.valor / total)}</span></span>
        </div>
      ))}
    </div>
  );
}

/** Barra de avance (aforo, ejecución de presupuesto). `limite` marca el 100 %. */
export function Medidor({ valor, limite, invertido = false }: { valor: number; limite: number; invertido?: boolean }) {
  const r = limite > 0 ? valor / limite : 0;
  // invertido: pasar del límite es malo (gasto, aforo lleno)
  const color = invertido ? (r > 1 ? "bg-red-500" : r > 0.9 ? "bg-amber-500" : "bg-ranch-verde") : r >= 1 ? "bg-ranch-verde" : r >= 0.8 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="relative mt-2 h-3 rounded-full bg-ranch-marron/10">
      <div className={`h-3 rounded-full ${color}`} style={{ width: `${Math.min(100, r * 100)}%` }} />
      {r > 1 && <div className="absolute inset-y-0 w-0.5 bg-ranch-marron" style={{ left: `${100 / r}%` }} />}
    </div>
  );
}

/** Una barra partida por estados (equipos, animales), con su leyenda. */
export function BarraEstados({ partes }: { partes: { nombre: string; valor: number; color: string }[] }) {
  const total = partes.reduce((t, p) => t + p.valor, 0);
  if (!total) return <p className="text-xs text-ranch-marron/40">Sin registros.</p>;
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full">
        {partes.filter((p) => p.valor > 0).map((p) => <div key={p.nombre} className={p.color} style={{ width: `${(p.valor / total) * 100}%` }} title={`${p.nombre}: ${p.valor.toLocaleString("es-CO")}`} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ranch-marron/70">
        {partes.filter((p) => p.valor > 0).map((p) => (
          <span key={p.nombre} className="inline-flex items-center gap-1"><i className={`inline-block h-2.5 w-2.5 rounded-sm ${p.color}`} />{p.nombre} <b className="tabular-nums text-ranch-marron">{p.valor.toLocaleString("es-CO")}</b></span>
        ))}
      </div>
    </div>
  );
}
