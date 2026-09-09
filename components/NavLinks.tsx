"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface EnlaceNav {
  label: string;
  href: string;
  /** Texto corto que explica a dónde lleva. Se ve dentro del grupo desplegado. */
  desc?: string;
}

export interface GrupoNav {
  /** Si no hay `enlaces`, es un enlace suelto (p. ej. Inicio). */
  label: string;
  href?: string;
  enlaces?: EnlaceNav[];
}

/** ¿La ruta actual cae dentro de este grupo? Sirve para resaltarlo. */
function grupoActivo(g: GrupoNav, path: string): boolean {
  if (g.href) return g.href === "/" ? path === "/" : path.startsWith(g.href);
  return (g.enlaces ?? []).some((e) => path.startsWith(e.href));
}

export default function NavLinks({ grupos }: { grupos: GrupoNav[] }) {
  const path = usePathname();
  const [abierto, setAbierto] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);

  // Cerrar al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (nav.current && !nav.current.contains(e.target as Node)) setAbierto(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(null);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  // Al cambiar de página, el menú se cierra solo.
  useEffect(() => setAbierto(null), [path]);

  const claseTop = (activo: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      activo ? "bg-ranch-marron text-ranch-crema" : "text-ranch-marron/70 hover:bg-ranch-marron/10"
    }`;

  return (
    <nav ref={nav} className="hidden items-center gap-1 md:flex">
      {grupos.map((g) => {
        const activo = grupoActivo(g, path);

        if (g.href) {
          return (
            <Link key={g.label} href={g.href} className={claseTop(activo)}>
              {g.label}
            </Link>
          );
        }

        const estaAbierto = abierto === g.label;
        return (
          <div key={g.label} className="relative">
            <button
              onClick={() => setAbierto(estaAbierto ? null : g.label)}
              aria-expanded={estaAbierto}
              aria-haspopup="true"
              className={claseTop(activo)}
            >
              {g.label}
              <span className={`ml-1 inline-block text-[10px] transition-transform ${estaAbierto ? "rotate-180" : ""}`}>▾</span>
            </button>

            {estaAbierto && (
              <div className="absolute left-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-xl border-2 border-ranch-marron/15 bg-white shadow-lg">
                {(g.enlaces ?? []).map((e) => {
                  const aqui = path.startsWith(e.href);
                  return (
                    <Link
                      key={e.href}
                      href={e.href}
                      className={`block px-3 py-2 text-sm transition hover:bg-ranch-crema/70 ${
                        aqui ? "bg-ranch-crema font-bold text-ranch-marron" : "text-ranch-marron/80"
                      }`}
                    >
                      <span className="font-semibold">{e.label}</span>
                      {e.desc && <span className="block text-xs text-ranch-marron/45">{e.desc}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
