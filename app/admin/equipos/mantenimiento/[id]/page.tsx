import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { vencimiento } from "@/lib/equipos/mantenimiento";
import { fechaBogota } from "@/lib/tiempo";
import OrdenClient from "./OrdenClient";

export const dynamic = "force-dynamic";

export default async function OrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) redirect("/reportar-falla");
  const { id } = await params;
  const o = await prisma.mantenimientoEquipo.findUnique({
    where: { id },
    include: {
      equipo: { include: { categoria: { select: { nombre: true } } } },
      plan: true, empleado: { select: { nombre: true } }, proveedor: { select: { nombre: true } }, gasto: { select: { id: true, estado: true } },
      repuestos: { orderBy: { creado_en: "asc" } }, fotos: { select: { id: true, tipo: true } },
      falla: { include: { fotos: { select: { id: true } } } },
    },
  });
  if (!o) notFound();
  const [empleados, proveedores, reporto] = await Promise.all([
    prisma.empleado.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.proveedor.findMany({ where: { activo: true }, select: { nombre: true }, orderBy: { nombre: "asc" } }),
    o.falla?.creado_por ? prisma.usuario.findUnique({ where: { id: o.falla.creado_por }, select: { nombre: true } }) : null,
  ]);
  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link href="/admin/equipos/mantenimiento" className="text-sm text-ranch-marron/60 hover:underline">← Mantenimiento</Link>
      <OrdenClient
        hoy={fechaBogota()}
        orden={{
          id: o.id, tipo: o.tipo, descripcion: o.descripcion, estado: o.estado,
          fechaProgramada: iso(o.fecha_programada), fechaInicio: iso(o.fecha_inicio), fechaRealizada: iso(o.fecha_realizada),
          horasObjetivo: o.horometro_objetivo, vencimiento: o.estado === "programado" ? vencimiento(o, o.equipo, new Date(), o.plan?.aviso_dias ?? 7, o.plan?.frecuencia_horas ?? null) : null,
          ejecutor: o.ejecutor, quien: o.empleado?.nombre ?? o.proveedor?.nombre ?? o.responsable, trabajos: o.trabajos_realizados, observaciones: o.observaciones,
          repuestos: o.repuestos.map((r) => ({ descripcion: r.descripcion, cantidad: Number(r.cantidad), unidad: r.unidad, precio: r.precio_unitario, subtotal: r.subtotal })),
          repuestosTotal: o.repuestos_total, manoObra: o.mano_obra, costo: o.costo, factura: o.numero_factura, horasFuera: o.horas_fuera_servicio,
          horometro: o.horometro, gasto: o.gasto ? { id: o.gasto.id, estado: o.gasto.estado } : null, motivoCancelacion: o.motivo_cancelacion,
          fotos: o.fotos.map((f) => ({ id: f.id, tipo: f.tipo })),
        }}
        equipo={{ id: o.equipo.id, nombre: o.equipo.nombre, codigo: o.equipo.codigo, grupo: o.equipo.categoria.nombre, ubicacion: o.equipo.ubicacion, estado: o.equipo.estado, usaHorometro: o.equipo.usa_horometro, horometro: o.equipo.horometro, garantia: iso(o.equipo.garantia_hasta) }}
        plan={o.plan ? { nombre: o.plan.nombre, instrucciones: o.plan.instrucciones, frecuenciaDias: o.plan.frecuencia_dias, frecuenciaHoras: o.plan.frecuencia_horas, costoEstimado: o.plan.costo_estimado } : null}
        falla={o.falla ? { descripcion: o.falla.descripcion, prioridad: o.falla.prioridad, detenido: o.falla.equipo_detenido, fecha: o.falla.creado_en.toISOString(), reporto: reporto?.nombre ?? "—", fotos: o.falla.fotos.map((f) => f.id) } : null}
        empleados={empleados}
        proveedores={proveedores.map((p) => p.nombre)}
      />
    </main>
  );
}
