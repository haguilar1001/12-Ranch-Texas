// Reemplaza TODAS las dietas del parque por las de los cuadros de noviembre de 2026:
//   · "ALIMENTO ANIMALES DE GRANJA — CONSUMO MENSUAL" ($5.357.000/mes)
//   · "PLAN DE ALIMENTACIÓN — RANCH TEXAS · 60 ANIMALES" (equinos, $39.257.954/mes)
//
// Regla del responsable (2026-11-12): SOLO peces y aves se manejan por LOTE (cantidad total
// del grupo). Todo lo demás va POR ANIMAL, así la dieta sigue sola al censo del kardex:
// si nace un ternero o muere un perro, el consumo y el costo se ajustan sin tocar la dieta.
//
// Nada se borra: las raciones viejas quedan inactivas (activo=false) y la bitácora que las
// usó sigue apuntándoles. Los alimentos se actualizan de precio; ninguno se desactiva.
// No toca el censo de animales.
//
//   npx tsx scripts/dietas-2026-11.ts                → muestra qué cambiaría (no toca la base)
//   npx tsx scripts/dietas-2026-11.ts --confirmar    → aplica
import "dotenv/config";
import { prisma } from "../lib/db";
import { costoMensual, consumoBaseMensual, type FrecuenciaRacion, type ModoRacion } from "../lib/animales/racion";

const CONFIRMAR = process.argv.includes("--confirmar");
const POR = "dietas-2026-11";
const cop = (n: number | null) => (n === null ? "—" : "$" + n.toLocaleString("es-CO"));
const num = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const conIva = (n: number) => Math.round(n * 1.05);

// ------------------------------------------------------------------ ALIMENTOS
// Precio por unidad de compra tal como lo paga el parque (IVA incluido cuando aplica).
// Granja: sale de dividir el VALOR MENSUAL del cuadro entre los bultos del mes.
// Equinos: precio unitario del cuadro + 5% de IVA (el heno no lleva IVA).
interface PlanAlimento { nombre: string; tipo: string; unidad: string; costo: number; equivalencia: number; nota: string }
const ALIMENTOS: PlanAlimento[] = [
  { nombre: "PREPICO DORADO", tipo: "concentrado", unidad: "bulto", costo: 80_000, equivalencia: 40_000, nota: "$720.000 / 9 bultos" },
  { nombre: "MAÍZ MOLIDO", tipo: "concentrado", unidad: "bulto", costo: 70_000, equivalencia: 50_000, nota: "($580.000 − 2 × $80.000) / 6 bultos" },
  { nombre: "LECHE 16", tipo: "concentrado", unidad: "bulto", costo: 85_000, equivalencia: 40_000, nota: "$1.275.000 / 15 y $340.000 / 4" },
  { nombre: "ITALCÁN", tipo: "concentrado", unidad: "bulto", costo: 110_000, equivalencia: 30_000, nota: "$880.000 / 8 bultos" },
  { nombre: "SÚPER TERNERA", tipo: "concentrado", unidad: "bulto", costo: 85_000, equivalencia: 40_000, nota: "$680.000 / 8 bultos" },
  { nombre: "CONEJINA", tipo: "concentrado", unidad: "libra", costo: 2_500, equivalencia: 500, nota: "$75.000 / 15 kg = $5.000 el kg" },
  { nombre: "ACUATILAPIA", tipo: "concentrado", unidad: "bulto", costo: 305_000, equivalencia: 40_000, nota: "$305.000 al mes (1 bulto)" },
  { nombre: "SAL MINERALIZADA", tipo: "suplemento", unidad: "bulto", costo: 95_000, equivalencia: 20_000, nota: "$190.000 / 2 bultos" },
  { nombre: "MELAZA", tipo: "suplemento", unidad: "bulto", costo: 52_000, equivalencia: 30_000, nota: "$312.000 / 6 bultos" },
  { nombre: "HENO", tipo: "forraje", unidad: "paca", costo: 17_500, equivalencia: 15_000, nota: "$17.500, sin IVA" },
  { nombre: "ALFALFA EN CUBOS", tipo: "forraje", unidad: "bulto", costo: conIva(96_113), equivalencia: 50_000, nota: "$96.113 + IVA · 25 kg seco rinde 50 kg humedecida" },
  { nombre: "PODIUM", tipo: "concentrado", unidad: "bulto", costo: conIva(83_105), equivalencia: 40_000, nota: "$83.105 + IVA" },
  { nombre: "BRÍO POTROS", tipo: "concentrado", unidad: "bulto", costo: conIva(86_000), equivalencia: 40_000, nota: "$86.000 + IVA (Briopotros)" },
  { nombre: "SAL EQUINA", tipo: "suplemento", unidad: "saco", costo: conIva(30_900), equivalencia: 10_000, nota: "$30.900 + IVA · saco de 10 kg" },
];

