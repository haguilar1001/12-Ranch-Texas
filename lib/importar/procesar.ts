import type { Prisma, TipoArchivo } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { renglonesPdf } from "./pdf-lineas";
import { leerPygPdf } from "./pyg-pdf";
import { leerVentaMes, cuadrarVentaMes } from "./venta-mes";
import { leerHistorico, NEGOCIO_HISTORICO } from "./historico";
import { leerPresupuesto } from "./presupuesto";
import { TIPOS_ARCHIVO } from "./tipos";

// Recibe un archivo subido en Configuración → Carga de archivos, lo lee según su tipo, guarda el
// original y carga sus datos en una sola transacción: si algo falla no queda nada a medias.
// Un archivo nuevo del mismo periodo deja al anterior como «reemplazado» (no se borra).

export { TIPOS_ARCHIVO };

export interface EntradaArchivo { tipo: TipoArchivo; nombre: string; mime: string; datos: Buffer; usuarioId: string }
export type ResultadoCarga = { ok: true; archivoId: string; resumen: Record<string, unknown> } | { ok: false; error: string };

const OPC = { timeout: 180_000, maxWait: 20_000 };

/** Vuelve a cuadrar los cuadros de venta por mes vigentes (tras cambiar el histórico). */
async function recuadrar(tx: Tx, anio?: number) {
  const cuadros = await tx.archivoCargado.findMany({ where: { tipo: "cuadro_mes_producto", estado: "procesado", ...(anio ? { anio } : {}) } });
  for (const c of cuadros) {
    const leido = leerVentaMes(c.contenido, c.nombre);
    await tx.ventaHistorica.deleteMany({ where: { anio: leido.anio, origen: { startsWith: "cuadro:" } } });
    await cuadrarVentaMes(tx, leido, `cuadro:${c.nombre}`, true);
  }
}

