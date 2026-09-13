import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { relacionCortesias } from "@/lib/reportes/cortesias";
import { fechaBogota, formatearFechaHoraCortaBogota } from "@/lib/tiempo";
import { rangoDe } from "../../periodo";

const ETIQUETA: Record<string, string> = { atencion: "Atencion", invitacion: "Invitacion", cortesia: "Cortesia", descuento: "Descuento" };

export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "supervisor")) return new Response("No autorizado", { status: 401 });

  const url = new URL(req.url);
  const cajaId = url.searchParams.get("caja") || undefined;
  const cajeroId = url.searchParams.get("cajero") || undefined;

  // El MISMO cálculo que usa la pantalla: el archivo no puede traer otro período.
  const rango = rangoDe(
    {
      anio: url.searchParams.get("anio") ?? undefined,
      mes: url.searchParams.get("mes") ?? undefined,
      dia: url.searchParams.get("dia"),
    },
    fechaBogota(),
  );

  const r = await relacionCortesias(rango.inicio, rango.fin, { cajaId, cajeroId });

  const filas: string[][] = [
    [`Relacion de cortesias ${rango.etiqueta}`],
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
    ["Fecha", "Venta", "Tipo", "Beneficiario", "Visitante", "Cantidad", "Valor lista", "Valor cobrado", "No cobrado", "Motivo", "Autoriza", "Cajero", "Caja"],
    ...r.lineas.map((l) => [
      formatearFechaHoraCortaBogota(l.fecha),
      String(l.numero_venta),
      ETIQUETA[l.tipo] ?? l.tipo,
      l.beneficiario,
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
      "Content-Disposition": `attachment; filename="cortesias-${rango.clave}.csv"`,
    },
  });
}
