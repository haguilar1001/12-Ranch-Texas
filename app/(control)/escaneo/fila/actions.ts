"use server";

import { revalidatePath } from "next/cache";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { llamarSiguiente, cerrarTurno, tomarTurno } from "@/lib/fila/turno";
import { prisma } from "@/lib/db";
import { verificarPayload } from "@/lib/qr/firma";

interface Resultado {
  ok: boolean;
  error?: string;
  aviso?: string;
}

const RUTA = "/escaneo/fila";

async function operario() {
  const s = await obtenerSesion();
  return s && tieneRol(s.rol, "control_acceso") ? s : null;
}

export async function llamar(atraccionId: string): Promise<Resultado> {
  const s = await operario();
  if (!s) return { ok: false, error: "Tu rol no puede operar la fila." };

  const r = await llamarSiguiente(atraccionId, s.id);
  revalidatePath(RUTA);
  return r.ok ? { ok: true, aviso: `Llamando al turno ${r.numero}.` } : { ok: false, error: r.error };
}

export async function atendido(turnoId: string): Promise<Resultado> {
  const s = await operario();
  if (!s) return { ok: false, error: "Tu rol no puede operar la fila." };

  const r = await cerrarTurno(turnoId, "atendido", { porQuien: s.id });
  revalidatePath(RUTA);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function noSePresento(turnoId: string): Promise<Resultado> {
  const s = await operario();
  if (!s) return { ok: false, error: "Tu rol no puede operar la fila." };

  const r = await cerrarTurno(turnoId, "no_se_presento", { motivo: "No se presentó al ser llamado", porQuien: s.id });
  if (r.ok) {
    await registrarAuditoria({ usuario_id: s.id, entidad: "turno_fila", entidad_id: turnoId, accion: "no_se_presento" });
  }
  revalidatePath(RUTA);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/**
 * El operario anota a alguien que no tiene celular, escaneando su manilla.
 * Es la misma fila: el visitante queda con su número igual que los demás.
 */
export async function anotarPorManilla(atraccionId: string, payloadQr: string, personas: number): Promise<Resultado> {
  const s = await operario();
  if (!s) return { ok: false, error: "Tu rol no puede operar la fila." };

  const verif = verificarPayload(payloadQr.trim());
  if (!verif.valido) return { ok: false, error: "Código de manilla inválido." };

  const manilla = await prisma.manilla.findUnique({ where: { codigo_uuid: verif.uuid } });
  if (!manilla) return { ok: false, error: "Manilla no encontrada." };

  const r = await tomarTurno(manilla.id, atraccionId, personas, s.id);
  revalidatePath(RUTA);
  return r.ok ? { ok: true, aviso: `Turno ${r.numero} asignado. ${r.aviso ?? ""}`.trim() } : { ok: false, error: r.error };
}
