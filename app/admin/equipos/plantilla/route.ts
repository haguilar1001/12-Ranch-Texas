import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import { construirPlantillaEquipos } from "@/lib/equipos/plantilla";

// Plantilla para la carga masiva de equipos. Se arma en el momento con los grupos, áreas,
// empleados y proveedores que hay en la app, así las listas desplegables siempre están al día.
// Se vuelve a subir en Equipos → Cargar Excel (lee esta misma hoja EQUIPOS).
export async function GET() {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "supervisor")) return new Response("No autorizado", { status: 401 });

  const nombres = { select: { nombre: true }, orderBy: { nombre: "asc" as const } };
  const [grupos, areas, empleados, proveedores] = await Promise.all([
    prisma.categoriaEquipo.findMany({ where: { activo: true }, ...nombres }),
    prisma.areaTrabajo.findMany({ where: { activo: true }, ...nombres }),
    prisma.empleado.findMany({ where: { activo: true }, ...nombres }),
    prisma.proveedor.findMany({ where: { activo: true }, ...nombres }),
  ]);
  const n = (xs: { nombre: string }[]) => xs.map((x) => x.nombre);

  const buffer = await construirPlantillaEquipos({
    grupos: n(grupos), areas: n(areas), empleados: n(empleados), proveedores: n(proveedores), fecha: fechaBogota(),
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Plantilla equipos ${fechaBogota()}.xlsx"`,
    },
  });
}
