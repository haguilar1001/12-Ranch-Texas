// Resumen de un reporte de falla para compartir por WhatsApp (imagen + texto).
// La parte de datos es pura (testeable); el dibujo en canvas vive en el componente cliente.

export interface DatosResumenFalla {
  id: string;
  equipo: string;
  codigo?: string | null;
  grupo?: string | null;
  ubicacion?: string | null;
  descripcion: string;
  solucion?: string | null;
  prioridad: string;
  detenido: boolean;
  reportadoPor: string;
  /** ISO (UTC). Se presenta en America/Bogota. */
  fecha: string;
  fotos?: number;
}

export const PRIORIDAD_FALLA: Record<string, { label: string; color: string; emoji: string }> = {
  baja: { label: "Baja", color: "#57A23C", emoji: "🟢" },
  media: { label: "Media", color: "#C79A3C", emoji: "🟡" },
  alta: { label: "Alta", color: "#E07B24", emoji: "🟠" },
  critica: { label: "Crítica", color: "#D93025", emoji: "🔴" },
};

/** Número corto y legible del reporte (primeros 8 caracteres del id). */
export const numeroReporte = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();

export function fechaResumen(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota", weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** Filas etiqueta/valor que van en la imagen (y en el texto). */
export function filasResumen(d: DatosResumenFalla): { etiqueta: string; valor: string }[] {
  const ubic = [d.grupo, d.ubicacion].filter(Boolean).join(" · ");
  const filas = [
    { etiqueta: "Fecha", valor: fechaResumen(d.fecha) },
    { etiqueta: "Equipo", valor: d.codigo ? `${d.equipo} (${d.codigo})` : d.equipo },
    ...(ubic ? [{ etiqueta: "Grupo / ubicación", valor: ubic }] : []),
    { etiqueta: "Reporta", valor: d.reportadoPor },
    { etiqueta: "Prioridad", valor: PRIORIDAD_FALLA[d.prioridad]?.label ?? d.prioridad },
    { etiqueta: "Estado del equipo", valor: d.detenido ? "DETENIDO — fuera de servicio" : "Sigue operando" },
  ];
  if (d.fotos) filas.push({ etiqueta: "Fotos", valor: `${d.fotos} adjunta${d.fotos === 1 ? "" : "s"} en la app` });
  return filas;
}

/** Texto plano para acompañar la imagen en WhatsApp (formato *negrita* de WhatsApp). */
export function textoWhatsApp(d: DatosResumenFalla): string {
  const p = PRIORIDAD_FALLA[d.prioridad];
  return [
    `🛠️ *REPORTE DE FALLA #${numeroReporte(d.id)}* — Ranch Texas`,
    ...filasResumen(d).map((f) => `*${f.etiqueta}:* ${f.etiqueta === "Prioridad" && p ? `${p.emoji} ` : ""}${f.valor}`),
    `*Falla:* ${d.descripcion}`,
    ...(d.solucion ? [`*Solución sugerida:* ${d.solucion}`] : []),
  ].join("\n");
}
