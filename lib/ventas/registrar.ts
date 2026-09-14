import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import {
  calcularTotales, esCortesia, faltanPorEscanear, resolverValorCobrado, validarVenta, type LineaVenta,
} from "./calculo";
import { firmarUuid } from "../qr/firma";
import { finDelDiaOperativo, formatearFechaHoraBogota } from "../tiempo";
import { textoManilla, type DatosManilla } from "../impresion";
import type { ContextoVenta, EntradaVenta, ResultadoVenta } from "./tipos";

const PARQUE = "Ranch Texas";

/**
 * Corrección: la venta nueva reemplaza a `ventaId`, que queda anulada junto con sus
 * manillas dentro de la MISMA transacción. O quedan las dos caras, o no queda ninguna.
 */
export interface CorreccionVenta {
  ventaId: string;
  motivo: string;
}

/**
 * Núcleo de registro de una venta de taquilla. PURO respecto de la sesión/HTTP: recibe el
 * contexto (cajero + turno) ya resuelto. Recalcula precios desde la tarifa vigente, valida,
 * y crea en una transacción: encabezado + detalle + una manilla por asistente + cola de impresión.
 * Testeable directamente contra la BD.
 */
export async function crearVenta(
  ctx: ContextoVenta,
  entrada: EntradaVenta,
  correccion?: CorreccionVenta,
): Promise<ResultadoVenta> {
  if (!entrada.lineas?.length) return { ok: false, error: "La venta no tiene líneas." };

  // ¿Este intento ya había entrado? Pasa cuando se cae el internet justo después de
  // que el servidor grabó: el cajero no vio respuesta y volvió a darle "Registrar".
  // Se devuelve la venta que ya existe, para no cobrarle dos veces al parque.
  if (entrada.clave_idempotencia) {
    const yaEsta = await prisma.venta.findUnique({
      where: { clave_idempotencia: entrada.clave_idempotencia },
      select: { id: true, numero_venta: true },
    });
    if (yaEsta) return { ok: true, numero_venta: yaEsta.numero_venta, venta_id: yaEsta.id, repetida: true };
  }

  const ids = [...new Set(entrada.lineas.map((l) => l.tipo_visitante_id))];
  const tiposInfo = new Map(
    (await prisma.tipoVisitante.findMany({
      where: { id: { in: ids } },
      select: { id: true, codigo: true, nombre: true, requiere_escaneo: true },
    })).map((t) => [t.id, t]),
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
      // El beneficiario solo tiene sentido en una cortesía: en una línea de pago nadie la recibe.
      beneficiario: l.tipo_linea !== "pago" ? l.beneficiario?.trim() || null : null,
      escaneado: !!l.escaneado,
      // El motivo del descuento solo aplica si de verdad se cobró menos.
      motivo_descuento: cobrado < valor && l.tipo_linea === "pago" ? l.motivo_descuento?.trim() || null : null,
      autorizado_por: l.autorizado_por ?? null,
    };
  });

  const val = validarVenta(lineas, entrada.pagos ?? []);
  if (!val.ok) return { ok: false, error: val.errores.join(" ") };

  // Quién exige escaneo lo dice la BD, no el cliente: de la taquilla solo se cree la
  // marca de que el cajero sí lo hizo.
  const sinEscanear = faltanPorEscanear(lineas, tiposInfo);
  if (sinEscanear.length) {
    return { ok: false, error: `Falta escanear en la aplicación de bonos: ${sinEscanear.join(", ")}.` };
  }

  const totales = calcularTotales(lineas);
  const vencimiento = finDelDiaOperativo();

  try {
    const res = await prisma.$transaction(async (tx) => {
      // Corrección: primero se cae la original (con sus manillas) y después nace la nueva.
      if (correccion) {
        const ahora = new Date();
        await tx.venta.update({
          where: { id: correccion.ventaId },
          data: {
            estado: "anulada",
            motivo_anulacion: correccion.motivo,
            anulada_por: ctx.usuarioId,
            anulada_en: ahora,
            actualizado_por: ctx.usuarioId,
          },
        });
        await tx.manilla.updateMany({
          where: { venta_detalle: { venta_id: correccion.ventaId }, estado: { not: "anulada" } },
          data: { estado: "anulada", anulada_en: ahora, anulada_por: ctx.usuarioId, motivo_anulacion: correccion.motivo },
        });
        // Las manillas anuladas no se imprimen: se sacan de la cola si seguían pendientes.
        await tx.impresion.deleteMany({
          where: { manilla: { venta_detalle: { venta_id: correccion.ventaId } }, estado: "pendiente" },
        });
      }

      const agg = await tx.venta.aggregate({ where: { turno_id: ctx.turnoId }, _max: { numero_venta: true } });
      const numero = (agg._max.numero_venta ?? 0) + 1;

      // Cliente maestro: llave = celular (ver Cliente en el schema, sobre por qué no
      // es la cédula). Sin celular no hay a quién enlazar — la venta queda igual, solo
      // que no alimenta el perfil ni sale sugerida la próxima vez.
      //
      // Se normaliza a solo dígitos para la LLAVE: "300 123 4567" y "300-123-4567" son
      // el mismo cliente. `comprador_celular` en la venta sí guarda tal cual se tecleó
      // (es una foto de esa venta, no la llave).
      const celularCrudo = entrada.comprador_celular?.trim() || null;
      const celular = celularCrudo ? celularCrudo.replace(/\D/g, "") || null : null;
      const nombreComprador = entrada.comprador_nombre?.trim() || null;
      const documentoComprador = entrada.comprador_documento?.trim() || null;
      const emailComprador = entrada.comprador_email?.trim() || null;

      const cliente = celular && nombreComprador
        ? await tx.cliente.upsert({
            where: { celular },
            create: {
              celular, nombre: nombreComprador, documento: documentoComprador, email: emailComprador,
              creado_por: ctx.usuarioId,
            },
            // Se actualiza con lo último que trajo (nunca se borra un dato con uno vacío
            // de una venta donde el cajero no volvió a preguntar documento/correo).
            update: {
              nombre: nombreComprador,
              ...(documentoComprador ? { documento: documentoComprador } : {}),
              ...(emailComprador ? { email: emailComprador } : {}),
              actualizado_por: ctx.usuarioId,
            },
          })
        : null;

      const venta = await tx.venta.create({
        data: {
          turno_id: ctx.turnoId,
          clave_idempotencia: entrada.clave_idempotencia ?? null,
          corrige_venta_id: correccion?.ventaId ?? null,
          usuario_id: ctx.usuarioId,
          numero_venta: numero,
          total_lista: totales.total_lista,
          total_cobrado: totales.total_cobrado,
          total_descuento: totales.total_descuento,
          cantidad_asistentes: totales.cantidad_asistentes,
          comprador_nombre: nombreComprador,
          comprador_documento: documentoComprador,
          comprador_celular: celularCrudo,
          comprador_email: emailComprador,
          cliente_id: cliente?.id ?? null,
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
            beneficiario: l.beneficiario ?? null,
            escaneado: !!l.escaneado,
            motivo_descuento: l.motivo_descuento ?? null,
            autorizado_por: l.autorizado_por ?? null,
            creado_por: ctx.usuarioId,
          },
        });

        // Los bebés entran en brazos y no llevan manilla: cuentan como asistentes
        // para el aforo, pero no se les imprime ni se les genera un QR que escanear.
        const esBebe = info?.codigo === "bebe";
        if (esBebe) continue;

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
              es_bebe: false,
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
            esCortesia: esCortesia(l.tipo_linea),
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
    // Dos peticiones con la MISMA llave a la vez: una ganó la carrera y la otra choca
    // contra el índice único. No es un error para el cajero: la venta sí quedó.
    if (entrada.clave_idempotencia && (e as { code?: string })?.code === "P2002") {
      const yaEsta = await prisma.venta.findUnique({
        where: { clave_idempotencia: entrada.clave_idempotencia },
        select: { id: true, numero_venta: true },
      });
      if (yaEsta) return { ok: true, numero_venta: yaEsta.numero_venta, venta_id: yaEsta.id, repetida: true };
    }
    console.error("Error registrando venta:", e);
    return { ok: false, error: "No se pudo registrar la venta. Intenta de nuevo." };
  }
}
