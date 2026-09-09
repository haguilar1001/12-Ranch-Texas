import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { inicioDelDiaOperativo, fechaBogota } from "@/lib/tiempo";
import AccesosClient from "./AccesosClient";

export const dynamic = "force-dynamic";

export default async function AccesosPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) return <main className="p-6">Sin acceso.</main>;

  const inicioHoy = inicioDelDiaOperativo();

  const [atraccionesRaw, puntosRaw, grupos] = await Promise.all([
    prisma.atraccion.findMany({
      orderBy: [{ activa: "desc" }, { nombre: "asc" }],
      include: {
        puntos_control: { select: { id: true } },
        _count: { select: { consentimientos: true } },
        // Cuántos esperan ahora mismo en la fila de hoy.
        turnos_fila: {
          where: { fecha_operativa: fechaBogota(), estado: { in: ["esperando", "llamado"] } },
          select: { id: true },
        },
      },
    }),
    prisma.puntoControl.findMany({
      orderBy: [{ activo: "desc" }, { atraccion_id: "asc" }, { nombre: "asc" }],
      include: { atraccion: { select: { nombre: true } } },
    }),
    // Entradas permitidas de hoy, agrupadas por lector.
    prisma.acceso.groupBy({
      by: ["punto_control_id"],
      where: { resultado: "permitido", sentido: "entrada", escaneado_en: { gte: inicioHoy } },
      _count: { _all: true },
    }),
  ]);

  const conteo = new Map(grupos.map((g) => [g.punto_control_id, g._count._all]));

  // Aforo del parque = entradas − salidas por los puntos que NO son de atracción.
  const idsParque = puntosRaw.filter((p) => !p.atraccion_id).map((p) => p.id);
  let entradasParque = 0;
  let aforoParque = 0;
  if (idsParque.length) {
    const [e, sa] = await Promise.all([
      prisma.acceso.count({ where: { punto_control_id: { in: idsParque }, resultado: "permitido", sentido: "entrada", escaneado_en: { gte: inicioHoy } } }),
      prisma.acceso.count({ where: { punto_control_id: { in: idsParque }, resultado: "permitido", sentido: "salida", escaneado_en: { gte: inicioHoy } } }),
    ]);
    entradasParque = e;
    aforoParque = Math.max(0, e - sa);
  }

  const atracciones = atraccionesRaw.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    descripcion: a.descripcion,
    edad_minima: a.edad_minima,
    estatura_minima: a.estatura_minima,
    requiere_consentimiento: a.requiere_consentimiento,
    fila_activa: a.fila_activa,
    cupo_por_tanda: a.cupo_por_tanda,
    minutos_por_tanda: a.minutos_por_tanda,
    enFilaAhora: a.turnos_fila.length,
    activa: a.activa,
    puntos: a.puntos_control.length,
    entradasHoy: a.puntos_control.reduce((acc, p) => acc + (conteo.get(p.id) ?? 0), 0),
    consentimientos: a._count.consentimientos,
  }));

  const puntos = puntosRaw.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    atraccion_id: p.atraccion_id,
    atraccion: p.atraccion?.nombre ?? null,
    tipo_regla: p.tipo_regla,
    aforo_maximo: p.aforo_maximo,
    edad_minima: p.edad_minima,
    estatura_minima: p.estatura_minima,
    requiere_consentimiento: p.requiere_consentimiento,
    activo: p.activo,
    entradasHoy: conteo.get(p.id) ?? 0,
  }));

  const aforoMaximo = puntosRaw.find((p) => !p.atraccion_id && p.aforo_maximo)?.aforo_maximo ?? null;

  return (
    <AccesosClient
      puedeEditar={tieneRol(s.rol, "supervisor")}
      kpis={{
        entradasParque,
        aforoParque,
        aforoMaximo,
        atracciones: atraccionesRaw.filter((a) => a.activa).length,
        conConsentimiento: atraccionesRaw.filter((a) => a.activa && a.requiere_consentimiento).length,
      }}
      atracciones={atracciones}
      puntos={puntos}
    />
  );
}
