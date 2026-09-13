// Lógica de cálculo y validación de una venta de taquilla.
// Funciones PURAS (sin BD) para poder probarlas y reutilizarlas en cliente y servidor.
// Regla dura: todo en enteros COP. Los totales del encabezado deben poder recalcularse desde el detalle.

export type TipoLinea = "pago" | "atencion" | "invitacion" | "cortesia";

/** Los tres tipos que no cobran. Se validan igual: valor 0, motivo y autorización. */
export const TIPOS_CORTESIA: TipoLinea[] = ["atencion", "invitacion", "cortesia"];

export function esCortesia(tipo: TipoLinea): boolean {
  return TIPOS_CORTESIA.includes(tipo);
}

export interface LineaVenta {
  tipo_visitante_id: string;
  codigo?: string; // informativo (adulto, nino, ...)
  cantidad: number;
  valor_lista: number; // por unidad (de la tarifa vigente)
  valor_cobrado: number; // por unidad, tras descuento (== valor_lista si no hay descuento)
  tipo_linea: TipoLinea;
  motivo_cortesia_id?: string | null;
  motivo_descuento?: string | null;
  autorizado_por?: string | null;
  beneficiario?: string | null;
  /** El bono/QR ya se verificó en la aplicación de bonos. Solo aplica a los tipos que lo exigen. */
  escaneado?: boolean;
}

export interface Pago {
  medio_pago_id: string;
  monto: number;
  referencia?: string | null;
}

export interface TotalesVenta {
  total_lista: number;
  total_cobrado: number;
  total_descuento: number;
  cantidad_asistentes: number;
}

/** Calcula los totales de la venta a partir del detalle. */
export function calcularTotales(lineas: LineaVenta[]): TotalesVenta {
  let total_lista = 0;
  let total_cobrado = 0;
  let cantidad_asistentes = 0;
  for (const l of lineas) {
    total_lista += l.valor_lista * l.cantidad;
    total_cobrado += l.valor_cobrado * l.cantidad;
    cantidad_asistentes += l.cantidad;
  }
  return {
    total_lista,
    total_cobrado,
    total_descuento: total_lista - total_cobrado,
    cantidad_asistentes,
  };
}

/** Suma de los pagos. */
export function sumarPagos(pagos: Pago[]): number {
  return pagos.reduce((acc, p) => acc + p.monto, 0);
}

export interface ResultadoValidacion {
  ok: boolean;
  errores: string[];
}

function esEnteroNoNeg(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

/**
 * Valida una venta completa: detalle + pagos.
 * - Cortesías (atencion/invitacion): valor_cobrado 0, motivo y autorización obligatorios.
 * - Descuentos (valor_cobrado < valor_lista en línea de pago): motivo y autorización obligatorios.
 * - La suma de pagos debe igualar exactamente el total cobrado.
 */
export function validarVenta(lineas: LineaVenta[], pagos: Pago[]): ResultadoValidacion {
  const errores: string[] = [];

  if (lineas.length === 0) errores.push("La venta no tiene líneas.");

  lineas.forEach((l, i) => {
    const et = `Línea ${i + 1}`;
    if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) errores.push(`${et}: la cantidad debe ser un entero mayor que 0.`);
    if (!esEnteroNoNeg(l.valor_lista)) errores.push(`${et}: valor de lista inválido.`);
    if (!esEnteroNoNeg(l.valor_cobrado)) errores.push(`${et}: valor cobrado inválido.`);
    if (l.valor_cobrado > l.valor_lista) errores.push(`${et}: el valor cobrado no puede superar el de lista.`);

    if (esCortesia(l.tipo_linea)) {
      if (l.valor_cobrado !== 0) errores.push(`${et}: una cortesía (${l.tipo_linea}) debe cobrar 0.`);
      if (!l.motivo_cortesia_id) errores.push(`${et}: la cortesía requiere motivo.`);
      if (!l.autorizado_por) errores.push(`${et}: la cortesía requiere autorización.`);
    } else {
      // línea de pago
      const hayDescuento = l.valor_cobrado < l.valor_lista;
      if (hayDescuento) {
        if (!l.motivo_descuento) errores.push(`${et}: el descuento requiere motivo.`);
        if (!l.autorizado_por) errores.push(`${et}: el descuento requiere autorización.`);
      }
    }
  });

  pagos.forEach((p, i) => {
    if (!p.medio_pago_id) errores.push(`Pago ${i + 1}: falta el medio de pago.`);
    if (!Number.isInteger(p.monto) || p.monto <= 0) errores.push(`Pago ${i + 1}: el monto debe ser un entero mayor que 0.`);
  });

  const { total_cobrado } = calcularTotales(lineas);
  const totalPagos = sumarPagos(pagos);
  if (totalPagos !== total_cobrado) {
    errores.push(`Los pagos (${totalPagos}) no cuadran con el total a cobrar (${total_cobrado}).`);
  }

  return { ok: errores.length === 0, errores };
}

/**
 * Resuelve cuánto se cobra por unidad en una línea, a partir de lo que pidió la taquilla.
 * El servidor SIEMPRE pasa por aquí: no se confía en el valor que manda el cliente.
 *
 * - Cortesía (atencion/invitacion) → 0, sin excepción.
 * - Línea de pago sin descuento pedido → el valor de lista.
 * - Línea de pago con descuento → el valor pedido, recortado al rango [0, valor_lista]
 *   y redondeado a entero (nunca decimales en pesos).
 */
export function resolverValorCobrado(
  valorLista: number,
  tipoLinea: TipoLinea,
  valorCobradoPedido?: number | null,
): number {
  if (tipoLinea !== "pago") return 0;
  if (valorCobradoPedido === null || valorCobradoPedido === undefined) return valorLista;
  if (!Number.isFinite(valorCobradoPedido)) return valorLista;
  return Math.min(valorLista, Math.max(0, Math.round(valorCobradoPedido)));
}

/** Descuento total de una línea (por las unidades), en pesos enteros. */
export function descuentoDeLinea(l: Pick<LineaVenta, "valor_lista" | "valor_cobrado" | "cantidad">): number {
  return (l.valor_lista - l.valor_cobrado) * l.cantidad;
}

/**
 * Bonos y compras por la web que entraron sin pasar por la aplicación de bonos.
 *
 * El bono de Coomeva, el de Comfamiliar, la compra por la página web y el QR de
 * redención ya se pagaron antes de llegar al parque: lo único que hace la taquilla
 * es verificar en OTRA aplicación (la de los PC de caja) que el bono sea válido y no
 * se haya usado. Sin esa verificación, un bono repetido entra igual y el parque se
 * entera cuando la caja de compensación no se lo paga.
 *
 * `exigen` dice qué tipos hay que escanear; viene de la BD, nunca del cliente.
 * Devuelve los NOMBRES sin escanear, sin repetir. Vacío = todo en orden.
 */
export function faltanPorEscanear(
  lineas: Pick<LineaVenta, "tipo_visitante_id" | "escaneado">[],
  exigen: Map<string, { nombre: string; requiere_escaneo: boolean }>,
): string[] {
  const nombres: string[] = [];
  for (const l of lineas) {
    const t = exigen.get(l.tipo_visitante_id);
    if (!t?.requiere_escaneo || l.escaneado) continue;
    if (!nombres.includes(t.nombre)) nombres.push(t.nombre);
  }
  return nombres;
}
