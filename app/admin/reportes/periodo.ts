// Qué período está mirando un informe: un mes completo o un día.
//
// Vive aparte porque lo usan VARIOS sitios: las pantallas de ventas, cortesías y
// dashboard, y las rutas que bajan su Excel. Si cada una interpretara los parámetros
// a su manera, el archivo descargado podría traer un período distinto del que se está
// viendo, y nadie lo notaría hasta que las cifras no cuadraran en una reunión.
//
// La URL dice el modo sin ambigüedad:
//   ?anio=2026&mes=9        → septiembre completo
//   ?fecha=2026-09-13       → solo ese día
//
// Puro: no toca la BD ni la sesión, así que se puede probar directo.

export interface Periodo {
  anio: number;
  mes: number;
  /** null = el mes completo. */
  dia: number | null;
  /** El día en formato YYYY-MM-DD, o null si es un mes. Lo consume el <input type="date">. */
  fecha: string | null;
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

/** Días que tiene un mes. El truco del día 0 del mes siguiente da el último día. */
export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Medianoche de Bogotá de una fecha del calendario. */
function medianocheBogota(anio: number, mes: number, dia: number): Date {
  return new Date(`${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T00:00:00-05:00`);
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function mesCompleto(anio: number, mes: number): Periodo {
  const sigAnio = mes === 12 ? anio + 1 : anio;
  const sigMes = mes === 12 ? 1 : mes + 1;
  return {
    anio, mes, dia: null, fecha: null,
    inicio: medianocheBogota(anio, mes, 1),
    fin: medianocheBogota(sigAnio, sigMes, 1),
    etiqueta: `${MESES[mes - 1]} ${anio}`,
    clave: `${anio}-${dosDigitos(mes)}`,
  };
}

/**
 * Resuelve el período a partir de lo que venga en la URL.
 *
 * `fecha` manda sobre `anio`/`mes`: si el usuario escogió un día, ese día es lo que
 * quiere ver. Una fecha con formato malo o inexistente (un 31 de febrero escrito a
 * mano en la URL) cae al mes completo en vez de inventarse un día: mostrar una fecha
 * que nadie pidió es peor que ampliar el rango.
 */
export function rangoDe(
  params: { fecha?: string | null; anio?: string | number; mes?: string | number; dia?: string | number | null },
  hoy: string,
): Periodo {
  const n = (v: string | number | null | undefined, porDefecto: number) => {
    const x = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
    return Number.isFinite(x) ? x : porDefecto;
  };

  const anioPorDefecto = parseInt(hoy.slice(0, 4), 10);
  const mesPorDefecto = parseInt(hoy.slice(5, 7), 10);

  if (params.fecha) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.fecha.trim());
    if (m) {
      const anio = Number(m[1]);
      const mes = Number(m[2]);
      const dia = Number(m[3]);
      // Se comprueba que el día exista de verdad en ese mes: "2026-02-31" no existe.
      if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasDelMes(anio, mes)) {
        const inicio = medianocheBogota(anio, mes, dia);
        return {
          anio, mes, dia,
          fecha: `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`,
          inicio,
          fin: new Date(inicio.getTime() + 24 * 3600_000),
          etiqueta: `${dia} de ${MESES[mes - 1]} de ${anio}`,
          clave: `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`,
        };
      }
    }
    // Fecha inválida: se cae al mes que digan los otros parámetros.
  }

  const anio = n(params.anio, anioPorDefecto);
  const mes = Math.min(12, Math.max(1, n(params.mes, mesPorDefecto)));

  // `dia` es la forma VIEJA de pedir un día: antes el filtro eran tres desplegables
  // (día, mes, año) y la URL decía "?anio=2026&mes=9&dia=13". Se sigue entendiendo
  // porque esas URLs siguen vivas: en un marcador, en una pestaña que el cajero dejó
  // abierta, o en la página que el navegador tenía en caché cuando salió el cambio.
  // Sin esto, esas pantallas mandan `dia`, el servidor lo ignora y devuelve el mes
  // entero — se ve como "escojo el día y no cambia nada", que es justo lo que pasó.
  if (params.dia !== null && params.dia !== undefined && params.dia !== "") {
    const dia = n(params.dia, 0);
    if (dia >= 1 && dia <= diasDelMes(anio, mes)) {
      return rangoDe({ fecha: `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}` }, hoy);
    }
  }

  return mesCompleto(anio, mes);
}

/** Query string del período + filtros, para el enlace del Excel y para volver. */
export function queryDe(p: Periodo, cajaId?: string, cajeroId?: string): string {
  return [
    p.fecha ? `fecha=${p.fecha}` : `anio=${p.anio}&mes=${p.mes}`,
    cajaId ? `caja=${cajaId}` : "",
    cajeroId ? `cajero=${cajeroId}` : "",
  ].filter(Boolean).join("&");
}
