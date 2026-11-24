// Entradas de alimento de caballos (pedido del responsable, 2026-11-24):
//   1. HENO: conteo de 140 pacas en bodega ANTES de la llegada del 23-nov (ajuste por conteo físico).
//   2. HENO: compra de 550 pacas a $17.000 a HENOS ORJUELA, recibida el 23-nov en la mañana.
//   3. Factura FE 807 de DOÑA HERMELINDA S.A.S. (19-nov): BRÍO POTROS 5 bultos y PODIUM 50 bultos.
//   4. Factura FE 811 de DOÑA HERMELINDA S.A.S. (22-nov): ALFALFA EN CUBOS (Italfalfa nacional) 50 bultos.
// Las facturas traen IVA del 5 %; el parque no descuenta IVA, así que el precio por bulto va con IVA
// (redondeado al peso). Cada compra se registra igual que en la pantalla de Animales → Compras:
// compra + detalle + entrada al kardex + gasto pendiente + costo del alimento = el de la última compra.
//
//   npx tsx scripts/compras-alimento-2026-11-23.ts               → simulación (no toca la base)
//   npx tsx scripts/compras-alimento-2026-11-23.ts --confirmar   → aplica
import "dotenv/config";
import { prisma, type Tx } from "../lib/db";
import { recalcularExistencia } from "../lib/animales/alimentacion";
import { calcularLineasCompra, preciosQueCambian } from "../lib/animales/compras";
import { formatearBase } from "../lib/animales/unidades";

const CONFIRMAR = process.argv.includes("--confirmar");
const USUARIO = "hectoralonsoaguilar@gmail.com"; // quien pidió la carga
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
const cop = (n: number) => "$ " + Math.round(n).toLocaleString("es-CO");
const conIva = (v: number) => Math.round(v * 1.05);

const COMPRAS = [
  { fecha: "2026-11-19", factura: "FE 807", proveedor: "DOÑA HERMELINDA S.A.S.", nit: "901.522.325-7", lineas: [["BRÍO POTROS", 5, conIva(87738)], ["PODIUM", 50, conIva(85104)]] as [string, number, number][], factura_total: 4928584.5 },
  { fecha: "2026-11-22", factura: "FE 811", proveedor: "DOÑA HERMELINDA S.A.S.", nit: "901.522.325-7", lineas: [["ALFALFA EN CUBOS", 50, conIva(98113)]] as [string, number, number][], factura_total: 5150932.5 },
  { fecha: "2026-11-23", factura: null, proveedor: "HENOS ORJUELA", nit: null, lineas: [["HENO", 550, 17000]] as [string, number, number][], factura_total: 550 * 17000 },
];
const CONTEO_HENO = { pacas: 140, fecha: new Date("2026-11-23T06:00:00-05:00") };

