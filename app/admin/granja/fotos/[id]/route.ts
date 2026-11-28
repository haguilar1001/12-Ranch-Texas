import { prisma } from "@/lib/db";
import { obtenerSesion, puedeOperarGranja } from "@/lib/auth/sesion";

// Foto de evidencia de la granja (fumigaciones). La ve quien opera la granja (supervisor en adelante incluido).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s || !puedeOperarGranja(s.rol)) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  const f = await prisma.fotoGranja.findUnique({ where: { id }, select: { mime: true, contenido: true } });
  if (!f) return new Response("No existe", { status: 404 });
  return new Response(Buffer.from(f.contenido), { headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=86400" } });
}
