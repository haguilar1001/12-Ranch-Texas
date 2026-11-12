import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { fechaBogota, formatearFechaHoraCortaBogota } from "@/lib/tiempo";
import { resumirPorTipo, ETIQUETA_EQUIPO, type TipoMovEquipo } from "@/lib/inventario/kardex";
import EquiposClient from "./EquiposClient";

export const dynamic = "force-dynamic";

const dia = (d: Date | null) => (d ? fechaBogota(d) : null);

export default async function EquiposPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) return <main className="p-6">Sin acceso.</main>;

  const hoy = fechaBogota();
  const inicioMes = new Date(`${hoy.slice(0, 7)}-01T00:00:00-05:00`);

  const [equiposRaw, gruposRaw, areas, empleados, proveedores, movimientosRaw, movimientosMes, mantenimientosRaw] = await Promise.all([
    prisma.equipo.findMany({
      where: { activo: true },
      include: {
        categoria: { select: { nombre: true } },
        area: { select: { nombre: true } },
        proveedor: { select: { nombre: true } },
        responsable: { select: { nombre: true } },
      },
      orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }],
    }),
    prisma.categoriaEquipo.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }], include: { _count: { select: { equipos: { where: { activo: true, cantidad: { gt: 0 } } } } } } }),
    prisma.areaTrabajo.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.empleado.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.proveedor.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.movimientoEquipo.findMany({
      orderBy: [{ fecha: "desc" }, { creado_en: "desc" }],
      take: 300,
      include: { equipo: { select: { nombre: true, codigo: true } } },
    }),
    prisma.movimientoEquipo.findMany({
      where: { fecha: { gte: inicioMes }, tipo: { notIn: ["saldo_inicial", "traslado_entrada", "traslado_salida"] } },
      select: { tipo: true, cantidad: true, valor: true, anulado: true },
    }),
    prisma.mantenimientoEquipo.findMany({
      include: { equipo: { select: { nombre: true, codigo: true } } },
      orderBy: [{ fecha_programada: "desc" }, { creado_en: "desc" }],
      take: 200,
    }),
  ]);

  const equipos = equiposRaw.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    codigo: e.codigo,
    categoria_id: e.categoria_id,
    grupo: e.categoria.nombre,
    marca: e.marca,
    modelo: e.modelo,
    referencia: e.referencia,
    serie: e.serie,
    area_id: e.area_id,
    area: e.area?.nombre ?? null,
    ubicacion: e.ubicacion,
    cantidad: e.cantidad,
    proveedor_id: e.proveedor_id,
    proveedor: e.proveedor?.nombre ?? null,
    responsable_id: e.responsable_id,
    responsable: e.responsable?.nombre ?? null,
    valor_compra: e.valor_compra,
    fecha_compra: dia(e.fecha_compra),
    fecha_instalacion: dia(e.fecha_instalacion),
    garantia_hasta: dia(e.garantia_hasta),
    vida_util_meses: e.vida_util_meses,
    estado: e.estado,
    observaciones: e.observaciones,
  }));

  const movimientos = movimientosRaw.map((m) => ({
    id: m.id,
    equipo_id: m.equipo_id,
    fecha: formatearFechaHoraCortaBogota(m.fecha),
    equipo: m.equipo.nombre,
    codigo: m.equipo.codigo,
    tipo: m.tipo,
    etiqueta: ETIQUETA_EQUIPO[m.tipo as TipoMovEquipo] ?? m.tipo,
    cantidad: m.cantidad,
    motivo: m.motivo,
    valor: m.valor,
    tercero: m.tercero,
    origen: m.origen,
    destino: m.destino,
    anulado: m.anulado,
    motivo_anulacion: m.motivo_anulacion,
    anulable: !m.anulado && m.tipo !== "traslado" && !(m.tipo === "saldo_inicial" && m.creado_por === "migracion"),
  }));

  const mantenimientos = mantenimientosRaw.map((m) => ({
    id: m.id,
    equipo_id: m.equipo_id,
    equipo: m.equipo.nombre,
    codigo: m.equipo.codigo,
    tipo: m.tipo,
    descripcion: m.descripcion,
    fecha_programada: dia(m.fecha_programada),
    fecha_realizada: dia(m.fecha_realizada),
    costo: m.costo,
    responsable: m.responsable,
    estado: m.estado,
    vencido: m.estado === "programado" && !!m.fecha_programada && fechaBogota(m.fecha_programada) < hoy,
  }));

  const enInventario = equipos.filter((e) => e.cantidad > 0);
  const en30 = fechaBogota(new Date(Date.now() + 30 * 86400000));
  const kpis = {
    registros: enInventario.length,
    unidades: enInventario.reduce((t, e) => t + e.cantidad, 0),
    operativos: enInventario.filter((e) => e.estado === "operativo").reduce((t, e) => t + e.cantidad, 0),
    noOperativos: enInventario.filter((e) => e.estado === "en_mantenimiento" || e.estado === "fuera_servicio").reduce((t, e) => t + e.cantidad, 0),
    valor: enInventario.reduce((t, e) => t + (e.valor_compra ?? 0) * e.cantidad, 0),
    mantVencidos: mantenimientos.filter((m) => m.vencido).length,
    garantiasPorVencer: enInventario.filter((e) => e.garantia_hasta && e.garantia_hasta >= hoy && e.garantia_hasta <= en30).length,
  };

  return (
    <EquiposClient
      esAdmin={tieneRol(s.rol, "administrador")}
      hoy={hoy}
      kpis={kpis}
      equipos={equipos}
      grupos={gruposRaw.map((g) => ({ id: g.id, nombre: g.nombre, descripcion: g.descripcion, activo: g.activo, equipos: g._count.equipos }))}
      areas={areas}
      empleados={empleados}
      proveedores={proveedores}
      movimientos={movimientos}
      resumenMes={resumirPorTipo(movimientosMes).map((r) => ({ ...r, etiqueta: ETIQUETA_EQUIPO[r.tipo as TipoMovEquipo] ?? r.tipo }))}
      mantenimientos={mantenimientos}
    />
  );
}
