import Link from "next/link";
import { prisma } from "@/lib/db";
import { verificarPayload } from "@/lib/qr/firma";
import { fechaBogota, formatearFechaHoraCortaBogota } from "@/lib/tiempo";
import { estaCerrado, personasAdelante, posicion, esperaEstimada, textoEspera, type TurnoEnFila } from "@/lib/fila/calculo";

export const dynamic = "force-dynamic";

// Menú del visitante: a esto llega el QR impreso en la manilla. Desde aquí salen las
// dos cosas que puede hacer con el celular (fila y consentimientos), sin tener que
// imprimir un QR distinto para cada una — en una banda de 2,84 cm no caben dos.

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="mx-auto max-w-lg p-6 text-center">
      <div className="rounded-xl border-4 border-red-300 bg-white p-6">
        <p className="text-lg font-semibold text-red-700">{texto}</p>
      </div>
    </main>
  );
}

export default async function MenuManillaPage({ params }: { params: Promise<{ payload: string }> }) {
  const { payload: raw } = await params;
  const payload = decodeURIComponent(raw);

  const verif = verificarPayload(payload);
  if (!verif.valido) return <Aviso texto="Código de manilla inválido." />;

  const manilla = await prisma.manilla.findUnique({
    where: { codigo_uuid: verif.uuid },
    include: { venta_detalle: { include: { tipo_visitante: { select: { nombre: true } } } } },
  });
  if (!manilla) return <Aviso texto="Manilla no encontrada." />;
  if (manilla.estado === "anulada") return <Aviso texto="Esta manilla está anulada." />;

  const vencida = !!manilla.vencimiento && manilla.vencimiento < new Date();
  const dia = fechaBogota();
  const enlace = encodeURIComponent(payload);

  const [misTurnos, atraccionesConFila, conConsentimiento, firmados] = await Promise.all([
    prisma.turnoFila.findMany({
      where: { manilla_id: manilla.id, fecha_operativa: dia },
      include: {
        atraccion: {
          select: {
            id: true, nombre: true, cupo_por_tanda: true, minutos_por_tanda: true,
            turnos_fila: { where: { fecha_operativa: dia }, select: { numero: true, personas: true, estado: true } },
          },
        },
      },
      orderBy: { tomado_en: "desc" },
    }),
    prisma.atraccion.count({ where: { activa: true, fila_activa: true } }),
    prisma.atraccion.count({ where: { activa: true, requiere_consentimiento: true } }),
    prisma.consentimiento.findMany({ where: { manilla_id: manilla.id }, select: { atraccion_id: true } }),
  ]);

  const abiertos = misTurnos.filter((t) => !estaCerrado(t.estado));
  const firmadas = new Set(firmados.map((c) => c.atraccion_id));
  const faltanFirmas = Math.max(0, conConsentimiento - firmadas.size);

  const turnos = abiertos.map((t) => {
    const fila: TurnoEnFila[] = t.atraccion.turnos_fila;
    const delante = personasAdelante(fila, t.numero);
    return {
      id: t.id,
      atraccion: t.atraccion.nombre,
      numero: t.numero,
      llamado: t.estado === "llamado",
      posicion: posicion(fila, t.numero),
      espera: textoEspera(esperaEstimada(delante, { cupo_por_tanda: t.atraccion.cupo_por_tanda, minutos_por_tanda: t.atraccion.minutos_por_tanda })),
    };
  });

  return (
    <main className="mx-auto max-w-lg p-4">
      <header className="mb-5 rounded-2xl border-4 border-ranch-marron bg-white p-5 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Ranch Texas" className="mx-auto mb-2 h-16 w-auto" />
        <p className="text-2xl font-black text-ranch-marron">Manilla {manilla.consecutivo}</p>
        <p className="text-sm text-ranch-marron/60">{manilla.venta_detalle.tipo_visitante.nombre}</p>
        {vencida ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
            Vencida. Pide una nueva en taquilla.
          </p>
        ) : (
          manilla.vencimiento && (
            <p className="mt-1 text-xs text-ranch-marron/45">
              Válida hasta {formatearFechaHoraCortaBogota(manilla.vencimiento)}
            </p>
          )
        )}
      </header>

      {/* Lo más urgente primero: si lo están llamando, que no se le pase. */}
      {turnos.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ranch-marron/50">Tus turnos de hoy</h2>
          <div className="space-y-2">
            {turnos.map((t) => (
              <Link
                key={t.id}
                href={`/fila/${enlace}`}
                className={`block rounded-2xl border-4 p-4 ${t.llamado ? "border-ranch-verde bg-ranch-verde/10" : "border-ranch-marron/25 bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-ranch-marron">{t.atraccion}</p>
                    {t.llamado ? (
                      <p className="text-lg font-black text-ranch-verde">¡Es tu turno! Acércate ya.</p>
                    ) : (
                      <p className="text-sm text-ranch-marron/70">Eres el {t.posicion}º · falta {t.espera}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-ranch-marron">{t.numero}</p>
                    <p className="text-[10px] uppercase text-ranch-marron/45">turno</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-3">
        <Link
          href={`/fila/${enlace}`}
          className="flex items-center gap-4 rounded-2xl border-2 border-ranch-marron/20 bg-white p-5 transition hover:border-ranch-dorado"
        >
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ranch-marron/10 text-3xl">🎢</span>
          <span>
            <span className="block font-bold text-ranch-marron">Filas y turnos</span>
            <span className="block text-sm text-ranch-marron/55">
              {atraccionesConFila === 0
                ? "Hoy no hay atracciones con fila"
                : "Separa tu turno y vete a hacer otra cosa mientras esperas"}
            </span>
          </span>
        </Link>

        <Link
          href={`/consentimiento/${enlace}`}
          className={`flex items-center gap-4 rounded-2xl border-2 p-5 transition hover:border-ranch-dorado ${
            faltanFirmas > 0 ? "border-ranch-dorado bg-ranch-dorado/10" : "border-ranch-marron/20 bg-white"
          }`}
        >
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ranch-marron/10 text-3xl">✍️</span>
          <span>
            <span className="block font-bold text-ranch-marron">Consentimientos</span>
            <span className="block text-sm text-ranch-marron/55">
              {faltanFirmas > 0
                ? `Te faltan ${faltanFirmas} por firmar para poder subirte`
                : "Ya firmaste todos los que necesitas"}
            </span>
          </span>
        </Link>
      </div>

      <p className="mt-5 text-center text-xs text-ranch-marron/40">
        Guarda esta página en tu celular: es tu manilla.
      </p>
    </main>
  );
}
