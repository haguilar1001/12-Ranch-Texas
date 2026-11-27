import { redirect } from "next/navigation";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { DEFS, TIPOS_CATALOGO } from "@/lib/catalogos/importar";
import { TIPOS_ARCHIVO } from "@/lib/importar/tipos";
import SubirClient from "./SubirClient";

export const dynamic = "force-dynamic";

// "Subir archivos": un solo lugar para cargar cualquier cosa desde Excel (equipos y catálogos) y
// el acceso a los archivos financieros. Cada carga se revisa antes de guardar.
export default async function SubirPage({ searchParams }: { searchParams: Promise<{ que?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden subir archivos.</p></main>;
  }
  const { que } = await searchParams;
  return (
    <SubirClient
      inicial={que}
      catalogos={TIPOS_CATALOGO.map((t) => ({ tipo: t, titulo: DEFS[t].titulo, columnas: DEFS[t].columnas.map((c) => c.titulo + (c.obligatoria ? " *" : "")) }))}
      financieros={tieneRol(s.rol, "administrador") ? Object.values(TIPOS_ARCHIVO).map((t) => t.nombre) : null}
    />
  );
}
