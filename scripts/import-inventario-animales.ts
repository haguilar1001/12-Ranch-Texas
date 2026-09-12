// Importa el INVENTARIO REAL de animales del Parque Ranch Texas y el consumo
// mensual de alimento. Reemplaza los datos inventados de `seed-boceto` para el
// módulo de Animales.
//
// Fuentes:
//   - "INVENTARIO ANIMALES RANCH.xlsx" (hoja LISTADO CABALLOS): censo por grupo,
//     cantidad y observación.
//   - Infografía "ALIMENTO ANIMALES DE GRANJA — CONSUMO MENSUAL": alimentos,
//     costos por bulto/kg y consumo mensual por grupo.
//
// Idempotente: reejecutar no duplica (upsert por nombre). Baja lógica, nunca borra.
//
//   npx tsx scripts/import-inventario-animales.ts
import "dotenv/config";
import { prisma } from "../lib/db";

const POR = "import-inventario";

// ---------------------------------------------------------------- CENSO (Excel)
// [nombre, cantidad, categoria, especie, observacion]
const CENSO: Array<[string, number, string, string, string]> = [
  ["Perros", 10, "Caninos", "Perro", ""],
  ["Cabras", 12, "Caprinos", "Cabra", ""],
  ["Crías hembras cabras", 7, "Caprinos", "Cabra", "Nacimientos"],
  ["Cabros", 5, "Caprinos", "Cabra", "3 crías"],
  ["Ovejos", 1, "Ovinos", "Oveja", "Exhibición granja"],
  ["Vacas", 9, "Bovinos", "Vaca", ""],
  ["Toros", 3, "Bovinos", "Toro", "1 reproductor (Texano, Paturro)"],
  ["Terneras", 7, "Bovinos", "Ternera", "2 mayores de un año, 4 en lactancia"],
  ["Terneros", 3, "Bovinos", "Ternero", "Crías nuevas 2026"],
  ["Toretes", 5, "Bovinos", "Torete", "1 Paturro, 4 para team penning"],
  ["Pavo real", 5, "Aves ornamentales", "Pavo real", "3 hembras, 2 machos"],
  ["Gansos", 30, "Aves de corral", "Ganso", ""],
  ["Patos de moño", 24, "Aves de corral", "Pato de moño", "Comprados enero 2026"],
  ["Gallinas Brahaman", 3, "Aves de corral", "Gallina Brahaman", "1 macho, 2 hembras"],
  ["Pato Pekín", 12, "Aves de corral", "Pato Pekín", ""],
  ["Pato corredor", 8, "Aves de corral", "Pato corredor", ""],
  ["Gallo fino", 1, "Aves de corral", "Gallo fino", "Chano"],
  ["Gallo Brahaman", 1, "Aves de corral", "Gallo Brahaman", ""],
  ["Patos", 47, "Aves de corral", "Pato", "2 chilenos, 11 machos, 34 hembras"],
  ["Gallinetas", 15, "Aves de corral", "Gallineta", ""],
  ["Gallinas", 36, "Aves de corral", "Gallina", "4 finas, 17 hembras, 15 gallos kikis"],
  ["Conejos", 7, "Lagomorfos", "Conejo", ""],
  ["Faisanes", 6, "Aves ornamentales", "Faisán", "3 machos, hembras"],
  ["Tigrilla", 1, "Fauna silvestre", "Tigrilla", "Pendiente entregar a Amigos de la Fauna"],
  ["Ocelote", 1, "Fauna silvestre", "Ocelote", "Pendiente entregar a Amigos de la Fauna"],
  ["Tortugas", 28, "Reptiles", "Tortuga", ""],
  ["Peces koi", 300, "Peces", "Pez koi", "Aproximado"],
  ["Mojarras", 0, "Peces", "Mojarra", "Aproximado, cantidad por confirmar"],
  ["Gallinas ponedoras", 96, "Aves de corral", "Gallina ponedora", ""],
];

