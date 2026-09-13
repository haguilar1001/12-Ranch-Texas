// CÓMO VAN LAS CAJAS AHORA MISMO.
//
// Un administrador no tiene turno propio, y hasta ahora para saber cómo iba cada caja
// tenía que entrar turno por turno desde el cuadre diario — o abrir una caja a su
// nombre, que es peor: crea un turno fantasma que entra al cuadre del día y hay que
// acordarse de cerrarlo.
//
// Esta es la foto de la jornada: quién está abierto, desde cuándo, cuánto lleva
// vendido y cuánto debería haber en su cajón, más las cajas que ya cerraron con su
// diferencia. No escribe nada: es una pantalla de mirar.
//
// La agregación (`resumirEstado`) es PURA para poder probarla sin BD; la consulta
// vive aparte en `estadoDeCajas`.

import { prisma } from "../db";
import { resumenTurno } from "./resumen";
import { ordenarTurnos } from "../reportes/cierre";

export interface CajaEnEstado {
  turnoId: string;
  caja: string;
  cajero: string;
  /** abierto | reabierto | cerrado */
  estado: string;
  abierto_en: Date;
  cerrado_en: Date | null;
  base: number;
  numVentas: number;
  anuladas: number;
  asistentes: number;
  totalVentas: number;
  /** Lo que debería haber en el cajón: base + efectivo + ingresos − egresos. */
  esperadoEfectivo: number;
  /** Solo en las cerradas: lo que el cajero contó y su diferencia contra lo esperado. */
  contado: number | null;
  diferencia: number | null;
}

export interface EstadoCajas {
  abiertas: CajaEnEstado[];
  cerradas: CajaEnEstado[];
  /** Vendido en la jornada, abiertas y cerradas juntas. */
  totalVentas: number;
  totalAsistentes: number;
  totalVentasCount: number;
  /** Efectivo que debería estar AHORA en los cajones de las cajas abiertas. */
  efectivoEnCajones: number;
  /** Suma de las diferencias de las cajas ya cerradas. 0 = todas cuadraron. */
  diferenciaCerradas: number;
  /** Cuántas de las cerradas no cuadraron: es lo que hay que mirar primero. */
  cerradasConDiferencia: number;
}

/**
 * Consolida la foto del día. Pura: recibe las cajas ya armadas.
 *
 * El efectivo esperado SOLO suma las cajas abiertas: el de una caja cerrada ya salió
 * del cajón y está en la consignación, así que sumarlo diría que hay en el parque
 * una plata que ya no está.
 */
export function resumirEstado(abiertas: CajaEnEstado[], cerradas: CajaEnEstado[]): EstadoCajas {
  const todas = [...abiertas, ...cerradas];
  return {
    abiertas,
    cerradas,
    totalVentas: todas.reduce((a, c) => a + c.totalVentas, 0),
    totalAsistentes: todas.reduce((a, c) => a + c.asistentes, 0),
    totalVentasCount: todas.reduce((a, c) => a + c.numVentas, 0),
    efectivoEnCajones: abiertas.reduce((a, c) => a + c.esperadoEfectivo, 0),
    diferenciaCerradas: cerradas.reduce((a, c) => a + (c.diferencia ?? 0), 0),
    cerradasConDiferencia: cerradas.filter((c) => (c.diferencia ?? 0) !== 0).length,
  };
}

/** Cuánto lleva abierto un turno, en palabras: "3 h 15 min". */
export function tiempoAbierto(desde: Date, ahora: Date = new Date()): string {
  const minutos = Math.max(0, Math.floor((ahora.getTime() - desde.getTime()) / 60000));
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Estado de las cajas de la jornada: las abiertas ahora y las que cerraron hoy.
 *
 * Se apoya en `resumenTurno`, el mismo cálculo del cuadre de cada caja: si esta
 * pantalla hiciera sus propias cuentas podría decir una cifra y el cuadre otra, y
 * entonces no serviría ninguna de las dos.
 */
export async function estadoDeCajas(desde: Date, hasta: Date): Promise<EstadoCajas> {
  const turnos = await prisma.turnoCaja.findMany({
    where: {
      OR: [
        // Abierto ahora, sin importar cuándo se abrió: un turno que quedó de ayer
        // tiene que verse, justamente para que alguien lo cierre.
        { estado: { in: ["abierto", "reabierto"] } },
        { estado: "cerrado", cerrado_en: { gte: desde, lt: hasta } },
      ],
    },
    include: { caja: { select: { nombre: true } }, usuario: { select: { nombre: true } } },
  });

  const armadas = await Promise.all(
    turnos.map(async (t): Promise<CajaEnEstado> => {
      const r = await resumenTurno(t.id);
      return {
        turnoId: t.id,
        caja: t.caja.nombre,
        cajero: t.usuario?.nombre ?? "—",
        estado: t.estado,
        abierto_en: t.abierto_en,
        cerrado_en: t.cerrado_en,
        base: r.base_inicial,
        numVentas: r.numVentas,
        anuladas: r.anuladas,
        asistentes: r.asistentes,
        totalVentas: r.totalVentas,
        esperadoEfectivo: r.esperadoEfectivo,
        contado: t.efectivo_contado,
        diferencia: t.diferencia,
      };
    }),
  );

  // Mismo orden que el informe de cierre: CAJA 1, CAJA 2, CAJA 3, todos los días.
  return resumirEstado(
    ordenarTurnos(armadas.filter((c) => c.estado !== "cerrado")),
    ordenarTurnos(armadas.filter((c) => c.estado === "cerrado")),
  );
}
