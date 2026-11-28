// Insumos de la granja (aseo, desinfección, fumigación, medicamentos): kardex con decimales.
// Lógica PURA: la existencia se calcula desde los movimientos; nadie la escribe a mano.
//
//   entrada → suma  (saldo inicial, compra, otra entrada)
//   salida  → resta (consumo, fumigación, tratamiento, pérdida, vencido)
//   ajuste  → FIJA el saldo (conteo físico)
// Los anulados no cuentan.

export const CATEGORIAS_INSUMO = ["aseo", "desinfeccion", "fumigacion", "medicamento", "otro"] as const;
export type CategoriaInsumo = (typeof CATEGORIAS_INSUMO)[number];
export const ETIQUETA_CATEGORIA: Record<CategoriaInsumo, string> = {
  aseo: "Aseo general",
  desinfeccion: "Desinfección y curación",
  fumigacion: "Venenos de fumigación",
  medicamento: "Medicamentos",
  otro: "Otros",
};

export const TIPOS_MOV_INSUMO = ["saldo_inicial", "compra", "entrada_otra", "consumo", "fumigacion", "tratamiento", "perdida", "vencido", "ajuste"] as const;
export type TipoMovInsumo = (typeof TIPOS_MOV_INSUMO)[number];
export type EfectoInsumo = "entrada" | "salida" | "ajuste";
export const EFECTO_INSUMO: Record<TipoMovInsumo, EfectoInsumo> = {
  saldo_inicial: "entrada", compra: "entrada", entrada_otra: "entrada",
  consumo: "salida", fumigacion: "salida", tratamiento: "salida", perdida: "salida", vencido: "salida",
  ajuste: "ajuste",
};
export const ETIQUETA_MOV_INSUMO: Record<TipoMovInsumo, string> = {
  saldo_inicial: "Saldo inicial", compra: "Compra", entrada_otra: "Otra entrada (donación, devolución)",
  consumo: "Consumo / uso", fumigacion: "Fumigación", tratamiento: "Tratamiento", perdida: "Pérdida / daño", vencido: "Vencido (se bota)",
  ajuste: "Ajuste por conteo",
};
/** Los que se registran a mano en la pantalla de insumos (fumigación y tratamiento los crean sus registros). */
export const MOV_MANUALES: TipoMovInsumo[] = ["compra", "entrada_otra", "consumo", "perdida", "vencido", "ajuste"];

/** Unidades sugeridas. */
export const UNIDADES_INSUMO = ["litro", "cc", "galón", "kg", "g", "unidad", "frasco", "bolsa", "caja", "dosis"];

/** Redondeo a milésimas: las cantidades se guardan con 3 decimales. */
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Cantidad escrita por una persona: "1", "0,5", "1.5", "2,25". No admite separador de miles
 * (en cantidades de bodega casi nunca hace falta y confunde con el decimal).
 */
export function cantidad(v: unknown): number | null | "error" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? r3(v) : "error";
  const t = String(v).trim().replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return "error";
  return r3(parseFloat(t));
}

export interface MovCalculo { tipo: TipoMovInsumo; cantidad: number; fecha: Date | string; creado_en?: Date | string; anulado?: boolean }

/** Existencia desde los movimientos (en orden de fecha, y de creación si empatan). */
export function calcularExistencia(movs: MovCalculo[]): number {
  const t = (d: Date | string | undefined) => (d ? new Date(d).getTime() : 0);
  const orden = movs.filter((m) => !m.anulado).sort((a, b) => t(a.fecha) - t(b.fecha) || t(a.creado_en) - t(b.creado_en));
  let saldo = 0;
  for (const m of orden) {
    const e = EFECTO_INSUMO[m.tipo];
    saldo = e === "ajuste" ? m.cantidad : e === "entrada" ? saldo + m.cantidad : saldo - m.cantidad;
    saldo = r3(saldo);
  }
  return saldo;
}

export type EstadoStock = "agotado" | "bajo" | "disponible";
export function estadoStock(existencia: number, minimo: number | null): EstadoStock {
  if (existencia <= 0) return "agotado";
  if (minimo !== null && existencia <= minimo) return "bajo";
  return "disponible";
}
export const ETIQUETA_STOCK: Record<EstadoStock, string> = { agotado: "Agotado", bajo: "Stock bajo", disponible: "Disponible" };

/** Cantidad legible: "1,5 litro", "100 cc". */
export function formatearCantidad(n: number, unidad?: string): string {
  const t = r3(n).toLocaleString("es-CO", { maximumFractionDigits: 3 });
  return unidad ? `${t} ${unidad}` : t;
}

/** Vencimiento más próximo de las entradas vigentes (aaaa-mm-dd), o null. */
export function proximoVencimiento(movs: { tipo: TipoMovInsumo; vencimiento?: string | null; anulado?: boolean }[], hoy: string): string | null {
  const fechas = movs
    .filter((m) => !m.anulado && EFECTO_INSUMO[m.tipo] === "entrada" && m.vencimiento && m.vencimiento >= hoy)
    .map((m) => m.vencimiento!)
    .sort();
  return fechas[0] ?? null;
}

// ------------------------------------------------------------------ validaciones

