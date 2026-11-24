import { getDocumentProxy } from "unpdf";

// Texto de un PDF agrupado en renglones, con la posición horizontal de cada pedazo. Sirve para
// leer tablas: los números de una misma columna quedan alineados a la derecha en la misma x.

export interface PiezaTexto {
  texto: string;
  x: number; // borde izquierdo
  fin: number; // borde derecho
}

export type Renglon = PiezaTexto[];

export async function renglonesPdf(datos: Uint8Array): Promise<Renglon[]> {
  const pdf = await getDocumentProxy(datos);
  const salida: Renglon[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    const { items } = await pagina.getTextContent();
    const porY: { y: number; piezas: PiezaTexto[] }[] = [];
    for (const it of items as { str?: string; transform: number[]; width: number }[]) {
      const texto = it.str?.trim();
      if (!texto) continue;
      const x = it.transform[4], y = it.transform[5];
      let fila = porY.find((f) => Math.abs(f.y - y) < 2.5);
      if (!fila) porY.push((fila = { y, piezas: [] }));
      fila.piezas.push({ texto, x, fin: x + it.width });
    }
    porY.sort((a, b) => b.y - a.y).forEach((f) => salida.push(f.piezas.sort((a, b) => a.x - b.x)));
  }
  return salida;
}
