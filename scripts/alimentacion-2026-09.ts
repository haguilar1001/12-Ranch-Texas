// Actualiza TODA la alimentación del parque con los datos de septiembre de 2026:
// precios nuevos (ya con el 5% de IVA), presentaciones corregidas y, por primera vez,
// los 60 EQUINOS — que no estaban en la base aunque son el mayor gasto de alimento.
//
// Fuentes (cuadros entregados por el responsable, 2026-09-13):
//   · ALIMENTOS — presentación y valor (granja y equinos)
//   · GASTO MENSUAL — ALIMENTACIÓN ANIMAL  ($4.973.029/mes)
//   · ALIMENTO MENSUAL EQUINOS + CONSUMO MENSUAL — CABALLOS ($15.893.451/mes)
//
// Qué cambia frente a lo cargado en agosto:
//   · Los precios: ahora se guardan CON IVA, porque es lo que el parque paga.
//   · Las presentaciones: el maíz viene por 50 kg (no 40), la melaza por 30 (no 20),
//     la sal por 20 (no 40) y el Italcán por 30 (no 40). Eso movía el costo por kilo.
//   · Las raciones pasan a decir lo que de verdad se entrega al día, no el agregado
//     mensual de la infografía vieja.
//
// Idempotente: correrlo dos veces no duplica nada. Nada se borra: las raciones que
// ya no aplican quedan inactivas, no eliminadas.
//
//   npm run alimentacion:2026                → muestra qué cambiaría (no toca la base)
//   npm run alimentacion:2026 -- --confirmar → aplica
import "dotenv/config";
import { prisma } from "../lib/db";
import { costoMensual, consumoBaseMensual, type FrecuenciaRacion, type ModoRacion } from "../lib/animales/racion";
import type { AlimentoUnidad } from "../lib/animales/unidades";

const CONFIRMAR = process.argv.includes("--confirmar");
const POR = "alimentacion-2026-09";
const cop = (n: number | null) => (n === null ? "—" : "$" + n.toLocaleString("es-CO"));
const num = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });

type Bloque = "granja" | "equinos";

interface PlanAlimento {
  nombre: string;
  tipo: string;
  unidad: string;
  /** COP por unidad de compra, IVA del 5% incluido. */
  costo: number;
  /** Gramos que rinde una unidad de compra. */
  equivalencia: number;
  nota?: string;
}

// ------------------------------------------------------------------ ALIMENTOS
const ALIMENTOS: PlanAlimento[] = [
  // --- granja -------------------------------------------------------------
  { nombre: "Prepico Dorado", tipo: "concentrado", unidad: "bulto", costo: 78_750, equivalencia: 40_000 },
  { nombre: "Leche 16", tipo: "concentrado", unidad: "bulto", costo: 76_650, equivalencia: 40_000 },
  { nombre: "Maíz Molido", tipo: "concentrado", unidad: "bulto", costo: 80_850, equivalencia: 50_000, nota: "el bulto pasó de 40 a 50 kg" },
  { nombre: "Súper Ternera", tipo: "concentrado", unidad: "bulto", costo: 80_955, equivalencia: 40_000 },
  // El cuadro escribió la libra en 0,4536 kg (la libra imperial). CONFIRMADO 2026-09-13
  // por el responsable: es la libra colombiana de 500 g. Por eso la conejina cuesta
  // $53.550/mes y no los $59.029 que dice el cuadro.
  { nombre: "Conejina", tipo: "concentrado", unidad: "libra", costo: 1_785, equivalencia: 500, nota: "libra colombiana de 500 g (el cuadro decía 0,4536 kg)" },
  { nombre: "Acuatilapia", tipo: "concentrado", unidad: "bulto", costo: 320_250, equivalencia: 40_000, nota: "ya no es estimado: 1 bulto/mes" },
  { nombre: "Sal Mineralizada", tipo: "suplemento", unidad: "bulto", costo: 105_000, equivalencia: 20_000, nota: "el bulto pasó de 40 a 20 kg" },
  { nombre: "Melaza", tipo: "suplemento", unidad: "bulto", costo: 63_000, equivalencia: 30_000, nota: "el bulto pasó de 20 a 30 kg" },
  { nombre: "Italcán", tipo: "concentrado", unidad: "bulto", costo: 105_000, equivalencia: 30_000, nota: "el bulto pasó de 40 a 30 kg" },
  // --- equinos ------------------------------------------------------------
  // El bulto trae 25 kg en seco pero se entrega HUMEDECIDO y rinde ~50 kg. Las dietas
  // están escritas en alfalfa húmeda, así que la equivalencia es la del rendimiento.
  { nombre: "Alfalfa en Cubos", tipo: "forraje", unidad: "bulto", costo: 101_010, equivalencia: 50_000, nota: "25 kg en seco → 50 kg humedecida" },
  { nombre: "Brío Potros", tipo: "concentrado", unidad: "bulto", costo: 89_985, equivalencia: 40_000 },
  { nombre: "Podium", tipo: "concentrado", unidad: "bulto", costo: 87_360, equivalencia: 40_000 },
  { nombre: "Briosal", tipo: "suplemento", unidad: "bulto", costo: 63_000, equivalencia: 20_000 },
  // El peso de la paca no está en los cuadros. Da igual para el costo (la dieta se
  // mide en pacas), pero sí para leer "cuántos kilos de heno se entregaron".
  { nombre: "Heno", tipo: "forraje", unidad: "paca", costo: 14_500, equivalencia: 20_000, nota: "SUPUESTO: paca de 20 kg, por confirmar" },
  // "Talcán" aparece en la lista de precios con los mismos datos del Italcán (bulto de
  // 30 kg, $105.000) y sin consumo en ningún cuadro. CONFIRMADO 2026-09-13: es el mismo
  // Italcán escrito distinto, así que no se crea como alimento aparte.
];

