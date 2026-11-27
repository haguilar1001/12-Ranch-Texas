import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import { DEFS, esTipoCatalogo } from "@/lib/catalogos/importar";
import { construirPlantillaCatalogo } from "@/lib/catalogos/plantilla";
import { filasActuales } from "@/lib/catalogos/carga-bd";

// Plantilla de carga de un catálogo (/admin/catalogos/plantilla/proveedores…). Con ?datos=1 sale
// con lo que hay hoy en la app, para corregirlo en Excel y volver a subirlo.
export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "supervisor")) return new Response("No autorizado", { status: 401 });
  const { tipo } = await params;
  if (!esTipoCatalogo(tipo)) return new Response("Catálogo no existe", { status: 404 });
  const conDatos = new URL(req.url).searchParams.get("datos") === "1";

  const proveedores = (await prisma.proveedor.findMany({ where: { activo: true }, select: { nombre: true }, orderBy: { nombre: "asc" } })).map((p) => p.nombre);
  const buffer = await construirPlantillaCatalogo(tipo, { proveedores, fecha: fechaBogota(), filas: conDatos ? await filasActuales(tipo) : undefined });
  const nombre = `${conDatos ? "Catálogo" : "Plantilla"} ${DEFS[tipo].titulo.toLowerCase()} ${fechaBogota()}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    },
  });
}
