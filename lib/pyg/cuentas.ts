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

export function grupoGasto(cuenta: string): GrupoGasto {
  return GASTO[normalizarCuenta(cuenta)] ?? "Otros gastos";
}

export function grupoIngreso(cuenta: string): (typeof GRUPOS_INGRESO)[number] {
  return INGRESO[normalizarCuenta(cuenta)] ?? "Otros ingresos";
}
