"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { registrarAuditoria } from "@/lib/audit";
import { turnoAbiertoDe } from "@/lib/caja/turno";
import { crearVenta } from "@/lib/ventas/registrar";
import type { EntradaVenta, ResultadoVenta } from "@/lib/ventas/tipos";

/**
 * Sin nombre y celular del comprador no hay venta.
 *
 * Es política de taquilla, no del núcleo: por eso se valida aquí, en la puerta, y no
 * dentro de `crearVenta` —que también usan los scripts de prueba e importación—. Y se
 * valida en el servidor además de en la pantalla, porque la pantalla se puede saltar.
 */
function validarComprador(e: EntradaVenta): string | null {
  if (!e.comprador_nombre?.trim()) return "Falta el nombre del comprador: es obligatorio para registrar la venta.";
  const celular = (e.comprador_celular ?? "").replace(/\D/g, "");
  if (!celular) return "Falta el celular del comprador: es obligatorio para registrar la venta.";
  if (celular.length < 7) return "El celular del comprador está incompleto.";
  return null;
}

export interface ClienteEncontrado {
  nombre: string;
  documento: string | null;
  email: string | null;
}

/**
 * Busca el cliente maestro por celular, para SUGERIR sus datos en taquilla — nunca
 * se aplican solos. El celular se recicla y la gente lo cambia seguido en Colombia:
 * quien confirma que es la misma persona es el cajero, mirando al cliente en frente.
 */
export async function buscarClientePorCelular(celular: string): Promise<ClienteEncontrado | null> {
  const s = await obtenerSesion();
  if (!s || !["cajero", "supervisor", "administrador"].includes(s.rol)) return null;

  const limpio = celular.replace(/\D/g, "");
  if (limpio.length < 7) return null;

  const cliente = await prisma.cliente.findUnique({
    where: { celular: limpio },
    select: { nombre: true, documento: true, email: true, activo: true },
  });
  return cliente?.activo ? cliente : null;
}

export async function registrarVenta(entrada: EntradaVenta): Promise<ResultadoVenta> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  if (!["cajero", "supervisor", "administrador"].includes(s.rol)) {
    return { ok: false, error: "Tu rol no puede registrar ventas." };
  }

  const faltante = validarComprador(entrada);
  if (faltante) return { ok: false, error: faltante };

  const turno = await turnoAbiertoDe(s.id);
  if (!turno) return { ok: false, error: "No tienes un turno abierto." };

  return crearVenta(
    { usuarioId: s.id, usuarioNombre: s.nombre, turnoId: turno.id, cajaNombre: turno.caja.nombre },
    entrada,
  );
}

/**
 * Corregir una venta ya registrada. SOLO supervisor o administrador.
 *
 * No se edita en sitio: se anula la original con sus manillas y se crea una nueva
 * que la reemplaza, todo en una transacción. Así el cuadre de caja sigue cuadrando
 * y la auditoría conserva qué decía antes, qué dice ahora y quién lo cambió.
 *
 * La corregida se registra en el MISMO turno de la original, para que la plata no se
 * mueva de caja. Por eso el turno de la original tiene que seguir abierto: si ya se
 * cerró, la venta solo se puede anular.
 */
export async function corregirVenta(
  ventaId: string,
  entrada: EntradaVenta,
  motivo: string,
): Promise<ResultadoVenta> {
  const s = await obtenerSesion();
  if (!s) return { ok: false, error: "Sesión expirada." };
  if (!tieneRol(s.rol, "supervisor")) return { ok: false, error: "Solo un supervisor puede corregir una venta." };

  const limpio = motivo?.trim();
  if (!limpio) return { ok: false, error: "Indica el motivo de la corrección: queda en la auditoría." };

  const faltante = validarComprador(entrada);
  if (faltante) return { ok: false, error: faltante };

  const original = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: { turno: { include: { caja: true } } },
  });
  if (!original) return { ok: false, error: "Venta no encontrada." };
  if (original.estado === "anulada") return { ok: false, error: "Esa venta ya está anulada: no hay nada que corregir." };
  if (!["abierto", "reabierto"].includes(original.turno.estado)) {
    return { ok: false, error: "El turno de esa venta ya está cerrado: a estas alturas solo se puede anular." };
  }

  const antes = {
    total_cobrado: original.total_cobrado,
    cantidad_asistentes: original.cantidad_asistentes,
    numero_venta: original.numero_venta,
  };

  const r = await crearVenta(
    {
      usuarioId: s.id,
      usuarioNombre: s.nombre,
      turnoId: original.turno_id,
      cajaNombre: original.turno.caja.nombre,
    },
    entrada,
    { ventaId, motivo: limpio },
  );

  if (!r.ok) return r;

  await registrarAuditoria({
    usuario_id: s.id,
    entidad: "venta",
    entidad_id: ventaId,
    accion: "corregir",
    datos_antes: antes,
    datos_despues: { motivo: limpio, venta_nueva: r.venta_id, numero_venta: r.numero_venta },
  });

  revalidatePath("/caja/ventas");
  revalidatePath(`/imprimir/venta/${ventaId}`);
  return r;
}
