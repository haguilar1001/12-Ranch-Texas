import { redirect } from "next/navigation";
import Link from "next/link";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { estadoDeCajas, tiempoAbierto, type CajaEnEstado } from "@/lib/caja/estado";
import { fechaBogota, formatearFechaHoraBogota } from "@/lib/tiempo";
import { formatearCOP } from "@/lib/dinero/cop";

export const dynamic = "force-dynamic";

/** Solo la hora: "10:35 a. m.". La fecha ya está en el título de la pantalla. */
function soloHora(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" }).format(d);
}

function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(`${iso}T12:00:00-05:00`));
}

function Kpi({ label, valor, sub, alerta }: { label: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 bg-white p-4 ${alerta ? "border-red-300" : "border-ranch-marron/15"}`}>
      <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{label}</p>
      <p className={`mt-1 text-2xl font-black ${alerta ? "text-red-600" : "text-ranch-marron"}`}>{valor}</p>
      {sub && <p className="text-xs text-ranch-marron/50">{sub}</p>}
    </div>
  );
}

/** Enlaces a lo que se puede hacer con esa caja sin tener turno propio. */
function Acciones({ c }: { c: CajaEnEstado }) {
  const boton = "rounded border border-ranch-marron/25 px-2 py-0.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60";
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Link href={`/caja/ventas?turno=${c.turnoId}`} className={boton}>Ventas</Link>
      <Link href={`/caja/cuadre/${c.turnoId}`} className={boton}>Cuadre</Link>
    </div>
  );
}

export default async function EstadoCajasPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return (
      <main className="p-6">
        <p className="rounded bg-red-50 px-4 py-3 text-red-700">
          Solo supervisores y administradores pueden ver el estado de las cajas.
        </p>
      </main>
    );
  }

  const hoy = fechaBogota();
  const desde = new Date(`${hoy}T00:00:00-05:00`);
  const hasta = new Date(desde.getTime() + 24 * 3600_000);
  const e = await estadoDeCajas(desde, hasta);
  const ahora = new Date();

  const celda = "px-3 py-2";
  const th = "px-3 py-2 text-xs font-bold uppercase text-ranch-marron/55";

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="text-2xl font-black text-ranch-marron">Estado de las cajas</h1>
      <p className="mb-4 text-sm capitalize text-ranch-marron/60">{fechaLarga(hoy)}</p>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Cajas abiertas"
          valor={String(e.abiertas.length)}
          sub={e.cerradas.length > 0 ? `${e.cerradas.length} ya cerró` : undefined}
        />
        <Kpi label="Vendido hoy" valor={formatearCOP(e.totalVentas)} sub={`${e.totalVentasCount} ventas · ${e.totalAsistentes} personas`} />
        <Kpi
          label="Efectivo en cajones"
          valor={formatearCOP(e.efectivoEnCajones)}
          sub={e.abiertas.length > 0 ? "lo que debería haber ahora" : "no hay cajas abiertas"}
        />
        {/* Una diferencia al cierre es lo primero que hay que mirar: se marca en rojo. */}
        <Kpi
          label="Diferencias al cerrar"
          valor={e.cerradas.length === 0 ? "—" : formatearCOP(e.diferenciaCerradas)}
          sub={
            e.cerradas.length === 0
              ? "aún no cierra ninguna"
              : e.cerradasConDiferencia === 0
                ? "todas cuadraron"
                : `${e.cerradasConDiferencia} sin cuadrar`
          }
          alerta={e.cerradasConDiferencia > 0}
        />
      </div>

      {/* ------------------------------------------------------------ abiertas */}
      <section className="mb-5 overflow-hidden rounded-2xl border-2 border-ranch-marron/20 bg-white">
        <h2 className="bg-ranch-marron px-4 py-2 font-bold text-ranch-crema">
          Abiertas ahora ({e.abiertas.length})
        </h2>
        {e.abiertas.length === 0 ? (
          <p className="px-4 py-8 text-center text-ranch-marron/50">
            Ninguna caja abierta. Nadie puede vender hasta que un cajero abra su turno.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="border-b border-ranch-marron/15 bg-ranch-crema/50">
                <tr>
                  <th className={th}>Caja</th>
                  <th className={th}>Desde</th>
                  <th className={`${th} text-right`}>Base</th>
                  <th className={`${th} text-right`}>Ventas</th>
                  <th className={`${th} text-right`}>Personas</th>
                  <th className={`${th} text-right`}>Vendido</th>
                  <th className={`${th} text-right`}>Efectivo esperado</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {e.abiertas.map((c) => (
                  <tr key={c.turnoId} className="border-b border-ranch-marron/10 last:border-0">
                    <td className={celda}>
                      <span className="font-bold uppercase text-ranch-marron">{c.caja}</span>
                      {c.estado === "reabierto" && (
                        <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                          reabierto
                        </span>
                      )}
                      <span className="block text-xs uppercase text-ranch-marron/50">{c.cajero}</span>
                    </td>
                    <td className={celda}>
                      <span className="text-ranch-marron/80">{soloHora(c.abierto_en)}</span>
                      <span className="block text-xs text-ranch-marron/45">hace {tiempoAbierto(c.abierto_en, ahora)}</span>
                    </td>
                    <td className={`${celda} text-right tabular-nums text-ranch-marron/70`}>{formatearCOP(c.base)}</td>
                    <td className={`${celda} text-right tabular-nums text-ranch-marron/70`}>
                      {c.numVentas}
                      {c.anuladas > 0 && <span className="block text-xs text-red-600">{c.anuladas} anulada{c.anuladas > 1 ? "s" : ""}</span>}
                    </td>
                    <td className={`${celda} text-right tabular-nums text-ranch-marron/70`}>{c.asistentes}</td>
                    <td className={`${celda} text-right font-bold tabular-nums text-ranch-marron`}>{formatearCOP(c.totalVentas)}</td>
                    <td className={`${celda} text-right font-bold tabular-nums text-ranch-verde`}>{formatearCOP(c.esperadoEfectivo)}</td>
                    <td className={celda}><Acciones c={c} /></td>
                  </tr>
                ))}
                <tr className="bg-ranch-crema/60 font-bold text-ranch-marron">
                  <td className={celda} colSpan={5}>Total abiertas</td>
                  <td className={`${celda} text-right tabular-nums`}>
                    {formatearCOP(e.abiertas.reduce((a, c) => a + c.totalVentas, 0))}
                  </td>
                  <td className={`${celda} text-right tabular-nums`}>{formatearCOP(e.efectivoEnCajones)}</td>
                  <td className={celda}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {e.abiertas.length > 0 && (
          <p className="border-t border-ranch-marron/10 px-4 py-2 text-xs text-ranch-marron/55">
            El efectivo esperado es base + ventas en efectivo + ingresos − egresos. Lo que no es efectivo
            (datáfono, transferencias, prepagado) no está en el cajón.
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------ cerradas */}
      {e.cerradas.length > 0 && (
        <section className="overflow-hidden rounded-2xl border-2 border-ranch-marron/20 bg-white">
          <h2 className="bg-ranch-marron/10 px-4 py-2 font-bold text-ranch-marron">
            Cerradas hoy ({e.cerradas.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="border-b border-ranch-marron/15 bg-ranch-crema/50">
                <tr>
                  <th className={th}>Caja</th>
                  <th className={th}>Horario</th>
                  <th className={`${th} text-right`}>Ventas</th>
                  <th className={`${th} text-right`}>Vendido</th>
                  <th className={`${th} text-right`}>Esperado</th>
                  <th className={`${th} text-right`}>Contado</th>
                  <th className={`${th} text-right`}>Diferencia</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {e.cerradas.map((c) => {
                  const dif = c.diferencia ?? 0;
                  return (
                    <tr key={c.turnoId} className="border-b border-ranch-marron/10 last:border-0">
                      <td className={celda}>
                        <span className="font-bold uppercase text-ranch-marron">{c.caja}</span>
                        <span className="block text-xs uppercase text-ranch-marron/50">{c.cajero}</span>
                      </td>
                      <td className={`${celda} text-ranch-marron/70`}>
                        {soloHora(c.abierto_en)} → {c.cerrado_en ? soloHora(c.cerrado_en) : "—"}
                      </td>
                      <td className={`${celda} text-right tabular-nums text-ranch-marron/70`}>{c.numVentas}</td>
                      <td className={`${celda} text-right tabular-nums text-ranch-marron`}>{formatearCOP(c.totalVentas)}</td>
                      <td className={`${celda} text-right tabular-nums text-ranch-marron/70`}>{formatearCOP(c.esperadoEfectivo)}</td>
                      <td className={`${celda} text-right tabular-nums text-ranch-marron/70`}>
                        {c.contado === null ? "—" : formatearCOP(c.contado)}
                      </td>
                      {/* Sobrante y faltante se ven distinto: uno se investiga, el otro se cobra. */}
                      <td className={`${celda} text-right font-bold tabular-nums ${dif === 0 ? "text-ranch-verde" : dif > 0 ? "text-amber-600" : "text-red-600"}`}>
                        {dif === 0 ? "cuadra" : formatearCOP(dif)}
                      </td>
                      <td className={celda}><Acciones c={c} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/cuadre" className="rounded-lg border border-ranch-marron/25 px-3 py-1.5 font-semibold text-ranch-marron hover:bg-white">
          💰 Cuadre diario consolidado
        </Link>
        <Link href="/admin/reportes/cierre" className="rounded-lg border border-ranch-marron/25 px-3 py-1.5 font-semibold text-ranch-marron hover:bg-white">
          📄 Cierre del día
        </Link>
      </div>
      <p className="mt-3 text-xs text-ranch-marron/45">
        Esta pantalla solo consulta: no abre, no cierra y no mueve nada. Recárgala para ver el último estado.
      </p>
    </main>
  );
}
