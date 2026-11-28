import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, puedeOperarGranja } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import TratamientosClient from "./TratamientosClient";

export const dynamic = "force-dynamic";

// Tratamientos de los animales: casos abiertos, revisiones pendientes y el formulario para abrir uno.
export default async function TratamientosPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!puedeOperarGranja(s.rol)) return <main className="p-6">Sin acceso.</main>;
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  const [animales, empleados, insumos, tratamientos] = await Promise.all([
    prisma.animal.findMany({
      where: { activo: true, estado: { notIn: ["fallecido", "trasladado"] } },
      select: { id: true, nombre: true, codigo: true, cantidad: true, estado: true, categoria: { select: { nombre: true } } },
      orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }],
    }),
    prisma.empleado.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.insumoGranja.findMany({ where: { activo: true }, select: { id: true, nombre: true, unidad: true, categoria: true, existencia: true }, orderBy: { nombre: "asc" } }),
    prisma.tratamiento.findMany({
      orderBy: [{ fecha: "desc" }, { creado_en: "desc" }], take: 200,
      include: {
        animal: { select: { nombre: true, codigo: true, categoria: { select: { nombre: true } } } },
        _count: { select: { seguimientos: true, fotos: true } },
      },
    }),
  ]);

  return (
    <TratamientosClient
      hoy={fechaBogota()}
      animales={animales.map((a) => ({ id: a.id, nombre: a.nombre, codigo: a.codigo, cantidad: a.cantidad, estado: a.estado, categoria: a.categoria.nombre }))}
      empleados={empleados}
      insumos={insumos.map((i) => ({ ...i, existencia: Number(i.existencia) }))}
      tratamientos={tratamientos.map((t) => ({
        id: t.id, fecha: iso(t.fecha)!, animal: t.animal.nombre, codigo: t.animal.codigo, categoria: t.animal.categoria.nombre, diagnostico: t.diagnostico,
        veterinario: t.veterinario, estado: t.estado, proxima: iso(t.proxima_revision), resultado: t.resultado, seguimientos: t._count.seguimientos, fotos: t._count.fotos,
      }))}
    />
  );
}
