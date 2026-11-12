// Carga masiva de equipos desde la plantilla de Excel. Lógica PURA (sin BD): recibe las filas
// ya leídas del archivo y los catálogos, y devuelve las filas listas para crear o los errores
// por fila. La plantilla la genera la app (`/admin/equipos/plantilla`) con estas mismas columnas.

export type Celda = string | number | Date | boolean | null | undefined;

export interface Columna {
  clave: ClaveColumna;
  titulo: string;
  obligatoria?: boolean;
  ancho: number;
  ayuda: string;
}

export type ClaveColumna =
  | "grupo" | "nombre" | "cantidad" | "codigo" | "marca" | "referencia" | "modelo" | "serie"
  | "area" | "ubicacion" | "estado" | "origen" | "proveedor" | "valor_compra" | "fecha_compra"
  | "fecha_instalacion" | "garantia_hasta" | "vida_util_meses" | "responsable" | "observaciones";

export const COLUMNAS: Columna[] = [
  { clave: "grupo", titulo: "GRUPO", obligatoria: true, ancho: 22, ayuda: "Elíjalo de la lista (son los grupos creados en la app)." },
  { clave: "nombre", titulo: "NOMBRE", obligatoria: true, ancho: 34, ayuda: "Nombre del equipo. Ej.: PLANTA ELÉCTRICA 60 KVA, SILLA PLÁSTICA." },
  { clave: "cantidad", titulo: "CANTIDAD", obligatoria: true, ancho: 11, ayuda: "Unidades. 1 si es un equipo individual; 20 si son 20 sillas iguales en el mismo sitio." },
  { clave: "codigo", titulo: "CÓDIGO / PLACA", ancho: 16, ayuda: "Placa o consecutivo interno. No se puede repetir con un equipo ya cargado." },
  { clave: "marca", titulo: "MARCA", ancho: 16, ayuda: "Ej.: YAMAHA, RIMAX, CUMMINS." },
  { clave: "referencia", titulo: "REFERENCIA", ancho: 18, ayuda: "Referencia comercial del fabricante." },
  { clave: "modelo", titulo: "MODELO", ancho: 16, ayuda: "Modelo o año." },
  { clave: "serie", titulo: "N.º SERIE", ancho: 18, ayuda: "Número de serie de la placa del fabricante." },
  { clave: "area", titulo: "ÁREA", ancho: 20, ayuda: "Elíjala de la lista (áreas de trabajo de la app)." },
  { clave: "ubicacion", titulo: "UBICACIÓN", ancho: 22, ayuda: "Sitio exacto. Ej.: TARIMA CENTRAL, BODEGA 2, PISCINA." },
  { clave: "estado", titulo: "ESTADO", ancho: 18, ayuda: "OPERATIVO, EN MANTENIMIENTO o FUERA DE SERVICIO. Vacío = OPERATIVO." },
  { clave: "origen", titulo: "ORIGEN", ancho: 16, ayuda: "YA ESTABA (inventario actual), COMPRA o DONACIÓN. Vacío = YA ESTABA." },
  { clave: "proveedor", titulo: "PROVEEDOR", ancho: 24, ayuda: "Elíjalo de la lista o escriba uno nuevo (se crea solo)." },
  { clave: "valor_compra", titulo: "VALOR UNITARIO", ancho: 15, ayuda: "Pesos, sin decimales. Valor de UNA unidad." },
  { clave: "fecha_compra", titulo: "FECHA COMPRA", ancho: 14, ayuda: "Fecha (dd/mm/aaaa)." },
  { clave: "fecha_instalacion", titulo: "FECHA INSTALACIÓN", ancho: 14, ayuda: "Fecha (dd/mm/aaaa)." },
  { clave: "garantia_hasta", titulo: "GARANTÍA HASTA", ancho: 14, ayuda: "Fecha en que vence la garantía (dd/mm/aaaa)." },
  { clave: "vida_util_meses", titulo: "VIDA ÚTIL (MESES)", ancho: 12, ayuda: "Meses de vida útil esperada. Ej.: 60 = 5 años." },
  { clave: "responsable", titulo: "RESPONSABLE", ancho: 26, ayuda: "Empleado que lo tiene a cargo. Elíjalo de la lista." },
  { clave: "observaciones", titulo: "OBSERVACIONES", ancho: 34, ayuda: "Cualquier nota." },
];

