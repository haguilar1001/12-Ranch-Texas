import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { indicadoresVentas } from "@/lib/reportes/ventas";

export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "consulta")) return new Response("No autorizado", { status: 401 });

  const url = new URL(req.url);
  const anio = parseInt(url.searchParams.get("anio") ?? "2026", 10);
  const mes = parseInt(url.searchParams.get("mes") ?? "1", 10);
  const inicio = new Date(`${anio}-${String(mes).padStart(2, "0")}-01T00:00:00-05:00`);
  const nAnio = mes === 12 ? anio + 1 : anio, nMes = mes === 12 ? 1 : mes + 1;
  const fin = new Date(`${nAnio}-${String(nMes).padStart(2, "0")}-01T00:00:00-05:00`);
  const cajaId = url.searchParams.get("caja") || undefined;
  const cajeroId = url.searchParams.get("cajero") || undefined;
  const ind = await indicadoresVentas(inicio, fin, { cajaId, cajeroId });

  const filas: string[][] = [
    [`Reporte de ventas ${mes}/${anio}`],
    ["Entradas (asistentes)", String(ind.asistentes)],
    ["Ventas", String(ind.numVentas)],
    ["Ingreso total", String(ind.ingreso)],
    ["Ticket promedio", String(ind.ticketPromedio)],
    ["% cortesias/descuento", ind.pctCortesias.toFixed(1)],
    ["Valor no cobrado", String(ind.valorNoCobrado)],
    ["Entradas de cortesia", String(ind.personasCortesia)],
    [],
    ["Por tipo", "Entradas", "De cortesia", "Ingreso"],
    ...ind.porTipo.map((t) => [t.tipo, String(t.cantidad), String(t.cortesias), String(t.total)]),
    [],
    ["Como entraron", "Personas", "No cobrado"],
    ...ind.porClase.map((c) => [c.clase, String(c.personas), String(c.noCobrado)]),
    [],
    ["Por medio", "Total"],
    ...ind.porMedio.map((m) => [m.medio, String(m.total)]),
  ];
  const csv = "﻿" + filas.map((f) => f.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");

  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ventas-${anio}-${mes}.csv"` },
  });
}
