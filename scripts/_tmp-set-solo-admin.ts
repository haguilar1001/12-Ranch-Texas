// Uso único: marca "EVENTOS VARIOS" como visible/vendible SOLO por administrador en
// taquilla, para que un cajero no pueda aplicarle descuentos por su cuenta.
import "dotenv/config";
import { prisma } from "../lib/db";

const NOMBRES = ["EVENTOS VARIOS"];

async function main() {
  for (const nombre of NOMBRES) {
    const tipo = await prisma.tipoVisitante.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" } } });
    if (!tipo) {
      console.log(`  · no existe el tipo "${nombre}", se omite`);
      continue;
    }
    await prisma.tipoVisitante.update({ where: { id: tipo.id }, data: { solo_administrador: true } });
    console.log(`  ✓ ${tipo.nombre}: ahora solo el administrador la ve y la vende en taquilla`);
  }
}

main().finally(() => prisma.$disconnect());
