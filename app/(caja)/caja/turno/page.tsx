import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { turnoAbiertoDe, cajasConOcupacion } from "@/lib/caja/turno";
import { resumenTurno } from "@/lib/caja/resumen";
import { formatearFechaHoraBogota } from "@/lib/tiempo";
import TurnoForm from "./TurnoForm";
import CajaAbierta from "./CajaAbierta";

export const dynamic = "force-dynamic";

export default async function TurnoPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");

  const turno = await turnoAbiertoDe(s.id);

  if (!turno) {
    const cajas = await cajasConOcupacion();
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="mb-1 text-2xl font-black text-ranch-marron">Turno de caja</h1>
        <p className="mb-6 text-sm text-ranch-marron/60">Cajero: {s.nombre}</p>
        <div className="rounded-2xl border-4 border-ranch-marron bg-white p-6">
          <p className="mb-4 text-sm text-ranch-marron/70">No tienes un turno abierto. Abre uno para poder vender.</p>
          <TurnoForm cajas={cajas} />
        </div>
      </main>
    );
  }

  const resumen = await resumenTurno(turno.id);
  const movimientos = await prisma.movimientoCaja.findMany({
    where: { turno_id: turno.id, tipo: { in: ["ingreso", "egreso"] } },
    orderBy: { creado_en: "desc" },
    include: { medio_pago: true },
  });
  const medios = await prisma.medioPago.findMany({ where: { activo: true }, orderBy: { orden: "asc" } });
  const beneficiarios = await prisma.beneficiarioCaja.findMany({
    where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, documento: true },
  });

  return (
    <CajaAbierta
      cajero={s.nombre}
      turno={{
        id: turno.id,
        caja: turno.caja.nombre,
        base_inicial: turno.base_inicial,
        abierto: formatearFechaHoraBogota(turno.abierto_en),
        estado: turno.estado,
      }}
      resumen={resumen}
      movimientos={movimientos.map((m) => ({
        id: m.id, tipo: m.tipo as "ingreso" | "egreso", numero: m.numero, tercero: m.tercero, monto: m.monto, concepto: m.concepto,
        medio: m.medio_pago?.nombre ?? null, hora: formatearFechaHoraBogota(m.creado_en),
      }))}
      medios={medios.map((m) => ({ id: m.id, nombre: m.nombre }))}
      beneficiarios={beneficiarios}
      puedeGestionarBeneficiarios={tieneRol(s.rol, "supervisor")}
    />
  );
}