// ---------------------------------------------------------------- ALIMENTOS (imagen)
// [nombre, tipo, unidad, costo_unitario COP por unidad, equivalencia en gramos por unidad]
// La equivalencia permite convertir "800 g por perro" a bultos y calcular consumo y costo.
// SUPUESTO a confirmar: el bulto es de 40 kg (estándar de concentrado en Colombia).
const BULTO_G = 40_000;
const ALIMENTOS: Array<[string, string, string, number | null, number | null]> = [
  ["Prepico Dorado", "concentrado", "bulto", 80_000, BULTO_G],
  ["Leche 16", "concentrado", "bulto", 85_000, BULTO_G],
  ["Maíz Molido", "concentrado", "bulto", 70_000, BULTO_G],
  ["Italcán", "concentrado", "bulto", 110_000, BULTO_G],
  ["Súper Ternera", "concentrado", "bulto", 85_000, BULTO_G],
  ["Conejina", "concentrado", "kg", 5_000, 1_000],
  ["Acuatilapia", "concentrado", "bulto", 152_500, BULTO_G], // ESTIMADO: 2 bultos = $305.000/mes (ajustar)
  ["Sal mineralizada", "suplemento", "bulto", 95_000, BULTO_G],
  ["Melaza", "suplemento", "bulto", 52_000, 20_000], // CONFIRMADO: viene por 20 kg, no 40
];

// Consumo mensual documentado. Se ata al GRUPO (animal) cuando existe, o a la
// CATEGORÍA cuando el consumo es "en general".
//
// `modo` = grupal: la cantidad es el TOTAL del lote; individual: es POR CABEZA y se
// multiplica por el censo del grupo.
// La mayoría queda grupal porque la infografía documenta el consumo mensual agregado.
// Confirmadas por el responsable (2026-08-24) como reglas POR CABEZA:
//   - Perros: 800 g por animal al día.
//   - Súper Ternera: 1 kg por animal al día, y se lo comen Terneros (3) Y Terneras (7),
//     por eso son DOS raciones. Los 8 bultos/mes de la infografía eran el agregado.
// [alimento, cantidad, unidad, destino_animal | null, destino_categoria | null, modo, frecuencia, horario, obs]
type ModoRacionImport = "individual" | "grupal";
type FrecRacionImport = "diaria" | "semanal" | "quincenal" | "mensual";
const RACIONES: Array<[string, number, string, string | null, string | null, ModoRacionImport, FrecRacionImport, string | null, string]> = [
  ["Prepico Dorado", 9, "bulto", "Gallinas ponedoras", null, "grupal", "mensual", null, "$720.000/mes"],
  ["Leche 16", 15, "bulto", "Vacas", null, "grupal", "mensual", null, "$1.275.000/mes"],
  ["Sal mineralizada", 2, "bulto", "Vacas", null, "grupal", "mensual", "consumo libre", "Consumo libre - $190.000/mes"],
  ["Melaza", 6, "bulto", "Vacas", null, "grupal", "mensual", "consumo libre", "Consumo libre - $312.000/mes"],
  ["Italcán", 800, "g", "Perros", null, "individual", "diaria", null, "CONFIRMADO 2026-08-24: 800 g por animal al día"],
  ["Súper Ternera", 1, "kg", "Terneros", null, "individual", "diaria", null, "CONFIRMADO 2026-08-24: 1 kg por animal al día"],
  ["Súper Ternera", 1, "kg", "Terneras", null, "individual", "diaria", null, "CONFIRMADO 2026-08-24: 1 kg por animal al día"],
  ["Conejina", 15, "kg", "Conejos", null, "grupal", "mensual", null, "500 g entre todos - $75.000/mes"],
  ["Leche 16", 4, "bulto", "Cabras", null, "grupal", "mensual", null, "5 kg diarios entre el lote - $340.000/mes"],
  ["Acuatilapia", 2, "bulto", "Peces koi", null, "grupal", "mensual", null, "ESTIMADO 2 bultos x $152.500 = $305.000/mes (ajustar)"],
  ["Maíz Molido", 6, "bulto", null, "Aves de corral", "grupal", "mensual", null, "Aves en general - parte de $580.000/mes"],
  ["Prepico Dorado", 2, "bulto", null, "Aves de corral", "grupal", "mensual", null, "Aves en general - parte de $580.000/mes"],
];

