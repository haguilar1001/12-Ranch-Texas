import type { TipoLinea } from "./calculo";

export interface EntradaLinea {
  tipo_visitante_id: string;
  cantidad: number;
  tipo_linea: TipoLinea;
  motivo_cortesia_id?: string | null;
  /** A nombre de quién entró la cortesía. El motivo dice por qué; esto dice a quién. */
  beneficiario?: string | null;
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
  /**
   * Llave que identifica ESTE intento de registro. La taquilla la genera una vez por
   * venta y la repite si tiene que reintentar (por ejemplo si se cayó el internet y no
   * supo si la venta entró). El servidor devuelve la venta ya creada en vez de repetirla.
   */
  clave_idempotencia?: string;
  comprador_nombre?: string;
  comprador_documento?: string;
  comprador_celular?: string;
  comprador_email?: string;
}

export type ResultadoVenta =
  /** `repetida` avisa que este intento ya estaba grabado: no se creó nada nuevo. */
  | { ok: true; numero_venta: number; venta_id: string; repetida?: boolean }
  | { ok: false; error: string };

/** Contexto de ejecución de la venta (cajero + turno + caja). */
export interface ContextoVenta {
  usuarioId: string;
  usuarioNombre: string;
  turnoId: string;
  cajaNombre: string;
}
