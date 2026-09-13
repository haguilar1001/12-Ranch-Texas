// Le pone su valor a las entradas PREPAGADAS que se vendieron en $ 0.
//
// Pasa cuando la tarifa del tipo estaba en cero al momento de vender: el bono o la
// compra por la web entraron, pero el día quedó registrando $ 0 por esas personas.
// Este script NO cambia el tipo de visitante — para eso está `reclasificar-prepagos`,
// que además mueve la línea de un tipo a otro. Aquí solo se valora lo que ya está bien
// clasificado:
//
//   · le pone a la línea el valor de la tarifa VIGENTE de su propio tipo,
//   · le agrega a la venta un pago con el medio PREPAGADO (BANCO), que no entra al
//     recaudo porque esa plata ya está en el banco,
//   · y recalcula los totales del encabezado desde el detalle.
//
// Lo que NO toca: el efectivo, los turnos ni el arqueo. Ningún cajón se mueve.
// Tampoco toca las cortesías: una entrada regalada de estos tipos sigue valiendo $ 0,
// porque nadie la pagó por adelantado.
//
// Es idempotente: solo mira líneas que sigan en $ 0, y el pago prepagado se ajusta en
// vez de duplicarse. Queda en la auditoría como "valorar_prepago".
//
//   npm run valorar:prepagos -- 2026-09-13
//   npm run valorar:prepagos -- 2026-09-13 --confirmar
import "dotenv/config";
import { prisma } from "../lib/db";
import { registrarAuditoria } from "../lib/audit";
import { mayus } from "../lib/db/mayusculas";

const CONFIRMAR = process.argv.includes("--confirmar");
const FECHA = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const cop = (n: number) => "$" + n.toLocaleString("es-CO");

/** Tipos cuya entrada se paga por banco ANTES de la visita. */
const PREPAGADOS = ["REDENCIÓN BONO", "PÁGINA WEB", "BONO COOMEVA", "BONO COMFAMILIAR"];

