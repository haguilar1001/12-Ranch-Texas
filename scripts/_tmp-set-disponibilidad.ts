// Uso único: marca la disponibilidad por día de los tipos cuyo nombre ya deja clara la
// intención (ADULTO/NIÑO → solo fin de semana/festivo; SEMANAL * → solo entre semana).
// Todo lo demás (bonos, adulto mayor, bebé, policía nacional, cajas de compensación,
// funcionario Campbell, página web, tarifa comercial especial, etc.) se deja en "todos
// los días" — el administrador ajusta desde /admin/tarifas si alguno debe restringirse.
import "dotenv/config";
import { prisma } from "../lib/db";

const SOLO_FINDE = ["adulto", "nino"];
const SOLO_SEMANA = ["semanal_adulto", "semanal_nino", "semanal_todo_incluido", "semanal_profesora"];

async function marcar(codigos: string[], disponible: "semana" | "fin_semana_festivo") {
  for (const codigo of codigos) {
    const tipo = await prisma.tipoVisitante.findUnique({ where: { codigo } });
    if (!tipo) {
      console.log(`  · no existe el tipo "${codigo}", se omite`);
      continue;
    }
    await prisma.tipoVisitante.update({ where: { id: tipo.id }, data: { disponible_dias: disponible } });
    console.log(`  ✓ ${tipo.nombre}: disponible solo ${disponible === "semana" ? "entre semana" : "fin de semana/festivo"}`);
  }
}

async function main() {
  await marcar(SOLO_FINDE, "fin_semana_festivo");
  await marcar(SOLO_SEMANA, "semana");
  console.log("Listo. Los demás tipos quedan en 'todos los días' (ajustable en /admin/tarifas).");
}

main().finally(() => prisma.$disconnect());
