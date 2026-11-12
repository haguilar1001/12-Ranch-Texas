import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { obtenerSesion, tieneRol, puedeOperarGranja } from "@/lib/auth/sesion";
import { fechaBogota, formatearFechaHoraBogota } from "@/lib/tiempo";
import { formatearCOP, formatearMiles } from "@/lib/dinero/cop";
import { reporteAlimentos, reporteAnimales, reporteDietas, reporteEquipos, type Novedad } from "@/lib/reportes/inventario";
import BotonImprimir from "./BotonImprimir";

export const dynamic = "force-dynamic";

type Clave = "animales" | "alimentos" | "dietas" | "equipos";
const REPORTES: Array<{ clave: Clave; titulo: string; granja: boolean }> = [
  { clave: "animales", titulo: "Inventario de animales", granja: true },
  { clave: "alimentos", titulo: "Inventario de alimentos", granja: true },
  { clave: "dietas", titulo: "Dietas vigentes", granja: true },
  { clave: "equipos", titulo: "Inventario de equipos", granja: false },
];

const num = (n: number, dec = 2) => n.toLocaleString("es-CO", { maximumFractionDigits: dec });
const kg = (g: number) => (g >= 1000 || g === 0 ? `${num(g / 1000)} kg` : `${num(g, 0)} g`);
const ESTADO_EQUIPO: Record<string, string> = { operativo: "Operativo", en_mantenimiento: "En mantenimiento", fuera_servicio: "Fuera de servicio", dado_de_baja: "Dado de baja" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Estilos de tabla: bordes finos que se ven bien en pantalla y en papel.
const th = "border border-ranch-marron/30 bg-ranch-crema px-2 py-1 text-left text-[11px] font-bold uppercase text-ranch-marron";
const td = "border border-ranch-marron/20 px-2 py-1 align-top";
const der = "text-right tabular-nums";

export default async function ReportesInventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; mes?: string; dias?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  const veGranja = tieneRol(s.rol, "consulta") || puedeOperarGranja(s.rol);
  const veEquipos = tieneRol(s.rol, "supervisor");
  const disponibles = REPORTES.filter((x) => (x.granja ? veGranja : veEquipos));
  if (disponibles.length === 0) return <main className="p-6">Sin acceso.</main>;

  const sp = await searchParams;
  const actual = disponibles.find((x) => x.clave === sp.r) ?? disponibles[0];
  const hoy = fechaBogota();
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") && sp.mes! <= hoy.slice(0, 7) ? sp.mes! : hoy.slice(0, 7);
  const [anio, m] = mes.split("-").map(Number);
  const desde = new Date(`${mes}-01T00:00:00-05:00`);
  const hasta = new Date(`${m === 12 ? anio + 1 : anio}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00-05:00`);
  const nombreMes = `${MESES[m - 1]} de ${anio}`;
  const dias = Math.min(90, Math.max(1, Number(sp.dias) || 15));

  let cuerpo: ReactNode;
  let horizontal = false;
  if (actual.clave === "animales") cuerpo = <Animales datos={await reporteAnimales(desde, hasta)} nombreMes={nombreMes} />;
  else if (actual.clave === "alimentos") cuerpo = <Alimentos datos={await reporteAlimentos(dias)} dias={dias} />;
  else if (actual.clave === "dietas") cuerpo = <Dietas datos={await reporteDietas()} />;
  else { horizontal = true; cuerpo = <Equipos datos={await reporteEquipos(desde, hasta)} nombreMes={nombreMes} />; }

  return (
    <main className="mx-auto max-w-6xl p-4 print:max-w-none print:p-0">
      <style>{`@media print { @page { size: letter ${horizontal ? "landscape" : "portrait"}; margin: 10mm } body { background: white !important } tr, td, th { break-inside: avoid } thead { display: table-header-group } }`}</style>

      {/* Barra de control: no se imprime. */}
      <div className="mb-4 space-y-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          {disponibles.map((x) => (
            <a
              key={x.clave}
              href={`/admin/reportes/inventarios?r=${x.clave}&mes=${mes}&dias=${dias}`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${x.clave === actual.clave ? "bg-ranch-marron text-ranch-crema" : "border border-ranch-marron/30 text-ranch-marron hover:bg-white"}`}
            >
              {x.titulo}
            </a>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="r" value={actual.clave} />
          {(actual.clave === "animales" || actual.clave === "equipos") && (
            <label className="flex items-center gap-2 text-ranch-marron/70">
              Novedades del mes
              <input type="month" name="mes" defaultValue={mes} max={hoy.slice(0, 7)} className="rounded border border-ranch-marron/30 px-2 py-1" />
            </label>
          )}
          {actual.clave === "alimentos" && (
            <label className="flex items-center gap-2 text-ranch-marron/70">
              Comprar para
              <input type="number" name="dias" min={1} max={90} defaultValue={dias} className="w-20 rounded border border-ranch-marron/30 px-2 py-1" />
              días
            </label>
          )}
          {actual.clave !== "dietas" && (
            <button className="rounded border border-ranch-marron/30 px-3 py-1 font-semibold text-ranch-marron">Ver</button>
          )}
          <span className="ml-auto" />
          <BotonImprimir />
        </form>
        <p className="text-xs text-ranch-marron/50">
          En la ventana de impresión elija <strong>Guardar como PDF</strong> como destino.
          {horizontal ? " Este reporte sale en hoja horizontal." : ""}
        </p>
      </div>

      <section className="rounded-2xl border-2 border-ranch-marron/20 bg-white p-5 text-sm text-ranch-marron print:rounded-none print:border-0 print:p-0">
        <header className="mb-4 flex items-center gap-4 border-b-2 border-ranch-marron pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Ranch Texas" className="h-14 w-auto" />
          <div className="flex-1">
            <h1 className="text-lg font-black uppercase tracking-wide">Parque Ranch Texas — {actual.titulo}</h1>
            <p className="text-xs text-ranch-marron/70">Corte: {formatearFechaHoraBogota(new Date())} · Generado por {s.nombre}</p>
          </div>
        </header>

        {cuerpo}

        <footer className="mt-10 grid grid-cols-2 gap-10 text-xs text-ranch-marron/70" style={{ breakInside: "avoid" }}>
          {["Elaboró", "Revisó"].map((f) => (
            <div key={f}>
              <div className="mt-8 border-t border-ranch-marron/60 pt-1">{f} — nombre y firma</div>
            </div>
          ))}
        </footer>
      </section>
    </main>
  );
}

// ------------------------------------------------------------------ piezas

function Resumen({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-ranch-marron/25 px-3 py-2">
          <p className="text-base font-black tabular-nums">{v}</p>
          <p className="text-[10px] uppercase tracking-wide text-ranch-marron/60">{k}</p>
        </div>
      ))}
    </div>
  );
}

function Novedades({ titulo, novedades, unidad }: { titulo: string; novedades: Novedad[]; unidad: string }) {
  return (
    <div className="mt-6" style={{ breakInside: "avoid" }}>
      <h2 className="mb-2 text-sm font-bold uppercase">{titulo}</h2>
      {novedades.length === 0 ? (
        <p className="text-xs text-ranch-marron/60">Sin novedades registradas en el mes.</p>
      ) : (
        <table className="w-full max-w-xl border-collapse text-xs">
          <thead><tr><th className={th}>Novedad</th><th className={`${th} ${der}`}>Registros</th><th className={`${th} ${der}`}>{unidad}</th><th className={`${th} ${der}`}>Valor</th></tr></thead>
          <tbody>
            {novedades.map((n) => (
              <tr key={n.tipo}>
                <td className={td}>{n.tipo}</td>
                <td className={`${td} ${der}`}>{formatearMiles(n.movimientos)}</td>
                <td className={`${td} ${der}`}>{formatearMiles(n.cantidad)}</td>
                <td className={`${td} ${der}`}>{n.valor > 0 ? formatearCOP(n.valor) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ reportes

function Animales({ datos, nombreMes }: { datos: Awaited<ReturnType<typeof reporteAnimales>>; nombreMes: string }) {
  return (
    <>
      <Resumen items={[
        ["Cabezas", formatearMiles(datos.totalCabezas)],
        ["Grupos", formatearMiles(datos.totalGrupos)],
        ["Categorías", formatearMiles(datos.categorias.length)],
        ["Alimento / mes", formatearCOP(datos.costoMes)],
      ]} />
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className={th}>Grupo</th><th className={th}>Especie</th><th className={th}>Ubicación</th>
            <th className={th}>Estado</th><th className={`${th} ${der}`}>Cabezas</th><th className={`${th} ${der}`}>Alimento / mes</th>
          </tr>
        </thead>
        <tbody>
          {datos.categorias.map((c) => (
            <CategoriaFilas key={c.nombre} c={c} />
          ))}
          <tr className="bg-ranch-crema font-black">
            <td className={td} colSpan={4}>TOTAL</td>
            <td className={`${td} ${der}`}>{formatearMiles(datos.totalCabezas)}</td>
            <td className={`${td} ${der}`}>{formatearCOP(datos.costoMes)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-ranch-marron/60">
        El costo de alimento usa las dietas vigentes y el censo actual. Las raciones de una categoría completa (p. ej. aves al lote)
        se suman en el subtotal de la categoría.{datos.enCero > 0 ? ` No se listan ${datos.enCero} grupo(s) en 0 cabezas.` : ""}
      </p>
      <Novedades titulo={`Novedades de ${nombreMes}`} novedades={datos.novedades} unidad="Cabezas" />
    </>
  );
}

function CategoriaFilas({ c }: { c: Awaited<ReturnType<typeof reporteAnimales>>["categorias"][number] }) {
  return (
    <>
      <tr className="bg-ranch-crema/50 font-bold">
        <td className={td} colSpan={4}>{c.nombre}</td>
        <td className={`${td} ${der}`}>{formatearMiles(c.cabezas)}</td>
        <td className={`${td} ${der}`}>{c.costoMes > 0 ? formatearCOP(c.costoMes) : "—"}</td>
      </tr>
      {c.grupos.map((g, i) => (
        <tr key={`${g.nombre}-${i}`}>
          <td className={`${td} pl-5`}>{g.nombre}{g.observaciones && <span className="block text-[10px] text-ranch-marron/55">{g.observaciones}</span>}</td>
          <td className={td}>{g.especie ?? "—"}</td>
          <td className={td}>{g.recinto ?? "Sin ubicar"}</td>
          <td className={td}>{g.estado}</td>
          <td className={`${td} ${der}`}>{formatearMiles(g.cabezas)}</td>
          <td className={`${td} ${der}`}>{g.costoMes > 0 ? formatearCOP(g.costoMes) : "—"}</td>
        </tr>
      ))}
    </>
  );
}

function Alimentos({ datos, dias }: { datos: Awaited<ReturnType<typeof reporteAlimentos>>; dias: number }) {
  const compra = datos.filas.filter((f) => f.comprar > 0);
  const u = (n: number | null, pres: string) => (n === null ? "—" : `${num(n)} ${pres}${n === 1 ? "" : "s"}`);
  return (
    <>
      <Resumen items={[
        ["Valor en bodega", formatearCOP(datos.valorBodega)],
        ["Consumo / día", formatearCOP(Math.round(datos.costoDia))],
        ["Alcanzan < 3 días", formatearMiles(datos.filas.filter((f) => f.dias !== null && f.dias < 3).length)],
        [`Compra para ${dias} días`, formatearCOP(datos.totalCompra)],
      ]} />
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className={th}>Alimento</th><th className={th}>Presentación</th><th className={`${th} ${der}`}>Costo unidad</th>
            <th className={`${th} ${der}`}>Existencia</th><th className={`${th} ${der}`}>Valor</th>
            <th className={`${th} ${der}`}>Consumo / día</th><th className={`${th} ${der}`}>Alcanza</th>
          </tr>
        </thead>
        <tbody>
          {datos.filas.map((f) => (
            <tr key={f.nombre} className={f.existencia < 0 ? "text-red-700" : ""}>
              <td className={`${td} font-semibold`}>{f.nombre}</td>
              <td className={td}>{f.presentacion}{f.porUnidad > 0 ? ` de ${kg(f.porUnidad)}` : ""}</td>
              <td className={`${td} ${der}`}>{f.costoUnitario ? formatearCOP(f.costoUnitario) : "—"}</td>
              <td className={`${td} ${der}`}>{u(f.existenciaUnidades, f.presentacion)}<span className="block text-[10px] text-ranch-marron/55">{kg(f.existencia)}</span></td>
              <td className={`${td} ${der}`}>{f.valor > 0 ? formatearCOP(f.valor) : "—"}</td>
              <td className={`${td} ${der}`}>{f.consumoDia > 0 ? kg(f.consumoDia) : "sin dieta"}</td>
              <td className={`${td} ${der} ${f.dias !== null && f.dias < 3 ? "font-bold text-red-700" : ""}`}>
                {f.dias === null ? "—" : `${formatearMiles(f.dias)} día${f.dias === 1 ? "" : "s"}`}
              </td>
            </tr>
          ))}
          <tr className="bg-ranch-crema font-black">
            <td className={td} colSpan={4}>TOTAL EN BODEGA</td>
            <td className={`${td} ${der}`}>{formatearCOP(datos.valorBodega)}</td>
            <td className={td} colSpan={2}></td>
          </tr>
        </tbody>
      </table>

      <div className="mt-6" style={{ breakInside: "avoid" }}>
        <h2 className="mb-1 text-sm font-bold uppercase">Pedido sugerido para {dias} días</h2>
        <p className="mb-2 text-[10px] text-ranch-marron/60">Consumo de {dias} días según las dietas vigentes, menos lo que hay en bodega, redondeado a la presentación completa.</p>
        {compra.length === 0 ? (
          <p className="text-xs">La bodega alcanza para {dias} días: no hay que pedir nada.</p>
        ) : (
          <table className="w-full max-w-2xl border-collapse text-xs">
            <thead><tr><th className={th}>Alimento</th><th className={`${th} ${der}`}>Pedir</th><th className={`${th} ${der}`}>Costo unidad</th><th className={`${th} ${der}`}>Total</th></tr></thead>
            <tbody>
              {compra.map((f) => (
                <tr key={f.nombre}>
                  <td className={td}>{f.nombre}</td>
                  <td className={`${td} ${der}`}>{formatearMiles(f.comprar)} {f.presentacion}{f.comprar === 1 ? "" : "s"}</td>
                  <td className={`${td} ${der}`}>{f.costoUnitario ? formatearCOP(f.costoUnitario) : "—"}</td>
                  <td className={`${td} ${der}`}>{formatearCOP(f.costoCompra)}</td>
                </tr>
              ))}
              <tr className="bg-ranch-crema font-black">
                <td className={td} colSpan={3}>TOTAL DEL PEDIDO</td>
                <td className={`${td} ${der}`}>{formatearCOP(datos.totalCompra)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Dietas({ datos }: { datos: Awaited<ReturnType<typeof reporteDietas>> }) {
  return (
    <>
      <Resumen items={[
        ["Raciones activas", formatearMiles(datos.filas.length)],
        ["Grupos con dieta", formatearMiles(new Set(datos.filas.map((f) => f.destino)).size)],
        ["Costo / día", formatearCOP(Math.round(datos.costoMes / 30))],
        ["Costo / mes", formatearCOP(datos.costoMes)],
      ]} />
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className={th}>Grupo</th><th className={`${th} ${der}`}>Cabezas</th><th className={th}>Alimento</th>
            <th className={th}>Ración</th><th className={`${th} ${der}`}>Total / día</th><th className={`${th} ${der}`}>Costo / mes</th>
          </tr>
        </thead>
        <tbody>
          {datos.filas.map((f, i) => (
            <tr key={i}>
              <td className={`${td} font-semibold`}>{f.destino}</td>
              <td className={`${td} ${der}`}>{formatearMiles(f.cabezas)}</td>
              <td className={td}>{f.alimento}{f.consumoLibre && <span className="block text-[10px] text-ranch-marron/55">consumo libre</span>}</td>
              <td className={td}>{formatearMiles(f.cantidad)} {f.unidad} {f.modo} · {f.frecuencia}{f.obs && <span className="block text-[10px] text-ranch-marron/55">{f.obs}</span>}</td>
              <td className={`${td} ${der}`}>{kg(f.diarioBase)}</td>
              <td className={`${td} ${der}`}>{formatearCOP(f.costoMes)}</td>
            </tr>
          ))}
          <tr className="bg-ranch-crema font-black">
            <td className={td} colSpan={5}>TOTAL</td>
            <td className={`${td} ${der}`}>{formatearCOP(datos.costoMes)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-ranch-marron/60">Mes de 30 días. "Por animal" se multiplica por las cabezas actuales del grupo; "al lote" es el total del grupo.</p>
    </>
  );
}

function Equipos({ datos, nombreMes }: { datos: Awaited<ReturnType<typeof reporteEquipos>>; nombreMes: string }) {
  return (
    <>
      <Resumen items={[
        ["Registros", formatearMiles(datos.registros)],
        ["Unidades", formatearMiles(datos.unidades)],
        ["Valor de compra", formatearCOP(datos.valor)],
        ["Por estado", datos.porEstado.map((e) => `${ESTADO_EQUIPO[e.estado] ?? e.estado}: ${formatearMiles(e.unidades)}`).join(" · ") || "—"],
      ]} />
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className={th}>Código</th><th className={th}>Equipo</th><th className={th}>Marca · referencia</th>
            <th className={th}>Ubicación</th><th className={th}>Estado</th><th className={`${th} ${der}`}>Cant.</th>
            <th className={`${th} ${der}`}>Valor unit.</th><th className={`${th} ${der}`}>Valor total</th>
            <th className={th}>Responsable</th><th className={th}>Garantía</th>
          </tr>
        </thead>
        <tbody>
          {datos.grupos.map((g) => (
            <GrupoEquipoFilas key={g.nombre} g={g} />
          ))}
          <tr className="bg-ranch-crema font-black">
            <td className={td} colSpan={5}>TOTAL</td>
            <td className={`${td} ${der}`}>{formatearMiles(datos.unidades)}</td>
            <td className={td}></td>
            <td className={`${td} ${der}`}>{formatearCOP(datos.valor)}</td>
            <td className={td} colSpan={2}></td>
          </tr>
        </tbody>
      </table>
      {datos.registros === 0 && <p className="mt-2 text-xs">Todavía no hay equipos cargados.</p>}
      <Novedades titulo={`Novedades de ${nombreMes}`} novedades={datos.novedades} unidad="Unidades" />
    </>
  );
}

function GrupoEquipoFilas({ g }: { g: Awaited<ReturnType<typeof reporteEquipos>>["grupos"][number] }) {
  return (
    <>
      <tr className="bg-ranch-crema/50 font-bold">
        <td className={td} colSpan={5}>{g.nombre}</td>
        <td className={`${td} ${der}`}>{formatearMiles(g.unidades)}</td>
        <td className={td}></td>
        <td className={`${td} ${der}`}>{g.valor > 0 ? formatearCOP(g.valor) : "—"}</td>
        <td className={td} colSpan={2}></td>
      </tr>
      {g.equipos.map((e, i) => (
        <tr key={`${e.nombre}-${i}`}>
          <td className={td}>{e.codigo ?? "—"}</td>
          <td className={`${td} font-semibold`}>{e.nombre}</td>
          <td className={td}>{e.marcaRef || "—"}</td>
          <td className={td}>{e.ubicacion || "—"}</td>
          <td className={td}>{ESTADO_EQUIPO[e.estado] ?? e.estado}</td>
          <td className={`${td} ${der}`}>{formatearMiles(e.cantidad)}</td>
          <td className={`${td} ${der}`}>{e.valorUnitario ? formatearCOP(e.valorUnitario) : "—"}</td>
          <td className={`${td} ${der}`}>{e.valorTotal > 0 ? formatearCOP(e.valorTotal) : "—"}</td>
          <td className={td}>{e.responsable ?? "—"}</td>
          <td className={td}>{e.garantia ? fechaBogota(e.garantia) : "—"}</td>
        </tr>
      ))}
    </>
  );
}
