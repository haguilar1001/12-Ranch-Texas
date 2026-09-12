import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { cierreDelDia } from "@/lib/reportes/cierre";
import { fechaBogota } from "@/lib/tiempo";

export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "supervisor")) return new Response("No autorizado", { status: 401 });

  const url = new URL(req.url);
  const pedida = url.searchParams.get("fecha") ?? "";
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : fechaBogota();
  const desde = new Date(`${fecha}T00:00:00-05:00`);
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);

  const r = await cierreDelDia(desde, hasta);

  const filas: (string | number)[][] = [
    ["PARQUE RANCH TEXAS - INFORME DE CIERRE DIA"],
    ["Fecha", fecha],
    [],
    ["Concepto", "Cant", "Vr Unit", "Vr Total"],
    ...r.ventas.map((f) => [f.concepto, f.cantidad, f.valorUnitario, f.valorTotal]),
    ...r.sinCobro.map((f) => [f.concepto, f.cantidad, 0, 0]),
    ["TOTAL VENTA DIA", r.totalCantidad, "", r.totalVenta],
    [],
    ["Descuentos autorizados", "Motivo", "Autoriza", "Personas", "Lista", "Cobrado", "No cobrado"],
    ...r.descuentos.map((d) => [d.concepto, d.motivo, d.autoriza, d.personas, d.valorLista, d.valorCobrado, d.noCobrado]),
    ["TOTAL", "", "", r.descuentos.reduce((a, d) => a + d.personas, 0), "", "", r.descuentoTotal],
    ["Valor a tarifa plena", "", "", "", "", "", r.totalLista],
    [],
    ...(r.porCaja.cajas.length > 1
      ? [
          ["Cierre por caja"],
          ["Concepto", "Vr Unit", ...r.porCaja.cajas.flatMap((c) => [`${c} cant`, `${c} valor`]), "Total cant", "Total valor"],
          ...r.porCaja.filas.map((f) => [
            f.concepto,
            f.cobra ? f.valorUnitario : 0,
            ...f.celdas.flatMap((c) => [c.cantidad, c.valorTotal]),
            f.cantidad,
            f.valorTotal,
          ]),
          ["TOTAL", "", ...r.porCaja.totalPorCaja.flatMap((t) => [t.cantidad, t.valorTotal]), r.porCaja.totalCantidad, r.porCaja.totalValor],
          [],
        ]
      : []),
    ["Manillas por tipo", "Manillas", "Personas"],
    ...r.porManilla.map((g) => [g.tipo, g.manillas, g.asistentes]),
    ["TOTAL", r.totalManillas, r.totalCantidad],
    [],
    ["Recaudo por medio de pago", "Monto"],
    ...r.porMedioPago.map((m) => [m.medio, m.monto]),
    [],
    ["Turnos", "Cajero", "Ventas", "Recaudado"],
    ...r.turnos.map((t) => [t.caja, t.cajero, t.ventas, t.recaudado]),
    [],
    ["Ventas completadas", r.ventasCompletadas],
    ["Ventas anuladas", r.ventasAnuladas],
  ];

  const csv = "﻿" + filas
    .map((f) => f.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cierre-${fecha}.csv"`,
    },
  });
}
