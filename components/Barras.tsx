import { formatearCOP } from "@/lib/dinero/cop";
import { formatearPct } from "@/lib/reportes/util";

export interface Barra {
  etiqueta: string;
  valor: number;
}

/**
 * Barras horizontales simples (server component). Un solo color de acento (dorado).
 *
 * Cada fila lleva su PARTICIPACIÓN sobre el total de la serie: la pregunta de estos
 * cuadros casi nunca es "cuánto entró a las 10", sino "cuánto pesa esa hora en el
 * día". Con cifras de siete dígitos eso no se estima de un vistazo.
 *
 * Ojo con los dos denominadores, que no son el mismo:
 *   · el LARGO de la barra es contra el mayor de la serie, para poder comparar filas
 *     entre sí sin que todas queden diminutas;
 *   · el PORCENTAJE es contra el total, que es lo que significa "participación".
 * Por eso la barra más larga llega al extremo aunque su porcentaje no sea 100%.
 */
export default function Barras({ datos, vacio = "Sin datos en el periodo." }: { datos: Barra[]; vacio?: string }) {
  if (datos.length === 0) return <p className="text-sm text-ranch-marron/40">{vacio}</p>;

  const max = Math.max(1, ...datos.map((d) => d.valor));
  const total = datos.reduce((a, d) => a + d.valor, 0);

  return (
    <div className="space-y-1.5">
      {datos.map((d) => {
        // Sin total no hay participación que mostrar: un 0% en todas las filas de un
        // cuadro vacío aparenta un dato que no existe.
        const parte = total > 0 ? (d.valor / total) * 100 : null;
        return (
          <div key={d.etiqueta} className="flex items-center gap-2 text-sm">
            {/* La etiqueta manda: con 80 px "BONO COOMEVA" y "BONO COMFAMILIAR"
                quedaban los dos en "BONO CO…", que es peor que no mostrar nada.
                El `title` deja ver el nombre completo si aun así no cabe. */}
            <span
              title={d.etiqueta}
              className="w-48 shrink-0 truncate text-right text-ranch-marron/60"
            >
              {d.etiqueta}
            </span>
            <div className="h-4 flex-1 rounded bg-ranch-marron/5">
              <div className="h-4 rounded bg-ranch-dorado" style={{ width: `${(d.valor / max) * 100}%` }} />
            </div>
            <span className="w-28 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-ranch-marron/70">
              {formatearCOP(d.valor)}
            </span>
            <span className="w-12 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-ranch-marron/45">
              {parte === null ? "" : formatearPct(parte)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