async function main() {
  if (!FECHA) {
    console.log("\nFalta la fecha: npm run valorar:prepagos -- 2026-09-13 [--confirmar]\n");
    return;
  }
  const url = process.env.DATABASE_URL ?? "";
  const destino = url.includes("localhost") || url.includes("127.0.0.1") ? "LOCAL" : "PRODUCCIÓN";
  console.log(`\n💳 Valorar prepagos del ${FECHA} · base ${destino}`);
  console.log(CONFIRMAR ? "   MODO: aplicando\n" : "   MODO: simulación (no se toca la base)\n");

  const desde = new Date(`${FECHA}T00:00:00-05:00`);
  const hasta = new Date(desde.getTime() + 24 * 3600000);

  const prepagado = await prisma.medioPago.findUnique({ where: { codigo: "prepagado" } });
  if (!prepagado) throw new Error("Falta el medio de pago 'prepagado'.");
  if (prepagado.afecta_recaudo) throw new Error("El medio 'prepagado' está marcado como que SÍ afecta el recaudo.");

  // Tarifa vigente de cada tipo prepagado. Sin tarifa no hay nada que aplicar.
  const tipos = await prisma.tipoVisitante.findMany({
    include: { tarifas: { where: { vigente_hasta: null }, orderBy: { vigente_desde: "desc" }, take: 1 } },
  });
  const vigenteDe = new Map(
    tipos
      .filter((t) => PREPAGADOS.includes(mayus(t.nombre)) && t.tarifas[0])
      .map((t) => [t.id, { nombre: t.nombre, tarifa: t.tarifas[0] }]),
  );

  console.log("  Tarifas vigentes que se van a aplicar:");
  for (const v of vigenteDe.values()) console.log(`    ${v.nombre.padEnd(20)} ${cop(v.tarifa.valor)}`);
  const sinValor = [...vigenteDe.values()].filter((v) => v.tarifa.valor === 0);
  if (sinValor.length) {
    console.log(`\n  ⚠️  ${sinValor.map((v) => v.nombre).join(", ")} sigue(n) en $ 0: esas líneas no se pueden valorar.`);
    console.log("      Corre primero:  npm run tarifas:prepago -- --confirmar\n");
  }

  const admin = await prisma.usuario.findFirst({ where: { usuario: "hectoralonsoaguilar@gmail.com" } });

  const ventas = await prisma.venta.findMany({
    where: {
      estado: "completada",
      creado_en: { gte: desde, lt: hasta },
      detalle: { some: { valor_cobrado: 0, tipo_linea: "pago", tipo_visitante_id: { in: [...vigenteDe.keys()] } } },
    },
    include: {
      detalle: { include: { tipo_visitante: { select: { nombre: true } } } },
      pagos: true,
      turno: { include: { caja: { select: { nombre: true } } } },
    },
    orderBy: [{ creado_en: "asc" }],
  });

  let totalAgregado = 0;
  let ventasTocadas = 0;
  let personas = 0;

  for (const v of ventas) {
    // Solo líneas de PAGO en cero: una cortesía de bono sigue siendo cortesía.
    const cambios = v.detalle
      .filter((d) => d.valor_cobrado === 0 && d.tipo_linea === "pago" && vigenteDe.has(d.tipo_visitante_id))
      .map((d) => ({ linea: d, destino: vigenteDe.get(d.tipo_visitante_id)! }))
      .filter((c) => c.destino.tarifa.valor > 0);

    if (!cambios.length) continue;

    const agregado = cambios.reduce((a, c) => a + c.destino.tarifa.valor * c.linea.cantidad, 0);
    ventasTocadas++;
    totalAgregado += agregado;
    personas += cambios.reduce((a, c) => a + c.linea.cantidad, 0);

    console.log(`\n  ${CONFIRMAR ? "→" : "?"} ${v.turno.caja.nombre} #${v.numero_venta} · ${v.comprador_nombre ?? "—"}`);
    for (const c of cambios) {
      console.log(`      ${String(c.linea.cantidad).padStart(3)} × ${c.destino.nombre.padEnd(18)} a ${cop(c.destino.tarifa.valor)} = ${cop(c.destino.tarifa.valor * c.linea.cantidad)}`);
    }
    console.log(`      venta ${cop(v.total_cobrado)} → ${cop(v.total_cobrado + agregado)}`);

    if (!CONFIRMAR) continue;

    const antes = { total_lista: v.total_lista, total_cobrado: v.total_cobrado, total_descuento: v.total_descuento };

    await prisma.$transaction(async (tx) => {
      for (const c of cambios) {
        await tx.ventaDetalle.update({
          where: { id: c.linea.id },
          data: {
            tarifa_id: c.destino.tarifa.id,
            valor_lista: c.destino.tarifa.valor,
            valor_cobrado: c.destino.tarifa.valor,
          },
        });
      }

      // Los totales se recalculan desde el detalle, nunca a mano.
      const detalle = await tx.ventaDetalle.findMany({ where: { venta_id: v.id } });
      const total_lista = detalle.reduce((a, d) => a + d.valor_lista * d.cantidad, 0);
      const total_cobrado = detalle.reduce((a, d) => a + d.valor_cobrado * d.cantidad, 0);

      // Un solo pago prepagado por venta. Se lleva la diferencia entre lo que ya
      // estaba pagado por otros medios y el nuevo total, para que los pagos cuadren
      // exactamente con el cobrado, como exige la validación de la venta.
      const otros = v.pagos.filter((p) => p.medio_pago_id !== prepagado.id).reduce((a, p) => a + p.monto, 0);
      const montoPrepagado = total_cobrado - otros;
      const yaHay = v.pagos.find((p) => p.medio_pago_id === prepagado.id);
      if (yaHay) await tx.ventaPago.update({ where: { id: yaHay.id }, data: { monto: montoPrepagado } });
      else if (montoPrepagado > 0) {
        await tx.ventaPago.create({ data: { venta_id: v.id, medio_pago_id: prepagado.id, monto: montoPrepagado } });
      }

      await tx.venta.update({
        where: { id: v.id },
        data: { total_lista, total_cobrado, total_descuento: total_lista - total_cobrado },
      });
    });

    await registrarAuditoria({
      usuario_id: admin?.id ?? null,
      entidad: "venta",
      entidad_id: v.id,
      accion: "valorar_prepago",
      datos_antes: antes,
      datos_despues: {
        motivo: "La entrada prepagada se había registrado en $ 0: se le pone su tarifa y el pago PREPAGADO (BANCO), que no entra al recaudo",
        agregado,
        lineas: cambios.map((c) => ({ tipo: c.destino.nombre, cantidad: c.linea.cantidad, valor: c.destino.tarifa.valor })),
      },
    });
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(`  ${ventasTocadas} venta(s) · ${personas} persona(s)`);
  console.log(`  La venta del día ${CONFIRMAR ? "subió" : "subiría"} ${cop(totalAgregado)}`);
  console.log("  El efectivo de las cajas no se mueve: el prepagado no entra al recaudo.\n");
  if (!CONFIRMAR) console.log("⚠ Simulación. Corre con --confirmar para aplicarlo.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
