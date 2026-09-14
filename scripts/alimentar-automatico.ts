// Punto de entrada del cron de Railway (ver decisiones.md): dispara la alimentación
// automática de la dieta, repartida por franja horaria.
//
//   Caballos, potros y caballos mini (categoría EQUINOS) → 7 a.m., 12 m. y 4 p.m.
//   El resto de los animales                              → 7 a.m. y 4 p.m.
//
// El Cron Schedule de Railway está en UTC y dispara a las 12:00, 17:00 y 21:00 UTC
// (= 7:00, 12:00 y 16:00 hora Bogotá, que no tiene horario de verano). Este script
// mira la hora real de Bogotá al momento de correr y decide sola qué franja le toca;
// así no importa si el cron se atrasa un par de minutos.
import "dotenv/config";
import { prisma } from "../lib/db";
import { horaBogota } from "../lib/tiempo";
import { franjaMasCercana } from "../lib/animales/auto-alimentacion";
import { ejecutarAlimentacionAutomatica } from "../lib/animales/ejecutar-automatico";

async function main() {
  const ahora = new Date();
  const hora = horaBogota(ahora);
  const franja = franjaMasCercana(hora);

  if (!franja) {
    console.log(`[alimentar-automatico] ${hora} (Bogotá) no cae en ninguna franja de alimentación. No se hace nada.`);
    return;
  }

  console.log(`[alimentar-automatico] Franja ${franja} (hora real Bogotá: ${hora})`);
  const r = await ejecutarAlimentacionAutomatica(franja, ahora);

  console.log(`  ${r.registrados.length} entrega(s) registrada(s):`);
  for (const reg of r.registrados) console.log(`   · ${reg.nombre}: ${reg.entregado}`);

  console.log(`  ${r.omitidos.length} ración(es) omitida(s):`);
  for (const om of r.omitidos) console.log(`   · ${om.nombre}: ${om.motivo}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("[alimentar-automatico] Error:", e);
    prisma.$disconnect();
    process.exit(1);
  });
