import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { formatearFechaHoraCortaBogota } from "@/lib/tiempo";
import BuscadorForm from "./BuscadorForm";
import ClientesClient from "./ClientesClient";

export const dynamic = "force-dynamic";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores pueden ver el catálogo de clientes.</p></main>;
  }

  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const soloDigitos = q.replace(/\D/g, "");

  const total = await prisma.cliente.count();
  const clientes = await prisma.cliente.findMany({
    where: q
      ? {
          OR: [
            { nombre: { contains: q, mode: "insensitive" } },
            { documento: { contains: q, mode: "insensitive" } },
            { razon_social: { contains: q, mode: "insensitive" } },
            { nit: { contains: q, mode: "insensitive" } },
            ...(soloDigitos.length >= 3 ? [{ celular: { contains: soloDigitos } }] : []),
          ],
        }
      : undefined,
    orderBy: { actualizado_en: "desc" },
    take: 100,
    select: {
      id: true, nombre: true, celular: true, documento: true, email: true,
      razon_social: true, nit: true, activo: true, actualizado_en: true,
      _count: { select: { ventas: true } },
    },
  });

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-black text-ranch-marron">Clientes</h1>
      <p className="mb-4 text-sm text-ranch-marron/60">
        Perfil de cada comprador, identificado por celular (ver <code>decisiones.md</code>). Se alimenta solo desde
        taquilla; aquí se corrige un dato mal capturado o se desactiva un duplicado.
      </p>

      <BuscadorForm q={q} />

      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-ranch-marron">
          {q ? `${clientes.length} resultado(s) de ${total}` : `${clientes.length} de ${total} cliente(s)`}
          {!q && clientes.length === 100 && " (los 100 más recientes; busca para filtrar)"}
        </h2>
        <ClientesClient clientes={clientes.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          celular: c.celular,
          documento: c.documento,
          email: c.email,
          razon_social: c.razon_social,
          nit: c.nit,
          activo: c.activo,
          ventas: c._count.ventas,
          actualizado: formatearFechaHoraCortaBogota(c.actualizado_en),
        }))} />
      </section>
    </main>
  );
}
