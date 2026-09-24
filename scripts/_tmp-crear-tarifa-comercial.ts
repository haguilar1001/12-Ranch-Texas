// Uso único: crea el tipo de visitante "Tarifa Comercial Especial" ($55.000), el ÚNICO
// que admite descuento unitario en taquilla — para eventos/convenios con precio
// negociado (47.000, 48.000, 43.000, 35.000, etc.) sin tener que crear una tarifa nueva
// por cada valor. Idempotente: si ya existe, no hace nada.
import "dotenv/config";
import { prisma } from "../lib/db";

const CODIGO = "tarifa_comercial_especial";
const NOMBRE = "Tarifa Comercial Especial";
const VALOR = 55000;
const POR = "sistema";

async function main() {
  const existente = await prisma.tipoVisitante.findUnique({ where: { codigo: CODIGO } });
  if (existente) {
    console.log(`  · "${NOMBRE}" ya existe (codigo=${CODIGO}), no se toca.`);
    return;
  }

  const ultimo = await prisma.tipoVisitante.findFirst({ orderBy: { orden: "desc" }, select: { orden: true } });
  const orden = (ultimo?.orden ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    const t = await tx.tipoVisitante.create({
      data: {
        codigo: CODIGO,
        nombre: NOMBRE,
        requiere_pago: true,
        orden,
        permite_descuento: true,
        creado_por: POR,
      },
    });
    const ahora = new Date();
    for (const dia of ["semana", "fin_semana_festivo"] as const) {
      await tx.tarifa.create({
        data: {
          tipo_visitante_id: t.id,
          dia_tipo: dia,
          valor: VALOR,
          vigente_desde: ahora,
          motivo_cambio: "Tarifa inicial (creación de Tarifa Comercial Especial)",
          creado_por: POR,
        },
      });
    }
  });

  console.log(`  ✓ "${NOMBRE}" creada en $${VALOR} (semana y fin de semana/festivo), con descuento unitario habilitado.`);
}

main().finally(() => prisma.$disconnect());
