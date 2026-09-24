import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { turnoAbiertoDe } from "@/lib/caja/turno";
import { diaOperativoDe } from "@/lib/tarifas/disponibilidad";
import TaquillaClient, { type VentaACorregir } from "./TaquillaClient";

export const dynamic = "force-dynamic";

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="mx-auto max-w-md p-6 text-center">
      <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-amber-800">{texto}</p>
      <Link href="/caja/ventas" className="inline-block rounded-lg bg-ranch-marron px-5 py-3 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro">
        ← Volver a las ventas
      </Link>
    </main>
  );
}

export default async function TaquillaPage({
  searchParams,
}: {
  searchParams: Promise<{ corrige?: string }>;
}) {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!["cajero", "supervisor", "administrador"].includes(s.rol)) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="rounded-lg bg-red-50 px-4 py-3 text-red-700">
          Tu rol ({s.rol}) no tiene acceso a taquilla.
        </p>
      </main>
    );
  }

  const { corrige } = await searchParams;

  // ---------------------------------------------------------------- corrección
  // Corregir no crea la venta en el turno del supervisor sino en el de la venta
  // original, para que la plata no se mueva de caja. Por eso aquí no se exige que
  // el supervisor tenga turno propio, sino que el turno de esa venta siga abierto.
  let correccion: VentaACorregir | null = null;
  let cajaNombre: string;

  if (corrige) {
    if (!tieneRol(s.rol, "supervisor")) {
      return <Aviso texto="Solo un supervisor puede corregir una venta. Pídele a tu supervisor que la corrija." />;
    }

    const v = await prisma.venta.findUnique({
      where: { id: corrige },
      include: {
        detalle: true,
        pagos: true,
        usuario: { select: { nombre: true } },
        turno: { include: { caja: { select: { nombre: true } } } },
      },
    });

    if (!v) return <Aviso texto="No encontré esa venta." />;
    if (v.estado === "anulada") return <Aviso texto="Esa venta ya está anulada: no hay nada que corregir." />;
    if (!["abierto", "reabierto"].includes(v.turno.estado)) {
      return <Aviso texto="El turno de esa venta ya está cerrado: a estas alturas solo se puede anular, no corregir." />;
    }

    correccion = {
      id: v.id,
      numero: v.numero_venta,
      cajeroOriginal: v.usuario?.nombre ?? "—",
      lineas: v.detalle.map((d) => ({
        tipo_visitante_id: d.tipo_visitante_id,
        cantidad: d.cantidad,
        tipo_linea: d.tipo_linea as VentaACorregir["lineas"][number]["tipo_linea"],
        valor_lista: d.valor_lista,
        valor_cobrado: d.valor_cobrado,
        motivo_cortesia_id: d.motivo_cortesia_id,
        beneficiario: d.beneficiario,
        escaneado: d.escaneado,
        motivo_descuento: d.motivo_descuento,
        autorizado_por: d.autorizado_por,
      })),
      pagos: v.pagos.map((p) => ({ medio_pago_id: p.medio_pago_id, monto: p.monto })),
      comprador: {
        nombre: v.comprador_nombre ?? "",
        documento: v.comprador_documento ?? "",
        celular: v.comprador_celular ?? "",
        email: v.comprador_email ?? "",
      },
      empresa: v.comprador_razon_social && v.comprador_nit
        ? { razon_social: v.comprador_razon_social, nit: v.comprador_nit }
        : null,
    };
    cajaNombre = v.turno.caja.nombre;
  } else {
    const turno = await turnoAbiertoDe(s.id);
    if (!turno) {
      return (
        <main className="mx-auto max-w-md p-6 text-center">
          <h1 className="mb-2 text-2xl font-black text-ranch-marron">Taquilla</h1>
          <p className="mb-4 text-ranch-marron/70">Debes abrir un turno de caja para vender.</p>
          <Link
            href="/caja/turno"
            className="inline-block rounded-lg bg-ranch-marron px-5 py-3 font-semibold text-ranch-crema hover:bg-ranch-marron-oscuro"
          >
            Abrir turno →
          </Link>
        </main>
      );
    }
    cajaNombre = turno.caja.nombre;
  }

  // El cajero solo ve los tipos que aplican HOY (todos los días, o la franja de hoy):
  // los que son de la otra franja ni siquiera llegan a la pantalla. Y los tipos
  // "solo administrador" (p. ej. Eventos Varios) ni aparecen si quien vende no lo es.
  const diaHoy = diaOperativoDe();
  const esAdmin = tieneRol(s.rol, "administrador");
  const [tiposRaw, medios, motivos, autorizadores] = await Promise.all([
    prisma.tipoVisitante.findMany({
      where: {
        activo: true,
        OR: [{ disponible_dias: "todos" }, { disponible_dias: diaHoy }],
        ...(esAdmin ? {} : { solo_administrador: false }),
      },
      orderBy: { orden: "asc" },
      include: { tarifas: { where: { vigente_hasta: null }, orderBy: { vigente_desde: "desc" }, take: 1 } },
    }),
    prisma.medioPago.findMany({ where: { activo: true }, orderBy: { orden: "asc" } }),
    prisma.motivoCortesia.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    // Catálogo editable en /admin/tarifas: no todos son usuarios de la app.
    prisma.autorizadorCortesia.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, cargo: true },
      orderBy: { nombre: "asc" },
    }),
  ]);

  const tipos = tiposRaw.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    codigo: t.codigo,
    requiere_pago: t.requiere_pago,
    valor: t.tarifas[0]?.valor ?? 0,
    icono: t.icono,
    requiere_carnet: t.requiere_carnet,
    requiere_escaneo: t.requiere_escaneo,
    permite_descuento: t.permite_descuento,
  }));

  return (
    <TaquillaClient
      cajero={s.nombre}
      caja={cajaNombre}
      tipos={tipos}
      medios={medios.map((m) => ({ id: m.id, nombre: m.nombre, codigo: m.codigo, es_efectivo: m.es_efectivo }))}
      motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre }))}
      autorizadores={autorizadores}
      correccion={correccion}
      puedeCorregir={tieneRol(s.rol, "supervisor")}
      esFinde={diaHoy === "fin_semana_festivo"}
    />
  );
}
