import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";

// Descarga el archivo original tal como se subió. Solo administrador: el presupuesto, por ejemplo,
// trae la nómina con nombres y salarios.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "administrador")) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  const a = await prisma.archivoCargado.findUnique({ where: { id }, select: { nombre: true, mime: true, contenido: true } });
  if (!a) return new Response("No existe", { status: 404 });
  return new Response(Buffer.from(a.contenido), {
    headers: {
      "Content-Type": a.mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.nombre)}`,
    },
  });
}
