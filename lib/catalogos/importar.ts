// Carga de catálogos desde Excel. Lógica PURA (sin BD): define las columnas de cada plantilla y
// valida las filas contra lo que ya existe. Si el nombre ya existe, la fila ACTUALIZA ese registro
// (las celdas vacías no borran lo que había); si no, lo CREA. La plantilla la genera la app en
// /admin/catalogos/plantilla/[tipo] con estas mismas columnas.

import { normalizar, type Celda } from "@/lib/equipos/importar";
import {
  CONDICIONES_PAGO, TIPOS_PROVEEDOR, UNIDADES, pesos, validarProveedor, validarMateriaPrima, validarArea,
} from "./validar";

export type TipoCatalogo = "proveedores" | "materias" | "rubros" | "alimentos" | "grupos" | "areas";

export interface ColumnaCatalogo {
  clave: string;
  titulo: string;
  obligatoria?: boolean;
  ancho: number;
  ayuda: string;
  /** Lista desplegable en la plantilla. `estricta`: solo valores de la lista. */
  lista?: { origen: "condiciones" | "tipos_proveedor" | "unidades" | "proveedores" | "unidades_alimento" | "tipos_alimento"; estricta?: boolean };
  numero?: boolean;
}

export interface DefCatalogo {
  tipo: TipoCatalogo;
  titulo: string;
  /** Nombre de la hoja donde se llenan los datos. */
  hoja: string;
  singular: string;
  columnas: ColumnaCatalogo[];
  ejemplos: string[][];
  nota?: string;
}

const C = (clave: string, titulo: string, ancho: number, ayuda: string, extra: Partial<ColumnaCatalogo> = {}): ColumnaCatalogo => ({ clave, titulo, ancho, ayuda, ...extra });

