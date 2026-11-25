import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { formatearCOP, formatearMiles } from "@/lib/dinero/cop";
import { fechaBogota } from "@/lib/tiempo";
import HojaVidaAcciones from "./HojaVidaAcciones";

export const dynamic = "force-dynamic";

const fecha = (d: Date | null | undefined) => (d ? d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" }) : "—");
const ESTADO: Record<string, string> = { operativo: "bg-green-100 text-green-800", en_mantenimiento: "bg-blue-100 text-blue-800", fuera_servicio: "bg-red-100 text-red-700", dado_de_baja: "bg-ranch-marron/10 text-ranch-marron/60" };
const ESTADO_ORDEN: Record<string, string> = { programado: "Programada", en_proceso: "En proceso", realizado: "Realizada", cancelado: "Cancelada" };
const ESTADO_FALLA: Record<string, string> = { abierta: "Abierta", en_atencion: "En reparación", resuelta: "Resuelta", descartada: "Descartada" };

// Hoja de vida del equipo: datos, horómetro, planes, órdenes, fallas, costos y fotos.
export default async function HojaVidaPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) redirect("/reportar-falla");
  const { id } = await params;
  const e = await prisma.equipo.findUnique({
    where: { id },
    include: {
      categoria: { select: { id: true, nombre: true } }, area: { select: { nombre: true } }, proveedor: { select: { nombre: true } }, responsable: { select: { nombre: true } },
      mantenimientos: { orderBy: [{ fecha_realizada: "desc" }, { fecha_programada: "desc" }], include: { empleado: { select: { nombre: true } }, proveedor: { select: { nombre: true } }, fotos: { select: { id: true } } } },
      fallas: { orderBy: { creado_en: "desc" }, take: 20, include: { fotos: { select: { id: true } } } },
      lecturas: { orderBy: { fecha: "desc" }, take: 6 },
    },
  });
  if (!e) notFound();
  const planes = await prisma.planMantenimiento.findMany({ where: { activo: true, OR: [{ equipo_id: e.id }, { categoria_id: e.categoria_id }] }, orderBy: { nombre: "asc" } });

  const anio = +fechaBogota().slice(0, 4);
  const realizadas = e.mantenimientos.filter((m) => m.estado === "realizado");
  const abiertas = e.mantenimientos.filter((m) => m.estado === "programado" || m.estado === "en_proceso");
  const costoTotal = realizadas.reduce((t, m) => t + m.costo, 0);
  const costoAnio = realizadas.filter((m) => m.fecha_realizada && +fechaBogota(m.fecha_realizada).slice(0, 4) === anio).reduce((t, m) => t + m.costo, 0);
  const correctivos = realizadas.filter((m) => m.tipo === "correctivo").length;
  const horasParado = realizadas.reduce((t, m) => t + (m.horas_fuera_servicio ?? 0), 0);
  // Una foto de la falla también queda en su orden: se muestra una sola vez.
  const fotos = [...new Set([...e.mantenimientos.flatMap((m) => m.fotos.map((f) => f.id)), ...e.fallas.flatMap((f) => f.fotos.map((x) => x.id))])].slice(0, 10);
  const nombre = `${e.nombre}${e.codigo ? ` (${e.codigo})` : ""}`;
  const card = "rounded-2xl border-2 border-ranch-marron/15 bg-white p-4";

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link href="/admin/equipos?tab=inventario" className="text-sm text-ranch-marron/60 hover:underline">← Inventario de equipos</Link>
      <div className="mb-4 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-ranch-marron">{nombre}</h1>
            <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${ESTADO[e.estado]}`}>{e.estado.replace(/_/g, " ")}</span>
          </div>
          <p className="text-sm text-ranch-marron/60">{[e.categoria.nombre, e.area?.nombre, e.ubicacion, e.marca, e.modelo, e.serie ? `serie ${e.serie}` : null].filter(Boolean).join(" · ")}</p>
        </div>
        <Link href="/reportar-falla" className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-600">⚠ Reportar falla</Link>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Costo de mantenimiento", formatearCOP(costoTotal), `${formatearCOP(costoAnio)} en ${anio}`],
          ["Órdenes realizadas", String(realizadas.length), `${correctivos} correctivas`],
          ["Tiempo parado", `${formatearMiles(horasParado)} h`, "por reparaciones"],
          ["Valor de compra", e.valor_compra ? formatearCOP(e.valor_compra) : "—", e.valor_compra && costoTotal ? `mantenimiento = ${Math.round((costoTotal / e.valor_compra) * 100)}% del valor` : e.fecha_compra ? `comprado ${fecha(e.fecha_compra)}` : ""],
          ["Garantía", e.garantia_hasta ? fecha(e.garantia_hasta) : "—", e.garantia_hasta ? (e.garantia_hasta > new Date() ? "vigente" : "vencida") : "sin registrar"],
        ].map(([t, v, s2]) => (
          <div key={t} className={card}><p className="text-xs uppercase tracking-wide text-ranch-marron/50">{t}</p><p className="mt-1 text-xl font-black tabular-nums text-ranch-marron">{v}</p><p className="text-xs text-ranch-marron/50">{s2}</p></div>
        ))}
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <section className={card}>
          <h2 className="mb-2 font-bold text-ranch-marron">Horómetro</h2>
          <HojaVidaAcciones equipoId={e.id} usaHorometro={e.usa_horometro} horometro={e.horometro} equipoNombre={nombre} />
          {e.lecturas.length > 0 && (
            <ul className="mt-3 space-y-0.5 text-xs text-ranch-marron/70">
              {e.lecturas.map((l) => <li key={l.id} className="flex justify-between"><span>{fecha(l.fecha)}{l.origen === "mantenimiento" ? " · al cerrar orden" : ""}</span><b className="tabular-nums">{formatearMiles(l.horas)} h</b></li>)}
            </ul>
          )}
        </section>

        <section className={`${card} lg:col-span-2`}>
          <div className="mb-2 flex items-baseline justify-between"><h2 className="font-bold text-ranch-marron">Planes preventivos que le aplican</h2><Link href="/admin/equipos/planes" className="text-xs text-ranch-marron/60 underline">Planes</Link></div>
          {planes.length === 0 ? <p className="text-sm text-ranch-marron/50">Ningún plan le aplica. Crea uno para este equipo o para el grupo {e.categoria.nombre}.</p> : (
            <ul className="space-y-1.5 text-sm">
              {planes.map((p) => {
                const prox = abiertas.find((m) => m.plan_id === p.id);
                return (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-ranch-crema/40 px-3 py-1.5">
                    <span><b className="text-ranch-marron">{p.nombre}</b> <span className="text-xs text-ranch-marron/60">{[p.frecuencia_dias ? `cada ${p.frecuencia_dias} días` : null, p.frecuencia_horas ? `cada ${p.frecuencia_horas} h` : null].filter(Boolean).join(" o ")}{p.equipo_id ? "" : " · por grupo"}</span></span>
                    {prox ? <Link href={`/admin/equipos/mantenimiento/${prox.id}`} className="text-xs underline">próxima: {prox.fecha_programada ? fecha(prox.fecha_programada) : ""}{prox.horometro_objetivo != null ? ` · ${prox.horometro_objetivo} h` : ""}</Link> : <span className="text-xs text-ranch-marron/40">{p.frecuencia_horas && !p.frecuencia_dias && !e.usa_horometro ? "activa el horómetro" : "—"}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className={`${card} mb-5`}>
        <h2 className="mb-2 font-bold text-ranch-marron">Historial de mantenimiento</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ranch-marron/60"><th className="py-1">Fecha</th><th>Tipo</th><th>Qué se hizo</th><th>Quién</th><th className="text-right">Parado</th><th className="text-right">Costo</th><th>Estado</th></tr></thead>
            <tbody>
              {e.mantenimientos.map((m) => (
                <tr key={m.id} className={`border-t border-ranch-marron/10 align-top ${m.estado === "cancelado" ? "text-ranch-marron/40" : ""}`}>
                  <td className="whitespace-nowrap py-1.5 pr-2">{fecha(m.fecha_realizada ?? m.fecha_programada)}</td>
                  <td className="pr-2 capitalize">{m.tipo}</td>
                  <td className="pr-2"><Link href={`/admin/equipos/mantenimiento/${m.id}`} className="font-medium hover:underline">{m.descripcion}</Link>{m.trabajos_realizados && <span className="block whitespace-pre-line text-xs text-ranch-marron/60">{m.trabajos_realizados}</span>}</td>
                  <td className="pr-2">{m.empleado?.nombre ?? m.proveedor?.nombre ?? m.responsable ?? "—"}</td>
                  <td className="text-right tabular-nums">{m.horas_fuera_servicio != null ? `${m.horas_fuera_servicio} h` : ""}</td>
                  <td className="text-right tabular-nums">{m.costo ? formatearCOP(m.costo) : ""}</td>
                  <td className="whitespace-nowrap pl-2 text-xs">{ESTADO_ORDEN[m.estado]}</td>
                </tr>
              ))}
              {e.mantenimientos.length === 0 && <tr><td colSpan={7} className="py-3 text-ranch-marron/40">Sin mantenimientos registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-2 font-bold text-ranch-marron">Fallas reportadas</h2>
          {e.fallas.length === 0 ? <p className="text-sm text-ranch-marron/50">Ninguna.</p> : (
            <ul className="space-y-1.5 text-sm">
              {e.fallas.map((f) => (
                <li key={f.id} className="rounded-lg border border-ranch-marron/10 px-3 py-1.5">
                  <div className="flex justify-between gap-2"><span>{f.descripcion}</span><span className="shrink-0 text-xs text-ranch-marron/60">{ESTADO_FALLA[f.estado]}</span></div>
                  <span className="text-xs text-ranch-marron/50">{fecha(f.creado_en)} · prioridad {f.prioridad}{f.equipo_detenido ? " · detenido" : ""}{f.motivo_cierre ? ` · ${f.motivo_cierre}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={card}>
          <h2 className="mb-2 font-bold text-ranch-marron">Ficha</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {[
              ["Proveedor", e.proveedor?.nombre], ["Responsable", e.responsable?.nombre], ["Compra", e.fecha_compra ? fecha(e.fecha_compra) : null], ["Instalación", e.fecha_instalacion ? fecha(e.fecha_instalacion) : null],
              ["Vida útil", e.vida_util_meses ? `${e.vida_util_meses} meses` : null], ["Unidades", String(e.cantidad)], ["Referencia", e.referencia], ["Observaciones", e.observaciones],
            ].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-xs text-ranch-marron/50">{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {fotos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {fotos.map((fid) => (
                <a key={fid} href={`/admin/equipos/fotos/${fid}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/admin/equipos/fotos/${fid}`} alt="Foto de evidencia" className="h-16 w-16 rounded-lg object-cover" />
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
