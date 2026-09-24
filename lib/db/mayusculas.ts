// Todo el texto que escribe una persona se guarda en MAYÚSCULAS, para que los
// listados, los informes y las manillas se vean uniformes sin depender de cómo
// teclee cada cajero ("maria jose" / "María José" / "MARIA JOSE").
//
// Se hace en UN solo punto (la extensión del cliente Prisma, ver lib/db.ts) y por
// LISTA EXPLÍCITA de campos, no sobre todo lo que sea texto. Pasar todo a mayúsculas
// a ciegas rompería la app: los `codigo` de tipo de visitante son claves que el
// código compara ("bebe"), `firma_hmac` es la firma del QR de la manilla, `payload`
// es el ZPL que va a la Zebra, los `*_id` son UUID de llaves foráneas, `hash_password`
// es el hash de la clave y `firma_imagen` es el PNG de la firma en base64.
//
// TAMPOCO se tocan, a propósito:
//   · correos y usuarios de login — el correo en mayúsculas es mala práctica y el
//     usuario rompería el ingreso de quien ya existe;
//   · el cuerpo de los consentimientos — es texto legal largo, en mayúsculas no se lee;
//   · `dim_fecha` y `ventas_historicas` — son tablas generadas/importadas, no las digita nadie.

/** Campos de texto escrito por personas, por modelo de Prisma. */
export const CAMPOS_MAYUSCULAS: Record<string, readonly string[]> = {
  Usuario: ["nombre"],
  Caja: ["nombre", "ubicacion"],
  TurnoCaja: ["observacion_cierre"],
  MovimientoCaja: ["concepto", "referencia"],
  TipoVisitante: ["nombre"],
  Tarifa: ["motivo_cambio"],
  MotivoCortesia: ["nombre"],
  AutorizadorCortesia: ["nombre", "cargo"],
  MedioPago: ["nombre"],
  Venta: ["motivo_anulacion", "comprador_nombre", "comprador_documento", "comprador_razon_social", "comprador_nit"],
  Cliente: ["nombre", "documento", "razon_social", "nit"],
  VentaDetalle: ["motivo_descuento"],
  VentaPago: ["referencia"],
  Manilla: ["motivo_anulacion"],
  Atraccion: ["nombre", "descripcion"],
  TurnoFila: ["motivo"],
  PuntoControl: ["nombre"],
  Acceso: ["motivo_denegacion"],
  TextoConsentimiento: ["titulo"],
  Consentimiento: [
    "nombre_firmante", "documento_firmante",
    "nombre_acudiente", "documento_acudiente", "parentesco",
  ],
  Proveedor: ["nombre", "nit_cedula", "contacto"],
  RubroGasto: ["nombre"],
  Gasto: ["descripcion"],
  GastoRecurrente: ["descripcion"],
  AreaTrabajo: ["nombre", "descripcion"],
  Cargo: ["nombre"],
  Empleado: ["nombre", "tipo_documento", "documento", "unidad_negocio", "observaciones"],
  CategoriaAnimal: ["nombre", "descripcion"],
  Recinto: ["nombre", "ubicacion", "descripcion"],
  Animal: ["nombre", "codigo", "especie", "raza", "observaciones"],
  TrasladoAnimal: ["motivo"],
  Alimento: ["nombre"],
  Racion: ["horario", "observaciones"],
  RegistroAlimentacion: ["motivo", "observaciones", "motivo_anulacion"],
  MovimientoAlimento: ["motivo"],
  CategoriaEquipo: ["nombre", "descripcion"],
  Equipo: ["nombre", "codigo", "ubicacion", "marca", "modelo", "serie", "observaciones"],
  MantenimientoEquipo: ["descripcion", "responsable"],
  Vehiculo: ["placa", "marca", "modelo"],
  SolicitanteVehiculo: ["nombre", "cargo"],
  SolicitudVehiculo: ["descripcion", "origen", "destino", "motivo_rechazo", "motivo_cancelacion"],
};

/** "maría josé " → "MARÍA JOSÉ". Respeta tildes y la Ñ. */
export function mayus(texto: string): string {
  return texto.trim().toLocaleUpperCase("es-CO");
}

/**
 * Devuelve una copia de `data` con los campos de texto de ese modelo en mayúsculas.
 * No toca nada más: los valores que no son texto, los campos fuera de la lista y los
 * `null` pasan intactos. Si el modelo no está en la lista, devuelve `data` tal cual.
 *
 * Soporta la forma `{ campo: { set: "texto" } }` que usa Prisma en algunos updates.
 */
export function aMayusculas<T>(modelo: string | undefined, data: T): T {
  const campos = modelo ? CAMPOS_MAYUSCULAS[modelo] : undefined;
  if (!campos || !data || typeof data !== "object" || Array.isArray(data)) return data;

  const fuente = data as Record<string, unknown>;
  let copia: Record<string, unknown> | null = null;

  for (const campo of campos) {
    const valor = fuente[campo];
    if (typeof valor === "string") {
      const nuevo = mayus(valor);
      if (nuevo !== valor) (copia ??= { ...fuente })[campo] = nuevo;
      continue;
    }
    // { nombre: { set: "..." } }
    if (valor && typeof valor === "object" && !Array.isArray(valor) && "set" in valor) {
      const envoltura = valor as { set?: unknown };
      if (typeof envoltura.set === "string") {
        const nuevo = mayus(envoltura.set);
        if (nuevo !== envoltura.set) (copia ??= { ...fuente })[campo] = { ...envoltura, set: nuevo };
      }
    }
  }

  return (copia ?? data) as T;
}

/** Operaciones de escritura de Prisma que llevan `data`. */
export const OPERACIONES_CON_DATA = [
  "create", "createMany", "createManyAndReturn",
  "update", "updateMany", "upsert",
] as const;
