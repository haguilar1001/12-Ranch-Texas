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

export default function NavLinks({
  grupos,
  usuario,
}: {
  grupos: GrupoNav[];
  usuario?: { nombre: string; rol: string };
}) {
  const path = usePathname();
  const [abierto, setAbierto] = useState<string | null>(null); // grupo abierto en escritorio
  const [menuMovil, setMenuMovil] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const movil = useRef<HTMLDivElement>(null);

  // Cerrar al tocar fuera o con Escape.
  useEffect(() => {
    if (!abierto && !menuMovil) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (nav.current && !nav.current.contains(t)) setAbierto(null);
      if (movil.current && !movil.current.contains(t)) setMenuMovil(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(null);
      setMenuMovil(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto, menuMovil]);

  // Al cambiar de página, todo se cierra solo.
  useEffect(() => {
    setAbierto(null);
    setMenuMovil(false);
  }, [path]);

  const claseTop = (activo: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      activo ? "bg-ranch-marron text-ranch-crema" : "text-ranch-marron/70 hover:bg-ranch-marron/10"
    }`;

  return (
    <>
      {/* ---------------------------------------------------------- ESCRITORIO */}
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

      {/* ---------------------------------------------------------- CELULAR
          Taquilla y escaneo se usan desde el teléfono, así que el menú no puede
          desaparecer ahí. Un solo botón abre todos los grupos, uno debajo del otro. */}
      <div ref={movil} className="relative ml-auto md:hidden">
        <button
          onClick={() => setMenuMovil(!menuMovil)}
          aria-expanded={menuMovil}
          aria-label={menuMovil ? "Cerrar menú" : "Abrir menú"}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-ranch-marron/30 text-xl text-ranch-marron hover:bg-ranch-marron/10"
        >
          {menuMovil ? "✕" : "☰"}
        </button>

        {menuMovil && (
          <div className="absolute right-0 top-full z-40 mt-2 max-h-[75vh] w-72 overflow-y-auto overscroll-contain rounded-xl border-2 border-ranch-marron/15 bg-white shadow-xl">
            {usuario && (
              <Link href="/perfil" className="block border-b border-ranch-marron/10 bg-ranch-crema/50 px-4 py-3">
                <span className="block font-bold text-ranch-marron">{usuario.nombre}</span>
                <span className="text-xs text-ranch-marron/50">{usuario.rol} · Mi cuenta</span>
              </Link>
            )}

            {grupos.map((g) => {
              if (g.href) {
                const activo = g.href === "/" ? path === "/" : path.startsWith(g.href);
                return (
                  <Link
                    key={g.label}
                    href={g.href}
                    className={`block border-b border-ranch-marron/10 px-4 py-3 font-bold ${
                      activo ? "bg-ranch-crema text-ranch-marron" : "text-ranch-marron/80"
                    }`}
                  >
                    {g.label}
                  </Link>
                );
              }

              return (
                <div key={g.label} className="border-b border-ranch-marron/10 last:border-b-0">
                  <p className="bg-ranch-crema/40 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ranch-marron/50">
                    {g.label}
                  </p>
                  {(g.enlaces ?? []).map((e) => {
                    const aqui = path.startsWith(e.href);
                    return (
                      <Link
                        key={e.href}
                        href={e.href}
                        className={`block px-4 py-3 text-sm ${
                          aqui ? "bg-ranch-crema font-bold text-ranch-marron" : "text-ranch-marron/80"
                        }`}
                      >
                        {e.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
