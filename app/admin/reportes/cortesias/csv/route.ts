import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { relacionCortesias } from "@/lib/reportes/cortesias";
import { formatearFechaHoraCortaBogota } from "@/lib/tiempo";

const ETIQUETA: Record<string, string> = { atencion: "Atencion", invitacion: "Invitacion", cortesia: "Cortesia", descuento: "Descuento" };

export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "supervisor")) return new Response("No autorizado", { status: 401 });

  const url = new URL(req.url);
  const anio = parseInt(url.searchParams.get("anio") ?? "2026", 10);
  const mes = parseInt(url.searchParams.get("mes") ?? "1", 10);
  const cajaId = url.searchParams.get("caja") || undefined;
  const cajeroId = url.searchParams.get("cajero") || undefined;

  const inicio = new Date(`${anio}-${String(mes).padStart(2, "0")}-01T00:00:00-05:00`);
  const nAnio = mes === 12 ? anio + 1 : anio, nMes = mes === 12 ? 1 : mes + 1;
  const fin = new Date(`${nAnio}-${String(nMes).padStart(2, "0")}-01T00:00:00-05:00`);

  const r = await relacionCortesias(inicio, fin, { cajaId, cajeroId });

  const filas: string[][] = [
    [`Relacion de atenciones e invitaciones ${mes}/${anio}`],
    ["Valor no cobrado", String(r.totalNoCobrado)],
    ["Personas", String(r.totalPersonas)],
    ["Registros", String(r.lineas.length)],
    [],
    ["Por tipo", "Personas", "No cobrado"],
    ...r.porTipo.map((t) => [ETIQUETA[t.tipo] ?? t.tipo, String(t.personas), String(t.noCobrado)]),
    [],
    ["Por motivo", "Personas", "No cobrado"],
    ...r.porMotivo.map((m) => [m.motivo, String(m.personas), String(m.noCobrado)]),
    [],
    ["Autoriza", "Personas", "No cobrado"],
    ...r.porAutoriza.map((a) => [a.autoriza, String(a.personas), String(a.noCobrado)]),
    [],
    ["Fecha", "Venta", "Tipo", "Visitante", "Cantidad", "Valor lista", "Valor cobrado", "No cobrado", "Motivo", "Autoriza", "Cajero", "Caja"],
    ...r.lineas.map((l) => [
      formatearFechaHoraCortaBogota(l.fecha),
      String(l.numero_venta),
      ETIQUETA[l.tipo] ?? l.tipo,
      l.tipo_visitante,
      String(l.cantidad),
      String(l.valor_lista),
      String(l.valor_cobrado),
      String(l.no_cobrado),
      l.motivo,
      l.autoriza,
      l.cajero,
      l.caja,
    ]),
  ];

  const csv = "﻿" + filas.map((f) => f.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cortesias-${anio}-${mes}.csv"`,
    },
  });
}
