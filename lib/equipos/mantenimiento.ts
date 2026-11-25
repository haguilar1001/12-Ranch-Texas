import { prisma, type Tx } from "../db";

// Mantenimiento de equipos: programación de preventivos por fecha y por horas de uso, estado de
// vencimiento de cada orden y alertas del módulo. Lo puro va arriba (se prueba sin base de datos).

const DIA = 86_400_000;

// ------------------------------------------------------------------ puro

export interface PlanCalculo { frecuencia_dias: number | null; frecuencia_horas: number | null; aviso_dias: number; creado_en: Date }
export interface UltimoRealizado { fecha_realizada: Date | null; horometro: number | null }

/**
 * Cuándo toca el siguiente preventivo de un plan en un equipo.
 *  · Fecha: último realizado (o, si nunca se ha hecho, la fecha base: instalación del equipo o
 *    creación del plan) + frecuencia en días.
 *  · Horas: lectura del horómetro en el último realizado (o la lectura actual si nunca se ha
 *    hecho) + frecuencia en horas. Solo si el equipo usa horómetro.
 * Si el plan tiene ambas, la orden vence con lo que llegue primero.
 */
export function proximoPreventivo(
  plan: PlanCalculo,
  equipo: { usa_horometro: boolean; horometro: number | null; fecha_instalacion: Date | null },
  ultimo: UltimoRealizado | null,
): { fecha: Date | null; horas: number | null } {
  const base = ultimo?.fecha_realizada ?? equipo.fecha_instalacion ?? plan.creado_en;
  const fecha = plan.frecuencia_dias ? new Date(base.getTime() + plan.frecuencia_dias * DIA) : null;
  let horas: number | null = null;
  if (plan.frecuencia_horas && equipo.usa_horometro) {
    const desde = ultimo?.horometro ?? equipo.horometro ?? 0;
    horas = desde + plan.frecuencia_horas;
  }
  return { fecha, horas };
}

export type Vencimiento = "vencido" | "proximo" | "al_dia";

/** Estado de una orden abierta: vencida, próxima (dentro del aviso) o al día. */
export function vencimiento(
  orden: { fecha_programada: Date | null; horometro_objetivo: number | null },
  equipo: { horometro: number | null },
  hoy: Date,
  avisoDias = 7,
  frecuenciaHoras: number | null = null,
): Vencimiento {
  const inicioHoy = new Date(hoy); inicioHoy.setUTCHours(5, 0, 0, 0); // 00:00 en Bogotá
  let estado: Vencimiento = "al_dia";
  if (orden.fecha_programada) {
    if (orden.fecha_programada.getTime() < inicioHoy.getTime()) return "vencido";
    if (orden.fecha_programada.getTime() <= inicioHoy.getTime() + avisoDias * DIA) estado = "proximo";
  }
  if (orden.horometro_objetivo != null && equipo.horometro != null) {
    if (equipo.horometro >= orden.horometro_objetivo) return "vencido";
    const margen = Math.max(5, Math.round((frecuenciaHoras ?? 100) * 0.1));
    if (orden.horometro_objetivo - equipo.horometro <= margen) estado = "proximo";
  }
  return estado;
}

/** Subtotal de un repuesto: cantidad × precio, redondeado al peso. */
export const subtotalRepuesto = (cantidad: number, precio: number) => Math.round(cantidad * precio);

/** Horas que el equipo estuvo parado por la orden (desde que se detuvo o se inició hasta que se cerró). */
export function horasFuera(desde: Date | null, hasta: Date): number | null {
  if (!desde) return null;
  return Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 3_600_000));
}

// ------------------------------------------------------------------ base de datos

/** Equipos activos a los que aplica un plan (el equipo, o todos los de su grupo). */
async function equiposDelPlan(db: Tx, plan: { equipo_id: string | null; categoria_id: string | null }) {
  return db.equipo.findMany({
    where: {
      activo: true, estado: { not: "dado_de_baja" }, cantidad: { gt: 0 },
      ...(plan.equipo_id ? { id: plan.equipo_id } : { categoria_id: plan.categoria_id ?? "-" }),
    },
    select: { id: true, usa_horometro: true, horometro: true, fecha_instalacion: true },
  });
}

/**
 * Crea la siguiente orden preventiva de cada plan activo en cada equipo que no tenga ya una abierta
 * de ese plan. Es idempotente: se puede llamar cuantas veces se quiera (al abrir el tablero, al
 * cerrar una orden, al guardar un plan o una lectura de horómetro).
 */
