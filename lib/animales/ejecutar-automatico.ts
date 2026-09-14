// Reparto automático de la dieta: lo dispara el cron de Railway (ver
// `scripts/alimentar-automatico.ts`), no una persona desde la app. Por cada ración
// activa que le toque a esta franja, registra la entrega (cantidad del día repartida
// entre las franjas) y su salida en el kardex — igual que si un operario la hubiera
// registrado a mano desde `/admin/animales`.
//
// Es IDEMPOTENTE por (ración, franja, día operativo Bogotá): si el cron se repite o
// se atrasa, no duplica la entrega.

import { prisma } from "@/lib/db";
import { registrarAuditoria } from "@/lib/audit";
import { costoCOP, formatearBase } from "./unidades";
import { cantidadPorEntrega } from "./racion";
import { registrarEntregaConKardex } from "./alimentacion";
import { franjasDeCategoria, esConsumoLibre, cantidadPorFranja, type Franja } from "./auto-alimentacion";
import { inicioDelDiaOperativo, finDelDiaOperativo } from "@/lib/tiempo";

const USUARIO_AUTOMATICO = "sistema-alimentacion-automatica";

export interface ResultadoFranja {
  franja: Franja;
  registrados: Array<{ racion_id: string; nombre: string; entregado: string }>;
  omitidos: Array<{ racion_id: string; nombre: string; motivo: string }>;
}

async function cabezasDeCategoria(categoriaId: string): Promise<number> {
  const r = await prisma.animal.aggregate({ where: { categoria_id: categoriaId, activo: true }, _sum: { cantidad: true } });
  return r._sum.cantidad ?? 0;
}

export async function ejecutarAlimentacionAutomatica(franja: Franja, ahora: Date = new Date()): Promise<ResultadoFranja> {
  const raciones = await prisma.racion.findMany({
    where: { activo: true },
    include: {
      alimento: true,
      categoria: true,
      animal: { include: { categoria: true } },
    },
  });

  const resultado: ResultadoFranja = { franja, registrados: [], omitidos: [] };
  const desde = inicioDelDiaOperativo(ahora);
  const hasta = finDelDiaOperativo(ahora);

  for (const r of raciones) {
    const nombre = r.animal ? r.animal.nombre : (r.categoria?.nombre ?? "(sin destino)");
    const nombreCategoria = r.animal ? r.animal.categoria.nombre : r.categoria?.nombre;

    if (!nombreCategoria) {
      resultado.omitidos.push({ racion_id: r.id, nombre, motivo: "Sin categoría." });
      continue;
    }
    if (esConsumoLibre(r.horario)) {
      resultado.omitidos.push({ racion_id: r.id, nombre, motivo: "Consumo libre: no se reparte por horario." });
      continue;
    }

    const franjas = franjasDeCategoria(nombreCategoria);
    if (!franjas.includes(franja)) {
      resultado.omitidos.push({ racion_id: r.id, nombre, motivo: `Esta franja no le toca (le tocan ${franjas.join(", ")}).` });
      continue;
    }

    const cabezas = r.animal ? r.animal.cantidad : await cabezasDeCategoria(r.categoria_animal_id!);
    const diaria = cantidadPorEntrega({ cantidad: r.cantidad, unidad: r.unidad, modo: r.modo, frecuencia: r.frecuencia }, cabezas, r.alimento);
    if (diaria === null) {
      resultado.omitidos.push({ racion_id: r.id, nombre, motivo: `No se pudo convertir "${r.unidad}" para ${r.alimento.nombre}.` });
      continue;
    }
    if (diaria <= 0) {
      resultado.omitidos.push({ racion_id: r.id, nombre, motivo: "La ración del día es 0 (sin cabezas o cantidad en 0)." });
      continue;
    }

    const yaRegistrado = await prisma.registroAlimentacion.findFirst({
      where: { racion_id: r.id, franja, automatico: true, anulado: false, fecha: { gte: desde, lte: hasta } },
      select: { id: true },
    });
    if (yaRegistrado) {
      resultado.omitidos.push({ racion_id: r.id, nombre, motivo: `Ya se registró la franja ${franja} de hoy.` });
      continue;
    }

    const cantidad = cantidadPorFranja(diaria, franjas.length);
    if (cantidad <= 0) {
      resultado.omitidos.push({ racion_id: r.id, nombre, motivo: "La parte de esta franja redondeó a 0." });
      continue;
    }

    const costo = costoCOP(cantidad, r.alimento);
    const recintoId = r.animal?.recinto_id ?? null;

    await prisma.$transaction(async (tx) => {
      await registrarEntregaConKardex(tx, {
        racion_id: r.id,
        animal_id: r.animal_id,
        categoria_animal_id: r.categoria_animal_id,
        recinto_id: recintoId,
        alimento_id: r.alimento_id,
        cantidad_planeada: cantidad,
        cantidad_entregada: cantidad,
        costo,
        estado: "realizada",
        automatico: true,
        franja,
        observaciones: `Reparto automático · franja ${franja}`,
        usuario_id: USUARIO_AUTOMATICO,
        creado_por: USUARIO_AUTOMATICO,
        motivoMovimiento: `Alimentación automática · franja ${franja}`,
      });
    });

    await registrarAuditoria({
      usuario_id: USUARIO_AUTOMATICO, entidad: "alimentacion", entidad_id: r.alimento_id, accion: "registrar_automatico",
      datos_despues: { racion_id: r.id, animal_id: r.animal_id, categoria_id: r.categoria_animal_id, franja, cantidad },
    });

    resultado.registrados.push({ racion_id: r.id, nombre, entregado: `${formatearBase(cantidad, r.alimento)} de ${r.alimento.nombre}` });
  }

  return resultado;
}
