// Verificación determinista de F13: fila virtual por atracción.
// Simula el flujo real: dos visitantes separan turno, el operario llama, uno es
// atendido, otro no se presenta, y se comprueba la posición y la espera estimada.
//
//   npm run verificar:f13
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { tomarTurno, llamarSiguiente, cerrarTurno, filaDelDia } from "../lib/fila/turno";
import { personasAdelante, posicion, esperaEstimada, textoEspera, resumirFila } from "../lib/fila/calculo";
import { fechaBogota } from "../lib/tiempo";

const prisma = new PrismaClient();
const MARCA = "QA-F13 Fila de prueba";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: string) {
  console.log(`${ok ? "  ✓" : "  ✗"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
}

async function main() {
  console.log("\n🎢 Verificando F13 · Fila virtual\n");

  // ------------------------------------------------------------ preparación
  const atraccion = await prisma.atraccion.create({
    data: {
      nombre: MARCA,
      requiere_consentimiento: true,
      fila_activa: true,
      cupo_por_tanda: 8,
      minutos_por_tanda: 10,
      creado_por: "qa",
    },
  });
  console.log(`  Atracción de prueba: 8 por tanda, 10 min por tanda\n`);

  // Manillas de prueba propias, para no depender de lo que haya en la BD.
  const detalle = await prisma.ventaDetalle.findFirst({ orderBy: { creado_en: "desc" } });
  if (!detalle) throw new Error("No hay ventas en la BD: registra una para poder probar la fila.");

  const nuevas = [];
  for (let i = 1; i <= 3; i++) {
    nuevas.push(
      await prisma.manilla.create({
        data: {
          codigo_uuid: crypto.randomUUID(),
          firma_hmac: "qa-f13",
          consecutivo: `qa-f13-${i}`,
          venta_detalle_id: detalle.id,
          tipo_visitante_id: detalle.tipo_visitante_id,
          vencimiento: new Date(Date.now() + 86_400_000),
          creado_por: "qa",
        },
      }),
    );
  }
  const [m1, m2, m3] = nuevas;

  // ------------------------------------------------------------ 1. separar turno
  console.log("1. El visitante separa su turno");
  const t1 = await tomarTurno(m1.id, atraccion.id, 4); // familia de 4
  check("toma turno con su manilla", t1.ok, t1.ok ? `turno ${t1.numero}` : t1.error);
  check("el primero recibe el número 1", t1.ok && t1.numero === 1);
  check(
    "avisa que falta firmar el consentimiento",
    t1.ok && !!t1.aviso?.includes("consentimiento"),
    t1.ok ? t1.aviso ?? "sin aviso" : "",
  );

  const t2 = await tomarTurno(m2.id, atraccion.id, 1);
  check("el segundo recibe el número 2", t2.ok && t2.numero === 2);

  console.log("\n2. No se puede pedir dos turnos en la misma atracción");
  const repetido = await tomarTurno(m1.id, atraccion.id, 1);
  check("rechaza el turno duplicado", !repetido.ok, repetido.ok ? "SE CREÓ (mal)" : repetido.error);

  console.log("\n3. Una manilla anulada no puede hacer fila");
  const anulada = await prisma.manilla.create({
    data: {
      codigo_uuid: crypto.randomUUID(), firma_hmac: "x", consecutivo: "qa-f13-anulada",
      venta_detalle_id: m3.venta_detalle_id, tipo_visitante_id: m3.tipo_visitante_id,
      estado: "anulada", creado_por: "qa",
    },
  });
  const rAnulada = await tomarTurno(anulada.id, atraccion.id, 1);
  check("rechaza la manilla anulada", !rAnulada.ok, rAnulada.ok ? "SE CREÓ (mal)" : rAnulada.error);

  // ------------------------------------------------------------ 4. posición y espera
  console.log("\n4. Posición y espera");
  const t3 = await tomarTurno(m3.id, atraccion.id, 1);
  check("el tercero recibe el número 3", t3.ok && t3.numero === 3);

  const fila = (await filaDelDia(atraccion.id)).map((t) => ({ numero: t.numero, personas: t.personas, estado: t.estado }));
  const delante3 = personasAdelante(fila, 3);
  check("cuenta PERSONAS adelante, no turnos", delante3 === 5, `${delante3} (familia de 4 + 1)`);
  check("su posición es la 3.ª", posicion(fila, 3) === 3);

  const espera3 = esperaEstimada(delante3, { cupo_por_tanda: 8, minutos_por_tanda: 10 });
  check("con 5 adelante y cupo 8, entra en la próxima tanda", espera3 === 0, textoEspera(espera3));

  // ------------------------------------------------------------ 5. operario
  console.log("\n5. El operario opera la fila");
  const l1 = await llamarSiguiente(atraccion.id, "qa");
  check("llama al primero de la fila", l1.ok && l1.numero === 1, l1.ok ? `turno ${l1.numero}` : l1.error);

  const filaLlamado = (await filaDelDia(atraccion.id)).map((t) => ({ numero: t.numero, personas: t.personas, estado: t.estado }));
  check("el llamado sigue ocupando cupo", personasAdelante(filaLlamado, 2) === 4, `${personasAdelante(filaLlamado, 2)}`);

  const atendidoR = await cerrarTurno(l1.ok ? l1.turno_id : "", "atendido", { porQuien: "qa" });
  check("lo marca como atendido", atendidoR.ok);

  const l2 = await llamarSiguiente(atraccion.id, "qa");
  check("llama al siguiente", l2.ok && l2.numero === 2);
  const noLlego = await cerrarTurno(l2.ok ? l2.turno_id : "", "no_se_presento", { motivo: "No apareció", porQuien: "qa" });
  check("marca que no se presentó", noLlego.ok);

  const filaFinal = (await filaDelDia(atraccion.id)).map((t) => ({ numero: t.numero, personas: t.personas, estado: t.estado }));
  const resumen = resumirFila(filaFinal);
  check("el resumen cuadra", resumen.atendidosHoy === 1 && resumen.noSePresentaron === 1 && resumen.esperando === 1,
    `atendidos ${resumen.atendidosHoy}, no llegaron ${resumen.noSePresentaron}, esperando ${resumen.esperando}`);
  check("el que quedó pasa a ser el primero", posicion(filaFinal, 3) === 1);

  console.log("\n6. Fila vacía");
  const l3 = await llamarSiguiente(atraccion.id, "qa");
  check("llama al último que quedaba", l3.ok && l3.numero === 3);
  await cerrarTurno(l3.ok ? l3.turno_id : "", "atendido", { porQuien: "qa" });
  const vacia = await llamarSiguiente(atraccion.id, "qa");
  check("avisa que no hay nadie esperando", !vacia.ok, vacia.ok ? "llamó a alguien (mal)" : vacia.error);

  console.log("\n7. Una atracción sin fila activa no acepta turnos");
  await prisma.atraccion.update({ where: { id: atraccion.id }, data: { fila_activa: false } });
  const sinFila = await tomarTurno(m1.id, atraccion.id, 1);
  check("rechaza el turno", !sinFila.ok, sinFila.ok ? "SE CREÓ (mal)" : sinFila.error);

  // ------------------------------------------------------------ limpieza
  console.log("\n8. Limpieza");
  await prisma.turnoFila.deleteMany({ where: { atraccion_id: atraccion.id } });
  await prisma.atraccion.delete({ where: { id: atraccion.id } });
  await prisma.manilla.deleteMany({ where: { consecutivo: { startsWith: "qa-f13" } } });
  check("se borraron los datos de prueba", true, `día ${fechaBogota()}`);

  console.log(fallos === 0 ? "\n✅ F13 verificada, sin fallos.\n" : `\n❌ ${fallos} verificación(es) fallaron.\n`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
