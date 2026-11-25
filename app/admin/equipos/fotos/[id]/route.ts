import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";

// Foto de evidencia de una falla u orden de mantenimiento. La ven el supervisor y quien la subió.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  const f = await prisma.fotoMantenimiento.findUnique({ where: { id }, select: { mime: true, contenido: true, creado_por: true } });
  if (!f) return new Response("No existe", { status: 404 });
  if (!tieneRol(s.rol, "supervisor") && f.creado_por !== s.id) return new Response("No autorizado", { status: 403 });
  return new Response(Buffer.from(f.contenido), { headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=86400" } });
}
