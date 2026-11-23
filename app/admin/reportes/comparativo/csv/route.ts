import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { comparativoAnual } from "@/lib/reportes/comparativo";
import { variacionPct } from "@/lib/reportes/util";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const FUENTE: Record<string, string> = { historico: "Historico", taquilla: "Taquilla", "": "" };

export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "consulta")) return new Response("No autorizado", { status: 401 });

  const url = new URL(req.url);
  const anio = parseInt(url.searchParams.get("anio") ?? "2026", 10);
  const producto = url.searchParams.get("producto") ?? undefined;
  const comp = await comparativoAnual(anio, producto || undefined);

  const filas: string[][] = [
    [`Comparativo ${anio} vs ${anio - 1}${producto ? ` — ${producto}` : ""}`],
    ["Mes", String(anio - 1), `Fuente ${anio - 1}`, String(anio), `Fuente ${anio}`, "Variacion %"],
    ...comp.meses.map((m) => {
      const v = m.futuro ? null : variacionPct(m.actual, m.anterior);
      return [MESES[m.mes - 1], String(m.anterior), FUENTE[m.fuenteAnterior ?? ""], String(m.actual), FUENTE[m.fuenteActual ?? ""], v === null ? "" : v.toFixed(1)];
    }),
    [`Total${comp.periodo ? ` ${comp.periodo}` : ""}`, String(comp.totalAnterior), "", String(comp.totalActual), "", (variacionPct(comp.totalActual, comp.totalAnterior) ?? 0).toFixed(1)],
    ...(comp.periodo ? [[`Total ${anio - 1} año completo`, String(comp.totalAnteriorAnio), "", "", "", ""]] : []),
  ];
  const csv = "﻿" + filas.map((f) => f.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");

  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="comparativo-${anio}.csv"` },
  });
}
