// Puebla `clientes` desde los `comprador_*` que ya quedaron guardados en las ventas
// (antes de que existiera la tabla `clientes`). Idempotente: correrlo dos veces no
// duplica nada, solo deja el dato más reciente que haya en las ventas.
//
//   npx tsx scripts/backfill-clientes.ts
import "dotenv/config";
import { prisma } from "../lib/db";

const POR = "backfill-clientes";

async function main() {
  const ventas = await prisma.venta.findMany({
    where: { comprador_celular: { not: null }, comprador_nombre: { not: null } },
    select: { comprador_celular: true, comprador_nombre: true, comprador_documento: true, comprador_email: true, creado_en: true },
    orderBy: { creado_en: "asc" }, // el más reciente por celular queda de último y manda
  });

  const porCelular = new Map<string, (typeof ventas)[number] & { celular: string }>();
  let sinCelularValido = 0;
  for (const v of ventas) {
    const celular = (v.comprador_celular ?? "").replace(/\D/g, "");
    if (celular.length < 7) { sinCelularValido++; continue; }
    porCelular.set(celular, { ...v, celular });
  }

  let creados = 0;
  let actualizados = 0;
  for (const [celular, v] of porCelular) {
    const existia = await prisma.cliente.findUnique({ where: { celular }, select: { id: true } });
    await prisma.cliente.upsert({
      where: { celular },
      create: {
        celular,
        nombre: v.comprador_nombre!.trim(),
        documento: v.comprador_documento?.trim() || null,
        email: v.comprador_email?.trim() || null,
        creado_por: POR,
      },
      update: {
        nombre: v.comprador_nombre!.trim(),
        ...(v.comprador_documento?.trim() ? { documento: v.comprador_documento.trim() } : {}),
        ...(v.comprador_email?.trim() ? { email: v.comprador_email.trim() } : {}),
        actualizado_por: POR,
      },
    });
    if (existia) actualizados++; else creados++;
  }
  console.log(`Clientes nuevos: ${creados}. Clientes actualizados: ${actualizados}. Ventas sin celular válido: ${sinCelularValido}.`);

  // Deja también el histórico enlazado (venta.cliente_id), no solo el perfil creado.
  const ventasSinCliente = await prisma.venta.findMany({
    where: { cliente_id: null, comprador_celular: { not: null } },
    select: { id: true, comprador_celular: true },
  });
  let enlazadas = 0;
  for (const v of ventasSinCliente) {
    const celular = (v.comprador_celular ?? "").replace(/\D/g, "");
    if (celular.length < 7) continue;
    const cliente = await prisma.cliente.findUnique({ where: { celular }, select: { id: true } });
    if (!cliente) continue;
    await prisma.venta.update({ where: { id: v.id }, data: { cliente_id: cliente.id } });
    enlazadas++;
  }
  console.log(`Ventas históricas enlazadas a su cliente: ${enlazadas}.`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
