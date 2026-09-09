import type { TipoLinea } from "./calculo";

export interface EntradaLinea {
  tipo_visitante_id: string;
  cantidad: number;
  tipo_linea: TipoLinea;
  motivo_cortesia_id?: string | null;
  autorizado_por?: string | null;
  /**
   * Descuento: cuánto se cobra por unidad. Se omite si se cobra la tarifa completa.
   * El servidor lo recorta al rango [0, tarifa vigente] — nunca confía en este número.
   */
  valor_cobrado?: number | null;
  motivo_descuento?: string | null;
}

export interface EntradaPago {
  medio_pago_id: string;
  monto: number;
}

export interface EntradaVenta {
  lineas: EntradaLinea[];
  pagos: EntradaPago[];
  comprador_nombre?: string;
  comprador_documento?: string;
}

export type ResultadoVenta =
  | { ok: true; numero_venta: number; venta_id: string }
  | { ok: false; error: string };

/** Contexto de ejecución de la venta (cajero + turno + caja). */
export interface ContextoVenta {
  usuarioId: string;
  usuarioNombre: string;
  turnoId: string;
  cajaNombre: string;
}
