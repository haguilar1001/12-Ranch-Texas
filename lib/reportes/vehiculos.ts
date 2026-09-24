import { prisma } from "../db";
import { kmRecorridos } from "../vehiculos/calculo";

export interface FilaViajeCompletado {
  solicitante: string;
  chofer: string;
  vehiculo: string;
  km_inicial: number | null;
  km_final: number | null;
}

export interface AgrupadoVehiculo {
  nombre: string;
  viajes: number;
  km: number;
}

export interface IndicadoresVehiculos {
  totalViajes: number;
  kmTotales: number;
  /** Quién más pide el vehículo — el control que motivó este reporte. */
  porSolicitante: AgrupadoVehiculo[];
  porChofer: AgrupadoVehiculo[];
  porVehiculo: AgrupadoVehiculo[];
}

function agrupar(filas: FilaViajeCompletado[], clave: keyof Pick<FilaViajeCompletado, "solicitante" | "chofer" | "vehiculo">): AgrupadoVehiculo[] {
  const acc = new Map<string, AgrupadoVehiculo>();
  for (const f of filas) {
    const nombre = f[clave];
    const a = acc.get(nombre) ?? { nombre, viajes: 0, km: 0 };
    a.viajes += 1;
    a.km += kmRecorridos(f.km_inicial, f.km_final);
    acc.set(nombre, a);
  }
  return [...acc.values()].sort((a, b) => b.viajes - a.viajes || b.km - a.km);
}

/** Agregación PURA (sin BD) de los viajes ya completados en el período. */
export function resumirVehiculos(filas: FilaViajeCompletado[]): IndicadoresVehiculos {
  return {
    totalViajes: filas.length,
    kmTotales: filas.reduce((a, f) => a + kmRecorridos(f.km_inicial, f.km_final), 0),
    porSolicitante: agrupar(filas, "solicitante"),
    porChofer: agrupar(filas, "chofer"),
    porVehiculo: agrupar(filas, "vehiculo"),
  };
}

/** Viajes completados en `[desde, hasta)` por fecha de cierre. */
export async function indicadoresVehiculos(desde: Date, hasta: Date): Promise<IndicadoresVehiculos> {
  const solicitudes = await prisma.solicitudVehiculo.findMany({
    where: { estado: "completada", cerrado_en: { gte: desde, lt: hasta } },
    select: {
      km_inicial: true, km_final: true,
      solicitante: { select: { nombre: true } },
      chofer: { select: { nombre: true } },
      vehiculo: { select: { placa: true } },
    },
  });
  const filas: FilaViajeCompletado[] = solicitudes.map((s) => ({
    solicitante: s.solicitante.nombre,
    chofer: s.chofer?.nombre ?? "—",
    vehiculo: s.vehiculo?.placa ?? "—",
    km_inicial: s.km_inicial,
    km_final: s.km_final,
  }));
  return resumirVehiculos(filas);
}
