import { Fragment } from "react";
import { redirect } from "next/navigation";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { fechaBogota } from "@/lib/tiempo";
import { programacionDelDia, type PedidoDelDia } from "@/lib/eventos/cotizaciones";

export const dynamic = "force-dynamic";

/** "domingo, 13 de septiembre de 2026" a partir de un YYYY-MM-DD. */
function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00-05:00`));
}

/** "1 unidad" / "24 unidades": una sola cosa no va en plural. */
function unidadDe(cantidad: number, unidad: "personas" | "unidades"): string {
  if (cantidad !== 1) return unidad;
  return unidad === "personas" ? "persona" : "unidad";
}

/**
 * Agrupa los pedidos por hora. La hoja se lee POR HORA y no por evento: a la una
 * de la tarde puede haber que sacar el almuerzo de un grupo y el refrigerio de
 * otro, y eso se atiende junto. Los que no tienen hora van al final, a la vista.
 */
function porHora(pedidos: PedidoDelDia[]): { hora: string | null; pedidos: PedidoDelDia[] }[] {
  const bloques: { hora: string | null; pedidos: PedidoDelDia[] }[] = [];
  for (const p of pedidos) {
    const ultimo = bloques[bloques.length - 1];
    if (ultimo && ultimo.hora === p.hora) ultimo.pedidos.push(p);
    else bloques.push({ hora: p.hora, pedidos: [p] });
  }
  return bloques;
}

export default async function EventosDelDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "consulta")) {
    return (
      <main className="p-6">
        <p className="rounded bg-red-50 px-4 py-3 text-red-700">Tu rol no tiene acceso a los eventos del día.</p>
      </main>
    );
  }

  const { fecha } = await searchParams;
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") ? fecha! : fechaBogota();
  const r = await programacionDelDia(dia);

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ranch-marron">Eventos del día</h1>
          <p className="text-sm capitalize text-ranch-marron/60">{fechaLarga(dia)}</p>
        </div>
        {/* Un GET: la fecha queda en la URL y se puede compartir o volver a ella. */}
        <form className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ranch-marron/60">
            Ver otro día
            <input
              type="date"
              name="fecha"
              defaultValue={dia}
              className="rounded-lg border border-ranch-marron/25 px-3 py-2 text-sm text-ranch-marron"
            />
          </label>
          <button className="rounded-lg bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro">
            Ver
          </button>
        </form>
      </div>

      {!r.ok ? (
        <div className={`rounded-2xl border-2 px-4 py-4 ${r.configurar ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
          <p className={`font-semibold ${r.configurar ? "text-amber-800" : "text-red-700"}`}>{r.error}</p>
          <p className={`mt-1 text-sm ${r.configurar ? "text-amber-700" : "text-red-600"}`}>
            {r.configurar
              ? "Los eventos los arma la app de Cotizaciones; falta apuntar a ella."
              : "No se muestra nada a propósito: una programación vieja presentada como la de hoy es peor que ninguna."}
          </p>
        </div>
      ) : r.datos.eventos.length === 0 ? (
        <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white px-4 py-8 text-center">
          <p className="text-lg font-semibold text-ranch-marron/70">No hay eventos programados para este día.</p>
        </div>
      ) : (
        <>
          {/* Quién llega */}
          <section className="mb-5 overflow-hidden rounded-2xl border-2 border-ranch-marron/20 bg-white">
            <div className="flex items-center justify-between bg-ranch-marron px-4 py-2 text-ranch-crema">
              <h2 className="font-bold">
                {r.datos.eventos.length} {r.datos.eventos.length === 1 ? "evento" : "eventos"}
              </h2>
              <span className="text-sm">{r.datos.personas.toLocaleString("es-CO")} personas</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ranch-marron/15 text-left text-xs font-semibold uppercase text-ranch-marron/50">
                  <th className="px-4 py-2">Llega</th>
                  <th className="px-4 py-2">Evento</th>
                  <th className="px-4 py-2 text-right">Personas</th>
                  <th className="px-4 py-2">Salón</th>
                </tr>
              </thead>
              <tbody>
                {r.datos.eventos.map((e) => (
                  <tr key={e.codigo} className="border-b border-ranch-marron/10 last:border-0">
                    <td className="px-4 py-2 font-bold tabular-nums text-ranch-marron">{e.hora ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className="font-bold uppercase text-ranch-marron">{e.responsable}</span>
                      <span className="block text-xs text-ranch-marron/50">
                        {e.codigo}
                        {e.tipo ? ` · ${e.tipo}` : ""}
                        {e.cliente !== e.responsable ? ` · ${e.cliente}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-ranch-marron">{e.personas}</td>
                    <td className="px-4 py-2 text-ranch-marron/70">{e.salones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Qué hay que sacar, hora por hora */}
          {r.datos.pedidos.length > 0 && (
            <section className="mb-5 overflow-hidden rounded-2xl border-2 border-ranch-marron/20 bg-white">
              <h2 className="bg-ranch-marron px-4 py-2 font-bold text-ranch-crema">
                Programación del día{r.datos.entidad ? ` · ${r.datos.entidad.nombre}` : ""}
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  {porHora(r.datos.pedidos).map((bloque, i) => (
                    <Fragment key={`${bloque.hora ?? "sin"}-${i}`}>
                      <tr className="bg-ranch-crema/50">
                        <td colSpan={3} className="px-4 py-1 text-xs font-black uppercase tracking-wide text-ranch-marron/70">
                          {bloque.hora ?? "Sin hora"}
                        </td>
                      </tr>
                      {bloque.pedidos.map((p, k) => (
                        <tr key={`${i}-${k}`} className="border-b border-ranch-marron/10 last:border-0">
                          <td className="px-4 py-2">
                            <span className="font-bold uppercase text-ranch-marron">{p.nombre}</span>
                            {p.detalle && <span className="block text-xs uppercase text-ranch-marron/50">{p.detalle}</span>}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="font-black tabular-nums text-ranch-marron">{p.cantidad}</span>
                            <span className="ml-1 text-xs text-ranch-marron/50">{unidadDe(p.cantidad, p.unidad)}</span>
                          </td>
                          <td className="px-4 py-2 text-xs uppercase text-ranch-marron/60">{p.responsable}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Totales: lo que hay que tener listo en total, sin importar de qué evento sea. */}
          {r.datos.totales.length > 0 && (
            <section className="rounded-2xl border-2 border-ranch-marron/20 bg-ranch-crema/40 px-4 py-3">
              <h2 className="mb-2 text-xs font-black uppercase tracking-wide text-ranch-marron/60">Totales del día</h2>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {r.datos.totales.map((t) => (
                  <span key={t.nombre} className="text-sm">
                    <strong className="text-lg font-black tabular-nums text-ranch-marron">{t.cantidad}</strong>{" "}
                    <span className="font-semibold uppercase text-ranch-marron/80">{t.nombre}</span>{" "}
                    <span className="text-xs text-ranch-marron/50">{unidadDe(t.cantidad, t.unidad)}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          <p className="mt-3 text-center text-xs text-ranch-marron/40">
            Los eventos se arman en la app de Cotizaciones; aquí solo se consultan.
          </p>
        </>
      )}
    </main>
  );
}
