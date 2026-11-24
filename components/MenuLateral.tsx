"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { logout } from "@/lib/auth/actions";
import { enlaceActivo, type SeccionMenu } from "@/lib/menu-activo";

// Barra lateral de la app.
//  · Escritorio (lg+): fija a la izquierda. Se puede COLAPSAR a solo iconos (queda guardado en
//    una cookie, así no "salta" al recargar) para darle ancho a la taquilla.
//  · Celular/tablet: barra superior con el logo y ☰, que abre la misma barra como cajón.
// Las secciones son acordeón: la de la página actual abre sola; el resto se abre a mano.

const COOKIE = "menu_colapsado";

export default function MenuLateral({
  secciones,
  usuario,
  colapsadoInicial,
  children,
}: {
  secciones: SeccionMenu[];
  usuario: { nombre: string; rol: string };
  colapsadoInicial: boolean;
  children: ReactNode;
}) {
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  const activo = useMemo(() => enlaceActivo(secciones, path, tab), [secciones, path, tab]);
  const seccionActiva = useMemo(
    () => secciones.find((s) => (s.href ? s.href === activo : s.grupos?.some((g) => g.enlaces.some((e) => e.href === activo))))?.id ?? null,
    [secciones, activo],
  );

  const [colapsado, setColapsado] = useState(colapsadoInicial);
  const [cajon, setCajon] = useState(false); // menú abierto en celular
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(seccionActiva ? [seccionActiva] : []));

  // Al navegar: se cierra el cajón y se abre la sección de la página nueva (sin cerrar las demás).
  useEffect(() => {
    setCajon(false);
    if (seccionActiva) setAbiertas((p) => (p.has(seccionActiva) ? p : new Set(p).add(seccionActiva)));
  }, [path, tab, seccionActiva]);

  // Escape cierra el cajón; con el cajón abierto no se desplaza la página de fondo.
  useEffect(() => {
    if (!cajon) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setCajon(false);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [cajon]);

  function alternarColapso() {
    const nuevo = !colapsado;
    setColapsado(nuevo);
    document.cookie = `${COOKIE}=${nuevo ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  function alternarSeccion(id: string) {
    // Colapsada, tocar un icono de sección expande la barra y abre esa sección.
    if (colapsado) {
      alternarColapso();
      setAbiertas(new Set([id]));
      return;
    }
    setAbiertas((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const contenido = (modoCajon: boolean) => {
    const angosto = colapsado && !modoCajon;
    return (
      <div className="flex h-full flex-col">
        {/* Logo + colapsar */}
        <div className={`flex items-center border-b border-white/10 px-3 py-3 ${angosto ? "justify-center" : "justify-between"}`}>
          {!angosto && (
            <Link href="/" className="flex items-center rounded-lg bg-ranch-crema px-2 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Ranch Texas" className="h-8 w-auto" />
            </Link>
          )}
          {modoCajon ? (
            <button onClick={() => setCajon(false)} aria-label="Cerrar menú" className="grid h-10 w-10 place-items-center rounded-lg text-xl text-ranch-crema hover:bg-white/10">✕</button>
          ) : (
            <button
              onClick={alternarColapso}
              aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
              title={colapsado ? "Expandir menú" : "Colapsar menú"}
              className="grid h-9 w-9 place-items-center rounded-lg text-ranch-crema/70 hover:bg-white/10 hover:text-ranch-crema"
            >
              {colapsado ? "»" : "«"}
            </button>
          )}
        </div>

        {/* Secciones */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-3" aria-label="Menú principal">
          {secciones.map((s) => {
            const esActiva = seccionActiva === s.id;
            const claseSeccion = `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold transition ${
              esActiva ? "text-ranch-dorado" : "text-ranch-crema/85 hover:bg-white/10 hover:text-ranch-crema"
            } ${angosto ? "justify-center px-0" : ""} ${angosto && esActiva ? "bg-white/15 ring-1 ring-ranch-dorado/60" : ""}`;

            if (s.href) {
              return (
                <Link key={s.id} href={s.href} title={angosto ? s.label : undefined} className={`${claseSeccion} mb-1 ${activo === s.href ? "bg-white/10" : ""}`}>
                  <span className="w-6 text-center text-lg">{s.icono}</span>
                  {!angosto && <span className="whitespace-nowrap text-[13px] uppercase">{s.label}</span>}
                </Link>
              );
            }

            const abierta = abiertas.has(s.id) && !angosto;
            return (
              <div key={s.id} className="mb-1">
                <button onClick={() => alternarSeccion(s.id)} aria-expanded={abierta} title={angosto ? s.label : undefined} className={claseSeccion}>
                  <span className="w-6 text-center text-lg">{s.icono}</span>
                  {!angosto && (
                    <>
                      <span className="flex-1 whitespace-nowrap text-left text-[13px] uppercase">{s.label}</span>
                      <span className={`text-[10px] transition-transform ${abierta ? "rotate-180" : ""}`}>▾</span>
                    </>
                  )}
                </button>

                {abierta && (
                  <div className="mb-2 ml-5 mt-1 border-l border-white/15 pl-2">
                    {s.grupos!.map((g, i) => (
                      <div key={g.titulo ?? i} className={i > 0 ? "mt-2" : ""}>
                        {g.titulo && <p className="px-2 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-widest text-ranch-crema/40">{g.titulo}</p>}
                        {g.enlaces.map((e) => {
                          const aqui = activo === e.href;
                          return (
                            <Link
                              key={e.href}
                              href={e.href}
                              title={e.desc}
                              aria-current={aqui ? "page" : undefined}
                              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                                aqui ? "bg-ranch-dorado font-semibold text-ranch-marron-oscuro" : "text-ranch-crema/75 hover:bg-white/10 hover:text-ranch-crema"
                              }`}
                            >
                              <span className="w-5 shrink-0 text-center">{e.icono}</span>
                              <span className="leading-tight">{e.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Usuario + salir */}
        <div className={`flex items-center gap-2 border-t border-white/10 px-3 py-3 ${angosto ? "flex-col" : ""}`}>
          <Link href="/perfil" title="Mi cuenta" className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/10 ${angosto ? "justify-center" : ""}`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ranch-dorado text-sm font-black text-ranch-marron-oscuro">
              {usuario.nombre.trim().charAt(0)}
            </span>
            {!angosto && (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold text-ranch-crema">{usuario.nombre}</span>
                <span className="block text-xs text-ranch-crema/50">{usuario.rol}</span>
              </span>
            )}
          </Link>
          <form action={logout}>
            <button title="Salir" className="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs font-semibold text-ranch-crema hover:bg-white/10">
              {angosto ? "⎋" : "Salir"}
            </button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ------------------------------------------------ ESCRITORIO */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden bg-ranch-marron shadow-xl transition-[width] duration-200 print:hidden lg:block ${colapsado ? "w-16" : "w-64"}`}
      >
        {contenido(false)}
      </aside>

      {/* ------------------------------------------------ CELULAR: barra superior + cajón */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b-2 border-ranch-marron/15 bg-ranch-crema/95 px-3 py-2 backdrop-blur print:hidden lg:hidden">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Ranch Texas" className="h-9 w-auto" />
        </Link>
        <button
          onClick={() => setCajon(true)}
          aria-label="Abrir menú"
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-ranch-marron/30 text-xl text-ranch-marron hover:bg-ranch-marron/10"
        >
          ☰
        </button>
      </header>

      {cajon && (
        <div className="fixed inset-0 z-40 print:hidden lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCajon(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-ranch-marron shadow-2xl">{contenido(true)}</aside>
        </div>
      )}

      {/* ------------------------------------------------ CONTENIDO */}
      <div className={`transition-[padding] duration-200 print:pl-0 ${colapsado ? "lg:pl-16" : "lg:pl-64"}`}>{children}</div>
    </>
  );
}
