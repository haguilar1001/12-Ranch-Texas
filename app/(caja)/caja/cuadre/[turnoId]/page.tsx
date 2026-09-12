import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { resumenTurno } from "@/lib/caja/resumen";
import { formatearCOP } from "@/lib/dinero/cop";
import { formatearFechaHoraBogota } from "@/lib/tiempo";
import CuadreAcciones from "./CuadreAcciones";

export const dynamic = "force-dynamic";

export default async function CuadrePage({ params }: { params: Promise<{ turnoId: string }> }) {
  const { turnoId } = await params;
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "cajero")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Sin acceso.</p></main>;
  }

  const turno = await prisma.turnoCaja.findUnique({ where: { id: turnoId }, include: { caja: true, usuario: { select: { nombre: true } } } });
  if (!turno) notFound();

  const resumen = await resumenTurno(turnoId);
  const cerrado = turno.estado === "cerrado";
  const dif = turno.diferencia ?? 0;

  const Fila = ({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) => (
    <div className={`flex justify-between py-1 text-sm ${fuerte ? "font-bold text-ranch-marron" : "text-ranch-marron/80"}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  );

  return (
    <main className="mx-auto max-w-lg p-4">
      <style>{`@media print { .no-print { display:none !important } @page { margin: 12mm } }`}</style>

      <CuadreAcciones turnoId={turnoId} esAdmin={tieneRol(s.rol, "administrador")} cerrado={cerrado} />

      <div className="rounded-xl border-2 border-ranch-marron/30 bg-white p-5">
        <div className="mb-2 text-center">
          <p className="text-xs uppercase tracking-widest text-ranch-dorado">Parque Ranch Texas</p>
          <h1 className="text-lg font-black text-ranch-marron">Cuadre de turno</h1>
          <p className="text-sm text-ranch-marron/60">
            {turno.caja.nombre} · {turno.usuario.nombre} · {turno.estado.toUpperCase()}
          </p>
          <p className="text-xs text-ranch-marron/50">
            Abierto {formatearFechaHoraBogota(turno.abierto_en)}{turno.cerrado_en ? ` · Cerrado ${formatearFechaHoraBogota(turno.cerrado_en)}` : ""}
          </p>
        </div>

        <h2 className="mt-3 border-b border-ranch-marron/15 pb-1 text-sm font-bold text-ranch-marron">Ventas por medio de pago</h2>
        {resumen.ventasPorMedio.map((m) => <Fila key={m.medio} k={m.medio} v={formatearCOP(m.total)} />)}
        <Fila k="Total ventas" v={formatearCOP(resumen.totalVentas)} fuerte />

        <h2 className="mt-3 border-b border-ranch-marron/15 pb-1 text-sm font-bold text-ranch-marron">Ventas por tipo</h2>
        {resumen.ventasPorTipo.map((t) => <Fila key={t.tipo} k={`${t.tipo} (${t.cantidad})`} v={formatearCOP(t.total)} />)}

        <h2 className="mt-3 border-b border-ranch-marron/15 pb-1 text-sm font-bold text-ranch-marron">Efectivo</h2>
        <Fila k="Base inicial" v={formatearCOP(resumen.base_inicial)} />
        <Fila k="+ Ventas efectivo" v={formatearCOP(resumen.ventasEfectivo)} />
        <Fila k="+ Otros ingresos" v={formatearCOP(resumen.otrosIngresos)} />
        <Fila k="− Egresos" v={formatearCOP(resumen.egresos)} />
        <Fila k="Efectivo esperado" v={formatearCOP(turno.efectivo_esperado ?? resumen.esperadoEfectivo)} fuerte />
        {cerrado && (
          <>
            <Fila k="Efectivo contado" v={formatearCOP(turno.efectivo_contado ?? 0)} fuerte />
            <div className={`flex justify-between py-1 text-base font-black ${dif === 0 ? "text-ranch-verde" : "text-red-600"}`}>
              <span>{dif === 0 ? "Cuadra" : dif > 0 ? "Sobrante" : "Faltante"}</span>
              <span>{formatearCOP(Math.abs(dif))}</span>
            </div>
            {turno.observacion_cierre && <p className="mt-1 rounded bg-ranch-crema/40 p-2 text-xs text-ranch-marron/80">Obs: {turno.observacion_cierre}</p>}
          </>
        )}

        {(resumen.cortesias > 0 || resumen.descuentos > 0 || resumen.anuladas > 0) && (
          <>
            <h2 className="mt-3 border-b border-ranch-marron/15 pb-1 text-sm font-bold text-ranch-marron">Otros</h2>
            {resumen.cortesias > 0 && <Fila k="Cortesías (entraron gratis)" v={formatearCOP(resumen.cortesias)} />}
            {resumen.descuentos > 0 && <Fila k="Descuentos de tarifa (no cobrado)" v={formatearCOP(resumen.descuentos)} />}
            {resumen.anuladas > 0 && <Fila k="Ventas anuladas" v={String(resumen.anuladas)} />}
          </>
        )}
      </div>
    </main>
  );
}