export const ESTADOS_EXCEL: Record<string, "operativo" | "en_mantenimiento" | "fuera_servicio"> = {
  operativo: "operativo",
  "en mantenimiento": "en_mantenimiento",
  "fuera de servicio": "fuera_servicio",
  "fuera servicio": "fuera_servicio",
};
export const ORIGENES_EXCEL: Record<string, "saldo_inicial" | "compra" | "donacion_recibida"> = {
  "ya estaba": "saldo_inicial",
  compra: "compra",
  donacion: "donacion_recibida",
  "donacion recibida": "donacion_recibida",
};

/** Mayúsculas/minúsculas, tildes y espacios de más no importan al comparar. */
export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function texto(c: Celda): string | null {
  if (c === null || c === undefined) return null;
  if (c instanceof Date) return null;
  const t = String(c).replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/** Entero desde número o texto ("45.000", "$ 45.000", "45000"). */
function entero(c: Celda): number | null | "error" {
  if (c === null || c === undefined || c === "") return null;
  if (typeof c === "number") return Number.isInteger(c) ? c : Math.round(c) === c ? c : "error";
  const t = String(c).replace(/[$\s.]/g, "").replace(/,00$/, "");
  if (!t) return null;
  if (!/^-?\d+$/.test(t)) return "error";
  return parseInt(t, 10);
}

/** Fecha desde Date de Excel, número serial o texto dd/mm/aaaa o aaaa-mm-dd. Devuelve "aaaa-mm-dd". */
export function fecha(c: Celda): string | null | "error" {
  if (c === null || c === undefined || c === "") return null;
  const dos = (n: number) => String(n).padStart(2, "0");
  if (c instanceof Date) {
    if (Number.isNaN(c.getTime())) return "error";
    // Excel guarda la fecha a medianoche UTC: se toma la parte de fecha en UTC.
    return `${c.getUTCFullYear()}-${dos(c.getUTCMonth() + 1)}-${dos(c.getUTCDate())}`;
  }
  if (typeof c === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000);
    return fecha(d);
  }
  const t = String(c).trim();
  let m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return valida(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  return "error";

  function valida(a: number, mes: number, d: number): string | "error" {
    const f = new Date(Date.UTC(a, mes - 1, d));
    if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return "error";
    return `${a}-${dos(mes)}-${dos(d)}`;
  }
}

export interface Catalogos {
  /** nombre normalizado → id */
  grupos: Map<string, string>;
  areas: Map<string, string>;
  empleados: Map<string, string>;
  proveedores: Map<string, string>;
  /** Códigos (normalizados) que ya tienen equipos activos. */
  codigosExistentes: Set<string>;
  /** Equipos ya cargados: clave de `claveDuplicado` (para avisar posibles duplicados sin código). */
  existentes?: Set<string>;
}

/** Nombre + grupo + ubicación: si coincide con algo ya cargado, probablemente se está cargando dos veces. */
export const claveDuplicado = (nombre: string, categoriaId: string, ubicacion: string | null) =>
  `${normalizar(nombre)}|${categoriaId}|${normalizar(ubicacion ?? "")}`;

export interface FilaEquipo {
  fila: number; // número de fila en Excel
  nombre: string;
  categoria_id: string;
  grupo: string;
  cantidad: number;
  codigo: string | null;
  marca: string | null;
  referencia: string | null;
  modelo: string | null;
  serie: string | null;
  area_id: string | null;
  ubicacion: string | null;
  estado: "operativo" | "en_mantenimiento" | "fuera_servicio";
  origen: "saldo_inicial" | "compra" | "donacion_recibida";
  proveedor_id: string | null;
  /** Proveedor que no existe y se creará. */
  proveedor_nuevo: string | null;
  valor_compra: number | null;
  fecha_compra: string | null;
  fecha_instalacion: string | null;
  garantia_hasta: string | null;
  vida_util_meses: number | null;
  responsable_id: string | null;
  observaciones: string | null;
}

export interface ErrorFila { fila: number; errores: string[] }

export interface ResultadoLectura {
  validas: FilaEquipo[];
  errores: ErrorFila[];
  /** Avisos que no impiden cargar (p. ej. proveedores nuevos). */
  avisos: string[];
  /** Columnas obligatorias que no se encontraron en el encabezado. */
  faltanColumnas: string[];
}

/** Ubica cada columna por su título (sin importar tildes, mayúsculas ni el asterisco de obligatoria). */
export function mapearEncabezado(encabezado: Celda[]): Map<ClaveColumna, number> {
  const mapa = new Map<ClaveColumna, number>();
  const titulos = encabezado.map((c) => normalizar(String(c ?? "").replace(/\*/g, "")));
  for (const col of COLUMNAS) {
    const i = titulos.indexOf(normalizar(col.titulo));
    if (i >= 0) mapa.set(col.clave, i);
  }
  return mapa;
}

/**
 * Valida las filas de la hoja. `filas[0]` es el encabezado; `primeraFila` es el número de fila de
 * Excel de `filas[1]` (para que los errores digan "fila 7" igual que en el archivo).
 */
export function leerFilas(filas: Celda[][], cat: Catalogos, primeraFila = 2): ResultadoLectura {
  const res: ResultadoLectura = { validas: [], errores: [], avisos: [], faltanColumnas: [] };
  if (filas.length === 0) {
    res.faltanColumnas = COLUMNAS.filter((c) => c.obligatoria).map((c) => c.titulo);
    return res;
  }
  const mapa = mapearEncabezado(filas[0]);
  res.faltanColumnas = COLUMNAS.filter((c) => c.obligatoria && !mapa.has(c.clave)).map((c) => c.titulo);
  if (res.faltanColumnas.length) return res;

  const codigosEnArchivo = new Map<string, number>();
  const proveedoresNuevos = new Set<string>();
  const posiblesDuplicados: number[] = [];

  filas.slice(1).forEach((f, idx) => {
    const numero = primeraFila + idx;
    const v = (k: ClaveColumna): Celda => (mapa.has(k) ? f[mapa.get(k)!] : null);
    // Fila totalmente vacía: se ignora.
    if (f.every((c) => texto(c) === null && !(c instanceof Date) && typeof c !== "number")) return;

    const errores: string[] = [];

    const grupo = texto(v("grupo"));
    const categoria_id = grupo ? cat.grupos.get(normalizar(grupo)) : undefined;
    if (!grupo) errores.push("Falta el GRUPO.");
    else if (!categoria_id) errores.push(`El grupo "${grupo}" no existe en la app.`);

    const nombre = texto(v("nombre"));
    if (!nombre) errores.push("Falta el NOMBRE.");

    const cantidad = entero(v("cantidad"));
    if (cantidad === null) errores.push("Falta la CANTIDAD.");
    else if (cantidad === "error" || cantidad < 1) errores.push("La CANTIDAD debe ser un número entero mayor a 0.");

    const codigo = texto(v("codigo"));
    if (codigo) {
      const n = normalizar(codigo);
      if (cat.codigosExistentes.has(n)) errores.push(`El código ${codigo} ya lo tiene un equipo cargado.`);
      else if (codigosEnArchivo.has(n)) errores.push(`El código ${codigo} está repetido (también en la fila ${codigosEnArchivo.get(n)}).`);
      else codigosEnArchivo.set(n, numero);
    }

    const area = texto(v("area"));
    const area_id = area ? cat.areas.get(normalizar(area)) ?? null : null;
    if (area && !area_id) errores.push(`El área "${area}" no existe en la app.`);

    const estadoTxt = texto(v("estado"));
    const estado = estadoTxt ? ESTADOS_EXCEL[normalizar(estadoTxt)] : "operativo";
    if (!estado) errores.push(`ESTADO "${estadoTxt}" no válido: use OPERATIVO, EN MANTENIMIENTO o FUERA DE SERVICIO.`);

    const origenTxt = texto(v("origen"));
    const origen = origenTxt ? ORIGENES_EXCEL[normalizar(origenTxt)] : "saldo_inicial";
    if (!origen) errores.push(`ORIGEN "${origenTxt}" no válido: use YA ESTABA, COMPRA o DONACIÓN.`);

    const proveedor = texto(v("proveedor"));
    const proveedor_id = proveedor ? cat.proveedores.get(normalizar(proveedor)) ?? null : null;
    const proveedor_nuevo = proveedor && !proveedor_id ? proveedor : null;

    const valor = entero(v("valor_compra"));
    if (valor === "error" || (typeof valor === "number" && valor < 0)) errores.push("El VALOR UNITARIO debe ser un número entero en pesos.");

    const fc = fecha(v("fecha_compra"));
    const fi = fecha(v("fecha_instalacion"));
    const fg = fecha(v("garantia_hasta"));
    if (fc === "error") errores.push("FECHA COMPRA no es una fecha válida.");
    if (fi === "error") errores.push("FECHA INSTALACIÓN no es una fecha válida.");
    if (fg === "error") errores.push("GARANTÍA HASTA no es una fecha válida.");

    const vida = entero(v("vida_util_meses"));
    if (vida === "error" || (typeof vida === "number" && vida <= 0)) errores.push("VIDA ÚTIL debe ser un número de meses mayor a 0.");

    const responsable = texto(v("responsable"));
    const responsable_id = responsable ? cat.empleados.get(normalizar(responsable)) ?? null : null;
    if (responsable && !responsable_id) errores.push(`El responsable "${responsable}" no es un empleado de la app.`);

    if (errores.length) {
      res.errores.push({ fila: numero, errores });
      return;
    }
    if (proveedor_nuevo) proveedoresNuevos.add(proveedor_nuevo.toUpperCase());
    if (!codigo && cat.existentes?.has(claveDuplicado(nombre!, categoria_id!, texto(v("ubicacion"))))) posiblesDuplicados.push(numero);

    res.validas.push({
      fila: numero,
      nombre: nombre!,
      categoria_id: categoria_id!,
      grupo: grupo!,
      cantidad: cantidad as number,
      codigo,
      marca: texto(v("marca")),
      referencia: texto(v("referencia")),
      modelo: texto(v("modelo")),
      serie: texto(v("serie")),
      area_id,
      ubicacion: texto(v("ubicacion")),
      estado: estado!,
      origen: origen!,
      proveedor_id,
      proveedor_nuevo,
      valor_compra: valor as number | null,
      fecha_compra: fc as string | null,
      fecha_instalacion: fi as string | null,
      garantia_hasta: fg as string | null,
      vida_util_meses: vida as number | null,
      responsable_id,
      observaciones: texto(v("observaciones")),
    });
  });

  if (proveedoresNuevos.size) {
    res.avisos.push(`Se crearán ${proveedoresNuevos.size} proveedor(es) nuevo(s): ${[...proveedoresNuevos].join(", ")}.`);
  }
  if (posiblesDuplicados.length) {
    res.avisos.push(
      `Posible duplicado: la(s) fila(s) ${posiblesDuplicados.join(", ")} tienen el mismo nombre, grupo y ubicación de un equipo ya cargado. ` +
      "Si es el mismo, quítela del archivo; si son unidades nuevas, regístrelas como Novedad → Compra.",
    );
  }
  return res;
}
