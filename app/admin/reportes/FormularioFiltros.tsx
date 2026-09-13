"use client";

import { useRef, type ReactNode } from "react";

/**
 * Formulario de filtros que se aplica SOLO: al cambiar cualquier control, consulta.
 *
 * Antes había que escoger el filtro y además darle a un botón "Ver". Es un paso de
 * más en la pantalla que más se mira del día, y cuando alguien lo olvidaba parecía
 * que el filtro no servía: se ve el mes seleccionado pero las cifras siguen siendo
 * las de antes.
 *
 * Sigue siendo un GET normal, así que el filtro queda en la URL y se puede guardar,
 * compartir y volver a él con el botón de atrás del navegador.
 *
 * Los cambios se escuchan en el formulario, no control por control: un filtro nuevo
 * que alguien agregue mañana queda conectado sin acordarse de nada.
 */
export default function FormularioFiltros({
  children, className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      className={className}
      onChange={(e) => {
        // El evento viene del control que cambió, no del formulario: se lee lo justo.
        const campo = e.target as EventTarget & { type?: string; value?: string };
        // Una fecha a medio escribir llega vacía: el navegador solo reporta valor
        // cuando el día, el mes y el año están completos. Consultar ahí mandaría al
        // usuario al mes entero justo mientras teclea.
        if (campo.type === "date" && !campo.value) return;
        form.current?.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