export interface EntradaInsumo {
  nombre: string; codigo?: string | null; categoria: string; unidad: string; stock_minimo?: string | number | null; observaciones?: string | null;
}
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

const texto = (v: unknown) => { const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""; return t || null; };

export function validarInsumo(e: EntradaInsumo): Resultado<{ nombre: string; codigo: string | null; categoria: CategoriaInsumo; unidad: string; stock_minimo: number | null; observaciones: string | null }> {
  const nombre = texto(e.nombre);
  if (!nombre) return { ok: false, error: "Escribe el nombre del insumo." };
  if (!CATEGORIAS_INSUMO.includes(e.categoria as CategoriaInsumo)) return { ok: false, error: "Escoge la categoría." };
  const unidad = texto(e.unidad)?.toLowerCase();
  if (!unidad) return { ok: false, error: "Indica la unidad (litro, cc, kg, unidad…)." };
  const minimo = cantidad(e.stock_minimo);
  if (minimo === "error") return { ok: false, error: "El stock mínimo debe ser un número (puede tener decimales, ej. 0,5)." };
  return { ok: true, datos: { nombre, codigo: texto(e.codigo), categoria: e.categoria as CategoriaInsumo, unidad, stock_minimo: minimo, observaciones: texto(e.observaciones) } };
}

export interface EntradaMovInsumo {
  tipo: string; cantidad: string | number; fecha?: string | null; motivo?: string | null; valor?: string | number | null; lote?: string | null; vencimiento?: string | null;
}

/** Valida un movimiento a mano. `existencia`: saldo actual, para no dejarlo negativo. */
export function validarMovimiento(e: EntradaMovInsumo, existencia: number, hoy: string): Resultado<{
  tipo: TipoMovInsumo; cantidad: number; fecha: string; motivo: string | null; valor: number | null; lote: string | null; vencimiento: string | null;
}> {
  if (!MOV_MANUALES.includes(e.tipo as TipoMovInsumo)) return { ok: false, error: "Escoge el tipo de movimiento." };
  const tipo = e.tipo as TipoMovInsumo;
  const efecto = EFECTO_INSUMO[tipo];
  const c = cantidad(e.cantidad);
  if (c === null || c === "error") return { ok: false, error: "Escribe la cantidad (puede tener decimales, ej. 0,5)." };
  if (efecto !== "ajuste" && c <= 0) return { ok: false, error: "La cantidad debe ser mayor a 0." };
  if (efecto === "salida" && c > existencia) return { ok: false, error: `No alcanza: hay ${formatearCantidad(existencia)} y quieres sacar ${formatearCantidad(c)}. Si el conteo no cuadra, haz un ajuste.` };
  const fecha = texto(e.fecha) ?? hoy;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "La fecha no es válida." };
  if (fecha > hoy) return { ok: false, error: "La fecha no puede ser futura." };
  const motivo = texto(e.motivo);
  if ((tipo === "perdida" || tipo === "vencido" || tipo === "ajuste") && !motivo) return { ok: false, error: "Cuenta el motivo (pérdida, vencimiento o ajuste lo exigen)." };
  let valor: number | null = null;
  if (e.valor !== null && e.valor !== undefined && e.valor !== "") {
    const t = String(e.valor).replace(/[$\s.]/g, "");
    if (!/^\d+$/.test(t)) return { ok: false, error: "El valor debe ser un número entero en pesos." };
    valor = parseInt(t, 10);
  }
  const vencimiento = texto(e.vencimiento);
  if (vencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(vencimiento)) return { ok: false, error: "La fecha de vencimiento no es válida." };
  return { ok: true, datos: { tipo, cantidad: c, fecha, motivo, valor: tipo === "compra" ? valor : null, lote: efecto === "entrada" ? texto(e.lote) : null, vencimiento: efecto === "entrada" ? vencimiento : null } };
}

/** Productos de una fumigación: al menos uno, sin repetir, y que alcance la existencia de cada uno. */
export function validarProductosFumigacion(
  productos: { insumo_id: string; cantidad: string | number }[],
  existencias: Map<string, { nombre: string; existencia: number; unidad: string }>,
): Resultado<{ insumo_id: string; cantidad: number }[]> {
  const limpios = productos.filter((p) => p.insumo_id);
  if (!limpios.length) return { ok: false, error: "Agrega al menos un producto con su cantidad." };
  const vistos = new Set<string>();
  const salida: { insumo_id: string; cantidad: number }[] = [];
  for (const p of limpios) {
    const ins = existencias.get(p.insumo_id);
    if (!ins) return { ok: false, error: "Uno de los productos no existe." };
    if (vistos.has(p.insumo_id)) return { ok: false, error: `${ins.nombre} está dos veces: súmalo en una sola línea.` };
    vistos.add(p.insumo_id);
    const c = cantidad(p.cantidad);
    if (c === null || c === "error" || c <= 0) return { ok: false, error: `Escribe cuánto se usó de ${ins.nombre}.` };
    if (c > ins.existencia) return { ok: false, error: `No alcanza ${ins.nombre}: hay ${formatearCantidad(ins.existencia, ins.unidad)}.` };
    salida.push({ insumo_id: p.insumo_id, cantidad: c });
  }
  return { ok: true, datos: salida };
}
