import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { indicadoresVentas } from "@/lib/reportes/ventas";
import { fechaBogota } from "@/lib/tiempo";
import { rangoDe } from "../../periodo";

export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "consulta")) return new Response("No autorizado", { status: 401 });

  const url = new URL(req.url);
  const cajaId = url.searchParams.get("caja") || undefined;
  const cajeroId = url.searchParams.get("cajero") || undefined;

  // El MISMO cálculo que usa la pantalla: el archivo no puede traer otro período.
  const periodo = rangoDe(
    {
      anio: url.searchParams.get("anio") ?? undefined,
      mes: url.searchParams.get("mes") ?? undefined,
      fecha: url.searchParams.get("fecha"),
    },
    fechaBogota(),
  );
  const ind = await indicadoresVentas(periodo.inicio, periodo.fin, { cajaId, cajeroId });

  const filas: string[][] = [
    [`Reporte de ventas ${periodo.etiqueta}`],
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
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ventas-${periodo.clave}.csv"` },
  });
}
