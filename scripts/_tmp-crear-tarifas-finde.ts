// Uso único: después de la migración que separa las tarifas por día (semana / fin de
// semana y festivo), toda tarifa existente quedó con dia_tipo="semana" (el default de la
// migración). Este script crea, para cada tarifa vigente, su contraparte de
// "fin_semana_festivo" con el MISMO valor — el administrador la ajusta después desde
// /admin/tarifas si de verdad debe ser distinta. Nada se toca en el histórico cerrado.
import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const vigentesSemana = await prisma.tarifa.findMany({
    where: { dia_tipo: "semana", vigente_hasta: null },
    include: { tipo_visitante: { select: { nombre: true } } },
  });

  let creadas = 0;
  for (const t of vigentesSemana) {
    const yaTiene = await prisma.tarifa.findFirst({
      where: { tipo_visitante_id: t.tipo_visitante_id, dia_tipo: "fin_semana_festivo", vigente_hasta: null },
    });
    if (yaTiene) {
      console.log(`  · ${t.tipo_visitante.nombre}: ya tiene tarifa de fin de semana/festivo, se omite`);
      continue;
    }
    await prisma.tarifa.create({
      data: {
        tipo_visitante_id: t.tipo_visitante_id,
        dia_tipo: "fin_semana_festivo",
        valor: t.valor,
        vigente_desde: t.vigente_desde,
        motivo_cambio: "Copiada de la tarifa de semana al separar tarifas por día",
        creado_por: "sistema",
      },
    });
    creadas++;
    console.log(`  ✓ ${t.tipo_visitante.nombre}: tarifa de fin de semana/festivo creada en $${t.valor}`);
  }
  console.log(`Listo: ${creadas} tarifa(s) de fin de semana/festivo creada(s).`);
}

main().finally(() => prisma.$disconnect());
