import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { redirect } from "next/navigation";
import { rutaRubro } from "@/lib/catalogos/validar";
import CatalogosClient from "./CatalogosClient";

export const dynamic = "force-dynamic";

// Catálogos del parque en un solo lugar: proveedores, materias primas, rubros de gasto, alimentos,
// grupos de equipos y áreas de trabajo. Nada se borra: se desactiva.
export default async function CatalogosPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden manejar los catálogos.</p></main>;
  }
  const { tab } = await searchParams;

  const [proveedores, materias, rubros, alimentos, grupos, areas] = await Promise.all([
    prisma.proveedor.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      include: { _count: { select: { gastos: true, compras_alimento: true, equipos: true, materias_primas: true, mantenimientos_equipo: true } } },
    }),
    prisma.materiaPrima.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }], include: { proveedor: { select: { nombre: true } } } }),
    prisma.rubroGasto.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }], include: { _count: { select: { gastos: true, hijos: true } } } }),
    prisma.alimento.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
    prisma.categoriaEquipo.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }], include: { _count: { select: { equipos: true } } } }),
    prisma.areaTrabajo.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }], include: { _count: { select: { empleados: true, equipos: true, gastos: true } } } }),
  ]);
  const mapaRubros = new Map(rubros.map((r) => [r.id, { nombre: r.nombre, padre_id: r.padre_id }]));

  return (
    <CatalogosClient
      tabInicial={tab}
      proveedores={proveedores.map((p) => ({
        id: p.id, activo: p.activo, nombre: p.nombre, nit_cedula: p.nit_cedula ?? "", contacto: p.contacto ?? "", telefono: p.telefono ?? "", email: p.email ?? "",
        direccion: p.direccion ?? "", ciudad: p.ciudad ?? "", tipo: p.tipo ?? "", suministra: p.suministra ?? "", condiciones_pago: p.condiciones_pago ?? "", observaciones: p.observaciones ?? "",
        usos: p._count.gastos + p._count.compras_alimento + p._count.equipos + p._count.materias_primas + p._count.mantenimientos_equipo,
      }))}
      materias={materias.map((m) => ({
        id: m.id, activo: m.activo, nombre: m.nombre, categoria: m.categoria ?? "", unidad_medida: m.unidad_medida,
        costo_referencia: m.costo_referencia === null ? "" : String(m.costo_referencia), proveedor_id: m.proveedor_id ?? "", proveedor: m.proveedor?.nombre ?? "", observaciones: m.observaciones ?? "",
      }))}
      rubros={rubros
        .map((r) => ({
          id: r.id, activo: r.activo, nombre: r.nombre, nivel: r.nivel, padre_id: r.padre_id ?? "", orden: String(r.orden),
          ruta: rutaRubro(r.id, mapaRubros), usos: r._count.gastos, hijos: r._count.hijos,
        }))
        .sort((a, b) => a.ruta.localeCompare(b.ruta, "es"))}
      alimentos={alimentos.map((a) => ({
        id: a.id, activo: a.activo, nombre: a.nombre, tipo: a.tipo ?? "", unidad_medida: a.unidad_medida,
        costo_unitario: a.costo_unitario === null ? "" : String(a.costo_unitario), equivalencia_g: a.equivalencia_g === null ? "" : String(a.equivalencia_g),
      }))}
      grupos={grupos.map((g) => ({ id: g.id, activo: g.activo, nombre: g.nombre, descripcion: g.descripcion ?? "", usos: g._count.equipos }))}
      areas={areas.map((a) => ({ id: a.id, activo: a.activo, nombre: a.nombre, descripcion: a.descripcion ?? "", empleados: a._count.empleados, usos: a._count.empleados + a._count.equipos + a._count.gastos }))}
    />
  );
}
