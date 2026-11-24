import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { obtenerSesion } from "@/lib/auth/sesion";
import { construirMenu } from "@/lib/menu";
import MenuLateral from "./MenuLateral";

/**
 * Marco de las páginas internas: barra lateral (menú) + contenido. Sin sesión, solo el contenido.
 * El estado colapsado se lee de la cookie en el servidor para que la página no "salte" al cargar.
 *
 * Sin <Suspense> alrededor del menú: leer la cookie ya hace dinámica toda página que use este marco,
 * así que useSearchParams no lo necesita. Con un fallback que repetía {children}, React dejaba una
 * segunda copia oculta de la página en el HTML (formularios e ids duplicados).
 */
export default async function AppShell({ children }: { children: ReactNode }) {
  const s = await obtenerSesion();
  if (!s) return <>{children}</>;

  const colapsado = (await cookies()).get("menu_colapsado")?.value === "1";

  return (
    <MenuLateral secciones={construirMenu(s.rol)} usuario={{ nombre: s.nombre, rol: s.rol }} colapsadoInicial={colapsado}>
      {children}
    </MenuLateral>
  );
}