// ------------------------------------------------------------------- RACIONES
// destino: "A:<grupo>" = un grupo del inventario · "C:<categoría>" = toda la categoría
// (en individual multiplica por las cabezas de todos sus grupos).
interface PlanRacion { destino: string; alimento: string; cantidad: number; unidad: string; modo: ModoRacion; frecuencia: FrecuenciaRacion; obs: string; cuadro: string }
const ind = "individual" as const;
const lote = "grupal" as const;
const RACIONES: PlanRacion[] = [
  // ---- AVES y PECES: por lote ----------------------------------------------
  { cuadro: "Gallinas ponedoras", destino: "A:GALLINAS PONEDORAS", alimento: "PREPICO DORADO", cantidad: 12, unidad: "kg", modo: lote, frecuencia: "diaria", obs: "12 kg al día para el lote (9 bultos/mes)" },
  { cuadro: "Aves en general", destino: "C:AVES DE CORRAL", alimento: "MAÍZ MOLIDO", cantidad: 6, unidad: "bulto", modo: lote, frecuencia: "mensual", obs: "Aves en general · 6 bultos al mes" },
  { cuadro: "Aves en general", destino: "C:AVES DE CORRAL", alimento: "PREPICO DORADO", cantidad: 2, unidad: "bulto", modo: lote, frecuencia: "mensual", obs: "Aves en general · 2 bultos al mes" },
  { cuadro: "Peces", destino: "C:PECES", alimento: "ACUATILAPIA", cantidad: 1, unidad: "bulto", modo: lote, frecuencia: "mensual", obs: "1 bulto al mes para los estanques" },
  // ---- Granja: por animal --------------------------------------------------
  { cuadro: "Vacas", destino: "A:VACAS", alimento: "LECHE 16", cantidad: 2, unidad: "kg", modo: ind, frecuencia: "diaria", obs: "2 kg por vaca al día" },
  { cuadro: "Sal mineralizada", destino: "A:VACAS", alimento: "SAL MINERALIZADA", cantidad: 2_667, unidad: "g", modo: ind, frecuencia: "mensual", obs: "Consumo libre · 2 bultos/mes entre 15 vacas" },
  { cuadro: "Melaza", destino: "A:VACAS", alimento: "MELAZA", cantidad: 12, unidad: "kg", modo: ind, frecuencia: "mensual", obs: "Consumo libre · 6 bultos/mes entre 15 vacas" },
  { cuadro: "Terneros", destino: "A:TERNEROS", alimento: "SÚPER TERNERA", cantidad: 1, unidad: "kg", modo: ind, frecuencia: "diaria", obs: "1 kg por animal al día" },
  { cuadro: "Terneros", destino: "A:TERNERAS", alimento: "SÚPER TERNERA", cantidad: 1, unidad: "kg", modo: ind, frecuencia: "diaria", obs: "1 kg por animal al día" },
  { cuadro: "Perros", destino: "A:PERROS", alimento: "ITALCÁN", cantidad: 800, unidad: "g", modo: ind, frecuencia: "diaria", obs: "800 g por perro al día" },
  { cuadro: "Conejos", destino: "A:CONEJOS", alimento: "CONEJINA", cantidad: 71, unidad: "g", modo: ind, frecuencia: "diaria", obs: "500 g al día entre 7 conejos ≈ 71 g c/u" },
  { cuadro: "Cabras", destino: "C:CAPRINOS", alimento: "LECHE 16", cantidad: 208, unidad: "g", modo: ind, frecuencia: "diaria", obs: "5 kg al día entre 24 caprinos ≈ 208 g c/u" },
  // ---- Equinos: por animal -------------------------------------------------
  { cuadro: "Caballos en general", destino: "A:CABALLOS", alimento: "HENO", cantidad: 1, unidad: "paca", modo: ind, frecuencia: "diaria", obs: "1 paca por caballo al día" },
  { cuadro: "Caballos en general", destino: "A:CABALLOS", alimento: "ALFALFA EN CUBOS", cantidad: 2, unidad: "kg", modo: ind, frecuencia: "diaria", obs: "2 kg de alfalfa humedecida" },
  { cuadro: "Caballos en general", destino: "A:CABALLOS", alimento: "PODIUM", cantidad: 3, unidad: "kg", modo: ind, frecuencia: "diaria", obs: "3 kg por caballo al día" },
  { cuadro: "Caballos en general", destino: "A:CABALLOS", alimento: "SAL EQUINA", cantidad: 30, unidad: "g", modo: ind, frecuencia: "diaria", obs: "30 g por caballo al día" },
  { cuadro: "Potros", destino: "A:POTROS", alimento: "HENO", cantidad: 7_500, unidad: "g", modo: ind, frecuencia: "diaria", obs: "½ paca por potro al día" },
  { cuadro: "Potros", destino: "A:POTROS", alimento: "ALFALFA EN CUBOS", cantidad: 2, unidad: "kg", modo: ind, frecuencia: "diaria", obs: "2 kg de alfalfa humedecida" },
  { cuadro: "Potros", destino: "A:POTROS", alimento: "BRÍO POTROS", cantidad: 2, unidad: "kg", modo: ind, frecuencia: "diaria", obs: "2 kg de Briopotros por potro" },
  { cuadro: "Potros", destino: "A:POTROS", alimento: "SAL EQUINA", cantidad: 20, unidad: "g", modo: ind, frecuencia: "diaria", obs: "20 g por potro al día" },
  { cuadro: "Caballos mini", destino: "A:CABALLOS MINI", alimento: "HENO", cantidad: 3_750, unidad: "g", modo: ind, frecuencia: "diaria", obs: "¼ paca por mini al día" },
  { cuadro: "Caballos mini", destino: "A:CABALLOS MINI", alimento: "ALFALFA EN CUBOS", cantidad: 1, unidad: "kg", modo: ind, frecuencia: "diaria", obs: "1 kg de alfalfa humedecida" },
  { cuadro: "Caballos mini", destino: "A:CABALLOS MINI", alimento: "PODIUM", cantidad: 1, unidad: "kg", modo: ind, frecuencia: "diaria", obs: "1 kg por mini al día" },
  { cuadro: "Caballos mini", destino: "A:CABALLOS MINI", alimento: "SAL EQUINA", cantidad: 10, unidad: "g", modo: ind, frecuencia: "diaria", obs: "10 g por mini al día" },
];

