import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { programarPreventivos, alertasEquipos, vencimiento } from "@/lib/equipos/mantenimiento";
import { indicadoresMantenimiento } from "@/lib/equipos/indicadores";
import { fechaBogota } from "@/lib/tiempo";
import MantenimientoClient from "./MantenimientoClient";

export const dynamic = "force-dynamic";

// Tablero de mantenimiento: lo que hay que atender (alertas y fallas), las órdenes abiertas, lo
// último que se hizo y los indicadores del año. Al abrirlo se programan los preventivos que falten.
export default async function MantenimientoPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) redirect("/reportar-falla");

  await programarPreventivos();
  const hoy = new Date();
  const anio = +fechaBogota().slice(0, 4);
  const [alertas, fallas, abiertas, realizadas, equipos, ind] = await Promise.all([
    alertasEquipos(hoy),
    prisma.reporteFalla.findMany({
      where: { estado: "abierta" }, orderBy: [{ prioridad: "desc" }, { creado_en: "asc" }],
      include: { equipo: { select: { id: true, nombre: true, codigo: true } }, fotos: { select: { id: true } } },
    }),
    prisma.mantenimientoEquipo.findMany({
      where: { estado: { in: ["programado", "en_proceso"] } },
      include: { equipo: { select: { id: true, nombre: true, codigo: true, horometro: true, categoria: { select: { nombre: true } } } }, plan: { select: { aviso_dias: true, frecuencia_horas: true } } },
    }),
    prisma.mantenimientoEquipo.findMany({
      where: { estado: "realizado" }, orderBy: { fecha_realizada: "desc" }, take: 25,
      include: { equipo: { select: { id: true, nombre: true, codigo: true } }, empleado: { select: { nombre: true } }, proveedor: { select: { nombre: true } } },
    }),
    prisma.equipo.findMany({ where: { activo: true, estado: { not: "dado_de_baja" }, cantidad: { gt: 0 } }, select: { id: true, nombre: true, codigo: true, categoria: { select: { nombre: true } } }, orderBy: { nombre: "asc" } }),
    indicadoresMantenimiento(anio),
  ]);
  const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: fallas.map((f) => f.creado_por).filter((x): x is string => !!x) } }, select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]));
  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  return (
    <MantenimientoClient
      anio={anio}
      hoy={fechaBogota()}
      alertas={alertas}
      fallas={fallas.map((f) => ({ id: f.id, equipo: f.equipo.nombre, codigo: f.equipo.codigo, equipoId: f.equipo.id, descripcion: f.descripcion, solucion: f.solucion_sugerida, prioridad: f.prioridad, detenido: f.equipo_detenido, fecha: f.creado_en.toISOString(), reporto: f.creado_por ? usuarios.get(f.creado_por) ?? "—" : "—", fotos: f.fotos.map((x) => x.id) }))}
      abiertas={abiertas.map((o) => ({
        id: o.id, equipo: o.equipo.nombre, codigo: o.equipo.codigo, grupo: o.equipo.categoria.nombre, equipoId: o.equipo.id, tipo: o.tipo, descripcion: o.descripcion,
        estado: o.estado, fecha: iso(o.fecha_programada), horasObjetivo: o.horometro_objetivo, horometro: o.equipo.horometro,
        vencimiento: vencimiento(o, o.equipo, hoy, o.plan?.aviso_dias ?? 7, o.plan?.frecuencia_horas ?? null), dePlan: !!o.plan_id,
      })).sort((a, b) => ({ vencido: 0, proximo: 1, al_dia: 2 })[a.vencimiento] - ({ vencido: 0, proximo: 1, al_dia: 2 })[b.vencimiento] || (a.fecha ?? "9").localeCompare(b.fecha ?? "9"))}
      realizadas={realizadas.map((o) => ({ id: o.id, equipo: o.equipo.nombre, codigo: o.equipo.codigo, tipo: o.tipo, descripcion: o.descripcion, fecha: iso(o.fecha_realizada), quien: o.empleado?.nombre ?? o.proveedor?.nombre ?? o.responsable ?? "—", costo: o.costo }))}
      equipos={equipos.map((e) => ({ id: e.id, nombre: e.codigo ? `${e.nombre} (${e.codigo})` : e.nombre, grupo: e.categoria.nombre }))}
      ind={ind}
    />
  );
}
