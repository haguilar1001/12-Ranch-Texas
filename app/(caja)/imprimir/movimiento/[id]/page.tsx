import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { formatearFechaHoraBogota } from "@/lib/tiempo";
import { formatearCOP } from "@/lib/dinero/cop";
import { pesosEnLetras } from "@/lib/dinero/letras";
import { PARQUE } from "@/lib/config/parque";
import ReciboAcciones from "../../venta/[id]/recibo/ReciboAcciones";

export const dynamic = "force-dynamic";

// Comprobante de un movimiento manual de caja (ingreso o egreso): el soporte en papel de la
// plata que sale del cajón (o entra) sin ser una venta. Lleva consecutivo propio por tipo,
// valor en letras y firmas de quien entrega y quien recibe.
export default async function ComprobanteMovimientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await obtenerSesion();
  if (!s) redirect("/login");

  const m = await prisma.movimientoCaja.findUnique({
    where: { id },
    include: {
      turno: { include: { caja: true, usuario: { select: { id: true, nombre: true } } } },
      medio_pago: { select: { nombre: true } },
    },
  });
  if (!m || (m.tipo !== "ingreso" && m.tipo !== "egreso")) notFound();
  // El cajero ve los de su propio turno; supervisor y administrador, todos.
  if (m.turno.usuario.id !== s.id && !tieneRol(s.rol, "supervisor")) notFound();

  const egreso = m.tipo === "egreso";
  const titulo = egreso ? "COMPROBANTE DE EGRESO" : "COMPROBANTE DE INGRESO";
  const firmaIzq = egreso ? "Entregó (cajero)" : "Entregó";
  const firmaDer = egreso ? "Recibió" : "Recibió (cajero)";

  return (
    <main className="mx-auto max-w-sm p-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { size: 80mm auto; margin: 3mm; }
        }
      `}</style>

      <header className="no-print mb-4">
        <h1 className="text-2xl font-black text-ranch-marron">
          {egreso ? "Egreso" : "Ingreso"} de caja N.° {m.numero ?? "—"}
        </h1>
      </header>

      <div className="no-print mb-4">
        <ReciboAcciones />
      </div>

      {/* Ticket 80mm */}
      <div className="w-[302px] bg-white p-2 font-mono text-[11px] leading-tight text-ranch-marron">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={PARQUE.nombreComercial} className="mx-auto mb-1 h-10 w-auto" />
          <p className="text-sm font-bold uppercase">{PARQUE.nombreComercial}</p>
          {PARQUE.razonSocial && <p className="uppercase">{PARQUE.razonSocial}</p>}
          {PARQUE.nit && <p>NIT {PARQUE.nit}</p>}
          <p>{PARQUE.direccion}</p>
          {PARQUE.telefono && <p>Tel. {PARQUE.telefono}</p>}
        </div>

        <div className="my-2 border-y border-dashed border-ranch-marron/40 py-1 text-center">
          <p className="font-bold">{titulo} N.° {m.numero ?? "—"}</p>
          <p>{formatearFechaHoraBogota(m.creado_en)}</p>
        </div>

        <div className="mb-2 space-y-1">
          {m.tercero && (
            <p><span className="font-bold">{egreso ? "Pagado a:" : "Recibido de:"}</span> {m.tercero}</p>
          )}
          <p><span className="font-bold">Concepto:</span> {m.concepto}</p>
          {m.medio_pago && <p><span className="font-bold">Medio:</span> {m.medio_pago.nombre}</p>}
        </div>

        <div className="border-t border-dashed border-ranch-marron/40 pt-1">
          <div className="flex justify-between text-sm font-bold">
            <span>VALOR</span>
            <span>{formatearCOP(m.monto)}</span>
          </div>
          <p className="mt-1 text-[10px]">Son: {pesosEnLetras(m.monto)}</p>
        </div>

        {/* Firmas: el papel es el soporte de que la plata se entregó. */}
        <div className="mt-8 grid grid-cols-2 gap-3 text-center text-[10px]">
          <div>
            <div className="border-t border-ranch-marron/60 pt-1">{firmaIzq}</div>
            {egreso && <p className="mt-0.5">{m.turno.usuario.nombre}</p>}
          </div>
          <div>
            <div className="border-t border-ranch-marron/60 pt-1">{firmaDer}</div>
            {!egreso && <p className="mt-0.5">{m.turno.usuario.nombre}</p>}
            <p className="mt-2 text-left">C.C.</p>
          </div>
        </div>

        <div className="mt-3 border-t border-dashed border-ranch-marron/40 pt-1 text-center">
          <p>{m.turno.caja.nombre} · {m.turno.usuario.nombre}</p>
          <p className="mt-2 text-[9px]">*** Este documento NO es una factura de venta ***</p>
        </div>
      </div>
    </main>
  );
}
