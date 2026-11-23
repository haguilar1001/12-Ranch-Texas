import "dotenv/config";
import { prisma } from "../lib/db";

// Pasa los ARRIENDOS de ago–nov 2026 (35.500.000 c/u, del cuadro "mes x producto" de la gerencia)
// a `ventas_otras`, para que se vean y se administren en /admin/ventas-otras. Después hay que
// correr scripts/cuadrar-cuadro-mes-producto.ts --aplicar: al ver estas ventas, quita sus filas de
// ajuste de ARRIENDOS y el total de cada mes no cambia.
//
// Idempotente: no crea una venta si ya hay una activa igual (fecha + línea + descripción).
//
// Uso: tsx scripts/arriendos-2026-ago-nov.ts [--aplicar]

const ARRIENDOS = [
  { fecha: "2026-08-31", mes: "AGOSTO" },
  { fecha: "2026-09-30", mes: "SEPTIEMBRE" },
  { fecha: "2026-10-31", mes: "OCTUBRE" },
  { fecha: "2026-11-30", mes: "NOVIEMBRE" },
];
const VALOR = 35_500_000;

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  for (const a of ARRIENDOS) {
    const descripcion = `ARRIENDOS ${a.mes} 2026 (CUADRO MES X PRODUCTO)`;
    const fecha = new Date(`${a.fecha}T00:00:00Z`);
    const existe = await prisma.ventaOtra.findFirst({ where: { fecha, linea: "ARRIENDOS", descripcion, estado: "activa" } });
    if (existe) {
      console.log(`  = ${a.fecha} ya existe`);
      continue;
    }
    if (aplicar) await prisma.ventaOtra.create({ data: { fecha, linea: "ARRIENDOS", valor: VALOR, descripcion, creado_por: null } });
    console.log(`  ${aplicar ? "✓" : "+"} ${a.fecha} ARRIENDOS ${VALOR.toLocaleString("es-CO")}`);
  }
  if (!aplicar) console.log("Simulación: agrega --aplicar para guardar.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
