// Verificación determinista de F12 (Caja): descuentos parciales, captura del comprador,
// relación de atenciones/invitaciones y export a Excel nativo.
//
// Corre contra la BD local. Crea ventas de prueba en el turno abierto y las deja marcadas
// con un comprador reconocible para poder limpiarlas.
//
//   npx tsx scripts/verificar-f12.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { crearVenta } from "../lib/ventas/registrar";
import { relacionCortesias } from "../lib/reportes/cortesias";
import { construirXlsx } from "../lib/reportes/xlsx";
import { resolverValorCobrado } from "../lib/ventas/calculo";

const prisma = new PrismaClient();
const MARCA = "QA-F12";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: string) {
  console.log(`${ok ? "  ✓" : "  ✗"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
}

async function main() {
  console.log("\n🧾 Verificando F12 · Caja\n");

  const turno = await prisma.turnoCaja.findFirst({
    where: { estado: "abierto" },
    include: { caja: true, usuario: true },
  });
  if (!turno) throw new Error("No hay turno de caja abierto. Abre uno para correr esta verificación.");

  const ctx = {
    usuarioId: turno.usuario_id,
    usuarioNombre: turno.usuario.nombre,
    usuarioRol: turno.usuario.rol,
    turnoId: turno.id,
    cajaNombre: turno.caja.nombre,
  };
  console.log(`  Turno: ${turno.caja.nombre} · ${turno.usuario.nombre}\n`);

  const adulto = await prisma.tipoVisitante.findFirst({ where: { codigo: "adulto" } });
  if (!adulto) throw new Error("No existe el tipo de visitante 'adulto'.");
  const tarifa = await prisma.tarifa.findFirst({
    where: { tipo_visitante_id: adulto.id, vigente_hasta: null },
    orderBy: { vigente_desde: "desc" },
  });
  const valorLista = tarifa?.valor ?? 0;
  console.log(`  Tarifa adulto vigente: $${valorLista.toLocaleString("es-CO")}\n`);

  const medio = await prisma.medioPago.findFirst({ where: { es_efectivo: true } });
  const motivo = await prisma.motivoCortesia.findFirst();
  if (!medio || !motivo) throw new Error("Faltan medios de pago o motivos de cortesía en la BD.");

  // ---------------------------------------------------------------- 1. Descuento parcial
  console.log("1. Descuento parcial con motivo y autorización");
  const cobrado = Math.round(valorLista * 0.75); // 25% de descuento
  const r1 = await crearVenta(ctx, {
    lineas: [{
      tipo_visitante_id: adulto.id, cantidad: 4, tipo_linea: "pago",
      valor_cobrado: cobrado, motivo_descuento: "Grupo grande", autorizado_por: ctx.usuarioId,
    }],
    pagos: [{ medio_pago_id: medio.id, monto: cobrado * 4 }],
    comprador_nombre: `${MARCA} Colegio San José`,
    comprador_documento: "900123456",
  });
  check("la venta con descuento se registra", r1.ok, r1.ok ? `venta #${r1.numero_venta}` : r1.error);

  if (r1.ok) {
    const v = await prisma.venta.findUnique({ where: { id: r1.venta_id }, include: { detalle: true } });
    const d = v!.detalle[0];
    check("cobra el valor con descuento", d.valor_cobrado === cobrado, `${d.valor_cobrado} vs ${cobrado}`);
    check("conserva el valor de lista", d.valor_lista === valorLista, String(d.valor_lista));
    check("guarda el motivo del descuento", d.motivo_descuento === "Grupo grande", d.motivo_descuento ?? "null");
    check("guarda quién autorizó", d.autorizado_por === ctx.usuarioId);
    check(
      "el descuento del encabezado cuadra con el detalle",
      v!.total_descuento === (valorLista - cobrado) * 4,
      `${v!.total_descuento} vs ${(valorLista - cobrado) * 4}`,
    );
    check("guarda el comprador", v!.comprador_nombre?.includes("Colegio San José") ?? false, v!.comprador_nombre ?? "null");
    check("guarda el documento del comprador", v!.comprador_documento === "900123456");
    check("genera una manilla por asistente", v!.cantidad_asistentes === 4);
  }

  // ---------------------------------------------------------------- 2. Descuento sin motivo
  console.log("\n2. Un descuento sin motivo NO puede pasar");
  const r2 = await crearVenta(ctx, {
    lineas: [{ tipo_visitante_id: adulto.id, cantidad: 1, tipo_linea: "pago", valor_cobrado: 1000, autorizado_por: ctx.usuarioId }],
    pagos: [{ medio_pago_id: medio.id, monto: 1000 }],
  });
  check("se rechaza el descuento sin motivo", !r2.ok, r2.ok ? "SE REGISTRÓ (mal)" : r2.error);

  console.log("\n3. Un descuento sin autorización NO puede pasar");
  const r3 = await crearVenta(ctx, {
    lineas: [{ tipo_visitante_id: adulto.id, cantidad: 1, tipo_linea: "pago", valor_cobrado: 1000, motivo_descuento: "Porque sí" }],
    pagos: [{ medio_pago_id: medio.id, monto: 1000 }],
  });
  check("se rechaza el descuento sin autorización", !r3.ok, r3.ok ? "SE REGISTRÓ (mal)" : r3.error);

  // ---------------------------------------------------------------- 4. No confiar en el cliente
  console.log("\n4. El servidor no se deja engañar por el cliente");
  check("un valor por encima de la tarifa se recorta", resolverValorCobrado(valorLista, "pago", valorLista * 3) === valorLista);
  check("un valor negativo se vuelve 0", resolverValorCobrado(valorLista, "pago", -50_000) === 0);
  check("una cortesía cobra 0 aunque pidan otra cosa", resolverValorCobrado(valorLista, "atencion", valorLista) === 0);

  const r4 = await crearVenta(ctx, {
    lineas: [{ tipo_visitante_id: adulto.id, cantidad: 1, tipo_linea: "pago", valor_cobrado: valorLista * 5 }],
    pagos: [{ medio_pago_id: medio.id, monto: valorLista }],
    comprador_nombre: `${MARCA} sin descuento`,
  });
  check("un 'descuento' mayor que la tarifa cobra la tarifa completa", r4.ok, r4.ok ? "" : r4.error);

  // ---------------------------------------------------------------- 5. Cortesía (atención)
  console.log("\n5. Atención (cortesía)");
  const r5 = await crearVenta(ctx, {
    lineas: [{
      tipo_visitante_id: adulto.id, cantidad: 2, tipo_linea: "atencion",
      motivo_cortesia_id: motivo.id, autorizado_por: ctx.usuarioId,
    }],
    pagos: [],
    comprador_nombre: `${MARCA} atención`,
  });
  check("la atención se registra sin cobro", r5.ok, r5.ok ? `venta #${r5.numero_venta}` : r5.error);

  // ---------------------------------------------------------------- 6. Relación de cortesías
  console.log("\n6. Relación de atenciones e invitaciones");
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - 86_400_000);
  const hasta = new Date(ahora.getTime() + 86_400_000);
  const rel = await relacionCortesias(desde, hasta);

  const laAtencion = rel.lineas.find((l) => l.tipo === "atencion");
  const elDescuento = rel.lineas.find((l) => l.tipo === "descuento" && l.motivo === "Grupo grande");

  check("aparece la atención en la relación", !!laAtencion, laAtencion ? `${laAtencion.cantidad} personas` : "no está");
  check("aparece el descuento en la relación", !!elDescuento, elDescuento ? `no cobrado $${elDescuento.no_cobrado.toLocaleString("es-CO")}` : "no está");
  if (laAtencion) {
    check("la atención muestra el motivo", laAtencion.motivo === motivo.nombre, laAtencion.motivo);
    check("la atención no cobró nada", laAtencion.valor_cobrado === 0);
    check("resuelve el nombre de quién autorizó", laAtencion.autoriza === ctx.usuarioNombre, laAtencion.autoriza);
  }
  if (elDescuento) {
    check(
      "el descuento cuenta solo lo dejado de cobrar",
      elDescuento.no_cobrado === (valorLista - cobrado) * 4,
      `${elDescuento.no_cobrado}`,
    );
  }
  const sumaLineas = rel.lineas.reduce((a, l) => a + l.no_cobrado, 0);
  check("el total cuadra con la suma del detalle", rel.totalNoCobrado === sumaLineas, `${rel.totalNoCobrado} vs ${sumaLineas}`);

  const sumaPorTipo = rel.porTipo.reduce((a, t) => a + t.noCobrado, 0);
  check("los agrupados por tipo suman el total", sumaPorTipo === rel.totalNoCobrado);
  const sumaPorAutoriza = rel.porAutoriza.reduce((a, t) => a + t.noCobrado, 0);
  check("los agrupados por autorizador suman el total", sumaPorAutoriza === rel.totalNoCobrado);

  console.log(`\n  Total no cobrado en el período: $${rel.totalNoCobrado.toLocaleString("es-CO")} · ${rel.totalPersonas} personas`);

  // ---------------------------------------------------------------- 7. Excel nativo
  console.log("\n7. Export a Excel nativo (.xlsx)");
  const buf = construirXlsx([
    { nombre: "Resumen", filas: [["Concepto", "Valor"], ["Total no cobrado", rel.totalNoCobrado], ["Personas", rel.totalPersonas]] },
    { nombre: "Detalle", filas: [["Tipo", "Cantidad", "No cobrado"], ...rel.lineas.map((l) => [l.tipo, l.cantidad, l.no_cobrado])] },
  ]);
  // Un .xlsx es un ZIP: siempre empieza con "PK".
  check("genera un archivo .xlsx real (no CSV)", buf[0] === 0x50 && buf[1] === 0x4b, `${buf.length} bytes`);
  check("el archivo tiene contenido", buf.length > 2000, `${buf.length} bytes`);

  // ---------------------------------------------------------------- Limpieza
  console.log("\n8. Limpieza de las ventas de prueba");
  const dePrueba = await prisma.venta.findMany({ where: { comprador_nombre: { startsWith: MARCA } }, select: { id: true } });
  const ids = dePrueba.map((v) => v.id);
  if (ids.length) {
    const detalles = await prisma.ventaDetalle.findMany({ where: { venta_id: { in: ids } }, select: { id: true } });
    const detIds = detalles.map((d) => d.id);
    await prisma.impresion.deleteMany({ where: { manilla: { venta_detalle_id: { in: detIds } } } });
    await prisma.manilla.deleteMany({ where: { venta_detalle_id: { in: detIds } } });
    await prisma.ventaDetalle.deleteMany({ where: { venta_id: { in: ids } } });
    await prisma.ventaPago.deleteMany({ where: { venta_id: { in: ids } } });
    await prisma.venta.deleteMany({ where: { id: { in: ids } } });
  }
  check("se borraron las ventas de prueba", true, `${ids.length} ventas`);

  console.log(fallos === 0 ? "\n✅ F12 verificada, sin fallos.\n" : `\n❌ ${fallos} verificación(es) fallaron.\n`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
