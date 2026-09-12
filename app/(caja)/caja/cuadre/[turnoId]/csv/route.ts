import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { resumenTurno } from "@/lib/caja/resumen";

// Exporta el cuadre del turno como CSV (se abre en Excel). Separador ';' y BOM UTF-8.
export async function GET(_req: Request, { params }: { params: Promise<{ turnoId: string }> }) {
  const { turnoId } = await params;
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "cajero")) return new Response("No autorizado", { status: 401 });

  const turno = await prisma.turnoCaja.findUnique({ where: { id: turnoId }, include: { caja: true, usuario: { select: { nombre: true } } } });
  if (!turno) return new Response("No encontrado", { status: 404 });
  const r = await resumenTurno(turnoId);

  const filas: string[][] = [
    ["Cuadre de turno"],
    ["Caja", turno.caja.nombre],
    ["Cajero", turno.usuario.nombre],
    ["Estado", turno.estado],
    [],
    ["Ventas por medio de pago", "Total"],
    ...r.ventasPorMedio.map((m) => [m.medio, String(m.total)]),
    ["Total ventas", String(r.totalVentas)],
    [],
    ["Ventas por tipo", "Cantidad", "Total"],
    ...r.ventasPorTipo.map((t) => [t.tipo, String(t.cantidad), String(t.total)]),
    [],
    ["Efectivo", "Valor"],
    ["Base inicial", String(r.base_inicial)],
    ["Ventas efectivo", String(r.ventasEfectivo)],
    ["Otros ingresos", String(r.otrosIngresos)],
    ["Egresos", String(r.egresos)],
    ["Efectivo esperado", String(turno.efectivo_esperado ?? r.esperadoEfectivo)],
    ["Efectivo contado", String(turno.efectivo_contado ?? "")],
    ["Diferencia", String(turno.diferencia ?? "")],
    ["Observación", turno.observacion_cierre ?? ""],
    [],
    ["Cortesías (entraron gratis)", String(r.cortesias)],
    ["Descuentos de tarifa (no cobrado)", String(r.descuentos)],
    ["Ventas anuladas", String(r.anuladas)],
  ];

  const csv = "﻿" + filas.map((f) => f.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cuadre-${turno.caja.nombre.replace(/\s+/g, "_")}-${turnoId.slice(0, 8)}.csv"`,
    },
  });
}
