"use client";

import { useState } from "react";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Elegir el período de un informe: un MES completo o un DÍA.
 *
 * Antes eran tres desplegables a la vez (día, mes, año) y había que leerlos juntos
 * para saber qué se estaba mirando. Ahora se escoge el modo y solo se ve el campo
 * que aplica: en "Mes", mes y año; en "Día", un calendario.
 *
 * Es un componente de cliente solo por ese cambio de modo. Los campos siguen
 * enviándose con el mismo GET del formulario de la página, así que el período
 * queda en la URL y se puede guardar, compartir y volver a él.
 *
 * Clave: en modo "Mes" el campo de fecha NO se renderiza (y al revés). Si los dos
 * viajaran, el servidor tendría que adivinar cuál manda.
 */
export default function FiltroPeriodo({
  anio, mes, fecha, hoy, anios = [2024, 2025, 2026],
}: {
  anio: number;
  mes: number;
  /** YYYY-MM-DD si el informe está en un día; null si está en un mes. */
  fecha: string | null;
  /** Hoy en Bogotá (YYYY-MM-DD): es lo que trae el calendario si aún no hay fecha. */
  hoy: string;
  anios?: number[];
}) {
  const [modo, setModo] = useState<"mes" | "dia">(fecha ? "dia" : "mes");
  const clase = "rounded border border-ranch-marron/25 px-2 py-1";

  return (
    <>
      {/* El modo no es un filtro: no lleva `name`, así que no viaja en la URL.
          Lo que viaja es el campo que quede visible. */}
      <div className="flex overflow-hidden rounded border border-ranch-marron/25">
        {(["mes", "dia"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            aria-pressed={modo === m}
            className={`px-3 py-1 font-semibold transition ${
              modo === m ? "bg-ranch-marron text-ranch-crema" : "bg-white text-ranch-marron/60 hover:bg-ranch-crema/60"
            }`}
          >
            {m === "mes" ? "Mes" : "Día"}
          </button>
        ))}
      </div>

      {modo === "mes" ? (
        <>
          <select name="mes" defaultValue={mes} className={clase}>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select name="anio" defaultValue={anio} className={clase}>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </>
      ) : (
        <input type="date" name="fecha" defaultValue={fecha ?? hoy} className={clase} />
      )}
    </>
  );
}
