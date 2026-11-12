// Verificación F15 (kardex de animales y equipos), determinista contra la BD.
// Uso: npx tsx scripts/verificar-f15.ts
import { PrismaClient } from "@prisma/client";
import { calcularSaldo, EFECTO_ANIMAL, EFECTO_EQUIPO, type TipoMovAnimal, type TipoMovEquipo } from "../lib/inventario/kardex";

const prisma = new PrismaClient();

async function main() {
  let fallas = 0;
  const animales = await prisma.animal.findMany({ include: { movimientos: true } });
  for (const a of animales) {
    const saldo = calcularSaldo(a.movimientos.map((m) => ({ ...m, efecto: EFECTO_ANIMAL[m.tipo as TipoMovAnimal] })));
    if (saldo !== a.cantidad) { fallas++; console.log(`✗ ${a.nombre}: guardado ${a.cantidad}, kardex ${saldo}`); }
  }
  const equipos = await prisma.equipo.findMany({ include: { movimientos: true } });
  for (const e of equipos) {
    const saldo = calcularSaldo(e.movimientos.map((m) => ({ ...m, efecto: EFECTO_EQUIPO[m.tipo as TipoMovEquipo] })));
    if (saldo !== e.cantidad) { fallas++; console.log(`✗ ${e.nombre}: guardado ${e.cantidad}, kardex ${saldo}`); }
  }
  const cabezas = animales.filter((a) => a.activo).reduce((t, a) => t + a.cantidad, 0);
  console.log(`Animales: ${animales.length} grupos, ${cabezas} cabezas activas · Equipos: ${equipos.length}`);
  console.log(fallas === 0 ? "✓ Cantidades guardadas = kardex en todos los registros" : `✗ ${fallas} descuadre(s)`);
  process.exit(fallas === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
