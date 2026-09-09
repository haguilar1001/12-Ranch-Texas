"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { verificarPayload } from "@/lib/qr/firma";
import { tomarTurno, cerrarTurno } from "@/lib/fila/turno";

// Acciones PÚBLICAS: el visitante llega desde el QR de su manilla, sin sesión.
// Por eso la autorización es el propio payload firmado (HMAC): sin firma válida no
// se hace nada, y solo puede tocar los turnos de SU manilla.

interface Resultado {
  ok: boolean;
  error?: string;
  aviso?: string;
}

async function manillaDelPayload(payload: string) {
  const verif = verificarPayload(payload);
  if (!verif.valido) return null;
  const m = await prisma.manilla.findUnique({ where: { codigo_uuid: verif.uuid } });
  if (!m || m.estado === "anulada") return null;
  if (m.vencimiento && m.vencimiento < new Date()) return null;
  return m;
}

export async function separarTurno(payload: string, atraccionId: string, personas: number): Promise<Resultado> {
  const manilla = await manillaDelPayload(payload);
  if (!manilla) return { ok: false, error: "Tu manilla no es válida o ya venció." };

  const r = await tomarTurno(manilla.id, atraccionId, personas, "visitante");
  revalidatePath(`/fila/${encodeURIComponent(payload)}`);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, aviso: r.aviso };
}

export async function cancelarMiTurno(payload: string, turnoId: string): Promise<Resultado> {
  const manilla = await manillaDelPayload(payload);
  if (!manilla) return { ok: false, error: "Tu manilla no es válida o ya venció." };

  // Solo puede cancelar un turno suyo.
  const turno = await prisma.turnoFila.findUnique({ where: { id: turnoId } });
  if (!turno || turno.manilla_id !== manilla.id) return { ok: false, error: "Ese turno no es tuyo." };

  const r = await cerrarTurno(turnoId, "cancelado", { motivo: "Cancelado por el visitante", porQuien: "visitante" });
  revalidatePath(`/fila/${encodeURIComponent(payload)}`);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
