import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { obtenerSesion } from "@/lib/auth/sesion";
import { construirMenu } from "@/lib/menu";
import MenuLateral from "./MenuLateral";

/**
 * Marco de las páginas internas: barra lateral (menú) + contenido. Sin sesión, solo el contenido.
 * El estado colapsado se lee de la cookie en el servidor para que la página no "salte" al cargar.
 */
export default async function AppShell({ children }: { children: ReactNode }) {
  const s = await obtenerSesion();
  if (!s) return <>{children}</>;

  const colapsado = (await cookies()).get("menu_colapsado")?.value === "1";

  return (
    // useSearchParams (pestaña activa) necesita un límite de Suspense.
    <Suspense fallback={<div className={colapsado ? "lg:pl-16" : "lg:pl-64"}>{children}</div>}>
      <MenuLateral secciones={construirMenu(s.rol)} usuario={{ nombre: s.nombre, rol: s.rol }} colapsadoInicial={colapsado}>
        {children}
      </MenuLateral>
    </Suspense>
  );
}