export async function programarPreventivos(db: Tx = prisma, filtro: { planId?: string; equipoId?: string } = {}, usuario = "sistema"): Promise<number> {
  const planes = await db.planMantenimiento.findMany({
    where: { activo: true, ...(filtro.planId ? { id: filtro.planId } : {}) },
  });
  let creadas = 0;
  for (const plan of planes) {
    const equipos = (await equiposDelPlan(db, plan)).filter((e) => !filtro.equipoId || e.id === filtro.equipoId);
    if (!equipos.length) continue;
    const ids = equipos.map((e) => e.id);
    const [abiertas, ultimos] = await Promise.all([
      db.mantenimientoEquipo.findMany({ where: { plan_id: plan.id, equipo_id: { in: ids }, estado: { in: ["programado", "en_proceso"] } }, select: { equipo_id: true } }),
      db.mantenimientoEquipo.findMany({
        where: { plan_id: plan.id, equipo_id: { in: ids }, estado: "realizado" },
        orderBy: { fecha_realizada: "desc" }, distinct: ["equipo_id"],
        select: { equipo_id: true, fecha_realizada: true, horometro: true },
      }),
    ]);
    const conAbierta = new Set(abiertas.map((a) => a.equipo_id));
    const ultimoDe = new Map(ultimos.map((u) => [u.equipo_id, u]));
    for (const e of equipos) {
      if (conAbierta.has(e.id)) continue;
      const p = proximoPreventivo(plan, e, ultimoDe.get(e.id) ?? null);
      if (!p.fecha && p.horas == null) continue; // plan por horas en un equipo sin horómetro
      await db.mantenimientoEquipo.create({
        data: {
          equipo_id: e.id, plan_id: plan.id, tipo: "preventivo", descripcion: plan.nombre,
          fecha_programada: p.fecha, horometro_objetivo: p.horas, costo: 0, estado: "programado", creado_por: usuario,
        },
      });
      creadas++;
    }
  }
  return creadas;
}

/** Guarda una lectura del horómetro y la deja como la actual del equipo. */
export async function registrarLectura(db: Tx, equipoId: string, horas: number, usuario: string, origen = "manual") {
  await db.lecturaHorometro.create({ data: { equipo_id: equipoId, horas, origen, creado_por: usuario } });
  await db.equipo.update({ where: { id: equipoId }, data: { horometro: horas, actualizado_por: usuario } });
}

export interface AlertaEquipo {
  nivel: "critica" | "alta" | "media";
  tipo: "falla" | "vencido" | "proximo" | "parado" | "garantia";
  titulo: string;
  detalle: string;
  href: string;
}

const fechaCorta = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });

/** Todo lo que necesita atención en el módulo, de lo más urgente a lo menos. */
export async function alertasEquipos(hoy = new Date()): Promise<AlertaEquipo[]> {
  const [fallas, abiertas, parados, garantias] = await Promise.all([
    prisma.reporteFalla.findMany({ where: { estado: "abierta" }, include: { equipo: { select: { nombre: true, codigo: true } } }, orderBy: { creado_en: "asc" } }),
    prisma.mantenimientoEquipo.findMany({
      where: { estado: "programado" },
      include: { equipo: { select: { nombre: true, codigo: true, horometro: true } }, plan: { select: { aviso_dias: true, frecuencia_horas: true } } },
    }),
    prisma.equipo.findMany({ where: { activo: true, estado: { in: ["fuera_servicio", "en_mantenimiento"] } }, select: { id: true, nombre: true, codigo: true, estado: true, actualizado_en: true } }),
    prisma.equipo.findMany({ where: { activo: true, garantia_hasta: { gte: hoy, lte: new Date(hoy.getTime() + 30 * DIA) } }, select: { id: true, nombre: true, garantia_hasta: true } }),
  ]);
  const nombre = (e: { nombre: string; codigo: string | null }) => (e.codigo ? `${e.nombre} (${e.codigo})` : e.nombre);
  const out: AlertaEquipo[] = [];
  const PRIO = { critica: "critica", alta: "alta", media: "media", baja: "media" } as const;
  for (const f of fallas) {
    out.push({ nivel: PRIO[f.prioridad], tipo: "falla", titulo: `Falla ${f.prioridad === "critica" ? "crítica" : f.prioridad}: ${nombre(f.equipo)}`, detalle: `${f.descripcion}${f.equipo_detenido ? " · equipo detenido" : ""} · reportada el ${fechaCorta(f.creado_en)}`, href: "/admin/equipos/mantenimiento#fallas" });
  }
  for (const o of abiertas) {
    const v = vencimiento(o, o.equipo, hoy, o.plan?.aviso_dias ?? 7, o.plan?.frecuencia_horas ?? null);
    if (v === "al_dia") continue;
    const cuando = [o.fecha_programada ? fechaCorta(o.fecha_programada) : null, o.horometro_objetivo != null ? `${o.horometro_objetivo} h (lleva ${o.equipo.horometro ?? 0} h)` : null].filter(Boolean).join(" · ");
    out.push({ nivel: v === "vencido" ? "alta" : "media", tipo: v, titulo: `${v === "vencido" ? "Vencido" : "Próximo"}: ${o.descripcion} · ${nombre(o.equipo)}`, detalle: `${o.tipo === "preventivo" ? "Preventivo" : "Correctivo"} programado para ${cuando}`, href: `/admin/equipos/mantenimiento/${o.id}` });
  }
  for (const e of parados) {
    const dias = Math.floor((hoy.getTime() - e.actualizado_en.getTime()) / DIA);
    if (dias < 3) continue;
    out.push({ nivel: dias >= 7 ? "alta" : "media", tipo: "parado", titulo: `${nombre(e)} lleva ${dias} días ${e.estado === "fuera_servicio" ? "fuera de servicio" : "en mantenimiento"}`, detalle: "Equipo parado: revisa la orden o el repuesto que falta.", href: `/admin/equipos/${e.id}` });
  }
  for (const g of garantias) {
    out.push({ nivel: "media", tipo: "garantia", titulo: `Garantía por vencer: ${g.nombre}`, detalle: `Vence el ${fechaCorta(g.garantia_hasta!)}. Si tiene fallas, repórtalas antes.`, href: `/admin/equipos/${g.id}` });
  }
  const peso = { critica: 0, alta: 1, media: 2 };
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}
