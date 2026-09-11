import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { turnoAbiertoDe } from "@/lib/caja/turno";
import { formatearCOP } from "@/lib/dinero/cop";
import { formatearFechaHoraCortaBogota } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

/**
 * Las ventas del turno abierto: para consultarlas, reimprimirlas y —si eres
 * supervisor— corregirlas. El cajero ve las suyas; el supervisor, además, puede
 * mirar cualquier turno abierto pasando ?turno=<id>.
 */
export default async function VentasDelTurnoPage({
  searchParams,
}: {
  searchParams: Promise<{ turno?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!["cajero", "supervisor", "administrador"].includes(s.rol)) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Tu rol no tiene acceso a las ventas de caja.</p></main>;
  }

  const esSupervisor = tieneRol(s.rol, "supervisor");
  const sp = await searchParams;

  // Un supervisor puede mirar otro turno; cualquiera ve el suyo.
  const turnoId = sp.turno && esSupervisor ? sp.turno : (await turnoAbiertoDe(s.id))?.id;
  const turno = turnoId
    ? await prisma.turnoCaja.findUnique({
        where: { id: turnoId },
        include: { caja: { select: { nombre: true } }, usuario: { select: { nombre: true } } },
      })
    : null;

  // Un supervisor puede estar sin turno propio y aun así necesitar corregir.
  const turnosAbiertos = esSupervisor
    ? await prisma.turnoCaja.findMany({
        where: { estado: { in: ["abierto", "reabierto"] } },
        include: { caja: { select: { nombre: true } }, usuario: { select: { nombre: true } } },
        orderBy: { abierto_en: "asc" },
      })
    : [];

  if (!turno) {
    return (
      <main className="mx-auto max-w-3xl p-4">
        <h1 className="mb-2 text-2xl font-black text-ranch-marron">Ventas del turno</h1>
        {turnosAbiertos.length > 0 ? (
          <>
            <p className="mb-3 text-sm text-ranch-marron/70">No tienes turno propio abierto. Turnos abiertos ahora:</p>
            <ul className="space-y-2">
              {turnosAbiertos.map((t) => (
                <li key={t.id}>
                  <Link href={`/caja/ventas?turno=${t.id}`} className="block rounded-xl border-2 border-ranch-marron/15 bg-white px-4 py-3 hover:border-ranch-dorado">
                    <span className="font-semibold text-ranch-marron">{t.caja.nombre}</span>
                    <span className="text-ranch-marron/60"> · {t.usuario?.nombre}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="mb-4 text-ranch-marron/70">No hay ningún turno de caja abierto.</p>
            <Link href="/caja/turno" className="inline-block rounded-lg bg-ranch-marron px-5 py-3 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro">
              Abrir turno →
            </Link>
          </>
        )}
      </main>
    );
  }

  const cajeroTurno = turno.usuario?.nombre ?? s.nombre;

  const ventas = await prisma.venta.findMany({
    where: { turno_id: turno.id },
    include: {
      usuario: { select: { nombre: true } },
      correccion: { select: { numero_venta: true } },
      corrige: { select: { numero_venta: true } },
    },
    orderBy: { numero_venta: "desc" },
  });

  const completadas = ventas.filter((v) => v.estado !== "anulada");
  const recaudado = completadas.reduce((a, v) => a + v.total_cobrado, 0);
  const asistentes = completadas.reduce((a, v) => a + v.cantidad_asistentes, 0);

  return (
    <main className="mx-auto max-w-5xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-black text-ranch-marron">Ventas del turno</h1>
        <p className="rounded-full bg-white px-3 py-1 text-sm text-ranch-marron/70 ring-1 ring-ranch-marron/10">
          🏛️ {turno.caja.nombre} · 👤 {cajeroTurno}
        </p>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border-2 border-ranch-marron/15 bg-white p-3 text-center">
          <p className="text-xs text-ranch-marron/60">Ventas</p>
          <p className="text-lg font-black text-ranch-marron">{completadas.length}</p>
        </div>
        <div className="rounded-xl border-2 border-ranch-marron/15 bg-white p-3 text-center">
          <p className="text-xs text-ranch-marron/60">Recaudado</p>
          <p className="text-lg font-black text-ranch-marron">{formatearCOP(recaudado)}</p>
        </div>
        <div className="rounded-xl border-2 border-ranch-marron/15 bg-white p-3 text-center">
          <p className="text-xs text-ranch-marron/60">Asistentes</p>
          <p className="text-lg font-black text-ranch-marron">{asistentes}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border-2 border-ranch-marron/15 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ranch-crema/60 text-xs uppercase text-ranch-marron/60">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Hora</th>
              <th className="px-3 py-2">Comprador</th>
              <th className="px-3 py-2 text-right">Asist.</th>
              <th className="px-3 py-2 text-right">Cobrado</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => {
              const anulada = v.estado === "anulada";
              return (
                <tr key={v.id} className={`border-t border-ranch-marron/10 ${anulada ? "opacity-55" : ""}`}>
                  <td className="px-3 py-2 font-bold text-ranch-marron">#{v.numero_venta}</td>
                  <td className="px-3 py-2 text-xs text-ranch-marron/60">{formatearFechaHoraCortaBogota(v.creado_en)}</td>
                  <td className="px-3 py-2 text-ranch-marron/70">
                    {v.comprador_nombre || <span className="text-ranch-marron/35">—</span>}
                    {v.corrige && <span className="block text-[11px] text-ranch-marron/45">corrige la #{v.corrige.numero_venta}</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{v.cantidad_asistentes}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${anulada ? "text-ranch-marron/50 line-through" : "text-ranch-marron"}`}>
                    {formatearCOP(v.total_cobrado)}
                  </td>
                  <td className="px-3 py-2">
                    {anulada ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {v.correccion ? `Corregida → #${v.correccion.numero_venta}` : "Anulada"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-ranch-verde/15 px-2 py-0.5 text-xs font-semibold text-ranch-verde">Completada</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Link href={`/imprimir/venta/${v.id}`} className="rounded border border-ranch-marron/25 px-2 py-0.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60">
                        Ver
                      </Link>
                      {!anulada && esSupervisor && (
                        <Link href={`/taquilla?corrige=${v.id}`} className="rounded bg-ranch-dorado px-2 py-0.5 text-xs font-semibold text-white hover:opacity-90">
                          ✏️ Corregir
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {ventas.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-ranch-marron/50">Este turno todavía no tiene ventas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-ranch-marron/50">
        {esSupervisor
          ? "Corregir anula la venta original con sus manillas y crea una nueva en el mismo turno. Ambas quedan en el historial y en la auditoría; si ya se imprimieron manillas, hay que recogerlas."
          : "Para corregir una venta necesitas a un supervisor: él la anula y la vuelve a hacer con los datos buenos."}
      </p>
    </main>
  );
}
