// Conteo físico de la bodega de alimentos del 2026-11-12 ("Inventario a la fecha — Alimentos").
// Cada alimento recibe un movimiento de AJUSTE en su kardex: fija la existencia en lo contado
// y desde ahí la planilla de alimentación descuenta lo real. Nada se borra.
// Además muestra para cuántos días alcanza cada alimento con las dietas activas.
//
//   npx tsx scripts/existencias-2026-11-12.ts               → simulación (no toca la base)
//   npx tsx scripts/existencias-2026-11-12.ts --confirmar   → aplica
import "dotenv/config";
import { prisma } from "../lib/db";
import { recalcularExistencia } from "../lib/animales/alimentacion";
import { consumoBaseDiario } from "../lib/animales/racion";
import { formatearBase } from "../lib/animales/unidades";

const CONFIRMAR = process.argv.includes("--confirmar");
const POR = "conteo-2026-11-12";
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

// [alimento, cantidad contada, en unidades de compra (bulto, saco, paca) o "kg"]
const CONTEO: Array<[string, number, "compra" | "kg", string]> = [
  ["ALFALFA EN CUBOS", 8.5, "compra", "8,5 bultos"],
  ["PODIUM", 9, "compra", "9 bultos"],
  ["BRÍO POTROS", 1.5, "compra", "1,5 bultos"],
  ["SAL EQUINA", 0.5, "compra", "½ bulto"],
  ["HENO", 430, "compra", "430 pacas"],
  ["ITALCÁN", 1, "compra", "1 bulto"],
  ["CONEJINA", 2, "kg", "2 kg"],
  ["LECHE 16", 2, "compra", "2 bultos"],
  ["SÚPER TERNERA", 1.5, "compra", "1,5 bultos"],
  ["SAL MINERALIZADA", 0.5, "compra", "½ bulto"],
  ["MELAZA", 0, "compra", "agotada"],
  ["PREPICO DORADO", 1, "compra", "1 bulto"],
  ["MAÍZ MOLIDO", 0.25, "compra", "¼ de bulto"],
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const base = url.includes("localhost") || url.includes("127.0.0.1") ? "LOCAL" : "PRODUCCIÓN";
  console.log(`\n📦 Conteo de bodega 2026-11-12 · base ${base} · ${CONFIRMAR ? "APLICANDO" : "simulación (no toca nada)"}\n`);

  const alimentos = await prisma.alimento.findMany({ where: { activo: true } });
  const faltan = CONTEO.filter(([n]) => !alimentos.some((a) => norm(a.nombre) === norm(n))).map(([n]) => n);
  if (faltan.length > 0) {
    console.log(`⛔ No se tocó nada. No encontré: ${faltan.join(", ")}`);
    console.log(`   Alimentos activos: ${alimentos.map((a) => a.nombre).join(", ")}`);
    process.exit(1);
  }

  // Consumo diario con las dietas activas, para saber cuántos días alcanza.
  const raciones = await prisma.racion.findMany({ where: { activo: true }, include: { alimento: true, animal: true } });
  const grupos = await prisma.animal.findMany({ where: { activo: true }, select: { categoria_id: true, cantidad: true } });
  const porCat = new Map<string, number>();
  for (const g of grupos) porCat.set(g.categoria_id, (porCat.get(g.categoria_id) ?? 0) + g.cantidad);
  const diario = new Map<string, number>();
  for (const r of raciones) {
    const cabezas = r.animal ? r.animal.cantidad : porCat.get(r.categoria_animal_id ?? "") ?? 0;
    const d = consumoBaseDiario({ cantidad: r.cantidad, unidad: r.unidad, modo: r.modo, frecuencia: r.frecuencia }, cabezas, r.alimento) ?? 0;
    diario.set(r.alimento_id, (diario.get(r.alimento_id) ?? 0) + d);
  }

  const ajustes: Array<{ id: string; base: number; texto: string }> = [];
  console.log(`  ${"ALIMENTO".padEnd(18)} ${"CONTADO".padEnd(12)} ${"EN LA APP".padEnd(30)} ${"CONSUMO/DÍA".padEnd(22)} ALCANZA`);
  for (const [nombre, cantidad, unidad, texto] of CONTEO) {
    const a = alimentos.find((x) => norm(x.nombre) === norm(nombre))!;
    if (unidad === "compra" && !a.equivalencia_g) throw new Error(`${a.nombre} no tiene equivalencia en gramos`);
    const baseContada = Math.round(cantidad * (unidad === "kg" ? 1000 : a.equivalencia_g!));
    const d = diario.get(a.id) ?? 0;
    const dias = d > 0 ? Math.floor(baseContada / d) : null;
    const alcanza = dias === null ? "sin dieta" : dias === 0 ? "⚠ menos de 1 día" : `${dias} día${dias === 1 ? "" : "s"}${dias <= 3 ? " ⚠" : ""}`;
    console.log(`  ${a.nombre.padEnd(18)} ${texto.padEnd(12)} ${formatearBase(baseContada, a).padEnd(30)} ${(d > 0 ? formatearBase(d, a) : "—").padEnd(22)} ${alcanza}`);
    ajustes.push({ id: a.id, base: baseContada, texto });
  }

  if (!CONFIRMAR) { console.log("\nSimulación: no se tocó nada. Para aplicar: --confirmar\n"); return; }

  await prisma.$transaction(async (tx) => {
    for (const x of ajustes) {
      await tx.movimientoAlimento.create({
        data: { alimento_id: x.id, tipo: "ajuste", cantidad_base: x.base, motivo: `Conteo físico 2026-11-12 (${x.texto})`, creado_por: POR },
      });
      await recalcularExistencia(tx, x.id, POR);
    }
    await tx.logAuditoria.create({
      data: { entidad: "alimentos", entidad_id: POR, accion: "conteo_fisico", datos_despues: { ajustes: ajustes.map(({ id, base }) => ({ id, base })) } },
    });
   }, { timeout: 120_000, maxWait: 20_000 }); // por el proxy público cada consulta tarda; 5 s no alcanzan
  console.log(`\n✅ Listo: ${ajustes.length} existencias ajustadas al conteo.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
