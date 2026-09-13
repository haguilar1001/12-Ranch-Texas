// Qué período está mirando el informe de cortesías.
//
// Vive aparte porque lo usan DOS sitios: la pantalla y la ruta que baja el Excel.
// Si cada una interpretara los parámetros a su manera, el archivo descargado podría
// traer un período distinto del que se está viendo, y nadie lo notaría hasta que las
// cifras no cuadraran en una reunión.
//
// Puro: no toca la BD ni la sesión, así que se puede probar directo.

/** Días que tiene un mes. El truco del día 0 del mes siguiente da el último día. */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export interface RangoCortesias {
  anio: number;
  mes: number;
  /** null = el mes completo. */
  dia: number | null;
  inicio: Date;
  /** Exclusivo: se compara con `lt`. */
  fin: Date;
  /** "13 de septiembre de 2026" o "septiembre 2026". */
  etiqueta: string;
  /** Para la query string y el nombre del archivo. */
  clave: string;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Medianoche de Bogotá de una fecha del calendario. */
function medianocheBogota(anio: number, mes: number, dia: number): Date {
  return new Date(`${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T00:00:00-05:00`);
}

/**
 * Resuelve el período a partir de lo que venga en la URL.
 *
 * Un día que no existe en ese mes (un 31 de febrero al cambiar de mes en el
 * formulario) NO se recorta al último día: se muestra el mes completo. Recortarlo
 * daría un informe de un día que el usuario no pidió, y sin avisarle.
 */
export function rangoDe(params: { anio?: string | number; mes?: string | number; dia?: string | number | null }, hoy: string): RangoCortesias {
  const n = (v: string | number | null | undefined, porDefecto: number) => {
    const x = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
    return Number.isFinite(x) ? x : porDefecto;
  };

  const anio = n(params.anio, parseInt(hoy.slice(0, 4), 10));
  const mesCrudo = n(params.mes, parseInt(hoy.slice(5, 7), 10));
  const mes = Math.min(12, Math.max(1, mesCrudo));

  const tope = diasDelMes(anio, mes);
  const diaCrudo = params.dia === null || params.dia === undefined || params.dia === "" ? null : n(params.dia, 0);
  const dia = diaCrudo !== null && diaCrudo >= 1 && diaCrudo <= tope ? diaCrudo : null;

  if (dia === null) {
    const inicio = medianocheBogota(anio, mes, 1);
    const sigAnio = mes === 12 ? anio + 1 : anio;
    const sigMes = mes === 12 ? 1 : mes + 1;
    return {
      anio, mes, dia: null,
      inicio,
      fin: medianocheBogota(sigAnio, sigMes, 1),
      etiqueta: `${MESES[mes - 1]} ${anio}`,
      clave: `${anio}-${String(mes).padStart(2, "0")}`,
    };
  }

  const inicio = medianocheBogota(anio, mes, dia);
  return {
    anio, mes, dia,
    inicio,
    fin: new Date(inicio.getTime() + 24 * 3600_000),
    etiqueta: `${dia} de ${MESES[mes - 1]} de ${anio}`,
    clave: `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
  };
}

/** Query string del período + filtros, para el enlace del Excel y para volver. */
export function queryDe(r: RangoCortesias, cajaId?: string, cajeroId?: string): string {
  return [
    `anio=${r.anio}`,
    `mes=${r.mes}`,
    r.dia !== null ? `dia=${r.dia}` : "",
    cajaId ? `caja=${cajaId}` : "",
    cajeroId ? `cajero=${cajeroId}` : "",
  ].filter(Boolean).join("&");
}
