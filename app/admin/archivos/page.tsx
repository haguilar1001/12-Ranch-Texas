import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { TIPOS_ARCHIVO } from "@/lib/importar/tipos";
import ArchivosClient from "./ArchivosClient";

export const dynamic = "force-dynamic";

export default async function ArchivosPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "administrador")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo el administrador.</p></main>;
  }
  const { ver } = await searchParams;
  const todos = ver === "todos";

  const archivos = await prisma.archivoCargado.findMany({
    where: todos ? {} : { estado: "procesado" },
    orderBy: [{ tipo: "asc" }, { anio: "desc" }, { mes: "desc" }, { creado_en: "desc" }],
    select: { id: true, tipo: true, nombre: true, tamano: true, anio: true, mes: true, estado: true, resumen: true, creado_en: true, creado_por: true, motivo_anulacion: true },
    take: 300,
  });
  const ids = [...new Set(archivos.map((a) => a.creado_por).filter((x): x is string => !!x))];
  const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]));

  return (
    <ArchivosClient
      todos={todos}
      tipos={Object.entries(TIPOS_ARCHIVO).map(([id, t]) => ({ id, ...t }))}
      archivos={archivos.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        nombre: a.nombre,
        tamano: a.tamano,
        anio: a.anio,
        mes: a.mes,
        estado: a.estado,
        resumen: (a.resumen ?? {}) as Record<string, unknown>,
        cargado: a.creado_en.toISOString(),
        cargadoPor: a.creado_por ? usuarios.get(a.creado_por) ?? "—" : "—",
        motivo: a.motivo_anulacion,
      }))}
    />
  );
}
