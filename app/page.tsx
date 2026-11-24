import Link from "next/link";
import type { ReactNode } from "react";
import { obtenerSesion, tieneRol, puedeOperarGranja, puedeConducir } from "@/lib/auth/sesion";
import { datosInicio } from "@/lib/inicio";
import { variacionPct } from "@/lib/reportes/util";
import { formatearCOP, formatearMiles } from "@/lib/dinero/cop";
import { fechaBogota } from "@/lib/tiempo";
import AppShell from "@/components/AppShell";
import { BarrasAnioVsAnterior, BarrasDiarias, ResultadoMensual, BarrasH, Medidor, BarraEstados, millones } from "@/components/graficos";

export const dynamic = "force-dynamic";

// Inicio = tablero de indicadores clave del parque: hoy, el año y el estado de la operación.
// La navegación está en la barra lateral; aquí solo quedan atajos a lo del día.

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const pct = (v: number) => `${(v * 100).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** ▲ +12,30% vs ayer, verde o rojo según si subir es bueno. */
function Variacion({ actual, base, texto, sentido = 1 }: { actual: number; base: number; texto: string; sentido?: 1 | -1 }) {
  const v = variacionPct(actual, base);
  if (v == null) return <span className="text-ranch-marron/40">Sin base para comparar {texto}</span>;
  const plano = Math.abs(v) < 0.5;
  const bueno = v * sentido > 0;
  return (
    <span className={plano ? "text-ranch-marron/50" : bueno ? "text-ranch-verde" : "text-red-600"} title={`${texto}: ${formatearCOP(base)}`}>
      {plano ? "▬" : v > 0 ? "▲" : "▼"} {v > 0 ? "+" : ""}{v.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% {texto}
    </span>
  );
}

function Kpi({ titulo, valor, completo, children, alerta }: { titulo: string; valor: string; completo?: string; children?: ReactNode; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 bg-white p-4 shadow-sm ${alerta ? "border-red-300" : "border-ranch-marron/15"}`}>
      <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{titulo}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${alerta ? "text-red-600" : "text-ranch-marron"}`} title={completo}>{valor}</p>
      {children && <div className="mt-0.5 text-xs">{children}</div>}
    </div>
  );
}

function Tarjeta({ titulo, conclusion, enlace, children }: { titulo: string; conclusion?: ReactNode; enlace?: { href: string; texto: string }; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="font-bold text-ranch-marron">{titulo}</h2>
        {enlace && <Link href={enlace.href} className="shrink-0 text-xs text-ranch-marron/60 underline hover:text-ranch-marron">{enlace.texto}</Link>}
      </div>
      {conclusion && <p className="mb-2 text-xs text-ranch-marron/60">{conclusion}</p>}
      {children}
    </section>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const periodo: "dia" | "mes" = (await searchParams).periodo === "mes" ? "mes" : "dia";
  const s = await obtenerSesion();

  if (!s) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border-4 border-ranch-marron bg-white p-10 text-center shadow-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Ranch Texas" className="mx-auto mb-4 h-28 w-auto" />
          <p className="mb-6 text-ranch-marron/60">Sistema de operación</p>
          <Link href="/login" className="block rounded-xl bg-ranch-marron px-6 py-3 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro">
            Ingresar
          </Link>
        </div>
      </main>
    );
  }

  const permisos = {
    cifras: tieneRol(s.rol, "consulta"),
    animales: puedeOperarGranja(s.rol),
    equipos: tieneRol(s.rol, "supervisor"),
    vehiculos: tieneRol(s.rol, "supervisor"),
  };
  const d = await datosInicio(permisos, periodo);
  const atajos = ([
    ["🎟️", "Taquilla", "/taquilla", tieneRol(s.rol, "cajero")],
    ["💵", "Caja y turno", "/caja/turno", tieneRol(s.rol, "cajero")],
    ["🚪", "Escaneo", "/escaneo", tieneRol(s.rol, "control_acceso")],
    ["🐄", "Alimentación", "/admin/animales?tab=bitacora", puedeOperarGranja(s.rol)],
    ["🚗", "Mis viajes", "/vehiculos/mis-viajes", puedeConducir(s.rol) && !tieneRol(s.rol, "supervisor")],
  ] as [string, string, string, boolean][]).filter((a) => a[3]);

  const comp = d.comparativo;
  const varAnio = comp ? variacionPct(comp.totalActual, comp.totalAnterior) : null;
  const mesesComp = comp?.meses.filter((m) => !m.futuro) ?? [];
  const mejorMes = mesesComp.length ? mesesComp.reduce((a, b) => (b.actual - b.anterior > a.actual - a.anterior ? b : a)) : null;
  const r = d.resultado;
  const perdidas = r?.meses.filter((m) => m.utilidad < 0) ?? [];
  const mezclaTotal = d.mezcla?.reduce((t, f) => t + f.total, 0) ?? 0;
  const lider = d.mezcla?.[0];
  const diasConVenta = d.diario?.filter((x) => x.ingreso > 0) ?? [];
  const ingreso30 = d.diario?.reduce((t, x) => t + x.ingreso, 0) ?? 0;
  const eq = d.equipos?.porEstado ?? {};
  const an = d.animales?.porEstado ?? {};

  return (
    <AppShell>
      <main className="mx-auto max-w-[96rem] p-4 sm:p-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-ranch-marron sm:text-3xl">Hola, {s.nombre.split(" ")[0]}</h1>
            <p className="text-sm text-ranch-marron/60">
              {new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric" })} · así va el parque
            </p>
          </div>
          {atajos.length > 0 && (
            <nav className="flex flex-wrap gap-2" aria-label="Atajos">
              {atajos.map(([i, t, h]) => (
                <Link key={h} href={h} className="rounded-full bg-ranch-marron px-4 py-2 text-sm font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro">{i} {t}</Link>
              ))}
            </nav>
          )}
        </header>

        {/* ---------------- Hoy ---------------- */}
        {d.hoy && (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-ranch-marron/50">{d.hoy.titulo}</h2>
              <nav className="inline-flex rounded-full border border-ranch-marron/20 bg-white p-0.5 text-sm" aria-label="Periodo de los indicadores">
                {([["dia", "Día"], ["mes", "Mes"]] as const).map(([v, t]) => (
                  <Link key={v} href={v === "dia" ? "/" : "/?periodo=mes"} aria-current={periodo === v ? "true" : undefined}
                    className={`rounded-full px-4 py-1 font-semibold ${periodo === v ? "bg-ranch-marron text-ranch-crema" : "text-ranch-marron/70 hover:bg-ranch-marron/10"}`}>
                    {t}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi titulo="Ingreso" valor={periodo === "mes" ? millones(d.hoy.ventas.ingreso) : formatearCOP(d.hoy.ventas.ingreso)} completo={formatearCOP(d.hoy.ventas.ingreso)}>
                <Variacion actual={d.hoy.ventas.ingreso} base={d.hoy.ayer.ingreso} texto={d.hoy.textoBase} />
              </Kpi>
              <Kpi titulo="Entradas" valor={formatearMiles(d.hoy.ventas.asistentes)}>
                <span className="text-ranch-marron/50">{formatearMiles(d.hoy.ventas.numVentas)} ventas · </span>
                <Variacion actual={d.hoy.ventas.asistentes} base={d.hoy.ayer.asistentes} texto={d.hoy.textoBase} />
              </Kpi>
              <Kpi titulo="Ticket promedio" valor={formatearCOP(d.hoy.ventas.ticketPromedio)}>
                <span className="text-ranch-marron/50">por entrada · {pct(d.hoy.ventas.pctCortesias)} en cortesías</span>
              </Kpi>
              {periodo === "dia" ? (
                <Kpi titulo="Aforo actual" valor={formatearMiles(d.hoy.aforo)} alerta={!!d.hoy.aforoMax && d.hoy.aforo >= d.hoy.aforoMax * 0.9}>
                  {d.hoy.aforoMax ? (
                    <>
                      <span className="text-ranch-marron/50">de {formatearMiles(d.hoy.aforoMax)} ({pct(d.hoy.aforo / d.hoy.aforoMax)})</span>
                      <Medidor valor={d.hoy.aforo} limite={d.hoy.aforoMax} invertido />
                    </>
                  ) : <span className="text-ranch-marron/40">Sin aforo máximo configurado</span>}
                </Kpi>
              ) : (
                <Kpi titulo="Días con venta" valor={formatearMiles(d.hoy.diasConVenta)}>
                  <span className="text-ranch-marron/50">
                    {d.hoy.diasConVenta ? `promedio ${millones(d.hoy.ventas.ingreso / d.hoy.diasConVenta)} y ${formatearMiles(Math.round(d.hoy.ventas.asistentes / d.hoy.diasConVenta))} entradas por día` : "aún sin ventas este mes"}
                  </span>
                </Kpi>
              )}
            </div>
          </>
        )}

        {/* ---------------- El año ---------------- */}
        {permisos.cifras && (
          <>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ranch-marron/50">El año {d.anio}</h2>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {comp && (
                <Kpi titulo={`Venta ${comp.periodo ?? d.anio}`} valor={millones(comp.totalActual)} completo={formatearCOP(comp.totalActual)}>
                  <Variacion actual={comp.totalActual} base={comp.totalAnterior} texto={`vs ${d.anio - 1}`} />
                  {comp.meses.find((m) => m.enCurso && m.actual) && (
                    <span className="block text-ranch-marron/50">+ {millones(comp.meses.find((m) => m.enCurso)!.actual)} del mes en curso</span>
                  )}
                </Kpi>
              )}
              {r ? (
                <>
                  <Kpi titulo={`Utilidad operacional ${r.anio}`} valor={millones(r.utilidad)} completo={formatearCOP(r.utilidad)} alerta={r.utilidad < 0}>
                    <span className="text-ranch-marron/60">margen {pct(r.margen)} · {r.meses.length} meses del P&G</span>
                  </Kpi>
                  <Kpi titulo="Gastos vs presupuesto" valor={r.presupuestoGastos ? pct(r.gastos / r.presupuestoGastos) : millones(r.gastos)} completo={formatearCOP(r.gastos)} alerta={!!r.presupuestoGastos && r.gastos > r.presupuestoGastos}>
                    {r.presupuestoGastos ? (
                      <>
                        <span className="text-ranch-marron/60">{millones(r.gastos)} de {millones(r.presupuestoGastos)} presupuestados</span>
                        <Medidor valor={r.gastos} limite={r.presupuestoGastos} invertido />
                      </>
                    ) : <span className="text-ranch-marron/40">Sin presupuesto cargado</span>}
                  </Kpi>
                  <Kpi titulo="Meses en pérdida" valor={`${perdidas.length} de ${r.meses.length}`} alerta={perdidas.length > 0}>
                    <span className="text-ranch-marron/60">{perdidas.length ? perdidas.map((m) => MESES[m.mes - 1]).join(", ") : "todos con utilidad"}</span>
                  </Kpi>
                </>
              ) : (
                <div className="col-span-2 rounded-2xl border-2 border-dashed border-ranch-marron/20 bg-white p-4 text-sm text-ranch-marron/60 lg:col-span-3">
                  Sin estados de resultados cargados: la utilidad y los gastos aparecen aquí cuando se suban en{" "}
                  {tieneRol(s.rol, "administrador") ? <Link href="/admin/archivos" className="underline">Configuración → Carga de archivos</Link> : "Configuración → Carga de archivos"}.
                </div>
              )}
            </div>

            <div className="mb-4 grid gap-4 xl:grid-cols-2">
              {comp && (
                <Tarjeta
                  titulo={`Venta por mes ${d.anio} vs ${d.anio - 1}`}
                  enlace={{ href: "/admin/reportes/comparativo", texto: "Ver comparativo" }}
                  conclusion={<>
                    {varAnio != null ? `${varAnio >= 0 ? "Vamos" : "Estamos"} ${varAnio >= 0 ? "+" : ""}${varAnio.toLocaleString("es-CO", { maximumFractionDigits: 1 })}% frente a ${d.anio - 1} en los mismos meses.` : ""}
                    {mejorMes ? ` El mes que más creció fue ${MESES[mejorMes.mes - 1]} (${millones(mejorMes.actual - mejorMes.anterior)}).` : ""}
                    {" "}<span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-ranch-marron/20" />{d.anio - 1}</span>{" "}
                    <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-ranch-dorado" />{d.anio}</span>
                  </>}
                >
                  <BarrasAnioVsAnterior meses={comp.meses} anio={d.anio} mesEnCurso={+fechaBogota().slice(5, 7)} />
                </Tarjeta>
              )}
              {d.diario && (
                <Tarjeta
                  titulo="Taquilla · últimos 30 días"
                  enlace={{ href: "/admin/dashboard", texto: "Ver dashboard" }}
                  conclusion={diasConVenta.length
                    ? `${diasConVenta.length} días con venta suman ${millones(ingreso30)} y ${formatearMiles(diasConVenta.reduce((t, x) => t + x.entradas, 0))} entradas.`
                    : "Sin ventas de taquilla en los últimos 30 días."}
                >
                  <BarrasDiarias dias={d.diario} />
                </Tarjeta>
              )}
              {r && r.meses.length > 0 && (
                <Tarjeta
                  titulo={`Resultado de cada mes · ${r.anio}`}
                  enlace={{ href: "/admin/reportes/estado-resultados", texto: "Ver estado de resultados" }}
                  conclusion={<>
                    Etiqueta: utilidad operacional del mes.{" "}
                    <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-ranch-dorado" />ingresos</span>{" "}
                    <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-sm bg-ranch-marron/35" />costos y gastos</span>
                  </>}
                >
                  <ResultadoMensual meses={r.meses} />
                </Tarjeta>
              )}
              {d.analisis && (
                <Tarjeta
                  titulo={`Salud financiera · ${d.analisis.anio}`}
                  enlace={{ href: "/admin/reportes/analisis-financiero", texto: "Ver análisis completo" }}
                  conclusion={d.analisis.conclusiones[0] ? d.analisis.conclusiones[0].titulo + "." : undefined}
                >
                  {d.analisis.equilibrio && (
                    <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-ranch-crema/60 p-2"><p className="text-[11px] text-ranch-marron/60">Equilibrio / mes</p><p className="font-black tabular-nums text-ranch-marron">{millones(d.analisis.equilibrio.pe_alto)}</p></div>
                      <div className="rounded-xl bg-ranch-crema/60 p-2"><p className="text-[11px] text-ranch-marron/60">Margen de seguridad</p><p className={`font-black tabular-nums ${d.analisis.equilibrio.margen_seguridad < 0.15 ? "text-red-600" : "text-ranch-verde"}`}>{pct(d.analisis.equilibrio.margen_seguridad)}</p></div>
                      <div className="rounded-xl bg-ranch-crema/60 p-2"><p className="text-[11px] text-ranch-marron/60">Apalancamiento</p><p className="font-black tabular-nums text-ranch-marron">{d.analisis.equilibrio.apalancamiento ? `${d.analisis.equilibrio.apalancamiento.toLocaleString("es-CO", { maximumFractionDigits: 1 })}x` : "—"}</p></div>
                    </div>
                  )}
                  <ul className="space-y-1.5">
                    {d.analisis.alertas.map((al) => (
                      <li key={al.senal} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className={al.disparada ? "text-red-700" : "text-green-700"}>{al.disparada ? "⚠" : "✓"} {al.senal}</span>
                        <span className={`shrink-0 font-bold tabular-nums ${al.disparada ? "text-red-700" : "text-green-700"}`}>{al.valor}</span>
                      </li>
                    ))}
                  </ul>
                </Tarjeta>
              )}
              {d.mezcla && d.mezcla.length > 0 && (
                <Tarjeta
                  titulo={`De dónde viene la venta · ${d.anio}`}
                  enlace={{ href: "/admin/reportes/venta-productos", texto: "Ver por producto" }}
                  conclusion={lider ? `${lider.producto} aporta ${pct(lider.total / (mezclaTotal || 1))} de ${millones(mezclaTotal)}.` : undefined}
                >
                  <BarrasH filas={d.mezcla.map((f) => ({ nombre: f.producto, valor: f.total }))} />
                </Tarjeta>
              )}
            </div>
          </>
        )}

        {/* ---------------- El parque ---------------- */}
        {(d.equipos || d.animales || d.vehiculos) && (
          <>
            <h2 className="mb-2 mt-2 text-xs font-bold uppercase tracking-wide text-ranch-marron/50">El parque</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {d.animales && (
                <Tarjeta
                  titulo="Animales"
                  enlace={{ href: "/admin/animales?tab=inventario", texto: "Ver inventario" }}
                  conclusion={`${formatearMiles((an.activo ?? 0) + (an.enfermo ?? 0) + (an.cuarentena ?? 0))} cabezas en el parque.${d.animales.sinUbicar ? ` ${d.animales.sinUbicar} grupo(s) sin ubicar.` : ""}`}
                >
                  <BarraEstados partes={[
                    { nombre: "Sanos", valor: an.activo ?? 0, color: "bg-ranch-verde" },
                    { nombre: "Enfermos", valor: an.enfermo ?? 0, color: "bg-amber-500" },
                    { nombre: "Cuarentena", valor: an.cuarentena ?? 0, color: "bg-orange-500" },
                  ]} />
                </Tarjeta>
              )}
              {d.equipos && (
                <Tarjeta
                  titulo="Equipos"
                  enlace={{ href: "/admin/equipos?tab=mantenimientos", texto: "Ver mantenimientos" }}
                  conclusion={d.equipos.mantVencidos ? `${d.equipos.mantVencidos} mantenimiento(s) programado(s) ya vencido(s).` : "Sin mantenimientos vencidos."}
                >
                  <BarraEstados partes={[
                    { nombre: "Operativos", valor: eq.operativo ?? 0, color: "bg-ranch-verde" },
                    { nombre: "En mantenimiento", valor: eq.en_mantenimiento ?? 0, color: "bg-amber-500" },
                    { nombre: "Fuera de servicio", valor: eq.fuera_servicio ?? 0, color: "bg-red-500" },
                  ]} />
                </Tarjeta>
              )}
              {d.vehiculos && (
                <Tarjeta titulo="Vehículos" enlace={{ href: "/vehiculos/aprobar", texto: "Aprobar solicitudes" }}>
                  <p className={`text-3xl font-black tabular-nums ${d.vehiculos.pendientes ? "text-amber-600" : "text-ranch-marron"}`}>{d.vehiculos.pendientes}</p>
                  <p className="text-xs text-ranch-marron/60">{d.vehiculos.pendientes === 1 ? "solicitud pendiente de aprobar" : "solicitudes pendientes de aprobar"}</p>
                </Tarjeta>
              )}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
