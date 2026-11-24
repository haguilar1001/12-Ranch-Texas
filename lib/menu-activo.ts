// Tipos del menú lateral y cálculo del enlace activo. Puro y sin dependencias de servidor:
// lo usa el componente de cliente (components/MenuLateral.tsx). La definición vive en lib/menu.ts.

export interface EnlaceMenu {
  icono: string;
  label: string;
  href: string;
  /** Texto corto que explica a dónde lleva (tooltip). */
  desc?: string;
}

export interface GrupoMenu {
  /** Subtítulo dentro de la sección (p. ej. "Ventas" dentro de Reportes). Vacío = sin subtítulo. */
  titulo?: string;
  enlaces: EnlaceMenu[];
}

export interface SeccionMenu {
  id: string;
  icono: string;
  label: string;
  /** Sección sin submenú (Inicio). */
  href?: string;
  grupos?: GrupoMenu[];
}

/**
 * Enlace activo para la URL actual: el de ruta MÁS LARGA que coincide (así /escaneo/fila no
 * enciende también /escaneo). Si el enlace trae ?tab=, también debe coincidir la pestaña; sin
 * pestaña en la URL, cuenta la primera del módulo (la que abre por defecto).
 */
export function enlaceActivo(secciones: SeccionMenu[], path: string, tab: string | null): string | null {
  let mejor: { href: string; largo: number; exacto: boolean } | null = null;
  const vistosConTab = new Set<string>();
  for (const s of secciones) {
    const candidatos = s.href ? [s.href] : (s.grupos ?? []).flatMap((g) => g.enlaces.map((e) => e.href));
    for (const href of candidatos) {
      const [ruta, query] = href.split("?");
      const coincide = ruta === "/" ? path === "/" : path === ruta || path.startsWith(ruta + "/");
      if (!coincide) continue;
      const tabEnlace = query ? new URLSearchParams(query).get("tab") : null;
      let exacto = true;
      if (tabEnlace) {
        const primera = !vistosConTab.has(ruta);
        vistosConTab.add(ruta);
        if (tab ? tab !== tabEnlace : !primera) continue;
        exacto = !!tab;
      }
      if (!mejor || ruta.length > mejor.largo || (ruta.length === mejor.largo && exacto && !mejor.exacto)) {
        mejor = { href, largo: ruta.length, exacto };
      }
    }
  }
  return mejor?.href ?? null;
}