export const DEFS: Record<TipoCatalogo, DefCatalogo> = {
  proveedores: {
    tipo: "proveedores", titulo: "Proveedores", hoja: "PROVEEDORES", singular: "proveedor",
    columnas: [
      C("nombre", "NOMBRE", 34, "Nombre o razón social. Si ya existe en la app, la fila actualiza sus datos.", { obligatoria: true }),
      C("nit_cedula", "NIT O CÉDULA", 16, "Sin puntos. Ej.: 802020269-9."),
      C("tipo", "TIPO", 22, "Elíjalo de la lista o escriba otro.", { lista: { origen: "tipos_proveedor" } }),
      C("contacto", "CONTACTO", 24, "Persona con quien se habla."),
      C("telefono", "TELÉFONO", 16, "Solo números, espacios, + o guiones."),
      C("email", "CORREO", 26, "Correo electrónico."),
      C("direccion", "DIRECCIÓN", 28, "Dirección del proveedor."),
      C("ciudad", "CIUDAD", 16, "Ciudad."),
      C("condiciones_pago", "CONDICIONES DE PAGO", 20, "Elíjala de la lista.", { lista: { origen: "condiciones", estricta: true } }),
      C("suministra", "QUÉ SUMINISTRA", 34, "Productos o servicios que le compramos."),
      C("observaciones", "OBSERVACIONES", 34, "Cualquier nota."),
    ],
    ejemplos: [["SANTIAGRO LIMITADA", "802020269-9", "REPUESTOS", "MARÍA HERNÁNDEZ", "605 3049349", "", "CALLE 67 # 42-65", "BARRANQUILLA", "Contado", "GUADAÑAS Y REPUESTOS AGRÍCOLAS", ""]],
  },
  materias: {
    tipo: "materias", titulo: "Materias primas", hoja: "MATERIAS PRIMAS", singular: "materia prima",
    columnas: [
      C("nombre", "NOMBRE", 34, "Nombre de la materia prima. Si ya existe, la fila actualiza sus datos.", { obligatoria: true }),
      C("categoria", "CATEGORÍA", 20, "Ej.: COCINA, ASEO, PISCINA, PAPELERÍA."),
      C("unidad_medida", "UNIDAD", 12, "Unidad de medida: kg, litro, unidad, bulto…", { obligatoria: true, lista: { origen: "unidades" } }),
      C("costo_referencia", "COSTO DE REFERENCIA", 16, "Pesos por unidad, sin decimales.", { numero: true }),
      C("proveedor", "PROVEEDOR HABITUAL", 28, "Elíjalo de la lista o escriba uno nuevo (se crea solo).", { lista: { origen: "proveedores" } }),
      C("observaciones", "OBSERVACIONES", 34, "Cualquier nota."),
    ],
    ejemplos: [["CLORO GRANULADO 90%", "PISCINA", "kg", "12500", "SANTIAGRO LIMITADA", ""]],
  },
  rubros: {
    tipo: "rubros", titulo: "Rubros de gasto", hoja: "RUBROS", singular: "rubro",
    columnas: [
      C("grupo", "GRUPO", 28, "Primer nivel. Si no existe, se crea.", { obligatoria: true }),
      C("rubro", "RUBRO", 28, "Segundo nivel, dentro del grupo. Vacío = la fila crea solo el grupo."),
      C("subrubro", "SUBRUBRO", 28, "Tercer nivel, dentro del rubro. Exige RUBRO."),
      C("orden", "ORDEN", 10, "Opcional. Los de número menor salen primero en las listas.", { numero: true }),
    ],
    ejemplos: [["GASTOS DE OPERACIÓN", "ASEO", "JABÓN Y DESINFECTANTES", ""], ["GASTOS DE OPERACIÓN", "ASEO", "", ""]],
    nota: "Una fila por rubro. Los niveles que falten se crean solos; los que ya existen no se duplican.",
  },
  alimentos: {
    tipo: "alimentos", titulo: "Alimentos", hoja: "ALIMENTOS", singular: "alimento",
    columnas: [
      C("nombre", "NOMBRE", 30, "Nombre del alimento. Si ya existe, la fila actualiza sus datos.", { obligatoria: true }),
      C("tipo", "TIPO", 16, "concentrado, forraje, fruta, verdura…", { lista: { origen: "tipos_alimento" } }),
      C("unidad_medida", "UNIDAD DE COMPRA", 16, "bulto, kg, litro, unidad, paca…", { obligatoria: true, lista: { origen: "unidades_alimento" } }),
      C("costo_unitario", "COSTO POR UNIDAD", 16, "Pesos por unidad de compra, sin decimales.", { numero: true }),
      C("equivalencia_g", "GRAMOS POR UNIDAD", 16, "Gramos (o ml) que trae una unidad de compra. Ej.: bulto de 40 kg = 40000.", { numero: true }),
    ],
    ejemplos: [["CONCENTRADO EQUINO", "concentrado", "bulto", "98000", "40000"]],
    nota: "Las existencias y compras de alimento se registran en Animales, no en esta plantilla.",
  },
  grupos: {
    tipo: "grupos", titulo: "Grupos de equipos", hoja: "GRUPOS", singular: "grupo",
    columnas: [
      C("nombre", "NOMBRE", 30, "Nombre del grupo. Si ya existe, la fila actualiza la descripción.", { obligatoria: true }),
      C("descripcion", "DESCRIPCIÓN", 50, "Qué equipos van en el grupo."),
    ],
    ejemplos: [["HERRAMIENTAS", "GUADAÑAS, MOTOSIERRAS, TALADROS"]],
  },
  areas: {
    tipo: "areas", titulo: "Áreas de trabajo", hoja: "AREAS", singular: "área",
    columnas: [
      C("nombre", "NOMBRE", 30, "Nombre del área. Si ya existe, la fila actualiza la descripción.", { obligatoria: true }),
      C("descripcion", "DESCRIPCIÓN", 50, "Qué hace el área."),
    ],
    ejemplos: [["ZONAS VERDES", "JARDINERÍA Y PODA"]],
  },
};

export const TIPOS_CATALOGO = Object.keys(DEFS) as TipoCatalogo[];
export const esTipoCatalogo = (t: string): t is TipoCatalogo => t in DEFS;

/** Listas para las plantillas que no dependen de la BD. */
export const LISTAS_FIJAS = {
  condiciones: CONDICIONES_PAGO.map((c) => c.label),
  tipos_proveedor: TIPOS_PROVEEDOR,
  unidades: UNIDADES,
  unidades_alimento: ["bulto", "kg", "g", "litro", "ml", "unidad", "paca"],
  tipos_alimento: ["concentrado", "forraje", "fruta", "verdura", "suplemento"],
};

// ------------------------------------------------------------------ lectura

