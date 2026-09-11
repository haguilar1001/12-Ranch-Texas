// Deja la operación de taquilla en CERO para arrancar limpio: cierra los turnos
// abiertos y borra ventas, manillas y todo lo que cuelga de ellas.
//
// NO toca los maestros ni el histórico:
//   · usuarios, cajas, medios de pago, tipos de visitante, tarifas, motivos de cortesía
//   · atracciones, puntos de control, personal, animales, equipos, gastos
//   · ventas_historicas (la venta 2020–2026 importada del Excel, que alimenta el
//     comparativo año vs año). Es otra tabla, no se toca.
//
// Por defecto SOLO INFORMA. Para que borre de verdad hay que pasar --confirmar.
//
//   npm run limpiar:taquilla              → muestra qué borraría
//   npm run limpiar:taquilla -- --confirmar → borra
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRMAR = process.argv.includes("--confirmar");

const cop = (n: number) => "$" + n.toLocaleString("es-CO");

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const destino = url.includes("localhost") || url.includes("127.0.0.1") ? "LOCAL" : "PRODUCCIÓN";
  console.log(`\n🧹 Limpieza de taquilla · base ${destino}\n`);

  // ---------------------------------------------------------------- inventario
  const [ventas, detalle, pagos, manillas, impresiones, accesos, consentimientos, turnosFila, turnos, movimientos, conteos] =
    await Promise.all([
      prisma.venta.findMany({ select: { total_cobrado: true, cantidad_asistentes: true, creado_en: true } }),
      prisma.ventaDetalle.count(),
      prisma.ventaPago.count(),
      prisma.manilla.count(),
      prisma.impresion.count(),
      prisma.acceso.count(),
      prisma.consentimiento.count(),
      prisma.turnoFila.count(),
      prisma.turnoCaja.findMany({ select: { estado: true } }),
      prisma.movimientoCaja.count(),
      prisma.conteoDenominacion.count(),
    ]);

  const totalVendido = ventas.reduce((a, v) => a + v.total_cobrado, 0);
  const asistentes = ventas.reduce((a, v) => a + v.cantidad_asistentes, 0);
  const abiertos = turnos.filter((t) => t.estado === "abierto").length;
  const fechas = ventas.map((v) => v.creado_en).sort((a, b) => a.getTime() - b.getTime());

  console.log("  SE VA A BORRAR:");
  console.log(`    ventas ................ ${ventas.length}  (${cop(totalVendido)} · ${asistentes} asistentes)`);
  if (fechas.length) {
    const f = (d: Date) => new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
    console.log(`      desde ${f(fechas[0])} hasta ${f(fechas[fechas.length - 1])}`);
  }
  console.log(`    líneas de venta ....... ${detalle}`);
  console.log(`    pagos de venta ........ ${pagos}`);
  console.log(`    manillas .............. ${manillas}`);
  console.log(`    impresiones en cola ... ${impresiones}`);
  console.log(`    accesos escaneados .... ${accesos}`);
  console.log(`    consentimientos ....... ${consentimientos}`);
  console.log(`    turnos de fila ........ ${turnosFila}`);
  console.log(`    turnos de caja ........ ${turnos.length}  (${abiertos} abiertos)`);
  console.log(`    movimientos de caja ... ${movimientos}`);
  console.log(`    conteos de cierre ..... ${conteos}`);

  // ---------------------------------------------------------------- lo que se conserva
  const [usuarios, cajas, medios, tipos, motivos, atracciones, empleados, historicas, gastos] = await Promise.all([
    prisma.usuario.count({ where: { activo: true } }),
    prisma.caja.count({ where: { activo: true } }),
    prisma.medioPago.count({ where: { activo: true } }),
    prisma.tipoVisitante.count({ where: { activo: true } }),
    prisma.motivoCortesia.count({ where: { activo: true } }),
    prisma.atraccion.count({ where: { activa: true } }),
    prisma.empleado.count({ where: { activo: true } }),
    prisma.ventaHistorica.count(),
    prisma.gasto.count(),
  ]);

  console.log("\n  SE CONSERVA:");
  console.log(`    usuarios ${usuarios} · cajas ${cajas} · medios de pago ${medios} · tipos de visitante ${tipos}`);
  console.log(`    motivos de cortesía ${motivos} · atracciones ${atracciones} · empleados ${empleados} · gastos ${gastos}`);
  console.log(`    venta histórica 2020–2026: ${historicas.toLocaleString("es-CO")} filas (NO se toca)`);

  if (!CONFIRMAR) {
    console.log("\n  ⚠ Simulación: no se borró nada.");
    console.log("    Para borrar de verdad: npm run limpiar:taquilla -- --confirmar\n");
    return;
  }

  // ---------------------------------------------------------------- borrado
  console.log("\n  Borrando en orden de dependencias...");
  await prisma.$transaction([
    prisma.impresion.deleteMany({}),
    prisma.acceso.deleteMany({}),
    prisma.consentimiento.deleteMany({}),
    prisma.turnoFila.deleteMany({}),
    prisma.manilla.deleteMany({}),
    prisma.ventaDetalle.deleteMany({}),
    prisma.ventaPago.deleteMany({}),
    prisma.movimientoCaja.deleteMany({}),
    prisma.conteoDenominacion.deleteMany({}),
    prisma.venta.deleteMany({}),
    prisma.turnoCaja.deleteMany({}),
  ]);

  const quedan = {
    ventas: await prisma.venta.count(),
    manillas: await prisma.manilla.count(),
    turnos: await prisma.turnoCaja.count(),
    impresiones: await prisma.impresion.count(),
    historicas: await prisma.ventaHistorica.count(),
    usuarios: await prisma.usuario.count({ where: { activo: true } }),
    tipos: await prisma.tipoVisitante.count({ where: { activo: true } }),
  };

  console.log("\n  DESPUÉS:");
  console.log(`    ventas ${quedan.ventas} · manillas ${quedan.manillas} · turnos ${quedan.turnos} · impresiones ${quedan.impresiones}`);
  console.log(`    usuarios ${quedan.usuarios} · tipos de visitante ${quedan.tipos} · histórico ${quedan.historicas.toLocaleString("es-CO")}`);

  const limpio = quedan.ventas === 0 && quedan.manillas === 0 && quedan.turnos === 0 && quedan.impresiones === 0;
  console.log(limpio ? "\n✅ Taquilla en cero. Lista para abrir turno mañana.\n" : "\n❌ Quedaron datos sin borrar.\n");
  if (!limpio) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
