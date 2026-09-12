// Importa el LISTADO GENERAL DE ATRACCIONES del Parque Ranch Texas desde el Excel
// del responsable. Reemplaza las atracciones de prueba que quedaron del seed viejo.
//
// Fuente: "Atracciones Ranch.xlsx", hoja "Hoja2", con cuatro columnas:
//   ATRACCIONES | RESTRICCIONES (según reglamento) | CONSENTIMIENTO | TURNO
//
// - CONSENTIMIENTO = SI  → requiere_consentimiento
// - TURNO          = SI  → fila_activa (fila virtual)
// - RESTRICCIONES  = SI  → solo dice QUE hay restricción, no cuál. La hoja "Reglamentos"
//   del archivo viene vacía, así que edad_minima y estatura_minima quedan sin cargar y
//   se listan al final para que el responsable las complete.
//
// Idempotente: reejecutar no duplica (se empareja por nombre normalizado). Nunca borra:
// las atracciones que ya no están en el Excel se DESACTIVAN, junto a sus lectores.
//
//   npm run import:atracciones
//   npm run import:atracciones -- "D:\ruta\otro.xlsx"
import "dotenv/config";
import { prisma } from "../lib/db";
import * as XLSX from "xlsx";
import { leerRango } from "../lib/accesos/restricciones";

const POR = "import-atracciones";
const RUTA_POR_DEFECTO = "D:/Escritorio/Atracciones Ranch.xlsx";

/** Palabras que en español van en minúscula dentro de un nombre propio. */
const MINUSCULAS = new Set(["de", "del", "en", "y", "la", "el", "los", "las", "a"]);

/**
 * Tildes que el Excel perdió por estar TODO EN MAYÚSCULAS. Se corrigen aquí para que
 * el nombre se vea bien en el celular del visitante; el responsable puede renombrar
 * cualquiera desde /admin/accesos.
 */
const TILDES: Record<string, string> = {
  magico: "Mágico",
  maquinas: "Máquinas",
  tobogan: "Tobogán",
  salon: "Salón",
};

/**
 * Nombres que el reglamento escribe distinto del listado general. Sin esto el
 * importador los tomaría por atracciones nuevas: crearía duplicados y desactivaría
 * las originales.
 */
const NOMBRES: Record<string, string> = {
  mariokarts: "Mario Karts",
  playgroun: "Play Ground",
  motocroos: "Motocross", // errata en el reglamento
};

