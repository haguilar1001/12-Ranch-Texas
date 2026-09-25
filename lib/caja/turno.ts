import { prisma, type Tx } from "@/lib/db";

/** Estados en los que un turno está vivo: se puede vender en él. */
export const ESTADOS_ACTIVOS = ["abierto", "reabierto"] as const;

/** Turno activo del usuario (abierto o reabierto). Un usuario tiene a lo sumo uno activo. */
export function turnoAbiertoDe(usuarioId: string) {
  return prisma.turnoCaja.findFirst({
    where: { usuario_id: usuarioId, estado: { in: [...ESTADOS_ACTIVOS] } },
    include: { caja: true },
  });
}

/**
 * Candado de la transacción sobre una clave ("caja:<id>", "usuario:<id>"). Si dos personas
 * intentan abrir la misma caja al mismo tiempo, la segunda espera a que la primera termine y
 * ya ve su turno: sin esto, las dos pasaban la validación y quedaban dos turnos en la caja.
 */
export async function bloquear(tx: Tx, clave: string) {
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${clave}))) AS candado`;
}

/**
 * ¿Se puede activar un turno de este usuario en esta caja? Una caja tiene a lo sumo un turno
 * activo (dos cajeros en la misma caja mezclan la plata del cajón y el cuadre ya no cuadra), y
 * un usuario también. `exceptoTurnoId` es para reabrir: el turno que se reabre no cuenta.
 * Debe llamarse dentro de la transacción, después de `bloquear`.
 */
async function conflictoDeTurno(
  tx: Tx,
  cajaId: string,
  usuarioId: string,
  exceptoTurnoId?: string,
): Promise<string | null> {
  const excepto = exceptoTurnoId ? { id: { not: exceptoTurnoId } } : {};
  const enCaja = await tx.turnoCaja.findFirst({
    where: { caja_id: cajaId, estado: { in: [...ESTADOS_ACTIVOS] }, ...excepto },
    include: { caja: { select: { nombre: true } }, usuario: { select: { id: true, nombre: true } } },
  });
  if (enCaja) {
    return enCaja.usuario.id === usuarioId
      ? `Ya tienes un turno abierto en ${enCaja.caja.nombre}.`
      : `${enCaja.caja.nombre} ya está abierta por ${enCaja.usuario.nombre}. Elige otra caja o pídele que cierre su turno.`;
  }
  const propio = await tx.turnoCaja.findFirst({
    where: { usuario_id: usuarioId, estado: { in: [...ESTADOS_ACTIVOS] }, ...excepto },
    include: { caja: { select: { nombre: true } } },
  });
  if (propio) return `Ya tienes un turno abierto en ${propio.caja.nombre}: ciérralo antes de abrir otro.`;
  return null;
}

/** Abre un turno garantizando: una caja = un turno activo, un usuario = un turno activo. */
export async function abrirTurnoEnCaja(entrada: {
  cajaId: string;
  usuarioId: string;
  baseInicial: number;
}): Promise<{ ok: true; turnoId: string } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    // Siempre en el mismo orden (caja y luego usuario), para que dos aperturas no se bloqueen entre sí.
    await bloquear(tx, `caja:${entrada.cajaId}`);
    await bloquear(tx, `usuario:${entrada.usuarioId}`);

    const caja = await tx.caja.findUnique({ where: { id: entrada.cajaId } });
    if (!caja || !caja.activo) return { ok: false as const, error: "Esa caja no existe o está inactiva." };

    const conflicto = await conflictoDeTurno(tx, entrada.cajaId, entrada.usuarioId);
    if (conflicto) return { ok: false as const, error: conflicto };

    const t = await tx.turnoCaja.create({
      data: { caja_id: entrada.cajaId, usuario_id: entrada.usuarioId, base_inicial: entrada.baseInicial, creado_por: entrada.usuarioId },
    });
    return { ok: true as const, turnoId: t.id };
  });
}

/**
 * Reabre un turno cerrado con las mismas reglas: si mientras tanto otro cajero abrió esa caja,
 * o el dueño del turno ya tiene otro abierto, no se reabre.
 */
export async function reabrirTurnoCerrado(entrada: {
  turnoId: string;
  por: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const turno = await prisma.turnoCaja.findUnique({ where: { id: entrada.turnoId } });
  if (!turno) return { ok: false, error: "Turno no encontrado." };

  return prisma.$transaction(async (tx) => {
    await bloquear(tx, `caja:${turno.caja_id}`);
    await bloquear(tx, `usuario:${turno.usuario_id}`);

    const actual = await tx.turnoCaja.findUnique({ where: { id: turno.id } });
    if (actual?.estado !== "cerrado") return { ok: false as const, error: "El turno no está cerrado." };

    const conflicto = await conflictoDeTurno(tx, turno.caja_id, turno.usuario_id, turno.id);
    if (conflicto) return { ok: false as const, error: `No se puede reabrir: ${conflicto}` };

    await tx.turnoCaja.update({
      where: { id: turno.id },
      data: { estado: "reabierto", reabierto_por: entrada.por, reabierto_en: new Date(), actualizado_por: entrada.por },
    });
    return { ok: true as const };
  });
}

/** Cajas activas con quién las tiene abiertas ahora (null = libre). Para el selector de apertura. */
export async function cajasConOcupacion() {
  const cajas = await prisma.caja.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
    include: {
      turnos: {
        where: { estado: { in: [...ESTADOS_ACTIVOS] } },
        select: { usuario: { select: { nombre: true } } },
        take: 1,
      },
    },
  });
  return cajas.map((c) => ({ id: c.id, nombre: c.nombre, ocupadaPor: c.turnos[0]?.usuario.nombre ?? null }));
}
