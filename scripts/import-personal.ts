// Importa el MAESTRO DE PERSONAL del Parque Ranch Texas desde el Excel de nómina.
//
// Fuente: "8 NOMINA DIVERSIONES AGOSTO 2026.xlsx"
//   · Hoja NOMINA         → NOMBRE | CENTRO DE COSTO | SALARIO | (vacía) | AREA
//   · Hoja BASE DE DATOS  → apellido1 | apellido2 | nombre1 | nombre2 | cédula | email |
//                            EPS | (vacía) | banco | cuenta | dirección
//
// Qué se carga y qué NO:
//   Se cargan nombre, área (centro de costo), unidad de negocio, salario base y —cuando
//   la persona cruza con el maestro— su cédula y su correo.
//   NO se cargan banco, número de cuenta, dirección ni EPS: son datos sensibles que la
//   app no necesita para operar y que viven en el software de nómina, que es donde se usan.
//
// Idempotente: se empareja por cédula cuando existe, si no por nombre normalizado.
// Nunca borra: quien deja de aparecer en la nómina se marca `retirado`, no se elimina.
//
//   npm run import:personal
//   npm run import:personal -- "D:\ruta\otra-nomina.xlsx"
import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { consolidarNomina, FACTOR_PRESTACIONAL } from "../lib/personal/costo";

const prisma = new PrismaClient();
const POR = "import-personal";
const RUTA_POR_DEFECTO = "D:/Escritorio/8 NOMINA DIVERSIONES AGOSTO 2026.xlsx";

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "e"]);

/** Erratas y tildes que el Excel perdió por venir en mayúsculas. */
const CORRECCIONES: Record<string, string> = {
  mantenimineto: "Mantenimiento", // errata en el archivo
  administracion: "Administración",
};