// -------------------------------------------------------------------- EQUINOS
// 60 cabezas que hoy NO existen en la base: el censo de agosto no traía caballos.
const EQUINOS: Array<[string, number, string, string]> = [
  ["Caballos", 36, "Caballo", "Caballos generales"],
  ["Potros", 10, "Caballo", "En crecimiento: llevan Brío Potros"],
  ["Caballos Mini", 14, "Caballo mini", "Media ración de alfalfa y Podium"],
];

// --------------------------------------------------------------- CENSO GRANJA
// Grupos donde el cuadro de alimentación contradice el censo del Excel de agosto.
// CONFIRMADO 2026-09-13: mandan los cuadros. No cambia ningún costo (esas raciones
// son grupales), pero sí deja el censo del parque al día.
const CENSO_GRANJA: Array<[string, number, string]> = [
  ["Perros", 12, "el Excel traía 10"],
  ["Vacas", 15, "el Excel traía 9"],
];

// ------------------------------------------------------------------- RACIONES
interface PlanRacion {
  bloque: Bloque;
  alimento: string;
  cantidad: number;
  unidad: string;
  animal: string | null;
  categoria: string | null;
  modo: ModoRacion;
  frecuencia: FrecuenciaRacion;
  obs: string;
}

const RACIONES: PlanRacion[] = [
  // --- granja: lo que dice el cuadro de gasto mensual ----------------------
  { bloque: "granja", alimento: "Prepico Dorado", cantidad: 9, unidad: "bulto", animal: "Gallinas ponedoras", categoria: null, modo: "grupal", frecuencia: "mensual", obs: "96 ponedoras · parte de los 11 bultos/mes" },
  { bloque: "granja", alimento: "Prepico Dorado", cantidad: 2, unidad: "bulto", animal: null, categoria: "Aves de corral", modo: "grupal", frecuencia: "mensual", obs: "Aves en general · parte de los 11 bultos/mes" },
  { bloque: "granja", alimento: "Leche 16", cantidad: 15, unidad: "kg", animal: "Vacas", categoria: null, modo: "grupal", frecuencia: "diaria", obs: "15 vacas · 450 kg/mes = 11,25 bultos" },
  // El cuadro dice "24 cabras": son todos los caprinos (12 cabras + 5 cabros + 7 crías),
  // no el grupo CABRAS solo. Por eso la ración cuelga de la categoría.
  { bloque: "granja", alimento: "Leche 16", cantidad: 6, unidad: "kg", animal: null, categoria: "Caprinos", modo: "grupal", frecuencia: "diaria", obs: "24 caprinos · 180 kg/mes = 4,5 bultos" },
  { bloque: "granja", alimento: "Maíz Molido", cantidad: 6, unidad: "bulto", animal: null, categoria: "Aves de corral", modo: "grupal", frecuencia: "mensual", obs: "Aves en general · 300 kg/mes" },
  { bloque: "granja", alimento: "Súper Ternera", cantidad: 1, unidad: "kg", animal: "Terneros", categoria: null, modo: "individual", frecuencia: "diaria", obs: "1 kg por cabeza al día" },
  { bloque: "granja", alimento: "Súper Ternera", cantidad: 1, unidad: "kg", animal: "Terneras", categoria: null, modo: "individual", frecuencia: "diaria", obs: "1 kg por cabeza al día" },
  { bloque: "granja", alimento: "Conejina", cantidad: 500, unidad: "g", animal: "Conejos", categoria: null, modo: "grupal", frecuencia: "diaria", obs: "7 conejos · 500 g entre todos al día" },
  { bloque: "granja", alimento: "Acuatilapia", cantidad: 1, unidad: "bulto", animal: "Peces koi", categoria: null, modo: "grupal", frecuencia: "mensual", obs: "1 bulto de 40 kg al mes" },
  { bloque: "granja", alimento: "Melaza", cantidad: 6, unidad: "bulto", animal: "Vacas", categoria: null, modo: "grupal", frecuencia: "mensual", obs: "Vacas + terneros · consumo libre" },
  { bloque: "granja", alimento: "Sal Mineralizada", cantidad: 2, unidad: "bulto", animal: "Vacas", categoria: null, modo: "grupal", frecuencia: "mensual", obs: "Vacas + terneros · consumo libre" },
  // El cuadro de agosto decía 800 g por perro y eran 10 perros (8 kg/día). Ahora son
  // 12 perros pero siguen siendo 8 kg/día en total, así que la ración pasa a grupal.
  { bloque: "granja", alimento: "Italcán", cantidad: 8, unidad: "kg", animal: "Perros", categoria: null, modo: "grupal", frecuencia: "diaria", obs: "12 perros · 8 kg/día al lote (≈667 g c/u)" },
  // --- equinos ------------------------------------------------------------
  { bloque: "equinos", alimento: "Alfalfa en Cubos", cantidad: 2, unidad: "kg", animal: "Caballos", categoria: null, modo: "individual", frecuencia: "diaria", obs: "2 kg de alfalfa húmeda por caballo" },
  { bloque: "equinos", alimento: "Alfalfa en Cubos", cantidad: 2, unidad: "kg", animal: "Potros", categoria: null, modo: "individual", frecuencia: "diaria", obs: "2 kg de alfalfa húmeda por potro" },
  { bloque: "equinos", alimento: "Alfalfa en Cubos", cantidad: 1, unidad: "kg", animal: "Caballos Mini", categoria: null, modo: "individual", frecuencia: "diaria", obs: "1 kg de alfalfa húmeda por mini" },
  { bloque: "equinos", alimento: "Podium", cantidad: 3, unidad: "kg", animal: "Caballos", categoria: null, modo: "individual", frecuencia: "diaria", obs: "3 kg por caballo al día" },
  { bloque: "equinos", alimento: "Podium", cantidad: 1, unidad: "kg", animal: "Caballos Mini", categoria: null, modo: "individual", frecuencia: "diaria", obs: "1 kg por mini al día" },
  { bloque: "equinos", alimento: "Brío Potros", cantidad: 2, unidad: "kg", animal: "Potros", categoria: null, modo: "individual", frecuencia: "diaria", obs: "2 kg por potro al día" },
  { bloque: "equinos", alimento: "Heno", cantidad: 40, unidad: "paca", animal: null, categoria: "Equinos", modo: "grupal", frecuencia: "diaria", obs: "A voluntad · promedio 40 pacas/día para las 60 cabezas" },
  { bloque: "equinos", alimento: "Briosal", cantidad: 40, unidad: "kg", animal: null, categoria: "Equinos", modo: "grupal", frecuencia: "mensual", obs: "Según necesidad · 40 kg/mes entre las 60 cabezas" },
];