// Lo que dicen los cuadros, para contrastar contra lo que calcula la app con el censo real.
const CUADRO: Record<string, number> = {
  "Gallinas ponedoras": 720_000, "Vacas": 1_275_000, "Aves en general": 580_000, "Perros": 880_000,
  "Terneros": 680_000, "Conejos": 75_000, "Cabras": 340_000, "Peces": 305_000,
  "Sal mineralizada": 190_000, "Melaza": 312_000,
  "Caballos en general": 30_432_883, "Potros": 5_209_995, "Caballos mini": 3_615_077,
};

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const base = url.includes("localhost") || url.includes("127.0.0.1") ? "LOCAL" : "PRODUCCIÓN";
  console.log(`\n🌾 Dietas · noviembre 2026 · base ${base} · ${CONFIRMAR ? "APLICANDO" : "simulación (no toca nada)"}\n`);

  // 1) alimentos ---------------------------------------------------------------
  console.log("1) ALIMENTOS — precio por unidad de compra\n");
  const alimentos = new Map<string, { id: string; unidad_medida: string; equivalencia_g: number; costo_unitario: number }>();
  for (const a of ALIMENTOS) {
    const actual = await prisma.alimento.findFirst({ where: { nombre: { equals: a.nombre, mode: "insensitive" } } });
    const antes = actual ? `${cop(actual.costo_unitario)} / ${actual.unidad_medida} ${num((actual.equivalencia_g ?? 0) / 1000)} kg` : "NUEVO";
    const ahora = `${cop(a.costo)} / ${a.unidad} ${num(a.equivalencia / 1000)} kg`;
    console.log(`  ${(antes === ahora ? "=" : actual ? "→" : "+")} ${a.nombre.padEnd(18)} ${antes.padEnd(30)} ${antes === ahora ? "" : ahora.padEnd(28)} ${a.nota}`);
    let id = actual?.id ?? `nuevo:${a.nombre}`;
    if (CONFIRMAR) {
      const data = { tipo: a.tipo, unidad_medida: a.unidad, costo_unitario: a.costo, equivalencia_g: a.equivalencia, activo: true };
      id = actual
        ? (await prisma.alimento.update({ where: { id: actual.id }, data: { ...data, actualizado_por: POR } })).id
        : (await prisma.alimento.create({ data: { ...data, nombre: a.nombre, creado_por: POR } })).id;
    }
    alimentos.set(a.nombre, { id, unidad_medida: a.unidad, equivalencia_g: a.equivalencia, costo_unitario: a.costo });
  }

  // 2) destinos ----------------------------------------------------------------
  const grupos = await prisma.animal.findMany({ where: { activo: true }, select: { id: true, nombre: true, cantidad: true, categoria_id: true } });
  const categorias = await prisma.categoriaAnimal.findMany({ where: { activo: true }, select: { id: true, nombre: true } });
  const destino = (d: string) => {
    const [tipo, nombre] = [d.slice(0, 1), d.slice(2)];
    if (tipo === "A") {
      const g = grupos.filter((x) => x.nombre.toUpperCase() === nombre);
      if (g.length !== 1) throw new Error(`Grupo "${nombre}": encontré ${g.length}`);
      return { animal_id: g[0].id, categoria_animal_id: null, cabezas: g[0].cantidad };
    }
    const c = categorias.find((x) => x.nombre.toUpperCase() === nombre);
    if (!c) throw new Error(`Categoría "${nombre}" no existe`);
    const cabezas = grupos.filter((x) => x.categoria_id === c.id).reduce((t, x) => t + x.cantidad, 0);
    return { animal_id: null, categoria_animal_id: c.id, cabezas };
  };

  // 3) raciones viejas ---------------------------------------------------------
  const viejas = await prisma.racion.findMany({ where: { activo: true } });
  console.log(`\n2) Se desactivan las ${viejas.length} raciones activas de hoy (no se borran).`);

  // 4) raciones nuevas ---------------------------------------------------------
  console.log(`\n3) DIETAS NUEVAS — ${RACIONES.length} raciones, costo con el censo actual\n`);
  const porCuadro = new Map<string, number>();
  const filas: Array<Record<string, unknown>> = [];
  let total = 0;
  for (const r of RACIONES) {
    const d = destino(r.destino);
    const al = alimentos.get(r.alimento)!;
    const calc = { cantidad: r.cantidad, unidad: r.unidad, modo: r.modo, frecuencia: r.frecuencia };
    const mes = costoMensual(calc, d.cabezas, al) ?? 0;
    const kgMes = (consumoBaseMensual(calc, d.cabezas, al) ?? 0) / 1000;
    total += mes;
    porCuadro.set(r.cuadro, (porCuadro.get(r.cuadro) ?? 0) + mes);
    console.log(`  ${r.destino.slice(2).padEnd(20)} ${String(d.cabezas).padStart(4)} cab  ${r.alimento.padEnd(17)} ${`${num(r.cantidad)} ${r.unidad}`.padStart(9)} ${r.modo === "individual" ? "c/u " : "lote"} ${r.frecuencia.padEnd(8)} ${num(kgMes).padStart(8)} kg/mes ${cop(mes).padStart(13)}`);
    filas.push({
      animal_id: d.animal_id, categoria_animal_id: d.categoria_animal_id, alimento_id: al.id,
      cantidad: r.cantidad, unidad: r.unidad, modo: r.modo, frecuencia: r.frecuencia,
      observaciones: r.obs, activo: true, creado_por: POR,
    });
  }

  console.log("\n4) CONTRASTE CON LOS CUADROS (costo mensual)\n");
  for (const [k, v] of Object.entries(CUADRO)) {
    const app = porCuadro.get(k) ?? 0;
    const dif = app - v;
    console.log(`  ${k.padEnd(20)} cuadro ${cop(v).padStart(13)}   app ${cop(app).padStart(13)}   ${dif === 0 ? "" : (dif > 0 ? "+" : "") + dif.toLocaleString("es-CO")}`);
  }
  const totalCuadro = Object.values(CUADRO).reduce((a, b) => a + b, 0);
  console.log(`  ${"TOTAL".padEnd(20)} cuadro ${cop(totalCuadro).padStart(13)}   app ${cop(total).padStart(13)}   ${(total - totalCuadro).toLocaleString("es-CO")}`);

  if (!CONFIRMAR) { console.log("\nSimulación: no se tocó nada. Para aplicar: --confirmar\n"); return; }

  await prisma.$transaction(async (tx) => {
    await tx.racion.updateMany({ where: { id: { in: viejas.map((v) => v.id) } }, data: { activo: false, actualizado_por: POR } });
    await tx.racion.createMany({ data: filas as never });
    await tx.logAuditoria.create({
      data: {
        entidad: "raciones", entidad_id: POR, accion: "reemplazo_dietas", usuario_id: null,
        datos_antes: { desactivadas: viejas.map((v) => v.id) },
        datos_despues: { creadas: filas.length, costo_mensual: total },
      },
    });
  });
  console.log(`\n✅ Listo: ${viejas.length} raciones desactivadas y ${filas.length} creadas.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