export interface Existentes {
  /** nombre normalizado → { id, ...datos actuales } del catálogo que se carga. */
  registros: Map<string, { id: string } & Record<string, unknown>>;
  /** Proveedores activos: nombre normalizado → id (para materias primas). */
  proveedores?: Map<string, string>;
  /** Rubros: ruta normalizada ("grupo|rubro|subrubro") → id. */
  rutasRubros?: Map<string, string>;
}

export interface FilaCatalogo {
  fila: number;
  /** id del registro existente si la fila lo actualiza. */
  id: string | null;
  nombre: string;
  /** Datos a guardar. En una actualización solo trae los campos con valor. */
  datos: Record<string, string | number | null>;
  /** Proveedor que no existe y se creará (materias primas). */
  proveedor_nuevo?: string | null;
  /** Rubros: los niveles de la ruta, de grupo a la hoja. */
  ruta?: string[];
}

export interface ErrorFila { fila: number; errores: string[] }

export interface LecturaCatalogo {
  nuevos: FilaCatalogo[];
  actualizar: FilaCatalogo[];
  errores: ErrorFila[];
  avisos: string[];
  faltanColumnas: string[];
}

/** Texto de una celda; los números (NIT, teléfono) se pasan a texto sin decimales. */
function txt(c: Celda): string | null {
  if (c === null || c === undefined || c instanceof Date) return null;
  if (typeof c === "number") return Number.isInteger(c) ? String(c) : String(c);
  const t = String(c).replace(/\s+/g, " ").trim();
  return t ? t : null;
}

export function mapearColumnas(def: DefCatalogo, encabezado: Celda[]): Map<string, number> {
  const titulos = encabezado.map((c) => normalizar(String(c ?? "").replace(/\*/g, "")));
  const m = new Map<string, number>();
  for (const col of def.columnas) {
    const i = titulos.indexOf(normalizar(col.titulo));
    if (i >= 0) m.set(col.clave, i);
  }
  return m;
}

/** Condición de pago desde la etiqueta de la lista ("Crédito 30 días") o el código ("credito_30"). */
export function condicionDesde(t: string | null): string | null | "error" {
  if (!t) return null;
  const n = normalizar(t);
  const c = CONDICIONES_PAGO.find((x) => normalizar(x.label) === n || x.id === n.replace(/\s+/g, "_"));
  return c ? c.id : "error";
}

/** Solo los campos con valor (para no borrar datos al actualizar). */
const conValor = (d: Record<string, string | number | null>) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== ""));

