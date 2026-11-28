import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import { proximoVencimiento, type TipoMovInsumo } from "@/lib/granja/insumos";
import InsumosClient from "./InsumosClient";

export const dynamic = "force-dynamic";

// Insumos de la granja: aseo, desinfección, venenos de fumigación y medicamentos, con su kardex.
export default async function InsumosPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!puedeOperarGranja(s.rol)) return <main className="p-6">Sin acceso.</main>;
  const { cat } = await searchParams;
  const hoy = fechaBogota();

  const [insumos, proveedores] = await Promise.all([
    prisma.insumoGranja.findMany({
      orderBy: [{ activo: "desc" }, { categoria: "asc" }, { nombre: "asc" }],
      include: {
        movimientos: {
          orderBy: [{ fecha: "desc" }, { creado_en: "desc" }], take: 60,
          include: { proveedor: { select: { nombre: true } }, fumigacion: { select: { zona: true, recinto: { select: { nombre: true } } } } },
        },
      },
    }),
    prisma.proveedor.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  const usuarios = new Map((await prisma.usuario.findMany({ select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]));
  const d = (x: Date | null) => (x ? fechaBogota(x) : null);

  return (
    <InsumosClient
      hoy={hoy}
      catInicial={cat}
      esSupervisor={tieneRol(s.rol, "supervisor")}
      proveedores={proveedores}
      insumos={insumos.map((i) => {
        const movs = i.movimientos.map((m) => ({
          id: m.id, tipo: m.tipo as TipoMovInsumo, cantidad: Number(m.cantidad), fecha: d(m.fecha)!, motivo: m.motivo, valor: m.valor,
          proveedor: m.proveedor?.nombre ?? null, lote: m.lote, vencimiento: d(m.vencimiento), anulado: m.anulado, motivo_anulacion: m.motivo_anulacion,
          de_fumigacion: !!m.fumigacion_id, donde: m.fumigacion ? m.fumigacion.recinto?.nombre ?? m.fumigacion.zona : null,
          quien: m.creado_por ? usuarios.get(m.creado_por) ?? null : null,
        }));
        return {
          id: i.id, nombre: i.nombre, codigo: i.codigo, categoria: i.categoria, unidad: i.unidad, activo: i.activo,
          existencia: Number(i.existencia), stock_minimo: i.stock_minimo === null ? null : Number(i.stock_minimo), observaciones: i.observaciones,
          vence: proximoVencimiento(movs, hoy), movimientos: movs,
        };
      })}
    />
  );
}
