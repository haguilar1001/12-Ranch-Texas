// Datos del PARQUE como emisor del recibo de caja (encabezado del documento).
// Tomados del RUT (formulario DIAN 141225032887, hoja 1 y hoja 6 — establecimiento
// "RANCH TEXAS" en Galapa, Atlántico).
//
// Es un archivo de configuración, no una tabla: un NIT o una razón social no cambian
// casi nunca, así que no vale la pena una pantalla de administración para esto — se
// edita aquí y ya. Si algún día cambia (o se abre otro establecimiento), es un commit.
export const PARQUE = {
  /** Nombre comercial: el que reconoce el cliente. */
  nombreComercial: "RANCH TEXAS",
  /** Razón social ante la DIAN — quien de verdad emite el recibo. */
  razonSocial: "DIVERSIONES DEL OCCIDENTE S.A.S",
  nit: "901.126.143-5",
  direccion: "Km 14 vía Cordialidad Ruta Nacional 90, Galapa, Atlántico",
  telefono: "300 834 8017",
};
