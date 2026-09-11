// Le pone cara a cada tipo de visitante en taquilla y saca el "(Presentar Carnet)"
// del nombre: eso ahora es una marca (*) con su aviso al pie de la rejilla.
//
// Empareja por el nombre normalizado (sin tildes, sin el paréntesis), no por código,
// porque los códigos se generaron con slugify y en producción incluyen el paréntesis.
//
//   npm run iconos:tipos            → muestra qué cambiaría
//   npm run iconos:tipos -- --confirmar
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONFIRMAR = process.argv.includes("--confirmar");

/** minúsculas, sin tildes, sin paréntesis y sin espacios de más. */
function clave(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface Plan {
  clave: string;
  /** Nombre definitivo (ya sin el "(Presentar Carnet)"). */
  nombre: string;
  icono: string;
  carnet: boolean;
}

const PLAN: Plan[] = [
  { clave: "adulto", nombre: "Adulto", icono: "🤠", carnet: false },
  { clave: "nino", nombre: "Niño", icono: "🧒", carnet: false },
  { clave: "adulto mayor", nombre: "Adulto Mayor", icono: "🧓", carnet: false },
  { clave: "bebe", nombre: "Bebé", icono: "👶", carnet: false },
  { clave: "policia nacional", nombre: "Policía Nacional", icono: "👮", carnet: true },
  { clave: "cajas de compensacion", nombre: "Cajas de Compensación", icono: "🏢", carnet: true },
  { clave: "redencion bono", nombre: "Redención Bono", icono: "🎟️", carnet: false },
  { clave: "pagina web", nombre: "Página Web", icono: "🌐", carnet: false },
  // Fundación Campbell (salud): el funcionario se identifica solo, no pide carnet.
  { clave: "funcionario campbell", nombre: "Funcionario Campbell", icono: "🏥", carnet: false },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const destino = url.includes("localhost") || url.includes("127.0.0.1") ? "LOCAL" : "PRODUCCIÓN";
  console.log(`\n🎨 Iconos de tipos de visitante · base ${destino}\n`);

  const tipos = await prisma.tipoVisitante.findMany({ orderBy: { orden: "asc" } });
  const porClave = new Map(tipos.map((t) => [clave(t.nombre), t]));

  let cambios = 0;
  const sinPlan = new Set(tipos.map((t) => clave(t.nombre)));

  for (const p of PLAN) {
    const t = porClave.get(p.clave);
    if (!t) {
      console.log(`  · ${p.nombre.padEnd(26)} no existe en esta base (se omite)`);
      continue;
    }
    sinPlan.delete(p.clave);

    const data: Record<string, unknown> = {};
    if (t.nombre !== p.nombre) data.nombre = p.nombre;
    if (t.icono !== p.icono) data.icono = p.icono;
    if (t.requiere_carnet !== p.carnet) data.requiere_carnet = p.carnet;

    if (Object.keys(data).length === 0) {
      console.log(`  ✓ ${p.nombre.padEnd(26)} ya estaba`);
      continue;
    }

    const detalle = [
      data.nombre ? `nombre "${t.nombre}" → "${p.nombre}"` : null,
      data.icono ? `icono ${t.icono ?? "—"} → ${p.icono}` : null,
      data.requiere_carnet !== undefined ? `carnet ${t.requiere_carnet} → ${p.carnet}` : null,
    ].filter(Boolean).join(" · ");
    console.log(`  ${CONFIRMAR ? "→" : "?"} ${p.nombre.padEnd(26)} ${detalle}`);

    if (CONFIRMAR) await prisma.tipoVisitante.update({ where: { id: t.id }, data });
    cambios++;
  }

  for (const k of sinPlan) {
    const t = porClave.get(k)!;
    console.log(`  ! ${t.nombre.padEnd(26)} sin icono en el plan — ponle uno desde /admin/tarifas`);
  }

  console.log(
    CONFIRMAR
      ? `\n✅ ${cambios} tipo(s) actualizados.\n`
      : `\n⚠ Simulación: ${cambios} tipo(s) cambiarían. Corre con -- --confirmar para aplicarlo.\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
