// Export a Excel NATIVO (.xlsx), no CSV disfrazado. La diferencia que importa:
// los números se escriben como números, así que en Excel se pueden sumar y filtrar
// sin tener que "convertir texto a columnas" ni pelear con el separador decimal.

import * as XLSX from "xlsx";

export type CeldaExcel = string | number | null | undefined;

export interface HojaExcel {
  nombre: string;
  filas: CeldaExcel[][];
  /** Ancho de cada columna en caracteres. Si se omite, se calcula del contenido. */
  anchos?: number[];
}

/** Excel no acepta ciertos caracteres en el nombre de la hoja, y la corta en 31. */
function nombreHojaValido(nombre: string): string {
  return (nombre.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Hoja1");
}

function anchosAutomaticos(filas: CeldaExcel[][]): number[] {
  const anchos: number[] = [];
  for (const fila of filas) {
    fila.forEach((celda, i) => {
      const largo = celda === null || celda === undefined ? 0 : String(celda).length;
      anchos[i] = Math.min(45, Math.max(anchos[i] ?? 10, largo + 2));
    });
  }
  return anchos;
}

/** Construye el archivo .xlsx en memoria. Una hoja por entrada. */
export function construirXlsx(hojas: HojaExcel[]): Buffer {
  const libro = XLSX.utils.book_new();
  for (const h of hojas) {
    const hoja = XLSX.utils.aoa_to_sheet(h.filas.map((f) => f.map((c) => (c === undefined ? null : c))));
    const anchos = h.anchos ?? anchosAutomaticos(h.filas);
    hoja["!cols"] = anchos.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(libro, hoja, nombreHojaValido(h.nombre));
  }
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Respuesta HTTP lista para descargar el .xlsx. */
export function respuestaXlsx(hojas: HojaExcel[], nombreArchivo: string): Response {
  const buffer = construirXlsx(hojas);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${nombreArchivo.replace(/"/g, "")}.xlsx"`,
    },
  });
}
