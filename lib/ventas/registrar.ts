import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { calcularTotales, resolverValorCobrado, validarVenta, type LineaVenta } from "./calculo";
import { firmarUuid } from "../qr/firma";
import { finDelDiaOperativo, formatearFechaHoraBogota } from "../tiempo";
import { textoManilla, type DatosManilla } from "../impresion";
import type { ContextoVenta, EntradaVenta, ResultadoVenta } from "./tipos";

const PARQUE = "Ranch Texas";

/**
 * Núcleo de registro de una venta de taquilla. PURO respecto de la sesión/HTTP: recibe el
 * contexto (cajero + turno) ya resuelto. Recalcula precios desde la tarifa vigente, valida,
 * y crea en una transacción: encabezado + detalle + una manilla por asistente + cola de impresión.
 * Testeable directamente contra la BD.
 */
export async function crearVenta(ctx: ContextoVenta, entrada: EntradaVenta): Promise<ResultadoVenta> {
  if (!entrada.lineas?.length) return { ok: false, error: "La venta no tiene líneas." };

  const ids = [...new Set(entrada.lineas.map((l) => l.tipo_visitante_id))];
  const tiposInfo = new Map(
    (await prisma.tipoVisitante.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true, nombre: true } }))
      .map((t) => [t.id, t]),
  );

  // Recalcular precios en el SERVIDOR desde la tarifa vigente (no confiar en el cliente).
  const tarifas = new Map<string, { tarifa_id: string | null; valor: number }>();
  for (const id of ids) {
    const t = await prisma.tarifa.findFirst({
      where: { tipo_visitante_id: id, vigente_hasta: null },
      orderBy: { vigente_desde: "desc" },
    });
    tarifas.set(id, { tarifa_id: t?.id ?? null, valor: t?.valor ?? 0 });
  }

  const lineas: LineaVenta[] = entrada.lineas.map((l) => {
    const valor = tarifas.get(l.tipo_visitante_id)!.valor;
    const cobrado = resolverValorCobrado(valor, l.tipo_linea, l.valor_cobrado);
    return {
      tipo_visitante_id: l.tipo_visitante_id,
      cantidad: l.cantidad,
      valor_lista: valor,
      valor_cobrado: cobrado,
      tipo_linea: l.tipo_linea,
      motivo_cortesia_id: l.motivo_cortesia_id ?? null,
      // El motivo del descuento solo aplica si de verdad se cobró menos.
      motivo_descuento: cobrado < valor && l.tipo_linea === "pago" ? l.motivo_descuento?.trim() || null : null,
      autorizado_por: l.autorizado_por ?? null,
    };
  });

  const val = validarVenta(lineas, entrada.pagos ?? []);
  if (!val.ok) return { ok: false, error: val.errores.join(" ") };

  const totales = calcularTotales(lineas);
  const vencimiento = finDelDiaOperativo();

  try {
    const res = await prisma.$transaction(async (tx) => {
      const agg = await tx.venta.aggregate({ where: { turno_id: ctx.turnoId }, _max: { numero_venta: true } });
      const numero = (agg._max.numero_venta ?? 0) + 1;

      const venta = await tx.venta.create({
        data: {
          turno_id: ctx.turnoId,
          usuario_id: ctx.usuarioId,
          numero_venta: numero,
          total_lista: totales.total_lista,
          total_cobrado: totales.total_cobrado,
          total_descuento: totales.total_descuento,
          cantidad_asistentes: totales.cantidad_asistentes,
          comprador_nombre: entrada.comprador_nombre?.trim() || null,
          comprador_documento: entrada.comprador_documento?.trim() || null,
          creado_por: ctx.usuarioId,
          pagos: { create: (entrada.pagos ?? []).map((p) => ({ medio_pago_id: p.medio_pago_id, monto: p.monto, creado_por: ctx.usuarioId })) },
        },
      });

      let correlativo = 0;
      for (const l of lineas) {
        const info = tiposInfo.get(l.tipo_visitante_id);
        const det = await tx.ventaDetalle.create({
          data: {
            venta_id: venta.id,
            tipo_visitante_id: l.tipo_visitante_id,
            tarifa_id: tarifas.get(l.tipo_visitante_id)!.tarifa_id,
            tipo_linea: l.tipo_linea,
            cantidad: l.cantidad,
            valor_lista: l.valor_lista,
            valor_cobrado: l.valor_cobrado,
            motivo_cortesia_id: l.motivo_cortesia_id ?? null,
            motivo_descuento: l.motivo_descuento ?? null,
            autorizado_por: l.autorizado_por ?? null,
            creado_por: ctx.usuarioId,
          },
        });

        for (let k = 0; k < l.cantidad; k++) {
          correlativo++;
          const uuid = randomUUID();
          const firma = firmarUuid(uuid);
          const manilla = await tx.manilla.create({
            data: {
              codigo_uuid: uuid,
              firma_hmac: firma,
              consecutivo: `${numero}-${correlativo}`,
              venta_detalle_id: det.id,
              tipo_visitante_id: l.tipo_visitante_id,
              es_bebe: info?.codigo === "bebe",
              vencimiento,
              creado_por: ctx.usuarioId,
            },
          });

          const datos: DatosManilla = {
            parque: PARQUE,
            tipoVisitante: info?.nombre ?? "",
            consecutivo: manilla.consecutivo,
            payloadQr: `${uuid}.${firma}`,
            caja: ctx.cajaNombre,
            cajero: ctx.usuarioNombre,
            emitida: formatearFechaHoraBogota(manilla.creado_en),
            valida: formatearFechaHoraBogota(vencimiento),
            esCortesia: l.tipo_linea !== "pago",
          };
          await tx.impresion.create({
            data: { manilla_id: manilla.id, tipo: "manilla", payload: textoManilla(datos), estado: "pendiente", creado_por: ctx.usuarioId },
          });
        }
      }

      return { numero, venta_id: venta.id };
    });

    return { ok: true, numero_venta: res.numero, venta_id: res.venta_id };
  } catch (e) {
    console.error("Error registrando venta:", e);
    return { ok: false, error: "No se pudo registrar la venta. Intenta de nuevo." };
  }
}