async function rubroAlimentoAnimales(tx: Tx, usuarioId: string): Promise<string> {
  const r = await tx.rubroGasto.findFirst({ where: { nombre: { equals: "ALIMENTO DE ANIMALES", mode: "insensitive" } } });
  if (r) return r.id;
  const insumos = await tx.rubroGasto.findFirst({ where: { nombre: { equals: "INSUMOS Y SUMINISTROS", mode: "insensitive" }, nivel: "grupo" } });
  return (await tx.rubroGasto.create({ data: insumos ? { nombre: "ALIMENTO DE ANIMALES", nivel: "rubro", padre_id: insumos.id, orden: 99, creado_por: usuarioId } : { nombre: "ALIMENTO DE ANIMALES", nivel: "grupo", orden: 99, creado_por: usuarioId } })).id;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log(`\n🐴 Entradas de alimento · base ${url.includes("localhost") ? "LOCAL" : "PRODUCCIÓN"} · ${CONFIRMAR ? "APLICANDO" : "simulación (no toca nada)"}\n`);
  const usuario = await prisma.usuario.findFirst({ where: { usuario: USUARIO } });
  if (!usuario) throw new Error(`No encontré el usuario ${USUARIO}`);
  const alimentos = await prisma.alimento.findMany({ where: { activo: true } });
  const buscar = (n: string) => { const a = alimentos.find((x) => norm(x.nombre) === norm(n)); if (!a) throw new Error(`No encontré el alimento ${n}`); return a; };

  // Ya cargadas: no duplicar.
  for (const c of COMPRAS.filter((c) => c.factura)) {
    if (await prisma.compraAlimento.findFirst({ where: { numero_factura: c.factura, estado: "registrada" } })) throw new Error(`La factura ${c.factura} ya está registrada. No se tocó nada.`);
  }
  const heno = buscar("HENO");
  if (await prisma.movimientoAlimento.findFirst({ where: { alimento_id: heno.id, tipo: "entrada", fecha: { gte: new Date("2026-11-23T00:00:00-05:00") } } })) throw new Error("Ya hay una entrada de heno desde el 23-nov. No se tocó nada.");

  const henoBase = CONTEO_HENO.pacas * heno.equivalencia_g!;
  console.log(`  Conteo HENO 23-nov antes de la llegada: ${CONTEO_HENO.pacas} pacas (la app tenía ${formatearBase(heno.existencia_base ?? 0, heno)})`);
  const planes = COMPRAS.map((c) => {
    const entradas = c.lineas.map(([n, cantidad, precio]) => ({ alimento_id: buscar(n).id, cantidad, precio_unitario: precio }));
    const calc = calcularLineasCompra(entradas, alimentos);
    if (!calc.ok) throw new Error(calc.error);
    console.log(`  ${c.fecha} ${c.factura ?? "(sin factura)"} · ${c.proveedor}`);
    for (const l of calc.lineas) { const a = alimentos.find((x) => x.id === l.alimento_id)!; console.log(`     ${a.nombre.padEnd(18)} ${formatearBase(l.cantidad_base, a).padEnd(22)} ${cop(l.precio_unitario)} c/u → ${cop(l.subtotal)}`); }
    console.log(`     total ${cop(calc.total)} (factura ${cop(c.factura_total)}, diferencia por redondeo ${cop(calc.total - c.factura_total)})`);
    return { c, calc, cambios: preciosQueCambian(calc.lineas, alimentos) };
  });
  if (!CONFIRMAR) { console.log("\nSimulación: no se tocó nada. Para aplicar: --confirmar\n"); return; }

  const saldos = await prisma.$transaction(async (tx) => {
    await tx.movimientoAlimento.create({ data: { alimento_id: heno.id, tipo: "ajuste", cantidad_base: henoBase, fecha: CONTEO_HENO.fecha, motivo: `CONTEO EN BODEGA 2026-11-23 ANTES DE LA LLEGADA (${CONTEO_HENO.pacas} PACAS)`, creado_por: usuario.id } });
    const tocados = new Set<string>([heno.id]);
    for (const { c, calc, cambios } of planes) {
      const fecha = new Date(`${c.fecha}T12:00:00-05:00`);
      const prov = (await tx.proveedor.findFirst({ where: { nombre: { equals: c.proveedor, mode: "insensitive" } } }))
        ?? (await tx.proveedor.create({ data: { nombre: c.proveedor, nit_cedula: c.nit, creado_por: usuario.id } }));
      const nombres = calc.lineas.map((l) => alimentos.find((x) => x.id === l.alimento_id)!.nombre).join(", ");
      const gasto = await tx.gasto.create({ data: { rubro_gasto_id: await rubroAlimentoAnimales(tx, usuario.id), proveedor_id: prov.id, descripcion: `Compra de alimento${c.factura ? ` · factura ${c.factura}` : ""} · ${nombres}`, fecha_gasto: fecha, base_gravable: calc.total, total: calc.total, estado: "pendiente", creado_por: usuario.id } });
      const compra = await tx.compraAlimento.create({ data: { proveedor_id: prov.id, fecha_compra: fecha, numero_factura: c.factura, total: calc.total, gasto_id: gasto.id, creado_por: usuario.id, observaciones: c.factura ? "Precios con IVA 5 % incluido" : null, detalle: { create: calc.lineas.map((l) => ({ ...l, creado_por: usuario.id })) } } });
      for (const l of calc.lineas) {
        await tx.movimientoAlimento.create({ data: { alimento_id: l.alimento_id, tipo: "entrada", cantidad_base: l.cantidad_base, fecha, costo: l.subtotal, motivo: `Compra${c.factura ? ` factura ${c.factura}` : ""}`, compra_id: compra.id, creado_por: usuario.id } });
        tocados.add(l.alimento_id);
      }
      for (const x of cambios) await tx.alimento.update({ where: { id: x.alimento_id }, data: { costo_unitario: x.despues, actualizado_por: usuario.id } });
    }
    const out: string[] = [];
    for (const id of tocados) { const s = await recalcularExistencia(tx, id, usuario.id); const a = alimentos.find((x) => x.id === id)!; out.push(`${a.nombre}: ${formatearBase(s, a)}`); }
    return out;
  }, { timeout: 120_000, maxWait: 20_000 });
  console.log("\n✓ Aplicado. Existencias:\n  " + saldos.join("\n  ") + "\n");
}

main().catch((e) => { console.error("⛔", e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