// Lo que dicen los cuadros, para contrastar contra lo que calcula la app.
const TOTAL_CUADRO_GRANJA = 4_973_029;
const TOTAL_CUADRO_EQUINOS = 15_893_451; // sin el heno: el cuadro no lo incluye

const dest = (r: { animal: string | null; categoria: string | null }) => r.animal ?? `cat:${r.categoria}`;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const destino = url.includes("localhost") || url.includes("127.0.0.1") ? "LOCAL" : "PRODUCCIÓN";
  console.log(`\n🌾 Alimentación · septiembre 2026 · base ${destino}`);
  console.log(CONFIRMAR ? "   MODO: aplicando cambios\n" : "   MODO: simulación (no se toca la base)\n");

  // ------------------------------------------------------------- 1) alimentos
  console.log("─".repeat(100));
  console.log("1) ALIMENTOS — precio con IVA y presentación\n");
  const idAlimento = new Map<string, string>();
  for (const a of ALIMENTOS) {
    const actual = await prisma.alimento.findFirst({ where: { nombre: { equals: a.nombre, mode: "insensitive" } } });
    const antes = actual
      ? `${cop(actual.costo_unitario)} / ${actual.unidad_medida} de ${num((actual.equivalencia_g ?? 0) / 1000)} kg`
      : "NUEVO";
    const ahora = `${cop(a.costo)} / ${a.unidad} de ${num(a.equivalencia / 1000)} kg`;
    const marca = !actual ? "+" : antes === ahora ? "=" : "→";
    console.log(`  ${marca} ${a.nombre.padEnd(18)} ${antes.padEnd(32)} ${marca === "=" ? "" : ahora}`);
    if (a.nota) console.log(`      ${a.nota}`);

    if (CONFIRMAR) {
      const data = { tipo: a.tipo, unidad_medida: a.unidad, costo_unitario: a.costo, equivalencia_g: a.equivalencia, activo: true };
      const id = actual
        ? (await prisma.alimento.update({ where: { id: actual.id }, data: { ...data, actualizado_por: POR } })).id
        : (await prisma.alimento.create({ data: { ...data, nombre: a.nombre, creado_por: POR } })).id;
      idAlimento.set(a.nombre, id);
    } else if (actual) {
      idAlimento.set(a.nombre, actual.id);
    }
  }

  // --------------------------------------------------------------- 2) equinos
  console.log("\n" + "─".repeat(100));
  console.log("2) CENSO — 60 equinos que no estaban, y lo que corrigen los cuadros\n");
  let catEquinos = await prisma.categoriaAnimal.findFirst({ where: { nombre: { equals: "Equinos", mode: "insensitive" } } });
  if (!catEquinos && CONFIRMAR) {
    catEquinos = await prisma.categoriaAnimal.create({
      data: { nombre: "Equinos", descripcion: "Caballos, potros y minis", creado_por: POR },
    });
  }
  const idAnimal = new Map<string, string>();
  const censo = new Map<string, number>();
  for (const [nombre, cantidad, especie, obs] of EQUINOS) {
    const actual = await prisma.animal.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" } } });
    censo.set(nombre, cantidad);
    const marca = actual ? (actual.cantidad === cantidad ? "=" : "→") : "+";
    console.log(`  ${marca} ${nombre.padEnd(18)} ${String(cantidad).padStart(3)} cabezas   ${obs}`);
    if (CONFIRMAR && catEquinos) {
      const data = { cantidad, especie, observaciones: obs, categoria_id: catEquinos.id, activo: true };
      const id = actual
        ? (await prisma.animal.update({ where: { id: actual.id }, data: { ...data, actualizado_por: POR } })).id
        : (await prisma.animal.create({ data: { ...data, nombre, creado_por: POR } })).id;
      idAnimal.set(nombre, id);
    } else if (actual) {
      idAnimal.set(nombre, actual.id);
    }
  }

  // Grupos de la granja donde el cuadro corrige el censo del Excel.
  for (const [nombre, cantidad, nota] of CENSO_GRANJA) {
    const actual = await prisma.animal.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" } } });
    if (!actual) {
      console.log(`  ⚠️  ${nombre.padEnd(18)} no está en la base`);
      continue;
    }
    censo.set(nombre, cantidad);
    idAnimal.set(nombre, actual.id);
    const marca = actual.cantidad === cantidad ? "=" : "→";
    console.log(`  ${marca} ${nombre.padEnd(18)} ${String(cantidad).padStart(3)} cabezas   ${nota}`);
    if (CONFIRMAR && actual.cantidad !== cantidad) {
      await prisma.animal.update({ where: { id: actual.id }, data: { cantidad, actualizado_por: POR } });
    }
  }

  // -------------------------------------------------------------- 3) raciones
  console.log("\n" + "─".repeat(100));
  console.log("3) DIETA — lo que se entrega de verdad\n");

  // Censo real de los grupos de la granja, para las raciones por cabeza.
  // Los nombres van en MAYÚSCULAS en la base y en capitalizado en las tablas de arriba:
  // se indexa siempre en mayúsculas para que no haya dos entradas del mismo grupo.
  const arriba = (s: string) => s.toLocaleUpperCase("es-CO");
  const idPorGrupo = new Map([...idAnimal].map(([k, v]) => [arriba(k), v]));
  const cabezasPorGrupo = new Map([...censo].map(([k, v]) => [arriba(k), v]));
  const animalesBD = await prisma.animal.findMany({ where: { activo: true }, select: { id: true, nombre: true, cantidad: true } });
  for (const a of animalesBD) {
    // Lo que traen las tablas de este script manda: ya viene corregido por los cuadros.
    if (!idPorGrupo.has(arriba(a.nombre))) idPorGrupo.set(arriba(a.nombre), a.id);
    if (!cabezasPorGrupo.has(arriba(a.nombre))) cabezasPorGrupo.set(arriba(a.nombre), a.cantidad);
  }
  const buscarAnimal = (nombre: string) => idPorGrupo.get(arriba(nombre)) ?? null;
  const cabezasDe = (nombre: string) => cabezasPorGrupo.get(arriba(nombre)) ?? 0;
  const categoriasBD = await prisma.categoriaAnimal.findMany({ select: { id: true, nombre: true } });
  const idCategoria = new Map(categoriasBD.map((c) => [c.nombre.toLocaleUpperCase("es-CO"), c.id]));
  if (catEquinos) idCategoria.set("EQUINOS", catEquinos.id);

  const existentes = await prisma.racion.findMany({
    where: { activo: true },
    include: { alimento: { select: { nombre: true } }, animal: { select: { nombre: true } }, categoria: { select: { nombre: true } } },
  });
  const claveBD = (r: (typeof existentes)[number]) =>
    `${r.alimento.nombre}|${r.animal?.nombre ?? `cat:${r.categoria?.nombre ?? ""}`}`.toLocaleUpperCase("es-CO");
  const porClave = new Map(existentes.map((r) => [claveBD(r), r]));

  const enPlan = new Set<string>();
  for (const r of RACIONES) {
    const clave = `${r.alimento}|${dest(r)}`.toLocaleUpperCase("es-CO");
    enPlan.add(clave);
    const previo = porClave.get(clave);
    const antes = previo ? `${previo.cantidad} ${previo.unidad} ${previo.modo} ${previo.frecuencia}` : "NUEVA";
    const ahora = `${r.cantidad} ${r.unidad} ${r.modo} ${r.frecuencia}`;
    const marca = !previo ? "+" : antes === ahora ? "=" : "→";
    console.log(`  ${marca} ${r.alimento.padEnd(16)} ${dest(r).padEnd(22)} ${antes.padEnd(26)} ${marca === "=" ? "" : ahora}`);

    if (!CONFIRMAR) continue;
    const alimento_id = idAlimento.get(r.alimento);
    const animal_id = r.animal ? buscarAnimal(r.animal) : null;
    const categoria_animal_id = r.categoria ? idCategoria.get(r.categoria.toLocaleUpperCase("es-CO")) ?? null : null;
    if (!alimento_id || (r.animal && !animal_id) || (r.categoria && !categoria_animal_id)) {
      console.log(`      ⚠️  sin destino en la base: no se creó`);
      continue;
    }
    const data = {
      alimento_id, animal_id, categoria_animal_id,
      cantidad: r.cantidad, unidad: r.unidad, modo: r.modo, frecuencia: r.frecuencia,
      observaciones: r.obs, activo: true,
    };
    if (previo) await prisma.racion.update({ where: { id: previo.id }, data: { ...data, actualizado_por: POR } });
    else await prisma.racion.create({ data: { ...data, creado_por: POR } });
  }

  // Raciones que ya no aplican: se desactivan, no se borran.
  for (const r of existentes.filter((x) => !enPlan.has(claveBD(x)))) {
    console.log(`  ✗ ${r.alimento.nombre.padEnd(16)} ${(r.animal?.nombre ?? `cat:${r.categoria?.nombre}`).padEnd(22)} queda INACTIVA`);
    if (CONFIRMAR) await prisma.racion.update({ where: { id: r.id }, data: { activo: false, actualizado_por: POR } });
  }

  // ---------------------------------------------------------------- 4) costos
  console.log("\n" + "─".repeat(100));
  console.log("4) GASTO MENSUAL que mostrará la app (mes de 30 días)\n");
  const unidadDe = new Map<string, AlimentoUnidad>(
    ALIMENTOS.map((a) => [a.nombre, { unidad_medida: a.unidad, equivalencia_g: a.equivalencia, costo_unitario: a.costo }]),
  );

  const totales: Record<Bloque, number> = { granja: 0, equinos: 0 };
  for (const bloque of ["granja", "equinos"] as Bloque[]) {
    console.log(`  ${bloque === "granja" ? "GRANJA" : "EQUINOS"}`);
    console.log(`  ${"Alimento".padEnd(17)}${"Destino".padEnd(22)}${"Consumo mes".padStart(16)}${"Costo mes".padStart(16)}`);
    for (const r of RACIONES.filter((x) => x.bloque === bloque)) {
      const al = unidadDe.get(r.alimento)!;
      const cabezas = r.animal ? cabezasDe(r.animal) : 0;
      const calc = { cantidad: r.cantidad, unidad: r.unidad, modo: r.modo, frecuencia: r.frecuencia };
      const base = consumoBaseMensual(calc, cabezas, al);
      const costo = costoMensual(calc, cabezas, al);
      totales[bloque] += costo ?? 0;
      const unidades = base !== null ? `${num(base / al.equivalencia_g!)} ${al.unidad_medida}` : "—";
      console.log(`  ${r.alimento.padEnd(17)}${dest(r).padEnd(22)}${unidades.padStart(16)}${cop(costo).padStart(16)}`);
    }
    console.log(`  ${"".padEnd(39)}${"TOTAL".padStart(16)}${cop(totales[bloque]).padStart(16)}\n`);
  }

  const heno = RACIONES.find((r) => r.alimento === "Heno")!;
  const costoHeno = costoMensual(
    { cantidad: heno.cantidad, unidad: heno.unidad, modo: heno.modo, frecuencia: heno.frecuencia },
    0,
    unidadDe.get("Heno")!,
  )!;
  console.log(`  TOTAL ALIMENTACIÓN DEL PARQUE: ${cop(totales.granja + totales.equinos)} al mes\n`);

  console.log("─".repeat(100));
  console.log("5) CONTRASTE CONTRA LOS CUADROS\n");
  console.log(`  Granja    cuadro ${cop(TOTAL_CUADRO_GRANJA).padStart(12)}   app ${cop(totales.granja).padStart(12)}   dif ${cop(totales.granja - TOTAL_CUADRO_GRANJA)}`);
  console.log(`  Equinos   cuadro ${cop(TOTAL_CUADRO_EQUINOS).padStart(12)}   app ${cop(totales.equinos - costoHeno).padStart(12)}   dif ${cop(totales.equinos - costoHeno - TOTAL_CUADRO_EQUINOS)}   (sin heno)`);
  console.log(`\n  La diferencia de la granja es la CONEJINA: el cuadro la calculó con libra de`);
  console.log(`  0,4536 kg y la libra colombiana es de 500 g. Son 30 libras al mes = ${cop(53_550)},`);
  console.log(`  no los $59.029 del cuadro.`);
  console.log(`\n  ⚠️  El HENO no está sumado en el cuadro de equinos: ${cop(costoHeno)} al mes`);
  console.log(`      (40 pacas/día × 30 días = 1.200 pacas × $14.500). Es el renglón más caro del parque.\n`);

  if (!CONFIRMAR) console.log("Nada se cambió. Para aplicar:  npm run alimentacion:2026 -- --confirmar\n");
  else console.log("✅ Aplicado.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
