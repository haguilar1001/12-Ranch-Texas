"use client";

import { useEffect, useRef, useState } from "react";

export interface OpcionMenu {
  label: string;
  onClick: () => void;
  /** Se pinta en rojo (p. ej. Baja). */
  peligro?: boolean;
  disabled?: boolean;
}

/**
 * Botón "Acciones ▾" con las opciones de una fila en un menú desplegable, para que la fila no
 * crezca en alto. El menú se pinta con position: fixed para que no lo recorte el contenedor
 * con scroll horizontal de la tabla; se cierra al hacer clic afuera, con Escape o al desplazarse.
 */
export default function MenuAcciones({ opciones, etiqueta = "Acciones" }: { opciones: OpcionMenu[]; etiqueta?: string }) {
  const [pos, setPos] = useState<{ top: number; right: number; arriba: boolean } | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const cerrar = (e: Event) => {
      if (e.type === "mousedown" && (menu.current?.contains(e.target as Node) || boton.current?.contains(e.target as Node))) return;
      setPos(null);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setPos(null); };
    document.addEventListener("mousedown", cerrar);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
      document.removeEventListener("keydown", tecla);
    };
  }, [pos]);

  function alternar() {
    if (pos) return setPos(null);
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    // Si no cabe abajo, se abre hacia arriba.
    const alto = opciones.length * 36 + 12;
    const arriba = r.bottom + alto > window.innerHeight && r.top > alto;
    setPos({ top: arriba ? r.top - 4 : r.bottom + 4, right: window.innerWidth - r.right, arriba });
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={alternar}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        className="rounded-lg border border-ranch-marron/30 px-3 py-1.5 text-xs font-semibold text-ranch-marron hover:bg-ranch-crema/60"
      >
        {etiqueta} ▾
      </button>
      {pos && (
        <div
          ref={menu}
          role="menu"
          style={{ position: "fixed", right: pos.right, ...(pos.arriba ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          className="z-50 min-w-40 rounded-xl border border-ranch-marron/20 bg-white py-1 shadow-lg"
        >
          {opciones.map((o) => (
            <button
              key={o.label}
              type="button"
              role="menuitem"
              disabled={o.disabled}
              onClick={() => { setPos(null); o.onClick(); }}
              className={`block w-full px-4 py-2 text-left text-sm hover:bg-ranch-crema/60 disabled:opacity-40 ${o.peligro ? "text-red-700" : "text-ranch-marron"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
