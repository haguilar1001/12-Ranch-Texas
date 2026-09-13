// Tarifas de lo que YA se pagó por banco antes de la visita: bonos de convenio y
// compras por la página web.
//
// Hasta hoy entraban en $ 0, así que no sumaban a la venta del día. Ahora valen lo
// que valen y suman; lo que no suman es al recaudo de la caja, porque esa plata ya
// está en el banco (para eso está el medio de pago PREPAGADO (BANCO)).
//
// Las tarifas NUNCA se sobrescriben: se cierra la vigente y se abre una nueva, igual
// que lo hace /admin/tarifas.
//
//   npm run tarifas:prepago               → muestra qué cambiaría
//   npm run tarifas:prepago -- --confirmar
import "dotenv/config";
import { prisma } from "../lib/db";
import { mayus } from "../lib/db/mayusculas";

const CONFIRMAR = process.argv.includes("--confirmar");
const cop = (n: number) => "$" + n.toLocaleString("es-CO");
const MOTIVO = "Prepagado: la entrada suma a la venta, el dinero ya está en banco";

/** Igual que el slugify de /admin/tarifas, para que los códigos salgan parejos. */
function slug(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const PLAN: { nombre: string; valor: number; icono: string }[] = [
  { nombre: "Bono Coomeva", valor: 45_000, icono: "🎟️" },
  { nombre: "Bono Comfamiliar", valor: 55_000, icono: "🎟️" },
  { nombre: "Página Web", valor: 60_000, icono: "🌐" },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const destino = url.includes("localhost") || url.includes("127.0.0.1") ? "LOCAL" : "PRODUCCIÓN";
  console.log(`\n🎫 Tarifas prepagadas · base ${destino}\n`);

  const prepagado = await prisma.medioPago.findUnique({ where: { codigo: "prepagado" } });
  console.log(prepagado
    ? `  Medio de pago: ${prepagado.nombre} (no entra al recaudo) ✓`
    : "  ! Falta el medio de pago 'prepagado' — ¿corriste la migración?");

  const tipos = await prisma.tipoVisitante.findMany({ include: { tarifas: { where: { vigente_hasta: null } } } });
  const porNombre = new Map(tipos.map((t) => [mayus(t.nombre), t]));
  const ahora = new Date();
  let cambios = 0;

  for (const p of PLAN) {
    const existente = porNombre.get(mayus(p.nombre));

    if (!existente) {
      console.log(`  ${CONFIRMAR ? "→" : "?"} CREAR  ${p.nombre.padEnd(20)} ${cop(p.valor)}`);
      if (CONFIRMAR) {
        const ultimo = await prisma.tipoVisitante.findFirst({ orderBy: { orden: "desc" }, select: { orden: true } });
        await prisma.$transaction(async (tx) => {
          const t = await tx.tipoVisitante.create({
            data: {
              nombre: p.nombre,
              codigo: slug(p.nombre),
              requiere_pago: true,
              icono: p.icono,
              orden: (ultimo?.orden ?? 0) + 1,
            },
          });
          await tx.tarifa.create({
            data: { tipo_visitante_id: t.id, valor: p.valor, vigente_desde: ahora, motivo_cambio: MOTIVO },
          });
        });
      }
      cambios++;
      continue;
    }

    const vigente = existente.tarifas[0];
    if (vigente?.valor === p.valor) {
      console.log(`  ✓ ${p.nombre.padEnd(20)} ya está en ${cop(p.valor)}`);
      continue;
    }

    console.log(`  ${CONFIRMAR ? "→" : "?"} TARIFA ${p.nombre.padEnd(20)} ${cop(vigente?.valor ?? 0)} → ${cop(p.valor)}`);
    if (CONFIRMAR) {
      await prisma.$transaction(async (tx) => {
        if (vigente) await tx.tarifa.update({ where: { id: vigente.id }, data: { vigente_hasta: ahora } });
        await tx.tarifa.create({
          data: { tipo_visitante_id: existente.id, valor: p.valor, vigente_desde: ahora, motivo_cambio: MOTIVO },
        });
        // El flag se deriva del valor, igual que en /admin/tarifas.
        if (!existente.requiere_pago) {
          await tx.tipoVisitante.update({ where: { id: existente.id }, data: { requiere_pago: true } });
        }
      });
    }
    cambios++;
  }

  console.log(
    CONFIRMAR
      ? `\n✅ ${cambios} cambio(s) aplicados. Las ventas de antes conservan su tarifa vieja.\n`
      : `\n⚠ Simulación: ${cambios} cambio(s). Corre con -- --confirmar para aplicarlo.\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
