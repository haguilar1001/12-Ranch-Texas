import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { qrDataUrl } from "@/lib/qr/generar";
import { construirZpl } from "@/lib/impresion";
import { formatearFechaHoraBogota, formatearFechaHoraCortaBogota } from "@/lib/tiempo";
import ImprimirAcciones from "./ImprimirAcciones";

export const dynamic = "force-dynamic";

const PARQUE = "RANCH TEXAS";

export default async function ImprimirVentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await obtenerSesion();
  if (!s) redirect("/login");

  const venta = await prisma.venta.findUnique({
    where: { id },
    include: {
      turno: { include: { caja: true } },
      usuario: { select: { nombre: true } },
      detalle: { include: { tipo_visitante: true, manillas: true }, orderBy: { creado_en: "asc" } },
    },
  });
  if (!venta) notFound();

  // Origen público para el enlace de consentimiento impreso.
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  const anulada = venta.estado === "anulada";

  // Aplanar manillas con su etiqueta e imagen QR, y el ZPL para la impresora Zebra.
  const items = [];
  const zpls: string[] = [];
  for (const d of venta.detalle) {
    for (const m of d.manillas) {
      const payload = `${m.codigo_uuid}.${m.firma_hmac}`;
      const etiqueta = m.es_bebe ? "BEBÉ" : d.tipo_visitante.nombre.toUpperCase();
      const emitida = formatearFechaHoraBogota(m.creado_en);
      const valida = m.vencimiento ? formatearFechaHoraBogota(m.vencimiento) : "—";
      const esCortesia = d.tipo_linea !== "pago";
      items.push({
        id: m.id,
        etiqueta,
        esCortesia,
        consecutivo: m.consecutivo,
        estado: m.estado,
        emitida,
        valida,
        qr: await qrDataUrl(payload),
        qrVisitante: await qrDataUrl(`${origin}/m/${payload}`),
      });
      if (m.estado === "activa" && !anulada) {
        zpls.push(construirZpl({
          parque: PARQUE,
          tipoVisitante: etiqueta,
          consecutivo: m.consecutivo,
          payloadQr: payload,
          caja: venta.turno.caja.nombre,
          cajero: venta.usuario.nombre,
          emitida: formatearFechaHoraCortaBogota(m.creado_en),
          valida: m.vencimiento ? formatearFechaHoraCortaBogota(m.vencimiento) : "—",
          esCortesia,
        }));
      }
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .manilla { page-break-after: always; border: none !important; }
          @page { size: 80mm auto; margin: 4mm; }
        }
      `}</style>

      <header className="no-print mb-4">
        <h1 className="text-2xl font-black text-ranch-marron">
          Manillas — Venta #{venta.numero_venta}
        </h1>
        <p className="text-sm text-ranch-marron/60">
          {venta.turno.caja.nombre} · {venta.usuario.nombre} · {items.length} manillas
          {anulada && <span className="ml-2 rounded bg-red-100 px-2 py-0.5 font-semibold text-red-700">ANULADA</span>}
        </p>
      </header>

      <div className="no-print mb-4">
        <ImprimirAcciones ventaId={venta.id} puedeSupervisar={tieneRol(s.rol, "supervisor")} anulada={anulada} zpls={zpls} />
      </div>

      {/* Tickets 80mm */}
      <div className="flex flex-wrap gap-4 print:block">
        {items.map((it) => (
          <div
            key={it.id}
            className="manilla w-[280px] rounded-lg border-2 border-dashed border-ranch-marron/40 bg-white p-3 text-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={PARQUE} className="mx-auto mb-1 h-8 w-auto" />
            <div className="my-1 border-y border-ranch-marron/20 py-1">
              <p className="text-2xl font-black text-ranch-marron">{it.etiqueta}</p>
              {it.esCortesia && <p className="text-xs font-bold text-ranch-dorado">CORTESÍA</p>}
            </div>
            <Image src={it.qr} alt={`QR ${it.consecutivo}`} width={180} height={180} className="mx-auto" unoptimized />
            <p className="mt-1 font-mono text-lg font-bold text-ranch-marron">{it.consecutivo}</p>
            {it.estado !== "activa" && (
              <p className="text-xs font-bold uppercase text-red-600">{it.estado}</p>
            )}
            <div className="mt-1 text-[10px] leading-tight text-ranch-marron/70">
              <p>Emitida: {it.emitida}</p>
              <p>Válida hasta: {it.valida}</p>
              <p>{venta.turno.caja.nombre} · {venta.usuario.nombre}</p>
            </div>
            <p className="mt-1 text-[8px] leading-tight text-ranch-marron/50">
              Conserve su manilla. Términos y condiciones aplican. El reingreso es válido el mismo día.
            </p>
            <div className="mt-1 border-t border-ranch-marron/15 pt-1">
              <p className="text-[8px] font-bold text-ranch-marron/70">TURNOS Y CONSENTIMIENTOS</p>
              <Image src={it.qrVisitante} alt={`Menú manilla ${it.consecutivo}`} width={90} height={90} className="mx-auto" unoptimized />
              <p className="text-[7px] text-ranch-marron/50">Escanea con tu celular: separa turno y firma</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
