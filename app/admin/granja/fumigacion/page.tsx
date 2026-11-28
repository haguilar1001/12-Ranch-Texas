import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import FumigacionClient from "./FumigacionClient";

export const dynamic = "force-dynamic";

// Fumigaciones: dónde, contra qué, con qué productos y cuánto (sale del inventario), quién y fotos.
export default async function FumigacionPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!puedeOperarGranja(s.rol)) return <main className="p-6">Sin acceso.</main>;

  const [recintos, empleados, insumos, fumigaciones] = await Promise.all([
    prisma.recinto.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.empleado.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.insumoGranja.findMany({ where: { activo: true }, select: { id: true, nombre: true, unidad: true, categoria: true, existencia: true }, orderBy: [{ categoria: "asc" }, { nombre: "asc" }] }),
    prisma.fumigacion.findMany({
      orderBy: [{ fecha: "desc" }, { creado_en: "desc" }], take: 100,
      include: {
        recinto: { select: { nombre: true } }, empleado: { select: { nombre: true } }, fotos: { select: { id: true } },
        productos: { select: { cantidad: true, anulado: true, insumo: { select: { nombre: true, unidad: true } } } },
      },
    }),
  ]);

  return (
    <FumigacionClient
      hoy={fechaBogota()}
      esSupervisor={tieneRol(s.rol, "supervisor")}
      recintos={recintos}
      empleados={empleados}
      insumos={insumos.map((i) => ({ id: i.id, nombre: i.nombre, unidad: i.unidad, categoria: i.categoria, existencia: Number(i.existencia) }))}
      fumigaciones={fumigaciones.map((f) => ({
        id: f.id, fecha: fechaBogota(f.fecha), donde: [f.recinto?.nombre, f.zona].filter(Boolean).join(" · "), plaga: f.plaga, quien: f.empleado?.nombre ?? "—",
        observaciones: f.observaciones, anulada: f.estado === "anulada", motivo_anulacion: f.motivo_anulacion, fotos: f.fotos.map((x) => x.id),
        productos: f.productos.map((p) => ({ nombre: p.insumo.nombre, unidad: p.insumo.unidad, cantidad: Number(p.cantidad) })),
      }))}
    />
  );
}
