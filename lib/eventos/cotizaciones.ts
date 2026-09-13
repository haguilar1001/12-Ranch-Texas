// Los eventos del día vienen de la app de Cotizaciones, que es donde se arman.
//
// Acá NO se guarda nada: se consulta y se muestra. Copiar la programación a esta
// base serían dos verdades — si allá mueven un pedido a las 11 de la mañana, la
// copia seguiría diciendo la hora vieja y el parque montaría el refrigerio tarde.
//
// Por lo mismo, cuando la otra app no contesta esta pantalla dice "no pude
// consultar" y no muestra nada: un listado viejo presentado como el de hoy es
// peor que no tener listado.

import { fechaBogota } from "../tiempo";

/** Si Cotizaciones no contesta en este tiempo, se avisa en vez de dejar la pantalla colgada. */
const ESPERA_MAXIMA_MS = 8_000;

export interface EventoDelDia {
  codigo: string;
  /** Hora de llegada del evento, tal como la escribieron al cotizar ("10:00AM"). */
  hora: string | null;
  tipo: string | null;
  cliente: string;
  /** Quien responde por el pago: la caja de compensación si va por una, si no el cliente. */
  responsable: string;
  personas: number;
  salones: string;
}

export interface PedidoDelDia {
  hora: string | null;
  nombre: string;
  detalle: string | null;
  cantidad: number;
  unidad: "personas" | "unidades";
  evento: string;
  responsable: string;
  horaEvento: string | null;
  personasEvento: number;
  salones: string;
  entidad: string | null;
}

export interface TotalDelDia {
  nombre: string;
  unidad: "personas" | "unidades";
  cantidad: number;
}

export interface ProgramacionDelDia {
  fecha: string;
  empresa: { slug: string; nombre: string };
  entidad: { id: string; nombre: string } | null;
  eventos: EventoDelDia[];
  pedidos: PedidoDelDia[];
  totales: TotalDelDia[];
  personas: number;
  generado: string;
}

export type ResultadoProgramacion =
  | { ok: true; datos: ProgramacionDelDia }
  /** `configurar` distingue "falta conectar las dos apps" de "la otra app falló". */
  | { ok: false; error: string; configurar?: boolean };

/** Lo que hace falta en el entorno para poder consultar. */
function configuracion() {
  return {
    url: process.env.COTIZACIONES_URL?.trim().replace(/\/+$/, ""),
    token: process.env.COTIZACIONES_TOKEN?.trim(),
    empresa: process.env.COTIZACIONES_EMPRESA?.trim(),
    /** Razón social del parque dentro de Cotizaciones. Vacío = traer todo el día. */
    entidad: process.env.COTIZACIONES_ENTIDAD?.trim(),
  };
}

/** ¿Están puestas las variables para hablar con Cotizaciones? */
export function hayConexionConfigurada(): boolean {
  const c = configuracion();
  return !!(c.url && c.token && c.empresa);
}

/**
 * Trae la programación de un día. `fecha` en formato YYYY-MM-DD; por defecto, hoy
 * en Bogotá (no la del servidor, que en Railway corre en UTC y a las 7 p.m. ya
 * estaría mostrando el día siguiente).
 */
export async function programacionDelDia(fecha?: string): Promise<ResultadoProgramacion> {
  const { url, token, empresa, entidad } = configuracion();
  if (!url || !token || !empresa) {
    return {
      ok: false,
      configurar: true,
      error: "Falta conectar la app de Cotizaciones (COTIZACIONES_URL, COTIZACIONES_TOKEN y COTIZACIONES_EMPRESA).",
    };
  }

  const dia = fecha ?? fechaBogota();
  const destino = new URL(`${url}/api/programacion`);
  destino.searchParams.set("empresa", empresa);
  destino.searchParams.set("fecha", dia);
  if (entidad) destino.searchParams.set("entidad", entidad);

  try {
    const r = await fetch(destino, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(ESPERA_MAXIMA_MS),
      cache: "no-store",
    });

    if (!r.ok) {
      // El 404 de "esa razón social no tiene pedidos hoy" es un día vacío, no un error.
      if (r.status === 404 && entidad) {
        return {
          ok: true,
          datos: {
            fecha: dia, empresa: { slug: empresa, nombre: empresa },
            entidad: null, eventos: [], pedidos: [], totales: [], personas: 0,
            generado: new Date().toISOString(),
          },
        };
      }
      const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: cuerpo?.error ?? `Cotizaciones respondió ${r.status}.` };
    }

    return { ok: true, datos: (await r.json()) as ProgramacionDelDia };
  } catch (e) {
    const porTiempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      error: porTiempo
        ? "La app de Cotizaciones no contestó a tiempo."
        : "No se pudo consultar la app de Cotizaciones.",
    };
  }
}
