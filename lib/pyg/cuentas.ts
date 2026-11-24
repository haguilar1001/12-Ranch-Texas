// Agrupación de las cuentas del estado de resultados (real y presupuestado) en los grupos que
// muestran los reportes. Las cuentas vienen escritas como en los archivos de contabilidad; se
// comparan sin tildes ni mayúsculas. Una cuenta que no esté aquí cae en "Otros gastos" y el
// reporte la sigue mostrando con su nombre, así que nada se pierde.

export const GRUPOS_GASTO = [
  "Personal",
  "Servicios públicos y aseo",
  "Animales",
  "Mantenimiento",
  "Operación general",
  "Administrativos y legales",
  "Comerciales",
  "Impuestos",
  "Otros gastos",
] as const;
export type GrupoGasto = (typeof GRUPOS_GASTO)[number];

export const GRUPOS_INGRESO = ["Entradas", "Eventos", "Arriendos", "Otros ingresos"] as const;

/** "Energía Eléctrica " → "ENERGIA ELECTRICA". */
export function normalizarCuenta(c: string): string {
  return c.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

const GASTO: Record<string, GrupoGasto> = {};
const asignar = (grupo: GrupoGasto, cuentas: string[]) => cuentas.forEach((c) => (GASTO[normalizarCuenta(c)] = grupo));

asignar("Personal", [
  "NOMINA", "NOMINA - OTROS", "PERSONAL EXTRA", "BONIFICACION", "SEGURIDAD SOCIAL", "DOTACION",
  "ALMUERZO PERSONAL", "ALIMENTO PERSONAL", "CAPACITACION Y FORMACION",
]);
asignar("Servicios públicos y aseo", [
  "ENERGIA ELECTRICA", "ENERGIA", "ENERGIA SOLAR", "INTERNET", "DIRECTV", "DIRECT TV", "PLANTAS Y ACUEDUTOS",
  "AGUA POTABLE", "SERVICIO ASEO", "SERVICIO VIGILANCIA", "ELEMENTO DE ASEO", "PRODUCTOS DE ASEO",
  "RECOLECCION DE BASURA", "POZAS SEPTICAS",
]);
asignar("Animales", [
  "ALIMENTO", "HERRAJES", "VIRUTAS", "MEDICAMENTOS", "VETERINARIO", "COMIDA ANIMALES GRANJA",
  "COMIDA CABALLOS (HENO)", "COMIDA CABALLOS CONCENTRADO",
]);
asignar("Mantenimiento", ["MANTENIMIENTO", "ADECUACIONES E INSTALACIONES", "MANTENIMIENTO GENERAL PARQUE", "INSUMO PISCINA"]);
asignar("Operación general", [
  "COMBUSTIBLE", "TRANSPORTES VARIOS", "TRANSPORTE VARIOS", "PAPELERIA", "OTROS GASTOS",
  "ATENCIONES INVITADOS RESTURANTE", "ATENCION INVITADOS RESTAURANTE", "CAJA MENOR", "INSUMOS DE BOTIQUIN",
]);
asignar("Comerciales", ["PUBLICIDAD", "COMISION", "COMISIONES", "DATAFONO", "PAUTAS", "PAPELERIA Y PUBLICIDAD"]);
asignar("Administrativos y legales", [
  "HONORARIOS", "POLIZAS", "SEGUROS", "ARRIENDO", "ARRIENDO PORTAL DEL RIO", "TRAMITES Y LICENCIAS", "SERVICIO SOFTWARE",
]);
asignar("Impuestos", ["IMPUESTOS", "IVA"]);

const INGRESO: Record<string, (typeof GRUPOS_INGRESO)[number]> = {
  ENTRADAS: "Entradas",
  EVENTOS: "Eventos",
  ARRIENDO: "Arriendos",
  ARRIENDOS: "Arriendos",
};

// Cuentas del P&G PRESUPUESTADO → la cuenta del estado de resultados REAL con la que se comparan.
// El presupuesto usa sus propios nombres (más detallados o agrupados distinto). Se muestra en la
// pantalla de Presupuesto para que cualquiera pueda revisarlo. Lo que no está aquí se compara con
// la cuenta del mismo nombre.
const CUENTA_REAL: Record<string, string> = {
  "NOMINA - OTROS": "NOMINA",
  "ALIMENTO PERSONAL": "ALMUERZO PERSONAL",
  ENERGIA: "ENERGIA ELECTRICA",
  "ENERGIA SOLAR": "ENERGIA ELECTRICA",
  "DIRECT TV": "DIRECTV",
  "AGUA POTABLE": "PLANTAS Y ACUEDUTOS",
  "PRODUCTOS DE ASEO": "ELEMENTO DE ASEO",
  "INSUMO PISCINA": "ELEMENTO DE ASEO",
  "RECOLECCION DE BASURA": "SERVICIO ASEO",
  "POZAS SEPTICAS": "SERVICIO ASEO",
  "MANTENIMIENTO GENERAL PARQUE": "MANTENIMIENTO",
  "COMIDA ANIMALES GRANJA": "ALIMENTO",
  "COMIDA CABALLOS (HENO)": "ALIMENTO",
  "COMIDA CABALLOS CONCENTRADO": "ALIMENTO",
  SEGUROS: "POLIZAS",
  "ARRIENDO PORTAL DEL RIO": "ARRIENDO",
  COMISIONES: "COMISION",
  PAUTAS: "PUBLICIDAD",
  "PAPELERIA Y PUBLICIDAD": "PUBLICIDAD",
  "TRANSPORTE VARIOS": "TRANSPORTES VARIOS",
  "ATENCION INVITADOS RESTAURANTE": "ATENCIONES INVITADOS RESTURANTE",
  "CAJA MENOR": "OTROS GASTOS",
  "INSUMOS DE BOTIQUIN": "OTROS GASTOS",
};

/** Cuenta del estado de resultados con la que se compara una cuenta (presupuestada o real). */
export function cuentaComparable(cuenta: string): string {
  const n = normalizarCuenta(cuenta);
  return CUENTA_REAL[n] ?? n;
}

/** Grupo de la cuenta. Una cuenta del presupuesto toma el grupo de su cuenta real equivalente. */
export function grupoGasto(cuenta: string): GrupoGasto {
  return GASTO[cuentaComparable(cuenta)] ?? GASTO[normalizarCuenta(cuenta)] ?? "Otros gastos";
}

export function grupoIngreso(cuenta: string): (typeof GRUPOS_INGRESO)[number] {
  return INGRESO[normalizarCuenta(cuenta)] ?? "Otros ingresos";
}

const TILDES: Record<string, string> = {
  NOMINA: "Nómina", "ENERGIA ELECTRICA": "Energía eléctrica", POLIZAS: "Pólizas", COMISION: "Comisión", DATAFONO: "Datáfono",
  PAPELERIA: "Papelería", "TRAMITES Y LICENCIAS": "Trámites y licencias", DOTACION: "Dotación", BONIFICACION: "Bonificación",
  "CAPACITACION Y FORMACION": "Capacitación y formación", DIRECTV: "DirecTV", IVA: "IVA",
  "ATENCIONES INVITADOS RESTURANTE": "Atenciones a invitados (restaurante)", "PLANTAS Y ACUEDUTOS": "Plantas y acueductos",
};

/** "NOMINA" → "Nómina", "PERSONAL EXTRA" → "Personal extra": para mostrar una cuenta en un texto. */
export function nombreCuenta(cuenta: string): string {
  const n = normalizarCuenta(cuenta);
  return TILDES[n] ?? n.charAt(0) + n.slice(1).toLowerCase();
}
