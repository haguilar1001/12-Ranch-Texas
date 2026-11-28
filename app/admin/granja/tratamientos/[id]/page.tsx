import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import ReporteClient from "./ReporteClient";

export const dynamic = "force-dynamic";

// Reporte médico de un tratamiento: todo el caso en una hoja (se puede imprimir), con seguimiento.
export default async function ReportePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!puedeOperarGranja(s.rol)) return <main className="p-6">Sin acceso.</main>;
  const { id } = await params;
  const t = await prisma.tratamiento.findUnique({
    where: { id },
    include: {
      animal: { include: { categoria: { select: { nombre: true } }, recinto: { select: { nombre: true } } } },
      empleado: { select: { nombre: true } },
      fotos: { select: { id: true, creado_en: true }, orderBy: { creado_en: "asc" } },
      seguimientos: { orderBy: [{ fecha: "asc" }, { creado_en: "asc" }] },
      medicamentos: { include: { insumo: { select: { nombre: true, unidad: true } } }, orderBy: [{ fecha: "asc" }, { creado_en: "asc" }] },
    },
  });
  if (!t) notFound();
  const [insumos, usuarios] = await Promise.all([
    prisma.insumoGranja.findMany({ where: { activo: true }, select: { id: true, nombre: true, unidad: true, categoria: true, existencia: true }, orderBy: { nombre: "asc" } }),
    prisma.usuario.findMany({ select: { id: true, nombre: true } }),
  ]);
  const quien = new Map(usuarios.map((u) => [u.id, u.nombre]));
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  return (
    <ReporteClient
      hoy={fechaBogota()}
      esSupervisor={tieneRol(s.rol, "supervisor")}
      insumos={insumos.map((i) => ({ ...i, existencia: Number(i.existencia) }))}
      t={{
        id: t.id, numero: t.id.replace(/-/g, "").slice(0, 8).toUpperCase(), fecha: iso(t.fecha)!, estado: t.estado,
        animal: { nombre: t.animal.nombre, codigo: t.animal.codigo, categoria: t.animal.categoria.nombre, especie: t.animal.especie, raza: t.animal.raza,
          sexo: t.animal.sexo, cantidad: t.animal.cantidad, recinto: t.animal.recinto?.nombre ?? null, estado: t.animal.estado },
        sintomas: t.sintomas, diagnostico: t.diagnostico, indicaciones: t.indicaciones, veterinario: t.veterinario, cuida: t.empleado?.nombre ?? null,
        proxima: iso(t.proxima_revision), resultado: t.resultado, motivo_anulacion: t.motivo_anulacion,
        registro: t.creado_por ? quien.get(t.creado_por) ?? null : null,
        fotos: t.fotos.map((f) => f.id),
        seguimientos: t.seguimientos.map((x) => ({ id: x.id, fecha: iso(x.fecha)!, nota: x.nota, quien: x.creado_por ? quien.get(x.creado_por) ?? null : null })),
        medicamentos: t.medicamentos.map((m) => ({ id: m.id, fecha: fechaBogota(m.fecha), nombre: m.insumo.nombre, unidad: m.insumo.unidad, cantidad: Number(m.cantidad), detalle: m.motivo, anulado: m.anulado })),
      }}
    />
  );
}
