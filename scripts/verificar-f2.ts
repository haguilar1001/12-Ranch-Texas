import "dotenv/config";
import { prisma } from "../lib/db";
import { crearVenta } from "../lib/ventas/registrar";
import { verificarPayload } from "../lib/qr/firma";
import type { EntradaVenta } from "../lib/ventas/tipos";

// Verificación determinista de F2 (manillas + QR + cola de impresión) contra la BD local.
// Registra una venta con 2 adultos + 1 bebé + 1 invitación, valida todo y limpia al final.

async function main() {
  console.log("\n🎟️  Verificación F2 — manillas con QR\n");

  // Turno abierto (o abrir uno para el admin).
  let turno = await prisma.turnoCaja.findFirst({
    where: { estado: "abierto" },
    include: { caja: true, usuario: true },
    orderBy: { abierto_en: "desc" },
  });
  if (!turno) {
    const admin = await prisma.usuario.findFirst({ where: { rol: "administrador" } });
    const caja = await prisma.caja.findFirst();
    if (!admin || !caja) throw new Error("Falta admin o caja (corre el seed).");
    const t = await prisma.turnoCaja.create({ data: { caja_id: caja.id, usuario_id: admin.id, base_inicial: 0, creado_por: admin.id } });
    turno = await prisma.turnoCaja.findUniqueOrThrow({ where: { id: t.id }, include: { caja: true, usuario: true } });
  }

  const tipos = await prisma.tipoVisitante.findMany();
  const idDe = (codigo: string) => tipos.find((t) => t.codigo === codigo)!.id;
  const efectivo = await prisma.medioPago.findFirstOrThrow({ where: { codigo: "efectivo" } });
  const motivo = await prisma.motivoCortesia.findFirstOrThrow();

  const entrada: EntradaVenta = {
    lineas: [
      { tipo_visitante_id: idDe("adulto"), cantidad: 2, tipo_linea: "pago" },
      { tipo_visitante_id: idDe("bebe"), cantidad: 1, tipo_linea: "pago" },
      { tipo_visitante_id: idDe("adulto"), cantidad: 1, tipo_linea: "invitacion", motivo_cortesia_id: motivo.id, autorizado_por: turno.usuario_id },
    ],
    pagos: [{ medio_pago_id: efectivo.id, monto: 120000 }],
  };

  const r = await crearVenta(
    { usuarioId: turno.usuario_id, usuarioNombre: turno.usuario.nombre, usuarioRol: turno.usuario.rol, turnoId: turno.id, cajaNombre: turno.caja.nombre },
    entrada,
  );
  if (!r.ok) throw new Error("crearVenta falló: " + r.error);
  console.log(`  ✓ Venta #${r.numero_venta} creada (id ${r.venta_id})`);

  const venta = await prisma.venta.findUniqueOrThrow({
    where: { id: r.venta_id },
    include: { detalle: { include: { manillas: true, tipo_visitante: true } }, pagos: true },
  });

  const manillas = venta.detalle.flatMap((d) => d.manillas);
  const asistentes = venta.detalle.reduce((a, d) => a + d.cantidad, 0);

  // Consistencia de totales
  const sumaDetalle = venta.detalle.reduce((a, d) => a + d.valor_cobrado * d.cantidad, 0);
  const sumaPagos = venta.pagos.reduce((a, p) => a + p.monto, 0);
  console.log(`  ✓ Totales: encabezado ${venta.total_cobrado} = detalle ${sumaDetalle} = pagos ${sumaPagos}`);
  if (venta.total_cobrado !== sumaDetalle || sumaDetalle !== sumaPagos) throw new Error("Totales inconsistentes");

  // Una manilla por asistente
  console.log(`  ✓ Manillas: ${manillas.length} (asistentes ${asistentes})`);
  if (manillas.length !== asistentes) throw new Error("Cantidad de manillas != asistentes");

  // Firma QR válida en cada manilla + bebé marcado
  let bebes = 0;
  for (const m of manillas) {
    const payload = `${m.codigo_uuid}.${m.firma_hmac}`;
    const v = verificarPayload(payload);
    if (!v.valido) throw new Error(`Firma inválida en manilla ${m.consecutivo}`);
    if (m.es_bebe) bebes++;
  }
  console.log(`  ✓ Firmas QR válidas en las ${manillas.length} manillas`);
  console.log(`  ✓ Manillas de bebé: ${bebes} (esperado 1)`);
  if (bebes !== 1) throw new Error("Bebé no marcado correctamente");

  // Cola de impresión poblada
  const impresiones = await prisma.impresion.count({ where: { manilla_id: { in: manillas.map((m) => m.id) } } });
  console.log(`  ✓ Cola de impresión: ${impresiones} registros pendientes`);
  if (impresiones !== manillas.length) throw new Error("Faltan registros en la cola de impresión");

  console.log(`  · Consecutivos: ${manillas.map((m) => m.consecutivo).join(", ")}`);

  // Limpieza (es una venta de verificación).
  await prisma.$transaction([
    prisma.impresion.deleteMany({ where: { manilla_id: { in: manillas.map((m) => m.id) } } }),
    prisma.manilla.deleteMany({ where: { id: { in: manillas.map((m) => m.id) } } }),
    prisma.ventaDetalle.deleteMany({ where: { venta_id: venta.id } }),
    prisma.ventaPago.deleteMany({ where: { venta_id: venta.id } }),
    prisma.venta.delete({ where: { id: venta.id } }),
  ]);
  console.log("  ✓ Limpieza: venta de verificación eliminada");

  console.log("\n✅ F2 verificado.\n");
}

main()
  .catch((e) => { console.error("❌", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
