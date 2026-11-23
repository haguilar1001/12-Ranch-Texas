import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import { LINEAS_SOLO_TAQUILLA } from "@/lib/ventas-otras/validar";
import VentasOtrasClient from "./VentasOtrasClient";

export const dynamic = "force-dynamic";

export default async function VentasOtrasPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores/administradores.</p></main>;
  }

  const hoy = fechaBogota();
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : hoy.slice(0, 7);
  const [a, m] = mes.split("-").map(Number);
  const desde = new Date(Date.UTC(a, m - 1, 1));
  const hasta = new Date(Date.UTC(a, m, 1));

  const [historicas, otras, ventas] = await Promise.all([
    prisma.ventaHistorica.findMany({ distinct: ["producto"], select: { producto: true } }),
    prisma.ventaOtra.findMany({ distinct: ["linea"], select: { linea: true } }),
    prisma.ventaOtra.findMany({ where: { fecha: { gte: desde, lt: hasta } }, orderBy: [{ fecha: "desc" }, { creado_en: "desc" }] }),
  ]);
  const excluidas = new Set<string>(LINEAS_SOLO_TAQUILLA);
  const lineas = [...new Set([...historicas.map((h) => h.producto), ...otras.map((o) => o.linea)])]
    .filter((l) => !excluidas.has(l))
    .sort();

  const ids = [...new Set(ventas.flatMap((v) => [v.creado_por, v.anulada_por]).filter((x): x is string => !!x))];
  const usuarios = new Map(
    (await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]),
  );

  return (
    <VentasOtrasClient
      hoy={hoy}
      mes={mes}
      lineas={lineas}
      ventas={ventas.map((v) => ({
        id: v.id,
        fecha: v.fecha.toISOString().slice(0, 10),
        linea: v.linea,
        valor: v.valor,
        descripcion: v.descripcion,
        estado: v.estado,
        creadoPor: v.creado_por ? usuarios.get(v.creado_por) ?? "—" : "—",
        motivoAnulacion: v.motivo_anulacion,
        anuladaPor: v.anulada_por ? usuarios.get(v.anulada_por) ?? "—" : null,
      }))}
    />
  );
}
