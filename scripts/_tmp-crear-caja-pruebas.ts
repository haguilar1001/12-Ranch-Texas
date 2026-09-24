// Uso único: crea una caja marcada como "de prueba" para poder abrir turno y vender en
// taquilla sin que esas ventas cuenten en los indicadores de ingreso (dashboard, reporte
// de ventas, ticket promedio). Idempotente: si ya existe una, no hace nada.
import "dotenv/config";
import { prisma } from "../lib/db";

const NOMBRE = "🧪 Caja de Pruebas";

async function main() {
  const existente = await prisma.caja.findFirst({ where: { es_prueba: true } });
  if (existente) {
    console.log(`  · ya existe una caja de pruebas: "${existente.nombre}", no se toca.`);
    return;
  }

  await prisma.caja.create({
    data: { nombre: NOMBRE, es_prueba: true, creado_por: "sistema" },
  });
  console.log(`  ✓ "${NOMBRE}" creada. Ábrele turno desde /caja/turno para probar taquilla sin afectar las cifras reales.`);
}

main().finally(() => prisma.$disconnect());