async function upsertCategoria(nombre: string): Promise<string> {
  const found = await prisma.categoriaAnimal.findFirst({ where: { nombre } });
  if (found) return found.id;
  return (await prisma.categoriaAnimal.create({ data: { nombre, creado_por: POR } })).id;
}

async function upsertAlimento(
  nombre: string,
  tipo: string,
  unidad: string,
  costo: number | null,
  equivalencia: number | null,
): Promise<string> {
  const found = await prisma.alimento.findFirst({ where: { nombre } });
  const data = { tipo, unidad_medida: unidad, costo_unitario: costo, equivalencia_g: equivalencia };
  if (found) {
    await prisma.alimento.update({ where: { id: found.id }, data: { ...data, actualizado_por: POR } });
    return found.id;
  }
  return (await prisma.alimento.create({ data: { ...data, nombre, creado_por: POR } })).id;
}

async function upsertAnimal(nombre: string, cantidad: number, categoria_id: string, especie: string, obs: string): Promise<string> {
  const found = await prisma.animal.findFirst({ where: { nombre } });
  const data = { cantidad, categoria_id, especie, observaciones: obs || null, estado: "activo" as const };
  if (found) {
    await prisma.animal.update({ where: { id: found.id }, data: { ...data, actualizado_por: POR } });
    return found.id;
  }
  return (await prisma.animal.create({ data: { ...data, nombre, creado_por: POR } })).id;
}

async function main() {
  console.log("\n🐄 Importando inventario REAL de animales · Ranch Texas\n");

  // Categorías
  const catNombres = Array.from(new Set(CENSO.map((c) => c[2])));
  const cats: Record<string, string> = {};
  for (const n of catNombres) cats[n] = await upsertCategoria(n);

  // Animales (grupos)
  const animalIds: Record<string, string> = {};
  let totalCabezas = 0;
  for (const [nombre, cantidad, cat, especie, obs] of CENSO) {
    animalIds[nombre] = await upsertAnimal(nombre, cantidad, cats[cat], especie, obs);
    totalCabezas += cantidad;
  }

  // Alimentos
  const alim: Record<string, string> = {};
  for (const [nombre, tipo, unidad, costo, equiv] of ALIMENTOS) {
    alim[nombre] = await upsertAlimento(nombre, tipo, unidad, costo, equiv);
  }

  // Raciones (idempotente por alimento + destino)
  let racCreadas = 0;
  for (const [alimento, cantidad, unidad, destAnimal, destCat, modo, frecuencia, horario, obs] of RACIONES) {
    const animal_id = destAnimal ? animalIds[destAnimal] ?? null : null;
    const categoria_animal_id = destCat ? cats[destCat] ?? null : null;
    const datos = { cantidad, unidad, modo, frecuencia, horario, observaciones: obs };
    const existente = await prisma.racion.findFirst({
      where: { alimento_id: alim[alimento], animal_id, categoria_animal_id },
    });
    if (existente) {
      await prisma.racion.update({ where: { id: existente.id }, data: { ...datos, actualizado_por: POR } });
    } else {
      await prisma.racion.create({
        data: { ...datos, alimento_id: alim[alimento], animal_id, categoria_animal_id, creado_por: POR },
      });
      racCreadas++;
    }
  }

  console.log(`  ✓ ${catNombres.length} categorías`);
  console.log(`  ✓ ${CENSO.length} grupos de animales · ${totalCabezas.toLocaleString("es-CO")} cabezas`);
  console.log(`  ✓ ${ALIMENTOS.length} alimentos`);
  console.log(`  ✓ ${RACIONES.length} raciones (${racCreadas} nuevas)`);
  console.log("\n✅ Inventario cargado.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
