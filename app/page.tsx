import Link from "next/link";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { indicadoresVentas } from "@/lib/reportes/ventas";
import { comparativoAnual } from "@/lib/reportes/comparativo";
import { variacionPct, formatearVariacion } from "@/lib/reportes/util";
import { inicioDelDiaOperativo, fechaBogota } from "@/lib/tiempo";
import { formatearCOP } from "@/lib/dinero/cop";
import NavBar from "@/components/NavBar";

export const dynamic = "force-dynamic";

function Kpi({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-2xl border-2 border-ranch-marron/15 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-ranch-marron/50">{label}</p>
      <p className="mt-1 text-2xl font-black text-ranch-marron">{valor}</p>
      {sub && <p className="text-xs text-ranch-marron/50">{sub}</p>}
    </div>
  );
}

function MenuButton({ icon, label, desc, href }: { icon: string; label: string; desc: string; href: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center justify-start gap-2 rounded-2xl border-2 border-ranch-marron/15 bg-white p-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-ranch-dorado hover:shadow-md"
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-ranch-marron/10 text-3xl transition group-hover:bg-ranch-dorado/20">{icon}</span>
      <span className="font-bold leading-tight text-ranch-marron">{label}</span>
      <span className="text-xs leading-tight text-ranch-marron/50">{desc}</span>
    </Link>
  );
}