export function leerCatalogo(tipo: TipoCatalogo, filas: Celda[][], ex: Existentes, primeraFila = 2): LecturaCatalogo {
  const def = DEFS[tipo];
  const res: LecturaCatalogo = { nuevos: [], actualizar: [], errores: [], avisos: [], faltanColumnas: [] };
  if (!filas.length) {
    res.faltanColumnas = def.columnas.filter((c) => c.obligatoria).map((c) => c.titulo);
    return res;
  }
  const mapa = mapearColumnas(def, filas[0]);
  res.faltanColumnas = def.columnas.filter((c) => c.obligatoria && !mapa.has(c.clave)).map((c) => c.titulo);
  if (res.faltanColumnas.length) return res;

  const vistos = new Map<string, number>();
  const proveedoresNuevos = new Set<string>();

  filas.slice(1).forEach((f, idx) => {
    const numero = primeraFila + idx;
    if (!f || f.every((c) => txt(c) === null)) return; // fila vacía
    const v = (k: string) => (mapa.has(k) ? txt(f[mapa.get(k)!]) : null);
    const errores: string[] = [];

    // ---- rubros: la clave es la ruta completa
    if (tipo === "rubros") {
      const ruta = [v("grupo"), v("rubro"), v("subrubro")];
      if (!ruta[0]) errores.push("Falta el GRUPO.");
      if (ruta[2] && !ruta[1]) errores.push("Un SUBRUBRO necesita su RUBRO.");
      const orden = pesos(v("orden"));
      if (orden === "error") errores.push("El ORDEN debe ser un número entero.");
      const niveles = ruta.filter((x): x is string => !!x);
      const clave = niveles.map(normalizar).join("|");
      if (!errores.length && vistos.has(clave)) errores.push(`Repetido: es el mismo rubro de la fila ${vistos.get(clave)}.`);
      if (errores.length) return res.errores.push({ fila: numero, errores });
      vistos.set(clave, numero);
      const id = ex.rutasRubros?.get(clave) ?? null;
      const fila: FilaCatalogo = { fila: numero, id, nombre: niveles.join(" › "), ruta: niveles, datos: conValor({ orden: orden as number | null }) };
      if (id) { if (Object.keys(fila.datos).length) res.actualizar.push(fila); }
      else res.nuevos.push(fila);
      return;
    }

    const nombre = v("nombre");
    if (!nombre) errores.push("Falta el NOMBRE.");
    const clave = nombre ? normalizar(nombre) : "";
    if (nombre && vistos.has(clave)) errores.push(`Repetido: el mismo nombre está en la fila ${vistos.get(clave)}.`);
    const existente = nombre ? ex.registros.get(clave) : undefined;

    let datos: Record<string, string | number | null> = {};
    let proveedor_nuevo: string | null = null;

    if (tipo === "proveedores") {
      const cond = condicionDesde(v("condiciones_pago"));
      if (cond === "error") errores.push("CONDICIONES DE PAGO no válidas: elíjalas de la lista.");
      const r = validarProveedor({
        nombre: nombre ?? "", nit_cedula: v("nit_cedula"), tipo: v("tipo"), contacto: v("contacto"), telefono: v("telefono"), email: v("email"),
        direccion: v("direccion"), ciudad: v("ciudad"), condiciones_pago: cond === "error" ? null : cond, suministra: v("suministra"), observaciones: v("observaciones"),
      });
      if (!r.ok) { if (nombre) errores.push(r.error); } else datos = r.datos;
    } else if (tipo === "materias") {
      const r = validarMateriaPrima({ nombre: nombre ?? "", categoria: v("categoria"), unidad_medida: v("unidad_medida") ?? "", costo_referencia: v("costo_referencia"), observaciones: v("observaciones") });
      if (!r.ok) { if (nombre) errores.push(r.error); } else {
        const { proveedor_id: _omit, ...resto } = r.datos; // eslint-disable-line @typescript-eslint/no-unused-vars
        datos = resto;
        const prov = v("proveedor");
        if (prov) {
          const pid = ex.proveedores?.get(normalizar(prov));
          if (pid) datos.proveedor_id = pid;
          else { proveedor_nuevo = prov; proveedoresNuevos.add(prov.toUpperCase()); }
        }
      }
    } else if (tipo === "alimentos") {
      const unidad = v("unidad_medida");
      if (!unidad) errores.push("Falta la UNIDAD DE COMPRA.");
      const costo = pesos(v("costo_unitario"));
      if (costo === "error") errores.push("El COSTO debe ser un número entero en pesos.");
      const equiv = pesos(v("equivalencia_g"));
      if (equiv === "error" || equiv === 0) errores.push("GRAMOS POR UNIDAD debe ser un número entero mayor a 0.");
      datos = { nombre: nombre ?? "", tipo: v("tipo"), unidad_medida: unidad, costo_unitario: costo === "error" ? null : costo, equivalencia_g: equiv === "error" ? null : equiv };
    } else {
      // grupos y áreas
      const r = validarArea({ nombre: nombre ?? "", descripcion: v("descripcion") });
      if (r.ok) datos = r.datos;
    }

    if (errores.length) return res.errores.push({ fila: numero, errores });
    vistos.set(clave, numero);

    if (existente) {
      // Actualiza: solo lo que trae valor y cambia; el nombre queda como estaba.
      // Los textos se guardan en mayúsculas: se comparan sin mayúsculas ni tildes.
      const distinto = (val: string | number | null, antes: unknown) =>
        typeof val === "string" ? normalizar(val) !== normalizar(String(antes ?? "")) : val !== antes;
      const cambios = Object.fromEntries(Object.entries(conValor(datos)).filter(([k, val]) => k !== "nombre" && distinto(val, existente[k])));
      if (proveedor_nuevo || Object.keys(cambios).length) res.actualizar.push({ fila: numero, id: existente.id, nombre: nombre!, datos: cambios, proveedor_nuevo });
    } else {
      res.nuevos.push({ fila: numero, id: null, nombre: nombre!, datos, proveedor_nuevo });
    }
  });

  if (proveedoresNuevos.size) res.avisos.push(`Se crearán ${proveedoresNuevos.size} proveedor(es) nuevo(s): ${[...proveedoresNuevos].join(", ")}.`);
  return res;
}