export async function procesarArchivo(e: EntradaArchivo): Promise<ResultadoCarga> {
  const ext = e.nombre.toLowerCase().slice(e.nombre.lastIndexOf("."));
  const def = TIPOS_ARCHIVO[e.tipo];
  if (!def) return { ok: false, error: "Tipo de archivo desconocido." };
  if (!def.extensiones.includes(ext)) return { ok: false, error: `Para «${def.nombre}» el archivo debe ser ${def.extensiones.join(" o ")}.` };

  try {
    const base = { tipo: e.tipo, nombre: e.nombre, mime: e.mime || "application/octet-stream", tamano: e.datos.length, contenido: Uint8Array.from(e.datos), creado_por: e.usuarioId };

    if (e.tipo === "estado_resultados") {
      const p = leerPygPdf(await renglonesPdf(new Uint8Array(e.datos)));
      const resumen = { unidades: p.unidades, cuentas: p.lineas.length, totales: p.totales, avisos: p.avisos };
      const archivo = await prisma.$transaction(async (tx) => {
        await tx.archivoCargado.updateMany({ where: { tipo: e.tipo, anio: p.anio, mes: p.mes, estado: "procesado" }, data: { estado: "reemplazado", actualizado_por: e.usuarioId } });
        const a = await tx.archivoCargado.create({ data: { ...base, anio: p.anio, mes: p.mes, resumen } });
        await tx.estadoResultadoLinea.createMany({
          data: p.lineas.flatMap((l) => l.valores.map((valor, i) => ({ archivo_id: a.id, anio: p.anio, mes: p.mes, unidad: p.unidades[i], seccion: l.seccion, cuenta: l.cuenta, orden: l.orden, valor })).filter((x) => x.valor !== 0)),
        });
        return a;
      }, OPC);
      return { ok: true, archivoId: archivo.id, resumen };
    }

    if (e.tipo === "cuadro_mes_producto") {
      const leido = leerVentaMes(e.datos, e.nombre);
      const origen = `cuadro:${e.nombre}`;
      let resumen: Record<string, unknown> = {};
      const archivo = await prisma.$transaction(async (tx) => {
        await tx.archivoCargado.updateMany({ where: { tipo: e.tipo, anio: leido.anio, estado: "procesado" }, data: { estado: "reemplazado", actualizado_por: e.usuarioId } });
        await tx.ventaHistorica.deleteMany({ where: { anio: leido.anio, origen: { startsWith: "cuadro:" } } });
        const r = await cuadrarVentaMes(tx, leido, origen, true);
        resumen = {
          total: leido.celdas.reduce((t, c) => t + c.valor, 0),
          meses: [...leido.totales.keys()].length,
          ajustes: r.ajustes.length,
          valorAjustado: r.ajustes.reduce((t, a) => t + a.valor, 0),
          avisos: r.avisos,
        };
        return tx.archivoCargado.create({ data: { ...base, anio: leido.anio, resumen: resumen as Prisma.InputJsonValue } });
      }, OPC);
      return { ok: true, archivoId: archivo.id, resumen };
    }

    if (e.tipo === "venta_historica") {
      const h = leerHistorico(e.datos);
      const resumen = { filas: h.filas.length, omitidas: h.omitidas, otrosNegocios: h.otrosNegocios, desde: h.desde, hasta: h.hasta, total: h.total };
      const archivo = await prisma.$transaction(async (tx) => {
        await tx.archivoCargado.updateMany({ where: { tipo: e.tipo, estado: "procesado" }, data: { estado: "reemplazado", actualizado_por: e.usuarioId } });
        await tx.ventaHistorica.deleteMany({ where: { origen: { startsWith: "excel:" } } });
        const origen = `excel:${e.nombre}`;
        for (let i = 0; i < h.filas.length; i += 1000) {
          await tx.ventaHistorica.createMany({ data: h.filas.slice(i, i + 1000).map((f) => ({ ...f, negocio: NEGOCIO_HISTORICO, origen })) });
        }
        await recuadrar(tx);
        return tx.archivoCargado.create({ data: { ...base, resumen } });
      }, OPC);
      return { ok: true, archivoId: archivo.id, resumen };
    }

    // presupuesto
    const pr = leerPresupuesto(e.datos, e.nombre);
    const resumen = { cuentas: pr.lineas.length, gastosMes: pr.totalGastos, empleados: pr.nomina.length, nominaMes: pr.totalNomina, avisos: pr.avisos };
    const archivo = await prisma.$transaction(async (tx) => {
      await tx.archivoCargado.updateMany({ where: { tipo: e.tipo, anio: pr.anio, estado: "procesado" }, data: { estado: "reemplazado", actualizado_por: e.usuarioId } });
      const a = await tx.archivoCargado.create({ data: { ...base, anio: pr.anio, resumen } });
      await tx.presupuestoPygLinea.createMany({ data: pr.lineas.map((l) => ({ archivo_id: a.id, anio: pr.anio, mes: null, seccion: l.seccion, cuenta: l.cuenta, orden: l.orden, valor: l.valor })) });
      if (pr.nomina.length) await tx.presupuestoNomina.createMany({ data: pr.nomina.map((n) => ({ ...n, archivo_id: a.id, anio: pr.anio })) });
      return a;
    }, OPC);
    return { ok: true, archivoId: archivo.id, resumen };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo leer el archivo." };
  }
}

/** Anula un archivo: sus datos dejan de contar. Para cuadros e histórico se retiran sus filas. */
export async function anularArchivo(id: string, motivo: string, usuarioId: string): Promise<ResultadoCarga> {
  const a = await prisma.archivoCargado.findUnique({ where: { id }, select: { id: true, tipo: true, anio: true, nombre: true, estado: true } });
  if (!a) return { ok: false, error: "No existe." };
  if (a.estado !== "procesado") return { ok: false, error: "Solo se anula un archivo vigente." };
  await prisma.$transaction(async (tx) => {
    await tx.archivoCargado.update({ where: { id }, data: { estado: "anulado", motivo_anulacion: motivo, anulado_por: usuarioId, anulado_en: new Date(), actualizado_por: usuarioId } });
    if (a.tipo === "cuadro_mes_producto" && a.anio) await tx.ventaHistorica.deleteMany({ where: { anio: a.anio, origen: { startsWith: "cuadro:" } } });
    if (a.tipo === "venta_historica") {
      await tx.ventaHistorica.deleteMany({ where: { origen: { startsWith: "excel:" } } });
      await recuadrar(tx);
    }
  }, OPC);
  return { ok: true, archivoId: id, resumen: {} };
}