export default async function Home() {
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

  // Indicadores del día operativo
  const inicioHoy = inicioDelDiaOperativo();
  const finHoy = new Date(inicioHoy.getTime() + 86_400_000);
  const anio = parseInt(fechaBogota().slice(0, 4), 10);

  const [ind, ep, comp] = await Promise.all([
    indicadoresVentas(inicioHoy, finHoy),
    prisma.puntoControl.findFirst({ where: { nombre: { equals: "Entrada Principal", mode: "insensitive" } } }),
    comparativoAnual(anio),
  ]);

  let aforo = 0;
  if (ep) {
    const [e, sa] = await Promise.all([
      prisma.acceso.count({ where: { punto_control_id: ep.id, resultado: "permitido", sentido: "entrada", escaneado_en: { gte: inicioHoy } } }),
      prisma.acceso.count({ where: { punto_control_id: ep.id, resultado: "permitido", sentido: "salida", escaneado_en: { gte: inicioHoy } } }),
    ]);
    aforo = Math.max(0, e - sa);
  }
  const varAnual = variacionPct(comp.totalActual, comp.totalAnterior);
  // El operario de granja entra al sistema pero no ve ingresos ni comparativos.
  const verCifras = tieneRol(s.rol, "consulta");

  const operacion = ([
    ["🎟️", "Taquilla", "Vender manillas", "/taquilla", tieneRol(s.rol, "cajero")],
    ["💵", "Caja y cuadre", "Turno, movimientos, cierre", "/caja/turno", tieneRol(s.rol, "cajero")],
    ["🚪", "Escaneo", "Control de acceso", "/escaneo", tieneRol(s.rol, "control_acceso")],
  ] as [string, string, string, string, boolean][]).filter((x) => x[4]);

  const parque = ([
    ["🎡", "Accesos y atracciones", "Condiciones y conteo del día", "/admin/accesos", tieneRol(s.rol, "consulta")],
    ["🐄", "Animales", "Inventario, ubicación y alimentación", "/admin/animales", puedeOperarGranja(s.rol)],
    ["🔧", "Equipos", "Inventario y mantenimientos", "/admin/equipos", tieneRol(s.rol, "supervisor")],
    ["👷", "Personal", "Empleados, áreas y cargos", "/admin/personal", tieneRol(s.rol, "supervisor")],
  ] as [string, string, string, string, boolean][]).filter((x) => x[4]);

  const reportes = ([
    ["📊", "Ventas", "Indicadores del día y del mes", "/admin/dashboard", tieneRol(s.rol, "consulta")],
    ["📈", "Comparativo", "Año vs. año contra el histórico", "/admin/reportes/comparativo", tieneRol(s.rol, "consulta")],
    ["🎁", "Atenciones", "Lo que no se cobró y quién lo autorizó", "/admin/reportes/cortesias", tieneRol(s.rol, "supervisor")],
    ["🧾", "Gastos y P&G", "Presupuesto vs. ejecutado", "/admin/reportes/gastos", tieneRol(s.rol, "consulta")],
  ] as [string, string, string, string, boolean][]).filter((x) => x[4]);

  const administracion = ([
    ["⚙️", "Administración", "Maestros y reportes", "/admin", tieneRol(s.rol, "consulta")],
  ] as [string, string, string, string, boolean][]).filter((x) => x[4]);

  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        {/* Hero con logo y video de fondo opcional.
            Para activar el video: sube el archivo a public/hero.mp4 (se reproduce en silencio y en bucle).
            Si no existe, se ve el logo sobre el degradado de marca. */}
        <section className="relative mb-6 overflow-hidden rounded-3xl border-4 border-ranch-marron bg-gradient-to-br from-ranch-crema to-white">
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          >
            <source src="/hero.mp4" type="video/mp4" />
          </video>
          {/* Velo claro: mantiene el logo (oscuro) y el texto legibles, con o sin video. */}
          <div className="absolute inset-0 bg-gradient-to-t from-ranch-crema/85 via-ranch-crema/55 to-white/70" />
          <div className="relative flex flex-col items-center gap-2 px-6 py-10 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Ranch Texas" className="mb-1 h-24 w-auto drop-shadow-md sm:h-28" />
            <h1 className="text-2xl font-black text-ranch-marron sm:text-3xl">Hola, {s.nombre.split(" ")[0]} 👋</h1>
            <p className="text-sm text-ranch-marron/60">
              Resumen del día — {new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
        </section>

        {/* KPIs de hoy — solo para roles con acceso a reportes (granja no ve facturación). */}
        {verCifras && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Ingreso hoy" valor={formatearCOP(ind.ingreso)} />
          <Kpi label="Entradas hoy" valor={String(ind.asistentes)} sub={`${ind.numVentas} ventas`} />
          <Kpi label="Ticket promedio" valor={formatearCOP(ind.ticketPromedio)} sub="por entrada" />
          <Kpi label="Aforo actual" valor={String(aforo)} sub={ep?.aforo_maximo ? `de ${ep.aforo_maximo}` : undefined} />
        </div>
        )}

        {/* Comparativo anual mini */}
        {verCifras && (
        <Link href="/admin/reportes/comparativo" className="mb-6 flex items-center justify-between rounded-2xl border-2 border-ranch-dorado bg-white p-4 shadow-sm hover:shadow-md">
          <div>
            <p className="text-xs uppercase tracking-wide text-ranch-marron/50">Venta {anio} vs {anio - 1}</p>
            <p className="text-2xl font-black text-ranch-marron">{formatearCOP(comp.totalActual)}</p>
          </div>
          <div className={`text-right ${varAnual != null && varAnual >= 0 ? "text-ranch-verde" : "text-red-600"}`}>
            <p className="text-2xl font-black">{formatearVariacion(varAnual)}</p>
            <p className="text-xs text-ranch-marron/50">vs {formatearCOP(comp.totalAnterior)}</p>
          </div>
        </Link>
        )}

        {/* Menú — botones con iconos */}
        {operacion.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ranch-marron/50">Operación</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {operacion.map((x) => <MenuButton key={x[3]} icon={x[0]} label={x[1]} desc={x[2]} href={x[3]} />)}
            </div>
          </section>
        )}
        {parque.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ranch-marron/50">Parque</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {parque.map((x) => <MenuButton key={x[3]} icon={x[0]} label={x[1]} desc={x[2]} href={x[3]} />)}
            </div>
          </section>
        )}
        {reportes.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ranch-marron/50">Reportes</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {reportes.map((x) => <MenuButton key={x[3]} icon={x[0]} label={x[1]} desc={x[2]} href={x[3]} />)}
            </div>
          </section>
        )}
        {administracion.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ranch-marron/50">Administración</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {administracion.map((x) => <MenuButton key={x[3]} icon={x[0]} label={x[1]} desc={x[2]} href={x[3]} />)}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
