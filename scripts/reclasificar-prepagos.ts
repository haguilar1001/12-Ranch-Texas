// Reclasifica las entradas de bono y de página web que se registraron en $ 0 antes de
// que existieran sus tarifas (12/09/2026, el primer día de operación).
//
// Qué hace con cada línea:
//   · la apunta al tipo que le corresponde (Bono Coomeva / Bono Comfamiliar / Página Web),
//   · le pone el valor de la tarifa vigente de ese tipo,
//   · mueve las manillas de esa línea al tipo nuevo, para que el conteo por manilla cuadre,
//   · le agrega a la venta un pago con el medio PREPAGADO (BANCO) por la diferencia, y
//   · recalcula los totales del encabezado desde el detalle.
//
// Lo que NO toca: las líneas que sí se cobraron, el efectivo, los turnos y el arqueo.
// El prepagado no entra al recaudo, así que ningún cajón se mueve.
//
// Queda registrado en la auditoría como "reclasificar_prepago", con el antes y el después.
// Es idempotente: correrlo dos veces no duplica el pago ni vuelve a subir los totales.
//
//   npx tsx scripts/reclasificar-prepagos.ts 2026-09-12
//   npx tsx scripts/reclasificar-prepagos.ts 2026-09-12 --confirmar
import "dotenv/config";
import { prisma } from "../lib/db";
import { registrarAuditoria } from "../lib/audit";
import { mayus } from "../lib/db/mayusculas";

const CONFIRMAR = process.argv.includes("--confirmar");
const FECHA = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? "2026-09-12";
const cop = (n: number) => "$" + n.toLocaleString("es-CO");

/** La venta que sí fue de Coomeva; el resto de los bonos son de Comfamiliar. */
const COOMEVA = { caja: "CAJA 3", numero_venta: 26 };

