// Verificación contra la BD LOCAL de dos reglas de caja (2026-09-25):
//   1. Una caja = un turno activo; un usuario = un turno activo, también si dos personas
//      intentan abrir la misma caja al mismo tiempo.
//   2. Los movimientos manuales de caja llevan un consecutivo por tipo, sin repetidos aunque
//      se registren en paralelo.
//
// Crea una caja y dos usuarios de prueba marcados QA-CAJA, y al final cierra sus turnos.
// Se niega a correr contra producción.
//
//   npx tsx scripts/verificar-caja.ts
import "dotenv/config";
import { prisma } from "../lib/db";
import { abrirTurnoEnCaja, reabrirTurnoCerrado } from "../lib/caja/turno";
import { crearMovimientoCaja } from "../lib/caja/movimientos";

const MARCA = "QA-CAJA";
let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: string) {
  console.log(`${ok ? "  ✓" : "  ✗"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
}

async function usuario(sufijo: string) {
  const u = `qa_caja_${sufijo}`;
  return prisma.usuario.upsert({
    where: { usuario: u },
    update: {},
    create: { nombre: `${MARCA} ${sufijo}`, usuario: u, hash_password: "x", rol: "cajero", creado_por: MARCA },
  });
}

async function cerrarTurnosDe(ids: string[]) {
  await prisma.turnoCaja.updateMany({
    where: { usuario_id: { in: ids }, estado: { in: ["abierto", "reabierto"] } },
    data: { estado: "cerrado", cerrado_en: new Date() },
  });
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) throw new Error("Solo corre contra la base LOCAL.");
  console.log("\n🏛️ Verificando reglas de caja\n");

  const [a, b, c] = await Promise.all([usuario("a"), usuario("b"), usuario("c")]);
  await cerrarTurnosDe([a.id, b.id, c.id]);
  const caja1 = await prisma.caja.create({ data: { nombre: `${MARCA} 1 ${Date.now()}`, creado_por: MARCA } });
  const caja2 = await prisma.caja.create({ data: { nombre: `${MARCA} 2 ${Date.now()}`, creado_por: MARCA } });

  console.log("1. Una caja, un turno");
  const r1 = await abrirTurnoEnCaja({ cajaId: caja1.id, usuarioId: a.id, baseInicial: 100000 });
  check("A abre la caja 1", r1.ok);
  const r2 = await abrirTurnoEnCaja({ cajaId: caja1.id, usuarioId: b.id, baseInicial: 0 });
  check("B NO puede abrir la caja 1 (ya la tiene A)", !r2.ok, r2.ok ? "la abrió" : r2.error);
  const r3 = await abrirTurnoEnCaja({ cajaId: caja2.id, usuarioId: a.id, baseInicial: 0 });
  check("A NO puede abrir otra caja con su turno abierto", !r3.ok, r3.ok ? "la abrió" : r3.error);
  const r4 = await abrirTurnoEnCaja({ cajaId: caja2.id, usuarioId: b.id, baseInicial: 0 });
  check("B sí abre la caja 2", r4.ok);

  console.log("\n2. Dos personas abriendo la misma caja al mismo tiempo");
  await cerrarTurnosDe([a.id, b.id]);
  const simultaneos = await Promise.all([
    abrirTurnoEnCaja({ cajaId: caja1.id, usuarioId: a.id, baseInicial: 0 }),
    abrirTurnoEnCaja({ cajaId: caja1.id, usuarioId: b.id, baseInicial: 0 }),
    abrirTurnoEnCaja({ cajaId: caja1.id, usuarioId: c.id, baseInicial: 0 }),
  ]);
  const exitosos = simultaneos.filter((r) => r.ok).length;
  const activos = await prisma.turnoCaja.count({ where: { caja_id: caja1.id, estado: { in: ["abierto", "reabierto"] } } });
  check("solo uno de tres lo logra", exitosos === 1, `${exitosos} lo lograron`);
  check("la caja queda con un solo turno activo", activos === 1, `${activos} activos`);

  console.log("\n3. Reabrir respeta la regla");
  const ganador = await prisma.turnoCaja.findFirstOrThrow({ where: { caja_id: caja1.id, estado: "abierto" } });
  await prisma.turnoCaja.update({ where: { id: ganador.id }, data: { estado: "cerrado", cerrado_en: new Date() } });
  const otro = [a, b, c].find((u) => u.id !== ganador.usuario_id)!;
  const r5 = await abrirTurnoEnCaja({ cajaId: caja1.id, usuarioId: otro.id, baseInicial: 0 });
  check("otro cajero abre la caja 1 después del cierre", r5.ok);
  const r6 = await reabrirTurnoCerrado({ turnoId: ganador.id, por: a.id });
  check("NO se reabre el turno viejo mientras la caja está ocupada", !r6.ok, r6.ok ? "se reabrió" : r6.error);

  console.log("\n4. Consecutivo de comprobantes");
  const turno = await prisma.turnoCaja.findFirstOrThrow({ where: { caja_id: caja1.id, estado: "abierto" } });
  const antes = (await prisma.movimientoCaja.aggregate({ where: { tipo: "egreso" }, _max: { numero: true } }))._max.numero ?? 0;
  const movs = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      crearMovimientoCaja({ turnoId: turno.id, tipo: "egreso", monto: 1000 * (i + 1), concepto: `${MARCA} prueba ${i}`, tercero: "Proveedor QA", por: otro.id }),
    ),
  );
  const numeros = movs.map((m) => m.numero!).sort((x, y) => x - y);
  const esperados = Array.from({ length: 6 }, (_, i) => antes + i + 1);
  check("6 egresos en paralelo, sin números repetidos", new Set(numeros).size === 6, numeros.join(", "));
  check("seguidos desde el último", JSON.stringify(numeros) === JSON.stringify(esperados), `esperado ${esperados.join(", ")}`);
  const ingreso = await crearMovimientoCaja({ turnoId: turno.id, tipo: "ingreso", monto: 5000, concepto: `${MARCA} ingreso`, por: otro.id });
  check("el ingreso lleva su propio consecutivo", ingreso.numero != null, `N.° ${ingreso.numero}`);
  check("guarda a quién se pagó", movs[0].tercero === "PROVEEDOR QA", movs[0].tercero ?? "null");

  // Limpieza: turnos cerrados y cajas de prueba inactivas (nada se borra).
  await cerrarTurnosDe([a.id, b.id, c.id]);
  await prisma.caja.updateMany({ where: { id: { in: [caja1.id, caja2.id] } }, data: { activo: false } });

  console.log(fallos === 0 ? "\n✅ Reglas de caja verificadas.\n" : `\n❌ ${fallos} comprobación(es) fallaron.\n`);
  if (fallos) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("❌", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
