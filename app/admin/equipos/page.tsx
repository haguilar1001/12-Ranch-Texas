import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { formatearCOP, formatearMiles } from "@/lib/dinero/cop";

export const dynamic = "force-dynamic";

const ESTADO_EQUIPO: Record<string, string> = {
  operativo: "bg-ranch-verde/15 text-ranch-verde",
  en_mantenimiento: "bg-amber-100 text-amber-700",
  fuera_servicio: "bg-red-100 text-red-700",
  dado_de_baja: "bg-ranch-marron/10 text-ranch-marron/60",
};

const ESTADO_MANT: Record<string, string> = {
  programado: "bg-ranch-dorado/20 text-ranch-marron",
  en_proceso: "bg-amber-100 text-amber-700",
  realizado: "bg-ranch-verde/15 text-ranch-verde",
  cancelado: "bg-ranch-marron/10 text-ranch-marron/60",
};

export default async function EquiposPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) return <main className="p-6">Sin acceso.</main>;

  const [equipos, categorias, mantenimientos] = await Promise.all([
    prisma.equipo.findMany({
      where: { activo: true },
      include: { categoria: { select: { nombre: true } }, area: { select: { nombre: true } } },
      orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }],
    }),
    prisma.categoriaEquipo.count({ where: { activo: true } }),
    prisma.mantenimientoEquipo.findMany({
      include: { equipo: { select: { nombre: true, codigo: true } } },
      orderBy: [{ fecha_programada: "desc" }],
      take: 20,
    }),
  ]);

  const operativos = equipos.filter((e) => e.estado === "operativo").length;

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-ranch-marron">Equipos</h1>
          <p className="text-sm text-ranch-marron/60">Inventario y mantenimientos</p>
        </div>
        <span className="rounded-full bg-ranch-dorado/20 px-3 py-1 text-xs font-semibold text-ranch-marron">
          Boceto · datos de ejemplo
        </span>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Kpi label="Equipos" valor={formatearMiles(equipos.length)} />
        <Kpi label="Operativos" valor={formatearMiles(operativos)} />
        <Kpi label="Categorías" valor={formatearMiles(categorias)} />
      </div>

      {/* Inventario */}
      <h2 className="mb-2 font-bold text-ranch-marron">Inventario</h2>
      <div className="mb-6 overflow-x-auto rounded-2xl border-2 border-ranch-marron/15 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60 text-xs uppercase text-ranch-marron/60">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Equipo</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Marca / Modelo</th>
              <th className="px-3 py-2">Ubicación</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {equipos.map((e) => (
              <tr key={e.id} className="border-t border-ranch-marron/10">
                <td className="px-3 py-2 font-mono text-xs text-ranch-marron/70">{e.codigo ?? "—"}</td>
                <td className="px-3 py-2 font-semibold text-ranch-marron">{e.nombre}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{e.categoria.nombre}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{[e.marca, e.modelo].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{e.ubicacion ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_EQUIPO[e.estado] ?? ""}`}>{e.estado.replace("_", " ")}</span>
                </td>
              </tr>
            ))}
            {equipos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ranch-marron/50">
                  Aún no hay equipos. Corre <code>npm run seed:boceto</code> para cargar datos de ejemplo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mantenimientos */}
      <h2 className="mb-2 font-bold text-ranch-marron">Mantenimientos</h2>
      <div className="overflow-x-auto rounded-2xl border-2 border-ranch-marron/15 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60 text-xs uppercase text-ranch-marron/60">
            <tr>
              <th className="px-3 py-2">Equipo</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2">Programado</th>
              <th className="px-3 py-2 text-right">Costo</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {mantenimientos.map((m) => (
              <tr key={m.id} className="border-t border-ranch-marron/10">
                <td className="px-3 py-2 font-semibold text-ranch-marron">{m.equipo.nombre}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{m.tipo}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{m.descripcion}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{m.fecha_programada ? m.fecha_programada.toLocaleDateString("es-CO") : "—"}</td>
                <td className="px-3 py-2 text-right text-ranch-marron/70">{formatearCOP(m.costo)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_MANT[m.estado] ?? ""}`}>{m.estado.replace("_", " ")}</span>
                </td>
              </tr>
            ))}
            {mantenimientos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ranch-marron/50">Sin mantenimientos registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-black text-ranch-marron">{valor}</p>
      <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{label}</p>
    </div>
  );
}
