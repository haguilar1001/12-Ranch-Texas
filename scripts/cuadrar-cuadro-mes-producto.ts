import "dotenv/config";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { LINEAS_TAQUILLA, inicioTaquilla, mesUsaTaquilla, taquillaPorMesYLinea } from "../lib/reportes/comparativo";

// Cuadra `ventas_historicas` contra los cuadros "mes x producto" de la gerencia
// (p. ej. D:\Escritorio\mes-x-producto-ranch-2026.xlsx: Mes | Total | ENTRADAS | EVENTOS | ARRIENDOS…).
//
// Por cada año/mes/producto calcula la diferencia entre el cuadro y lo que ya hay en el histórico
// (de cualquier otro origen) y la guarda como fila de AJUSTE con origen `cuadro:<archivo>`, fechada
// el último día del mes. Es idempotente: primero descarta sus propias filas y vuelve a calcular,
// así que se puede correr de nuevo tras reimportar el Excel fuente sin duplicar nada.
//
// ENTRADAS y EVENTOS de los meses que ya salen de la taquilla (desde el primer mes completo, ver
// lib/reportes/comparativo.ts) NO se ajustan: para esos meses el script solo informa taquilla vs. cuadro.
//
// Uso:
//   tsx scripts/cuadrar-cuadro-mes-producto.ts <cuadro.xlsx> [<cuadro2.xlsx> …]            # simulación
//   tsx scripts/cuadrar-cuadro-mes-producto.ts <cuadro.xlsx> [<cuadro2.xlsx> …] --aplicar  # escribe

const prisma = new PrismaClient();
const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const NEGOCIO = "RANCH TEXAS";
const fmt = (n: number) => "$ " + Math.round(n).toLocaleString("es-CO");

interface Celda { anio: number; mes: number; producto: string; valor: number }

function leerCuadro(archivo: string): { anio: number; celdas: Celda[]; totales: Map<number, number> } {
  const wb = XLSX.readFile(archivo);
  const hoja = wb.SheetNames[0];
  const anio = parseInt(/\d{4}/.exec(hoja)?.[0] ?? /\d{4}/.exec(path.basename(archivo))?.[0] ?? "", 10);
  if (!anio) throw new Error(`No se pudo deducir el año de ${archivo}`);
  const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, raw: true });
  const iEnc = filas.findIndex((f) => String(f?.[0] ?? "").trim().toUpperCase() === "MES");
  if (iEnc < 0) throw new Error(`No se encontró el encabezado "Mes" en ${archivo}`);
  const enc = filas[iEnc].map((v) => String(v ?? "").trim().toUpperCase());
  const celdas: Celda[] = [];
  const totales = new Map<number, number>();
  for (const f of filas.slice(iEnc + 1)) {
    const mes = MESES.indexOf(String(f?.[0] ?? "").trim().toUpperCase()) + 1;
    if (mes < 1) continue;
    enc.forEach((col, j) => {
      const v = Number(f[j]);
      if (j === 0 || !col || !Number.isFinite(v) || v === 0) return;
      if (col === "TOTAL") totales.set(mes, Math.round(v));
      else celdas.push({ anio, mes, producto: col, valor: Math.round(v) });
    });
  }
  return { anio, celdas, totales };
}

async function main() {
  const args = process.argv.slice(2);
  const aplicar = args.includes("--aplicar");
  const archivos = args.filter((a) => !a.startsWith("--"));
  if (!archivos.length) throw new Error("Indica al menos un cuadro .xlsx");

  for (const archivo of archivos) {
    const origen = `cuadro:${path.basename(archivo)}`;
    const { anio, celdas, totales } = leerCuadro(archivo);
    console.log(`\n=== ${path.basename(archivo)} (${anio}) ${aplicar ? "— APLICANDO" : "— simulación"} ===`);

    const [hist, taqLineas, inicio] = await Promise.all([
      prisma.ventaHistorica.groupBy({
        by: ["mes", "producto"],
        where: { anio, negocio: NEGOCIO, NOT: { origen } },
        _sum: { valor: true },
      }),
      taquillaPorMesYLinea(anio),
      inicioTaquilla(),
    ]);
    const usa = (mes: number) => mesUsaTaquilla(inicio, anio, mes);
    const deTaquilla = (p: string) => (LINEAS_TAQUILLA as readonly string[]).includes(p);
    // Meses de taquilla: taquilla (entradas + eventos) vs. ENTRADAS + EVENTOS del cuadro.
    for (let mes = 1; mes <= 12; mes++) {
      if (!usa(mes) || !totales.has(mes)) continue;
      const taq = taqLineas[mes - 1].ENTRADAS + taqLineas[mes - 1].EVENTOS;
      const cuadro = celdas.filter((c) => c.mes === mes && deTaquilla(c.producto)).reduce((s, c) => s + c.valor, 0);
      const d = taq - cuadro;
      console.log(`  ${MESES[mes - 1]} taquilla ${fmt(taq)} vs cuadro ENTRADAS+EVENTOS ${fmt(cuadro)}  dif ${fmt(d)}${d === 0 ? "  ✓" : "  ⚠"}`);
    }
    const enHist = new Map(hist.map((r) => [`${r.mes}|${r.producto}`, r._sum.valor ?? 0]));

    const ajustes: Celda[] = [];
    for (const c of celdas) {
      const actual = enHist.get(`${c.mes}|${c.producto}`) ?? 0;
      if (usa(c.mes) && deTaquilla(c.producto)) continue;
      const dif = c.valor - actual;
      if (dif !== 0) {
        ajustes.push({ ...c, valor: dif });
        console.log(`  ${MESES[c.mes - 1]} ${c.producto.padEnd(11)} histórico ${fmt(actual)} → cuadro ${fmt(c.valor)}  ajuste ${fmt(dif)}`);
      }
    }
    // Productos del histórico que el cuadro no trae ese mes (quedarían de más).
    for (const [k, v] of enHist) {
      const [mes, producto] = k.split("|");
      const m = Number(mes);
      if (!totales.has(m) || v === 0) continue;
      if (usa(m) && deTaquilla(producto)) continue;
      if (!celdas.some((c) => c.mes === m && c.producto === producto)) {
        console.log(`  ⚠ ${MESES[m - 1]} ${producto}: ${fmt(v)} en el histórico pero no en el cuadro (no se toca)`);
      }
    }
    if (!ajustes.length) console.log("  Sin ajustes: el histórico ya cuadra con el cuadro.");

    if (aplicar) {
      await prisma.$transaction(async (tx) => {
        await tx.ventaHistorica.deleteMany({ where: { origen } });
        if (ajustes.length) {
          await tx.ventaHistorica.createMany({
            data: ajustes.map((a) => ({
              fecha: new Date(Date.UTC(a.anio, a.mes, 0)), // último día del mes
              anio: a.anio,
              mes: a.mes,
              producto: a.producto,
              valor: a.valor,
              negocio: NEGOCIO,
              origen,
            })),
          });
        }
      }, { timeout: 120_000, maxWait: 20_000 });
      console.log(`  ✓ ${ajustes.length} filas de ajuste guardadas (origen "${origen}")`);
    }
  }
  if (!aplicar) console.log("\nSimulación: no se escribió nada. Agrega --aplicar para guardar.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
