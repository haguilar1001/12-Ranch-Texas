import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import { consolidarAnio, type ConceptoEgreso, type TipoMovProducto } from "@/lib/granja/produccion";
import ProduccionClient from "./ProduccionClient";

export const dynamic = "force-dynamic";

// Producción y ventas de la granja: huevos, queso, suero… con su existencia, ventas, donaciones,
// egresos y el consolidado del año (como el Excel que llevaban).
export default async function ProduccionPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!puedeOperarGranja(s.rol)) return <main className="p-6">Sin acceso.</main>;
  const hoy = fechaBogota();
  const { anio: a } = await searchParams;
  const anio = /^\d{4}$/.test(a ?? "") ? Number(a) : Number(hoy.slice(0, 4));
  const desde = new Date(Date.UTC(anio, 0, 1));
  const hasta = new Date(Date.UTC(anio + 1, 0, 1));

  const [productos, movimientos, ventasAnio, egresosAnio, empleados, aniosMov] = await Promise.all([
    prisma.productoGranja.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
    prisma.movimientoProducto.findMany({
      orderBy: [{ fecha: "desc" }, { creado_en: "desc" }], take: 150,
      where: { NOT: { motivo: { startsWith: "PRODUCCIÓN DE LO VENDIDO" } } },
      include: { producto: { select: { nombre: true, unidad: true } }, empleado: { select: { nombre: true } } },
    }),
    prisma.movimientoProducto.findMany({
      where: { tipo: "venta", anulado: false, fecha: { gte: desde, lt: hasta } },
      select: { fecha: true, valor: true, producto: { select: { nombre: true } } },
    }),
    prisma.gasto.findMany({
      where: { estado: { not: "anulado" }, fecha_gasto: { gte: new Date(`${anio}-01-01T00:00:00-05:00`), lt: new Date(`${anio + 1}-01-01T00:00:00-05:00`) }, rubro: { padre: { nombre: "GRANJA" } } },
      orderBy: { fecha_gasto: "desc" },
      select: { id: true, fecha_gasto: true, total: true, descripcion: true, rubro: { select: { nombre: true } } },
    }),
    prisma.empleado.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.movimientoProducto.findFirst({ orderBy: { fecha: "asc" }, select: { fecha: true } }),
  ]);
  const usuarios = new Map((await prisma.usuario.findMany({ select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const concepto = (n: string): ConceptoEgreso => (n.toUpperCase() === "EXTRAS" ? "extras" : "otros");
  const egresos = egresosAnio.map((g) => ({ id: g.id, fecha: fechaBogota(g.fecha_gasto), valor: g.total, concepto: concepto(g.rubro.nombre), descripcion: g.descripcion.replace(/\s*\[GRJ [^\]]*\]/, "") }));
  const primerAnio = aniosMov ? aniosMov.fecha.getUTCFullYear() : anio;

  return (
    <ProduccionClient
      hoy={hoy}
      anio={anio}
      anios={Array.from({ length: Number(hoy.slice(0, 4)) - Math.min(primerAnio, anio) + 1 }, (_, i) => Math.min(primerAnio, anio) + i).reverse()}
      esSupervisor={tieneRol(s.rol, "supervisor")}
      productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, unidad: p.unidad, precio: p.precio, existencia: Number(p.existencia), activo: p.activo }))}
      empleados={empleados}
      movimientos={movimientos.map((m) => ({
        id: m.id, fecha: iso(m.fecha), tipo: m.tipo as TipoMovProducto, producto: m.producto.nombre, unidad: m.producto.unidad, cantidad: Number(m.cantidad),
        precio: m.precio_unitario, valor: m.valor, detalle: [m.cliente, m.empleado?.nombre, m.motivo].filter(Boolean).join(" · "),
        anulado: m.anulado, motivo_anulacion: m.motivo_anulacion, quien: m.creado_por ? usuarios.get(m.creado_por) ?? null : null,
      }))}
      egresos={egresos}
      consolidado={consolidarAnio(ventasAnio.map((v) => ({ fecha: iso(v.fecha), producto: v.producto.nombre, valor: v.valor ?? 0 })), egresos, anio)}
    />
  );
}
