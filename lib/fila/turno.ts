// Núcleo de la fila virtual. Separado de HTTP y de la sesión para poder probarlo
// directamente contra la BD, como el resto de los módulos del proyecto.

import { prisma } from "../db";
import { fechaBogota } from "../tiempo";
import { siguienteNumero, type EstadoTurnoFila } from "./calculo";

export type ResultadoTurno =
  | { ok: true; turno_id: string; numero: number; aviso?: string }
  | { ok: false; error: string };

/** Estados que siguen ocupando puesto en la fila. */
const ABIERTOS: EstadoTurnoFila[] = ["esperando", "llamado"];

/**
 * El visitante separa su puesto en la fila de una atracción, con su manilla.
 *
 * Se valida que la manilla sirva (no anulada, no vencida) y que la atracción tenga
 * la fila encendida. NO se exige el consentimiento firmado para tomar el turno: al
 * contrario, se avisa para que lo firme mientras espera, que es justo el rato muerto
 * que este módulo viene a aprovechar.
 */
export async function tomarTurno(
  manillaId: string,
  atraccionId: string,
  personas = 1,
  porQuien?: string,
): Promise<ResultadoTurno> {
  const [manilla, atraccion] = await Promise.all([
    prisma.manilla.findUnique({ where: { id: manillaId } }),
    prisma.atraccion.findUnique({ where: { id: atraccionId } }),
  ]);

  if (!manilla) return { ok: false, error: "Manilla no encontrada." };
  if (manilla.estado === "anulada") return { ok: false, error: "Esta manilla está anulada." };
  if (manilla.vencimiento && manilla.vencimiento < new Date()) {
    return { ok: false, error: "Esta manilla ya venció." };
  }

  if (!atraccion) return { ok: false, error: "Atracción no encontrada." };
  if (!atraccion.activa) return { ok: false, error: `${atraccion.nombre} no está disponible hoy.` };
  if (!atraccion.fila_activa) return { ok: false, error: `${atraccion.nombre} no maneja fila.` };

  const cuantos = Math.max(1, Math.trunc(personas));
  const dia = fechaBogota();

  // Un puesto por manilla y atracción a la vez: si no, alguien pide cinco turnos
  // seguidos y tapona la fila.
  const yaEnFila = await prisma.turnoFila.findFirst({
    where: { manilla_id: manillaId, atraccion_id: atraccionId, fecha_operativa: dia, estado: { in: ABIERTOS } },
  });
  if (yaEnFila) {
    return { ok: false, error: `Ya tienes el turno ${yaEnFila.numero} en ${atraccion.nombre}.` };
  }

  const delDia = await prisma.turnoFila.findMany({
    where: { atraccion_id: atraccionId, fecha_operativa: dia },
    select: { numero: true },
  });
  const numero = siguienteNumero(delDia.map((t) => t.numero));

  // Dos personas pueden pedir turno en el mismo instante; el índice único
  // (atraccion, día, número) lo impide y aquí se reintenta con el siguiente.
  for (let intento = 0; intento < 5; intento++) {
    try {
      const turno = await prisma.turnoFila.create({
        data: {
          atraccion_id: atraccionId,
          manilla_id: manillaId,
          numero: numero + intento,
          fecha_operativa: dia,
          personas: cuantos,
          creado_por: porQuien ?? null,
        },
      });

      let aviso: string | undefined;
      if (atraccion.requiere_consentimiento) {
        const firmado = await prisma.consentimiento.findFirst({
          where: { manilla_id: manillaId, atraccion_id: atraccionId },
        });
        if (!firmado) {
          aviso = `${atraccion.nombre} exige consentimiento firmado. Fírmalo mientras esperas o no podrás subir cuando te llamen.`;
        }
      }

      return { ok: true, turno_id: turno.id, numero: turno.numero, aviso };
    } catch {
      // Choque de consecutivo: probar con el siguiente.
    }
  }

  return { ok: false, error: "La fila está muy congestionada en este momento. Intenta de nuevo." };
}

/** El operario llama al siguiente de la fila. */
export async function llamarSiguiente(atraccionId: string, porQuien?: string): Promise<ResultadoTurno> {
  const dia = fechaBogota();
  const siguiente = await prisma.turnoFila.findFirst({
    where: { atraccion_id: atraccionId, fecha_operativa: dia, estado: "esperando" },
    orderBy: { numero: "asc" },
  });
  if (!siguiente) return { ok: false, error: "No hay nadie esperando en la fila." };

  await prisma.turnoFila.update({
    where: { id: siguiente.id },
    data: { estado: "llamado", llamado_en: new Date(), actualizado_por: porQuien ?? null },
  });

  return { ok: true, turno_id: siguiente.id, numero: siguiente.numero };
}

/** Cierra un turno: se atendió, no se presentó, o el visitante lo cancela. */
export async function cerrarTurno(
  turnoId: string,
  estado: Extract<EstadoTurnoFila, "atendido" | "no_se_presento" | "cancelado">,
  opciones: { motivo?: string; porQuien?: string } = {},
): Promise<ResultadoTurno> {
  const turno = await prisma.turnoFila.findUnique({ where: { id: turnoId } });
  if (!turno) return { ok: false, error: "Turno no encontrado." };
  if (turno.estado === estado) return { ok: true, turno_id: turno.id, numero: turno.numero };
  if (turno.estado === "atendido") return { ok: false, error: "Ese turno ya fue atendido." };

  await prisma.turnoFila.update({
    where: { id: turnoId },
    data: {
      estado,
      cerrado_en: new Date(),
      motivo: opciones.motivo?.trim() || null,
      actualizado_por: opciones.porQuien ?? null,
    },
  });

  return { ok: true, turno_id: turno.id, numero: turno.numero };
}

/** La fila de hoy de una atracción, en orden. */
export async function filaDelDia(atraccionId: string) {
  return prisma.turnoFila.findMany({
    where: { atraccion_id: atraccionId, fecha_operativa: fechaBogota() },
    orderBy: { numero: "asc" },
    include: { manilla: { select: { consecutivo: true } } },
  });
}
