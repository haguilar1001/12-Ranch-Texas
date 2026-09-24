import "dotenv/config";
import { prisma } from "../lib/db";
import { crearVenta } from "../lib/ventas/registrar";
import { resumenTurno } from "../lib/caja/resumen";
import { totalConteo, calcularDiferencia } from "../lib/caja/cierre";
import type { EntradaVenta } from "../lib/ventas/tipos";

async function main() {
  console.log("\n💰 Verificación F5 — caja y cuadre\n");
  const check = (cond: boolean, msg: string) => { console.log(`  ${cond ? "✓" : "✗"} ${msg}`); if (!cond) throw new Error("FALLO: " + msg); };

  const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: "administrador" } });
  const caja = await prisma.caja.findFirstOrThrow();
  const tipos = await prisma.tipoVisitante.findMany();
  const efectivo = await prisma.medioPago.findFirstOrThrow({ where: { codigo: "efectivo" } });

  // Turno de prueba con base 100.000
  const turno = await prisma.turnoCaja.create({ data: { caja_id: caja.id, usuario_id: admin.id, base_inicial: 100000, creado_por: admin.id } });

  const entrada: EntradaVenta = {
    lineas: [{ tipo_visitante_id: tipos.find((t) => t.codigo === "adulto")!.id, cantidad: 2, tipo_linea: "pago" }],
    pagos: [{ medio_pago_id: efectivo.id, monto: 120000 }],
  };
  const venta = await crearVenta({ usuarioId: admin.id, usuarioNombre: admin.nombre, usuarioRol: admin.rol, turnoId: turno.id, cajaNombre: caja.nombre }, entrada);
  if (!venta.ok) throw new Error("venta");

  // Movimientos: +20.000 ingreso, -15.000 egreso
  await prisma.movimientoCaja.create({ data: { turno_id: turno.id, tipo: "ingreso", monto: 20000, concepto: "Préstamo", creado_por: admin.id } });
  await prisma.movimientoCaja.create({ data: { turno_id: turno.id, tipo: "egreso", monto: 15000, concepto: "Insumos", creado_por: admin.id } });

  const r = await resumenTurno(turno.id);
  check(r.ventasEfectivo === 120000, `Ventas en efectivo = 120.000 (${r.ventasEfectivo})`);
  check(r.otrosIngresos === 20000 && r.egresos === 15000, "Otros ingresos 20.000 y egresos 15.000");
  check(r.esperadoEfectivo === 225000, `Efectivo esperado = base+ventas+ingresos-egresos = 225.000 (${r.esperadoEfectivo})`);
  const adulto = r.ventasPorTipo.find((t) => t.tipo === "Adulto");
  check(!!adulto && adulto.cantidad === 2 && adulto.total === 120000, "Ventas por tipo: Adulto x2 = 120.000");
  const medioEfectivo = r.ventasPorMedio.find((m) => m.es_efectivo);
  check(!!medioEfectivo && medioEfectivo.total === 120000, "Ventas por medio: Efectivo = 120.000");

  // Cierre: conteo exacto → cuadra; conteo con faltante → -5.000
  const exacto = totalConteo([
    { denominacion: 100000, cantidad: 2 }, // 200000
    { denominacion: 20000, cantidad: 1 },  // 20000
    { denominacion: 5000, cantidad: 1 },   // 5000
  ]); // 225000
  check(exacto === 225000, `Conteo exacto = 225.000 (${exacto})`);
  check(calcularDiferencia(exacto, r.esperadoEfectivo) === 0, "Diferencia con conteo exacto = 0 (cuadra)");
  check(calcularDiferencia(220000, r.esperadoEfectivo) === -5000, "Faltante de 5.000 → diferencia -5.000");
  check(calcularDiferencia(230000, r.esperadoEfectivo) === 5000, "Sobrante de 5.000 → diferencia +5.000");

  // Limpieza
  const manillas = await prisma.manilla.findMany({ where: { venta_detalle: { venta_id: venta.venta_id } }, select: { id: true } });
  await prisma.impresion.deleteMany({ where: { manilla_id: { in: manillas.map((m) => m.id) } } });
  await prisma.manilla.deleteMany({ where: { id: { in: manillas.map((m) => m.id) } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta_id: venta.venta_id } });
  await prisma.ventaPago.deleteMany({ where: { venta_id: venta.venta_id } });
  await prisma.venta.delete({ where: { id: venta.venta_id } });
  await prisma.movimientoCaja.deleteMany({ where: { turno_id: turno.id } });
  await prisma.conteoDenominacion.deleteMany({ where: { turno_id: turno.id } });
  await prisma.turnoCaja.delete({ where: { id: turno.id } });
  console.log("  ✓ Limpieza completada");

  console.log("\n✅ F5 verificado.\n");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
