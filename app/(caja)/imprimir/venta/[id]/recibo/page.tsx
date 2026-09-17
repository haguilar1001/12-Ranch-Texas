import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { obtenerSesion } from "@/lib/auth/sesion";
import { formatearFechaHoraBogota } from "@/lib/tiempo";
import { formatearCOP } from "@/lib/dinero/cop";
import { PARQUE } from "@/lib/config/parque";
import ReciboAcciones from "./ReciboAcciones";

export const dynamic = "force-dynamic";

/** Un dato del emisor que aún no se completó en `lib/config/parque.ts`. */
const opcional = (v: string | null) => v ?? "(pendiente)";

export default async function ReciboVentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await obtenerSesion();
  if (!s) redirect("/login");

  const venta = await prisma.venta.findUnique({
    where: { id },
    include: {
      turno: { include: { caja: true } },
      usuario: { select: { nombre: true } },
      detalle: { include: { tipo_visitante: true }, orderBy: { creado_en: "asc" } },
      pagos: { include: { medio_pago: true } },
    },
  });
  if (!venta) notFound();

  const anulada = venta.estado === "anulada";
  const esEmpresa = !!(venta.comprador_razon_social && venta.comprador_nit);

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
        <h1 className="text-2xl font-black text-ranch-marron">Recibo de caja — Venta #{venta.numero_venta}</h1>
        {anulada && <span className="mt-1 inline-block rounded bg-red-100 px-2 py-0.5 text-sm font-semibold text-red-700">ANULADA</span>}
      </header>

      <div className="no-print mb-4">
        <ReciboAcciones />
      </div>

      {/* Ticket 80mm */}
      <div className="w-[302px] bg-white p-2 font-mono text-[11px] leading-tight text-ranch-marron">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={PARQUE.razonSocial} className="mx-auto mb-1 h-10 w-auto" />
          <p className="text-sm font-bold uppercase">{PARQUE.razonSocial}</p>
          <p>NIT {opcional(PARQUE.nit)}</p>
          <p>{opcional(PARQUE.direccion)}</p>
          {PARQUE.telefono && <p>Tel. {PARQUE.telefono}</p>}
        </div>

        <div className="my-2 border-y border-dashed border-ranch-marron/40 py-1 text-center">
          <p className="font-bold">RECIBO DE CAJA N.° {venta.numero_venta}</p>
          <p>{formatearFechaHoraBogota(venta.creado_en)}</p>
          {anulada && <p className="font-bold uppercase text-red-600">*** ANULADA ***</p>}
        </div>

        <div className="mb-2">
          <p className="font-bold uppercase">Cliente</p>
          {esEmpresa ? (
            <>
              <p>{venta.comprador_razon_social}</p>
              <p>NIT {venta.comprador_nit}</p>
            </>
          ) : (
            <p>{venta.comprador_nombre?.trim() || "Cliente particular"}</p>
          )}
          {venta.comprador_documento && <p>Doc. {venta.comprador_documento}</p>}
          {venta.comprador_celular && <p>Cel. {venta.comprador_celular}</p>}
          {venta.comprador_email && <p>{venta.comprador_email}</p>}
        </div>

        <div className="mb-2 border-t border-dashed border-ranch-marron/40 pt-1">
          {venta.detalle.map((d) => (
            <div key={d.id} className="mb-1 flex justify-between gap-2">
              <span>
                {d.cantidad} × {d.tipo_visitante.nombre}
                {d.tipo_linea !== "pago" && <span className="ml-1 font-bold">({d.tipo_linea})</span>}
              </span>
              <span className="whitespace-nowrap">{formatearCOP(d.valor_cobrado * d.cantidad)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-ranch-marron/40 pt-1">
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>{formatearCOP(venta.total_cobrado)}</span>
          </div>
          <p className="mt-1">{venta.cantidad_asistentes} asistente{venta.cantidad_asistentes === 1 ? "" : "s"}</p>
        </div>

        <div className="mb-2 mt-2 border-t border-dashed border-ranch-marron/40 pt-1">
          <p className="font-bold uppercase">Pago</p>
          {venta.pagos.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span>{p.medio_pago.nombre}</span>
              <span>{formatearCOP(p.monto)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-ranch-marron/40 pt-1 text-center">
          <p>{venta.turno.caja.nombre} · {venta.usuario.nombre}</p>
          <p className="mt-2 text-[9px]">*** Este documento NO es una factura de venta ***</p>
        </div>
      </div>
    </main>
  );
}
