import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { relacionAnulaciones } from "@/lib/reportes/anulaciones";
import { fechaBogota, formatearFechaHoraCortaBogota } from "@/lib/tiempo";
import { rangoDe } from "../../periodo";

export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "supervisor")) return new Response("No autorizado", { status: 401 });

  const url = new URL(req.url);
  const cajaId = url.searchParams.get("caja") || undefined;
  const anuloId = url.searchParams.get("anulo") || undefined;

  const rango = rangoDe(
    {
      anio: url.searchParams.get("anio") ?? undefined,
      mes: url.searchParams.get("mes") ?? undefined,
      fecha: url.searchParams.get("fecha"),
      dia: url.searchParams.get("dia"),
    },
    fechaBogota(),
  );

  const r = await relacionAnulaciones(rango.inicio, rango.fin, { cajaId, anuloId });

  const filas: string[][] = [
    [`Ventas anuladas ${rango.etiqueta}`],
    ["Valor anulado", String(r.totalAnulado)],
    ["Ventas anuladas", String(r.totalVentas)],
    ["Asistentes", String(r.totalAsistentes)],
    [],
    ["Quién anuló", "Ventas", "Valor"],
    ...r.porUsuario.map((u) => [u.usuario, String(u.ventas), String(u.valor)]),
    [],
    ["Motivo", "Ventas", "Valor"],
    ...r.porMotivo.map((m) => [m.motivo, String(m.ventas), String(m.valor)]),
    [],
    ["Anulada", "Venta", "Comprador", "Asistentes", "Valor", "Motivo", "Vendió", "Anuló", "Caja", "Reemplazada por"],
    ...r.lineas.map((l) => [
      formatearFechaHoraCortaBogota(l.fecha),
      String(l.numero_venta),
      l.comprador,
      String(l.cantidad_asistentes),
      String(l.total_cobrado),
      l.motivo,
      l.vendio,
      l.anulo,
      l.caja,
      l.reemplazada_por ? `#${l.reemplazada_por}` : "",
    ]),
  ];

  const csv = "﻿" + filas.map((f) => f.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="anulaciones-${rango.clave}.csv"`,
    },
  });
}