function titulo(nombre: string): string {
  const directo = NOMBRES[nombre.trim().toLowerCase()];
  if (directo) return directo;

  return nombre
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => {
      if (TILDES[p]) return TILDES[p];
      if (i > 0 && MINUSCULAS.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

/**
 * Clave para emparejar sin importar mayúsculas, tildes, espacios ni plural simple.
 * Los espacios se ignoran porque el mismo parque escribe "Mariokarts" y "Mario Karts".
 */
function clave(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/s$/, ""); // "areneros" ≡ "arenero"
}

const esSi = (v: unknown): boolean => String(v ?? "").trim().toUpperCase().startsWith("S");

interface FilaExcel {
  nombre: string;
  consentimiento: boolean;
  turno: boolean;
  estatura_minima: number | null;
  estatura_maxima: number | null;
  peso_minimo: number | null;
  peso_maximo: number | null;
  edad_minima: number | null;
  edad_maxima: number | null;
  /** Lo que el reglamento dice en palabras (acompañamiento de menores). */
  nota: string | null;
}

/** Busca una columna por su nombre en el encabezado. -1 si el Excel no la trae. */
function columna(encabezado: unknown[], ...alias: string[]): number {
  const norm = (s: unknown) =>
    String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return encabezado.findIndex((c) => alias.some((a) => norm(c).includes(norm(a))));
}

function leerExcel(ruta: string): { filas: FilaExcel[]; conRestricciones: boolean } {
  const wb = XLSX.readFile(ruta);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" }) as unknown[][];
  const enc = filas[0] ?? [];

  // Las columnas se ubican por NOMBRE, no por posición: el archivo creció de 4 a 8
  // columnas y puede volver a cambiar de orden.
  const cAtraccion = Math.max(0, columna(enc, "ATRACCION"));
  const cConsent = columna(enc, "CONSENTIMIENTO");
  const cTurno = columna(enc, "TURNO");
  const cEstatura = columna(enc, "ESTATURA");
  const cPeso = columna(enc, "PESO");
  const cEdad = columna(enc, "EDAD");

  const conRestricciones = cEstatura >= 0 || cPeso >= 0 || cEdad >= 0;

  const datos = filas
    .slice(1)
    .filter((f) => String(f[cAtraccion] ?? "").trim().length > 0)
    .map((f) => {
      const estatura = cEstatura >= 0 ? leerRango(f[cEstatura], "min") : { min: null, max: null, nota: null };
      // La columna se llama "Peso max kg": un número suelto es tope.
      const peso = cPeso >= 0 ? leerRango(f[cPeso], "max") : { min: null, max: null, nota: null };
      const edad = cEdad >= 0 ? leerRango(f[cEdad], "min") : { min: null, max: null, nota: null };

      // Lo que no es un número (el acompañamiento de menores) se conserva como texto
      // para que el visitante y el operario lo vean, aunque la app no lo verifique.
      const notas = [estatura.nota, peso.nota, edad.nota].filter(Boolean) as string[];

      return {
        nombre: titulo(String(f[cAtraccion])),
        consentimiento: cConsent >= 0 ? esSi(f[cConsent]) : false,
        turno: cTurno >= 0 ? esSi(f[cTurno]) : false,
        estatura_minima: estatura.min,
        estatura_maxima: estatura.max,
        peso_minimo: peso.min,
        peso_maximo: peso.max,
        edad_minima: edad.min,
        edad_maxima: edad.max,
        nota: notas.length ? notas.join(" · ") : null,
      };
    });

  return { filas: datos, conRestricciones };
}

async function main() {
  const ruta = process.argv[2] ?? RUTA_POR_DEFECTO;
  console.log(`\n🎡 Importando atracciones desde:\n   ${ruta}\n`);

  const { filas: delExcel, conRestricciones } = leerExcel(ruta);
  if (delExcel.length === 0) throw new Error("El Excel no tiene atracciones.");
  console.log(
    conRestricciones
      ? "  Formato con restricciones (estatura, peso, edad)\n"
      : "  Formato básico: sin columnas de estatura, peso ni edad\n",
  );

  const existentes = await prisma.atraccion.findMany();
  const porClave = new Map(existentes.map((a) => [clave(a.nombre), a]));

  let creadas = 0;
  let actualizadas = 0;
  const vistas = new Set<string>();

  for (const at of delExcel) {
    const k = clave(at.nombre);
    vistas.add(k);
    const previa = porClave.get(k);

    const datos = {
      nombre: at.nombre,
      requiere_consentimiento: at.consentimiento,
      fila_activa: at.turno,
      activa: true,
      // Solo se pisan las restricciones si el Excel trae esas columnas: con el
      // formato viejo se conserva lo que ya esté cargado en la app.
      ...(conRestricciones
        ? {
            estatura_minima: at.estatura_minima,
            estatura_maxima: at.estatura_maxima,
            peso_minimo: at.peso_minimo,
            peso_maximo: at.peso_maximo,
            edad_minima: at.edad_minima,
            edad_maxima: at.edad_maxima,
            descripcion: at.nota,
          }
        : {}),
    };

    if (previa) {
      await prisma.atraccion.update({
        where: { id: previa.id },
        data: { ...datos, actualizado_por: POR },
      });
      // El lector sigue la misma regla de consentimiento que su atracción.
      await prisma.puntoControl.updateMany({
        where: { atraccion_id: previa.id },
        data: { requiere_consentimiento: at.consentimiento, activo: true, actualizado_por: POR },
      });
      if (previa.nombre !== at.nombre) console.log(`  ↻ "${previa.nombre}" → "${at.nombre}"`);
      actualizadas++;
    } else {
      const nueva = await prisma.atraccion.create({ data: { ...datos, creado_por: POR } });
      // Sin lector no hay dónde escanear.
      await prisma.puntoControl.create({
        data: {
          nombre: `Control ${at.nombre}`,
          atraccion_id: nueva.id,
          tipo_regla: "reingreso",
          requiere_consentimiento: at.consentimiento,
          creado_por: POR,
        },
      });
      creadas++;
    }
  }

  // Lo que ya no está en el Excel se da de baja lógica, nunca se borra.
  const sobrantes = existentes.filter((a) => !vistas.has(clave(a.nombre)) && a.activa);
  for (const a of sobrantes) {
    await prisma.atraccion.update({ where: { id: a.id }, data: { activa: false, actualizado_por: POR } });
    await prisma.puntoControl.updateMany({ where: { atraccion_id: a.id }, data: { activo: false, actualizado_por: POR } });
    console.log(`  ✗ "${a.nombre}" ya no está en el listado → desactivada`);
  }

  const conConsentimiento = delExcel.filter((a) => a.consentimiento);
  const conTurno = delExcel.filter((a) => a.turno);
  const conRestriccion = delExcel.filter(
    (a) => a.estatura_minima || a.estatura_maxima || a.peso_minimo || a.peso_maximo || a.edad_minima || a.edad_maxima || a.nota,
  );

  console.log(`\n  ✓ ${delExcel.length} atracciones (${creadas} nuevas, ${actualizadas} actualizadas)`);
  console.log(`  ✓ ${conConsentimiento.length} exigen consentimiento`);
  console.log(`  ✓ ${conTurno.length} con fila virtual`);
  if (sobrantes.length) console.log(`  ✓ ${sobrantes.length} desactivadas por no estar en el listado`);

  if (conRestricciones) {
    console.log(`\n  ✓ ${conRestriccion.length} con restricciones cargadas:`);
    for (const a of conRestriccion) {
      const partes = [
        a.estatura_minima || a.estatura_maxima ? `${a.estatura_minima ?? "?"}–${a.estatura_maxima ?? "?"} cm` : null,
        a.peso_minimo || a.peso_maximo ? `${a.peso_minimo ?? "?"}–${a.peso_maximo ?? "?"} kg` : null,
        a.edad_minima || a.edad_maxima ? `${a.edad_minima ?? "?"}–${a.edad_maxima ?? "?"} años` : null,
        a.nota,
      ].filter(Boolean);
      console.log(`      ${a.nombre}: ${partes.join(" · ")}`);
    }
  } else {
    console.log(`\n  ⚠ El Excel no trae columnas de estatura, peso ni edad, así que esas`);
    console.log(`    restricciones no se cargaron. Se conservan las que ya estén en la app.`);
  }

  console.log(`\n  ⚠ PENDIENTE: las ${conTurno.length} con fila necesitan cuántas personas entran por`);
  console.log(`    tanda y cuántos minutos dura, o el visitante no verá cuánto falta.`);
  console.log(`    Se configura en /admin/accesos → pestaña "Fila virtual".\n`);

  console.log("✅ Atracciones cargadas.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
