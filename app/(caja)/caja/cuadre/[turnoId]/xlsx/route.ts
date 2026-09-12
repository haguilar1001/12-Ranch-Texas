import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { resumenTurno } from "@/lib/caja/resumen";
import { respuestaXlsx, type CeldaExcel } from "@/lib/reportes/xlsx";
import { formatearFechaHoraBogota } from "@/lib/tiempo";

// Cuadre del turno en Excel NATIVO: los valores van como números, no como texto.
export async function GET(_req: Request, { params }: { params: Promise<{ turnoId: string }> }) {
  const { turnoId } = await params;
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "cajero")) return new Response("No autorizado", { status: 401 });

  const turno = await prisma.turnoCaja.findUnique({
    where: { id: turnoId },
    include: { caja: true, usuario: { select: { nombre: true } } },
  });
  if (!turno) return new Response("No encontrado", { status: 404 });
  const r = await resumenTurno(turnoId);

  const resumen: CeldaExcel[][] = [
    ["Cuadre de turno"],
    ["Caja", turno.caja.nombre],
    ["Cajero", turno.usuario.nombre],
    ["Estado", turno.estado],
    ["Abierto", formatearFechaHoraBogota(turno.abierto_en)],
    ["Cerrado", turno.cerrado_en ? formatearFechaHoraBogota(turno.cerrado_en) : "—"],
    [],
    ["Efectivo", "Valor"],
    ["Base inicial", r.base_inicial],
    ["Ventas efectivo", r.ventasEfectivo],
    ["Otros ingresos", r.otrosIngresos],
    ["Egresos", -r.egresos],
    ["Efectivo esperado", turno.efectivo_esperado ?? r.esperadoEfectivo],
    ["Efectivo contado", turno.efectivo_contado ?? null],
    ["Diferencia", turno.diferencia ?? null],
    ["Observación", turno.observacion_cierre ?? ""],
    [],
    ["Cortesías (entraron gratis)", r.cortesias],
    ["Descuentos de tarifa (no cobrado)", r.descuentos],
    ["Ventas anuladas", r.anuladas],
  ];

  const porMedio: CeldaExcel[][] = [
    ["Medio de pago", "Total"],
    ...r.ventasPorMedio.map((m) => [m.medio, m.total] as CeldaExcel[]),
    ["Total ventas", r.totalVentas],
  ];

  const porTipo: CeldaExcel[][] = [
    ["Tipo de visitante", "Cantidad", "Total"],
    ...r.ventasPorTipo.map((t) => [t.tipo, t.cantidad, t.total] as CeldaExcel[]),
  ];

  return respuestaXlsx(
    [
      { nombre: "Resumen", filas: resumen },
      { nombre: "Por medio de pago", filas: porMedio },
      { nombre: "Por tipo", filas: porTipo },
    ],
    `cuadre-${turno.caja.nombre}-${turnoId.slice(0, 8)}`,
  );
}