/** Tipos cuyas líneas hay que reclasificar, y a qué tipo destino. */
const ORIGEN_BONO = "REDENCIÓN BONO";
const ORIGEN_WEB = "PÁGINA WEB";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const destino = url.includes("localhost") || url.includes("127.0.0.1") ? "LOCAL" : "PRODUCCIÓN";
  console.log(`\n🔁 Reclasificar prepagos del ${FECHA} · base ${destino}\n`);

  const desde = new Date(`${FECHA}T00:00:00-05:00`);
  const hasta = new Date(desde.getTime() + 24 * 3600000);

  const prepagado = await prisma.medioPago.findUnique({ where: { codigo: "prepagado" } });
  if (!prepagado) throw new Error("Falta el medio de pago 'prepagado'.");

  // Tipos destino con su tarifa vigente.
  const tipos = await prisma.tipoVisitante.findMany({
    include: { tarifas: { where: { vigente_hasta: null }, orderBy: { vigente_desde: "desc" }, take: 1 } },
  });
  const porNombre = new Map(tipos.map((t) => [mayus(t.nombre), t]));
  const destinoDe = (nombre: string) => {
    const t = porNombre.get(mayus(nombre));
    if (!t?.tarifas[0]) throw new Error(`Falta el tipo "${nombre}" o su tarifa vigente.`);
    return { tipo: t, tarifa: t.tarifas[0] };
  };
  const COOMEVA_T = destinoDe("Bono Coomeva");
  const COMFAMILIAR_T = destinoDe("Bono Comfamiliar");
  const WEB_T = destinoDe("Página Web");

  const admin = await prisma.usuario.findFirst({ where: { rol: "administrador", activo: true } });

  const ventas = await prisma.venta.findMany({
    where: {
      estado: "completada",
      creado_en: { gte: desde, lt: hasta },
      // Insensible a mayúsculas: en producción los nombres viejos están en minúscula.
      detalle: { some: { valor_cobrado: 0, tipo_visitante: { OR: [ORIGEN_BONO, ORIGEN_WEB].map((n) => ({ nombre: { equals: n, mode: "insensitive" as const } })) } } },
    },
    include: {
      detalle: { include: { tipo_visitante: true } },
      pagos: true,
      turno: { include: { caja: true } },
    },
    orderBy: { creado_en: "asc" },
  });

  let totalAgregado = 0;
  let ventasTocadas = 0;

  for (const v of ventas) {
    const esCoomeva = mayus(v.turno.caja.nombre) === COOMEVA.caja && v.numero_venta === COOMEVA.numero_venta;

    const cambios = v.detalle
      .filter((d) => d.valor_cobrado === 0 && [ORIGEN_BONO, ORIGEN_WEB].includes(mayus(d.tipo_visitante.nombre)))
      .map((d) => {
        const destino =
          mayus(d.tipo_visitante.nombre) === ORIGEN_WEB ? WEB_T : esCoomeva ? COOMEVA_T : COMFAMILIAR_T;
        return { linea: d, destino, valor: destino.tarifa.valor };
      });

    if (cambios.length === 0) continue;

    const agregado = cambios.reduce((a, c) => a + c.valor * c.linea.cantidad, 0);
    if (agregado === 0) continue;

    ventasTocadas++;
    totalAgregado += agregado;

    console.log(`  ${CONFIRMAR ? "→" : "?"} ${v.turno.caja.nombre} #${v.numero_venta} · ${v.comprador_nombre ?? "—"}`);
    for (const c of cambios) {
      console.log(`      ${c.linea.cantidad} × ${c.linea.tipo_visitante.nombre} → ${c.destino.tipo.nombre} a ${cop(c.valor)} = ${cop(c.valor * c.linea.cantidad)}`);
    }
    console.log(`      total venta ${cop(v.total_cobrado)} → ${cop(v.total_cobrado + agregado)}`);

    if (!CONFIRMAR) continue;

    const antes = { total_lista: v.total_lista, total_cobrado: v.total_cobrado, total_descuento: v.total_descuento };

    await prisma.$transaction(async (tx) => {
      for (const c of cambios) {
        await tx.ventaDetalle.update({
          where: { id: c.linea.id },
          data: {
            tipo_visitante_id: c.destino.tipo.id,
            tarifa_id: c.destino.tarifa.id,
            valor_lista: c.valor,
            valor_cobrado: c.valor,
          },
        });
        // Las manillas siguen a su línea, si no el conteo por tipo queda desfasado.
        await tx.manilla.updateMany({
          where: { venta_detalle_id: c.linea.id },
          data: { tipo_visitante_id: c.destino.tipo.id },
        });
      }

      // Un solo pago prepagado por venta: si ya existe se ajusta, no se duplica.
      const yaHay = v.pagos.find((p) => p.medio_pago_id === prepagado.id);
      if (yaHay) {
        await tx.ventaPago.update({ where: { id: yaHay.id }, data: { monto: agregado } });
      } else {
        await tx.ventaPago.create({ data: { venta_id: v.id, medio_pago_id: prepagado.id, monto: agregado } });
      }

      // Los totales del encabezado se recalculan desde el detalle, nunca a mano.
      const detalle = await tx.ventaDetalle.findMany({ where: { venta_id: v.id } });
      const total_lista = detalle.reduce((a, d) => a + d.valor_lista * d.cantidad, 0);
      const total_cobrado = detalle.reduce((a, d) => a + d.valor_cobrado * d.cantidad, 0);
      await tx.venta.update({
        where: { id: v.id },
        data: { total_lista, total_cobrado, total_descuento: total_lista - total_cobrado },
      });
    });

    await registrarAuditoria({
      usuario_id: admin?.id ?? null,
      entidad: "venta",
      entidad_id: v.id,
      accion: "reclasificar_prepago",
      datos_antes: antes,
      datos_despues: {
        motivo: "Bonos y página web entraron en $ 0 el primer día; se les puso su tarifa y el pago PREPAGADO (BANCO)",
        agregado,
        lineas: cambios.map((c) => ({
          de: c.linea.tipo_visitante.nombre,
          a: c.destino.tipo.nombre,
          cantidad: c.linea.cantidad,
          valor: c.valor,
        })),
      },
    });
  }

  console.log(`\n  ${ventasTocadas} venta(s) · venta del día ${CONFIRMAR ? "subió" : "subiría"} ${cop(totalAgregado)}`);
  console.log("  El efectivo de las cajas no se mueve: el prepagado no entra al recaudo.\n");
  if (!CONFIRMAR) console.log("⚠ Simulación. Corre con --confirmar para aplicarlo.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
