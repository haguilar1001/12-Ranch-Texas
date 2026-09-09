import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { formatearCOP } from "@/lib/dinero/cop";
import { consolidarNomina, costoEmpresa, FACTOR_PRESTACIONAL } from "@/lib/personal/costo";

export const dynamic = "force-dynamic";

const ESTADO_COLOR: Record<string, string> = {
  activo: "bg-ranch-verde/15 text-ranch-verde",
  inactivo: "bg-ranch-marron/10 text-ranch-marron/60",
  retirado: "bg-red-100 text-red-700",
};

export default async function PersonalPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) return <main className="p-6">Sin acceso.</main>;

  const [empleados, areas, cargos] = await Promise.all([
    prisma.empleado.findMany({
      where: { activo: true },
      include: { area: { select: { nombre: true } }, cargo: { select: { nombre: true } } },
      orderBy: { nombre: "asc" },
    }),
    prisma.areaTrabajo.count({ where: { activo: true } }),
    prisma.cargo.count({ where: { activo: true } }),
  ]);

  const costo = consolidarNomina(empleados.map((e) => e.salario_base));

  // Costo por área, para saber dónde pesa la nómina.
  const porArea = new Map<string, { personas: number; costo: number }>();
  for (const e of empleados) {
    const k = e.area?.nombre ?? "Sin área";
    const acc = porArea.get(k) ?? { personas: 0, costo: 0 };
    acc.personas += 1;
    acc.costo += costoEmpresa(e.salario_base ?? 0);
    porArea.set(k, acc);
  }
  const areasOrdenadas = [...porArea.entries()].sort((a, b) => b[1].costo - a[1].costo);

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-ranch-marron">Personal</h1>
          <p className="text-sm text-ranch-marron/60">Empleados, áreas y cargos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-ranch-verde/15 px-3 py-1 text-xs font-semibold text-ranch-verde">
            Nómina real · {empleados.length} personas
          </span>
          <a href="/admin/personal/xlsx" className="rounded-lg bg-ranch-verde px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            ⬇️ Excel para completar
          </a>
        </div>
      </div>

      {/* Los tres valores de la nómina: lo que se paga, lo que cuesta encima, y el total. */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Salarios" valor={formatearCOP(costo.salarios)} />
        <Kpi label={`Carga prestacional (+${FACTOR_PRESTACIONAL * 100}%)`} valor={formatearCOP(costo.carga)} />
        <Kpi label="Total nómina / mes" valor={formatearCOP(costo.total)} destacado />
      </div>

      <p className="mb-6 rounded-lg bg-ranch-crema/60 px-3 py-2 text-xs text-ranch-marron/70">
        {empleados.length} empleados en {areas} áreas. En Colombia un empleado vale <strong>1,5 veces su
        sueldo</strong>: sobre el salario van prestaciones, seguridad social a cargo del empleador y
        parafiscales.
        {costo.personas < empleados.length && (
          <> {empleados.length - costo.personas} empleado(s) sin salario cargado no entran en el cálculo.</>
        )}
      </p>

      <h2 className="mb-2 font-bold text-ranch-marron">Costo por área</h2>
      <div className="mb-6 overflow-x-auto rounded-2xl border-2 border-ranch-marron/15 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60 text-xs uppercase text-ranch-marron/60">
            <tr>
              <th className="px-3 py-2">Área</th>
              <th className="px-3 py-2 text-right">Personas</th>
              <th className="px-3 py-2 text-right">Costo real / mes</th>
              <th className="px-3 py-2 text-right">Participación</th>
            </tr>
          </thead>
          <tbody>
            {areasOrdenadas.map(([nombre, d]) => (
              <tr key={nombre} className="border-t border-ranch-marron/10">
                <td className="px-3 py-2 font-semibold text-ranch-marron">{nombre}</td>
                <td className="px-3 py-2 text-right text-ranch-marron/70">{d.personas}</td>
                <td className="px-3 py-2 text-right font-bold text-ranch-marron">{formatearCOP(d.costo)}</td>
                <td className="px-3 py-2 text-right text-ranch-marron/55">
                  {costo.total > 0 ? ((d.costo / costo.total) * 100).toFixed(1) : "0.0"}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-2xl border-2 border-ranch-marron/15 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60 text-xs uppercase text-ranch-marron/60">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Documento</th>
              <th className="px-3 py-2">Cargo</th>
              <th className="px-3 py-2">Área</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2 text-right">Costo real</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {empleados.map((e) => (
              <tr key={e.id} className="border-t border-ranch-marron/10">
                <td className="px-3 py-2 font-semibold text-ranch-marron">{e.nombre}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{e.tipo_documento} {e.documento}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{e.cargo?.nombre ?? "—"}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{e.area?.nombre ?? "—"}</td>
                <td className="px-3 py-2 text-ranch-marron/70">{e.unidad_negocio ?? "—"}</td>
                <td className="px-3 py-2 text-right text-ranch-marron/70">
                  {e.salario_base ? formatearCOP(costoEmpresa(e.salario_base)) : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_COLOR[e.estado] ?? ""}`}>{e.estado}</span>
                </td>
              </tr>
            ))}
            {empleados.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ranch-marron/50">
                  Aún no hay empleados. Corre <code>npm run import:personal</code> para cargar la nómina.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Kpi({ label, valor, destacado }: { label: string; valor: number | string; destacado?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 bg-white p-4 text-center shadow-sm ${destacado ? "border-ranch-dorado" : "border-ranch-marron/15"}`}>
      <p className="text-xl font-black text-ranch-marron sm:text-2xl">{valor}</p>
      <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{label}</p>
    </div>
  );
}
