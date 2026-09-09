import { prisma } from "@/lib/db";
import { verificarPayload } from "@/lib/qr/firma";
import { fechaBogota } from "@/lib/tiempo";
import { personasAdelante, posicion, esperaEstimada, textoEspera, estaCerrado, type TurnoEnFila } from "@/lib/fila/calculo";
import { describirRestricciones } from "@/lib/accesos/restricciones";
import FilaClient from "./FilaClient";

export const dynamic = "force-dynamic";

function Aviso({ texto }: { texto: string }) {
  return (
    <main className="mx-auto max-w-lg p-6 text-center">
      <div className="rounded-xl border-4 border-red-300 bg-white p-6">
        <p className="text-lg font-semibold text-red-700">{texto}</p>
      </div>
    </main>
  );
}

export default async function FilaPage({ params }: { params: Promise<{ payload: string }> }) {
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
  if (manilla.vencimiento && manilla.vencimiento < new Date()) {
    return <Aviso texto="Esta manilla ya venció. Pide una nueva en taquilla." />;
  }

  const dia = fechaBogota();

  const [atracciones, misTurnos, firmados] = await Promise.all([
    prisma.atraccion.findMany({
      where: { activa: true, fila_activa: true },
      orderBy: { nombre: "asc" },
      include: {
        turnos_fila: {
          where: { fecha_operativa: dia },
          select: { numero: true, personas: true, estado: true },
          orderBy: { numero: "asc" },
        },
      },
    }),
    prisma.turnoFila.findMany({
      where: { manilla_id: manilla.id, fecha_operativa: dia },
      orderBy: { tomado_en: "desc" },
    }),
    prisma.consentimiento.findMany({ where: { manilla_id: manilla.id }, select: { atraccion_id: true } }),
  ]);

  const firmadas = new Set(firmados.map((c) => c.atraccion_id));
  const turnoPorAtraccion = new Map(
    misTurnos.filter((t) => !estaCerrado(t.estado)).map((t) => [t.atraccion_id, t]),
  );

  const vista = atracciones.map((a) => {
    const fila: TurnoEnFila[] = a.turnos_fila;
    const mio = turnoPorAtraccion.get(a.id) ?? null;
    const cfg = { cupo_por_tanda: a.cupo_por_tanda, minutos_por_tanda: a.minutos_por_tanda };

    const enEspera = fila.filter((t) => !estaCerrado(t.estado));
    const personasEnFila = enEspera.reduce((acc, t) => acc + Math.max(1, t.personas), 0);

    let miPosicion: number | null = null;
    let miEspera: string | null = null;
    if (mio) {
      const delante = personasAdelante(fila, mio.numero);
      miPosicion = posicion(fila, mio.numero);
      miEspera = textoEspera(esperaEstimada(delante, cfg));
    }

    return {
      id: a.id,
      nombre: a.nombre,
      descripcion: a.descripcion,
      restricciones: describirRestricciones(a),
      requiere_consentimiento: a.requiere_consentimiento,
      firmado: firmadas.has(a.id),
      personasEnFila,
      // Lo que esperaría alguien que pida turno AHORA.
      esperaSiEntroAhora: textoEspera(esperaEstimada(personasEnFila, cfg)),
      miTurno: mio ? { id: mio.id, numero: mio.numero, estado: mio.estado, personas: mio.personas } : null,
      miPosicion,
      miEspera,
      llamando: fila.filter((t) => t.estado === "llamado").map((t) => t.numero).sort((x, y) => x - y)[0] ?? null,
    };
  });

  return (
    <FilaClient
      payload={payload}
      manilla={{ consecutivo: manilla.consecutivo, tipo: manilla.venta_detalle.tipo_visitante.nombre }}
      atracciones={vista}
    />
  );
}
