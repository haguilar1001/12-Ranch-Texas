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
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
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

function titulo(nombre: string): string {
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

/** Clave para emparejar sin importar mayúsculas, tildes ni plural simple. */
function clave(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/s\b/g, ""); // "areneros" ≡ "arenero"
}

const esSi = (v: unknown): boolean => String(v ?? "").trim().toUpperCase().startsWith("S");

interface FilaExcel {
  nombre: string;
  restricciones: boolean;
  consentimiento: boolean;
  turno: boolean;
}

function leerExcel(ruta: string): FilaExcel[] {
  const wb = XLSX.readFile(ruta);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" }) as unknown[][];

  return filas
    .slice(1) // encabezado
    .filter((f) => String(f[0] ?? "").trim().length > 0)
    .map((f) => ({
      nombre: titulo(String(f[0])),
      restricciones: esSi(f[1]),
      consentimiento: esSi(f[2]),
      turno: esSi(f[3]),
    }));
}

async function main() {
  const ruta = process.argv[2] ?? RUTA_POR_DEFECTO;
  console.log(`\n🎡 Importando atracciones desde:\n   ${ruta}\n`);

  const delExcel = leerExcel(ruta);
  if (delExcel.length === 0) throw new Error("El Excel no tiene atracciones.");

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
  const conRestriccion = delExcel.filter((a) => a.restricciones);

  console.log(`\n  ✓ ${delExcel.length} atracciones (${creadas} nuevas, ${actualizadas} actualizadas)`);
  console.log(`  ✓ ${conConsentimiento.length} exigen consentimiento`);
  console.log(`  ✓ ${conTurno.length} con fila virtual`);
  if (sobrantes.length) console.log(`  ✓ ${sobrantes.length} desactivadas por no estar en el listado`);

  console.log(`\n  ⚠ PENDIENTE: ${conRestriccion.length} tienen restricción según reglamento, pero el`);
  console.log(`    Excel no dice cuál (la hoja "Reglamentos" viene vacía). Falta cargar edad y`);
  console.log(`    estatura mínimas en /admin/accesos:`);
  console.log(`    ${conRestriccion.map((a) => a.nombre).join(", ")}`);

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
