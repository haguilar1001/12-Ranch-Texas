// Datos del PARQUE como emisor del recibo de caja (encabezado del documento).
//
// Es un archivo de configuración, no una tabla: un NIT o una razón social no cambian
// casi nunca, así que no vale la pena una pantalla de administración para esto — se
// edita aquí y ya. Si algún día cambia, es un commit, no un formulario.
//
// ⚠️ PENDIENTE: completar con los datos reales antes de usar el recibo con clientes
// de verdad. Mientras tanto el recibo va a mostrar "(pendiente)" en lo que falte, para
// que sea imposible no darse cuenta si se imprime así por error.
export const PARQUE = {
  razonSocial: "PARQUE RANCH TEXAS",
  nit: null as string | null, // ej. "900.123.456-7"
  direccion: null as string | null, // ej. "Km 5 vía Baranoa - Sibarco, Baranoa, Atlántico"
  telefono: null as string | null,
};
