"use client";

import { useState } from "react";

/**
 * La cara de un tipo de visitante en taquilla. `icono` puede ser:
 *   · un emoji  → "🤠"
 *   · una ruta  → "/logos/campbell.png" (logos institucionales, como la Fundación Campbell)
 *
 * Si la imagen no carga (todavía no la han subido, ruta mal escrita) cae en las
 * iniciales del nombre, para que la tarjeta nunca se vea rota en plena venta.
 */
export default function IconoTipo({
  icono,
  nombre,
  className = "",
}: {
  icono: string | null;
  nombre: string;
  className?: string;
}) {
  const [fallo, setFallo] = useState(false);
  const esImagen = !!icono && (icono.startsWith("/") || icono.startsWith("http"));

  const base = `flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${className}`;

  if (esImagen && !fallo) {
    return (
      <span className={`${base} bg-white ring-1 ring-ranch-marron/10`}>
        {/* Logo institucional: <img> plano para no pasar por el optimizador de Next.
            alt vacío porque el nombre del tipo ya va al lado; así una imagen rota no
            escupe texto dentro de la tarjeta. El ref cubre el caso de que la imagen
            falle ANTES de que React hidrate y el onError no llegue a dispararse. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={icono!}
          alt=""
          aria-hidden
          ref={(el) => {
            if (el && el.complete && el.naturalWidth === 0) setFallo(true);
          }}
          onError={() => setFallo(true)}
          className="h-8 w-8 object-contain"
        />
      </span>
    );
  }

  if (icono && !esImagen) {
    return (
      <span aria-hidden className={`${base} bg-ranch-crema/70 text-2xl leading-none`}>
        {icono}
      </span>
    );
  }

  const iniciales = nombre
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span aria-hidden className={`${base} bg-ranch-marron/10 text-sm font-black text-ranch-marron/70`}>
      {iniciales || "•"}
    </span>
  );
}