function titulo(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => {
      if (CORRECCIONES[p]) return CORRECCIONES[p];
      if (i > 0 && MINUSCULAS.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

/** Nombre comparable: sin tildes, sin puntuación y con las palabras ordenadas. */
function claveNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\(.*?\)/g, "") // "(hijo)"
    .replace(/[^A-Z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

const limpio = (v: unknown): string => String(v ?? "").trim();

/** Clave para emparejar áreas sin importar tildes ni mayúsculas. */
const claveArea = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

interface Persona {
  nombre: string;
  area: string;
  unidad: string;
  salario: number | null;
  documento: string | null;
  email: string | null;
  cargo: string | null;
  estado: "activo" | "inactivo" | "retirado";
}

const ESTADOS = ["activo", "inactivo", "retirado"] as const;
type Estado = (typeof ESTADOS)[number];

/**
 * Formato de VUELTA: la hoja PERSONAL que exporta /admin/personal/xlsx, ya completada
 * por el responsable. Columnas: NOMBRE | DOCUMENTO | CARGO | AREA | UNIDAD | SALARIO |
 * COSTO REAL (calculado, se ignora) | ESTADO.
 */
function leerHojaPersonal(wb: XLSX.WorkBook): Persona[] {
  const filas = XLSX.utils.sheet_to_json(wb.Sheets["PERSONAL"], { header: 1, defval: "" }) as unknown[][];
  const personas: Persona[] = [];

  for (const r of filas.slice(1)) {
    const nombre = limpio(r[0]);
    if (!nombre) continue;
    const salario = Math.round(Number(r[5]) || 0);
    const estado = limpio(r[7]).toLowerCase() as Estado;
    personas.push({
      nombre: titulo(nombre),
      documento: limpio(r[1]).replace(/\D/g, "") || null,
      cargo: limpio(r[2]) ? titulo(limpio(r[2])) : null,
      area: titulo(limpio(r[3]) || "Sin área"),
      unidad: titulo(limpio(r[4]) || "Sin unidad"),
      salario: salario > 0 ? salario : null,
      email: null, // esta hoja no lo trae; no se pisa el correo ya guardado
      estado: ESTADOS.includes(estado) ? estado : "activo",
    });
  }
  return personas;
}

function leer(ruta: string): { personas: Persona[]; sinDatos: string[]; formato: string } {
  const wb = XLSX.readFile(ruta);

  // Si trae la hoja PERSONAL es el archivo que exportó la app, ya completado.
  if (wb.SheetNames.includes("PERSONAL")) {
    const personas = leerHojaPersonal(wb);
    return {
      personas,
      sinDatos: personas.filter((p) => !p.documento).map((p) => p.nombre),
      formato: "hoja PERSONAL (archivo devuelto completo)",
    };
  }

  const filas = (h: string) => XLSX.utils.sheet_to_json(wb.Sheets[h], { header: 1, defval: "" }) as unknown[][];

  // Maestro con cédula y correo, indexado por nombre comparable.
  const maestro = new Map<string, { documento: string; email: string }>();
  for (const r of filas("BASE DE DATOS")) {
    const completo = [r[0], r[1], r[2], r[3]].map(limpio).filter(Boolean).join(" ");
    if (!completo) continue;
    maestro.set(claveNombre(completo), { documento: limpio(r[4]), email: limpio(r[5]) });
  }

  const personas: Persona[] = [];
  const sinDatos: string[] = [];

  for (const r of filas("NOMINA").slice(1)) {
    const nombre = limpio(r[0]);
    if (!nombre) continue;

    const extra = maestro.get(claveNombre(nombre));
    if (!extra?.documento) sinDatos.push(titulo(nombre));

    const salario = Math.round(Number(r[2]) || 0);
    personas.push({
      nombre: titulo(nombre),
      area: titulo(limpio(r[1]) || "Sin área"),
      unidad: titulo(limpio(r[4]) || "Sin unidad"),
      salario: salario > 0 ? salario : null,
      documento: extra?.documento || null,
      email: extra?.email || null,
      cargo: null, // el Excel de nómina no trae la columna de cargo
      estado: "activo",
    });
  }

  return { personas, sinDatos, formato: "hojas NOMINA + BASE DE DATOS" };
}

async function main() {
  const ruta = process.argv[2] ?? RUTA_POR_DEFECTO;
  console.log(`\n👷 Importando personal desde:\n   ${ruta}\n`);

  const { personas, sinDatos, formato } = leer(ruta);
  if (personas.length === 0) throw new Error("El archivo no tiene personas.");
  console.log("  Formato detectado: " + formato + "\n");

  // Áreas de trabajo (centro de costo). Se emparejan ignorando tildes para no
  // terminar con "Administracion" y "Administración" como áreas distintas.
  const todasLasAreas = await prisma.areaTrabajo.findMany();
  const areaPorClave = new Map(todasLasAreas.map((a) => [claveArea(a.nombre), a]));
  const areas = new Map<string, string>();

  for (const nombre of new Set(personas.map((p) => p.area))) {
    const previa = areaPorClave.get(claveArea(nombre));
    if (previa) {
      if (previa.nombre !== nombre) console.log(`  ↻ área "${previa.nombre}" → "${nombre}"`);
      await prisma.areaTrabajo.update({ where: { id: previa.id }, data: { nombre, activo: true, actualizado_por: POR } });
      areas.set(nombre, previa.id);
    } else {
      areas.set(nombre, (await prisma.areaTrabajo.create({ data: { nombre, creado_por: POR } })).id);
    }
  }

  // Cargos, colgados de su área. Solo llegan cuando el archivo es el devuelto.
  const cargos = new Map<string, string>();
  for (const p of personas) {
    if (!p.cargo) continue;
    const clave = `${claveArea(p.cargo)}|${p.area}`;
    if (cargos.has(clave)) continue;
    const areaId = areas.get(p.area)!;
    const previo = await prisma.cargo.findFirst({
      where: { nombre: { equals: p.cargo, mode: "insensitive" }, area_id: areaId },
    });
    cargos.set(
      clave,
      previo
        ? (await prisma.cargo.update({ where: { id: previo.id }, data: { activo: true, actualizado_por: POR } })).id
        : (await prisma.cargo.create({ data: { nombre: p.cargo, area_id: areaId, creado_por: POR } })).id,
    );
  }

  const existentes = await prisma.empleado.findMany();
  const porDocumento = new Map(existentes.filter((e) => e.documento).map((e) => [e.documento as string, e]));
  const porNombre = new Map(existentes.map((e) => [claveNombre(e.nombre), e]));

  let creados = 0;
  let actualizados = 0;
  const vistos = new Set<string>();

  for (const p of personas) {
    const previo = (p.documento && porDocumento.get(p.documento)) || porNombre.get(claveNombre(p.nombre));

    const datos = {
      nombre: p.nombre,
      documento: p.documento,
      tipo_documento: p.documento ? "CC" : null,
      // El archivo devuelto no trae correo: se conserva el que ya estaba.
      ...(p.email ? { email: p.email } : {}),
      area_id: areas.get(p.area)!,
      cargo_id: p.cargo ? cargos.get(`${claveArea(p.cargo)}|${p.area}`) ?? null : null,
      unidad_negocio: p.unidad,
      salario_base: p.salario,
      estado: p.estado,
      activo: p.estado === "activo",
    };

    if (previo) {
      await prisma.empleado.update({ where: { id: previo.id }, data: { ...datos, actualizado_por: POR } });
      vistos.add(previo.id);
      actualizados++;
    } else {
      const nuevo = await prisma.empleado.create({ data: { ...datos, creado_por: POR } });
      vistos.add(nuevo.id);
      creados++;
    }
  }

  // Quien ya no aparece en la nómina se marca retirado, nunca se borra.
  const fuera = existentes.filter((e) => !vistos.has(e.id) && e.estado === "activo");
  for (const e of fuera) {
    await prisma.empleado.update({
      where: { id: e.id },
      data: { estado: "retirado", activo: false, actualizado_por: POR },
    });
    console.log(`  ✗ "${e.nombre}" ya no está en la nómina → retirado`);
  }

  const costo = consolidarNomina(personas.map((p) => p.salario));
  const porUnidad = new Map<string, number>();
  for (const p of personas) porUnidad.set(p.unidad, (porUnidad.get(p.unidad) ?? 0) + 1);
  const cop = (n: number) => "$" + n.toLocaleString("es-CO");

  console.log(`\n  ✓ ${personas.length} personas (${creados} nuevas, ${actualizados} actualizadas)`);
  console.log(`  ✓ ${areas.size} áreas de trabajo`);
  [...porUnidad.entries()].forEach(([u, n]) => console.log(`  ✓ ${u}: ${n}`));
  console.log(`  ✓ Salarios base:       ${cop(costo.salarios)}/mes`);
  console.log(`  ✓ Carga prestacional:  ${cop(costo.carga)}/mes  (+${FACTOR_PRESTACIONAL * 100}%)`);
  console.log(`  ✓ COSTO REAL EMPRESA:  ${cop(costo.total)}/mes`);
  if (fuera.length) console.log(`  ✓ ${fuera.length} retirado(s)`);

  if (sinDatos.length) {
    console.log(`\n  ⚠ ${sinDatos.length} de ${personas.length} personas NO están en la hoja "BASE DE DATOS",`);
    console.log(`    así que quedaron sin cédula ni correo. Ese maestro está desfasado:`);
    sinDatos.forEach((n) => console.log(`    · ${n}`));
  }

  console.log(`\n  · No se cargaron banco, cuenta, dirección ni EPS: son datos sensibles que la app`);
  console.log(`    no necesita para operar y que ya viven en el software de nómina.`);
  console.log(`  · Los CARGOS quedan sin asignar: el Excel no trae esa columna.\n`);

  console.log("✅ Personal cargado.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
