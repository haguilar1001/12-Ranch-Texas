import "dotenv/config";
import { prisma } from "../lib/db";
import { crearVenta } from "../lib/ventas/registrar";
import { procesarEscaneo, type ResultadoEscaneo } from "../lib/acceso/procesar";
import type { EntradaVenta } from "../lib/ventas/tipos";

// Verificación determinista de F3 (control de acceso) contra la BD local.

function esOk(r: unknown): r is ResultadoEscaneo {
  return !!r && typeof r === "object" && "permitido" in r;
}

async function main() {
  console.log("\n🚪 Verificación F3 — control de acceso\n");

  const turno = await prisma.turnoCaja.findFirstOrThrow({ where: { estado: "abierto" }, include: { caja: true, usuario: true } });
  const tipos = await prisma.tipoVisitante.findMany();
  const idDe = (c: string) => tipos.find((t) => t.codigo === c)!.id;
  const efectivo = await prisma.medioPago.findFirstOrThrow({ where: { codigo: "efectivo" } });

  const entrada: EntradaVenta = {
    lineas: [{ tipo_visitante_id: idDe("adulto"), cantidad: 2, tipo_linea: "pago" }],
    pagos: [{ medio_pago_id: efectivo.id, monto: 120000 }],
  };
  const venta = await crearVenta({ usuarioId: turno.usuario_id, usuarioNombre: turno.usuario.nombre, usuarioRol: turno.usuario.rol, turnoId: turno.id, cajaNombre: turno.caja.nombre }, entrada);
  if (!venta.ok) throw new Error("No se pudo crear la venta");

  const manillas = await prisma.manilla.findMany({ where: { venta_detalle: { venta_id: venta.venta_id } } });
  const [m1, m2] = manillas;
  const pl = (m: typeof m1) => `${m.codigo_uuid}.${m.firma_hmac}`;

  const entradaPrincipal = await prisma.puntoControl.findFirstOrThrow({ where: { nombre: "Entrada Principal" } });
  const puntoConsent = await prisma.puntoControl.findFirstOrThrow({ where: { requiere_consentimiento: true } });

  const accesoIds: string[] = [];
  const usuario = turno.usuario_id;
  const scan = async (puntoId: string, payload: string) => {
    const r = await procesarEscaneo(usuario, puntoId, payload);
    if (esOk(r)) accesoIds.push(r.acceso_id);
    return r;
  };
  const check = (cond: boolean, msg: string) => { console.log(`  ${cond ? "✓" : "✗"} ${msg}`); if (!cond) throw new Error("FALLO: " + msg); };

  // 1) Entrada / salida alternada + aforo
  const r1 = await scan(entradaPrincipal.id, pl(m1));
  check(esOk(r1) && r1.permitido && r1.sentido === "entrada", `1ª pasada = ENTRADA permitida (aforo ${esOk(r1) ? r1.aforoActual : "?"})`);
  const r2 = await scan(entradaPrincipal.id, pl(m1));
  check(esOk(r2) && r2.permitido && r2.sentido === "salida", "2ª pasada misma manilla = SALIDA");
  const r3 = await scan(entradaPrincipal.id, pl(m1));
  check(esOk(r3) && r3.permitido && r3.sentido === "entrada", `3ª pasada = ENTRADA (aforo neto ${esOk(r3) ? r3.aforoActual : "?"})`);
  check(esOk(r3) && r3.aforoActual === 1, "aforo neto de la entrada = 1");

  // 2) Firma inválida
  const r4 = await scan(entradaPrincipal.id, "00000000-0000-0000-0000-000000000000.firmafalsa");
  check(esOk(r4) && !r4.permitido && r4.motivo === "Código inválido o falsificado", "QR falsificado = DENEGADO (firma inválida)");

  // 3) Punto que requiere consentimiento, sin firmarlo
  const r5 = await scan(puntoConsent.id, pl(m2));
  check(esOk(r5) && !r5.permitido && r5.motivo === "Falta consentimiento firmado", `${puntoConsent.nombre}: sin consentimiento = DENEGADO`);

  // 4) Manilla anulada
  await prisma.manilla.update({ where: { id: m2.id }, data: { estado: "anulada" } });
  const r6 = await scan(entradaPrincipal.id, pl(m2));
  check(esOk(r6) && !r6.permitido && r6.motivo === "Manilla anulada", "Manilla anulada = DENEGADO");

  // Limpieza
  await prisma.acceso.deleteMany({ where: { id: { in: accesoIds } } });
  await prisma.$transaction([
    prisma.impresion.deleteMany({ where: { manilla_id: { in: manillas.map((m) => m.id) } } }),
    prisma.manilla.deleteMany({ where: { id: { in: manillas.map((m) => m.id) } } }),
    prisma.ventaDetalle.deleteMany({ where: { venta_id: venta.venta_id } }),
    prisma.ventaPago.deleteMany({ where: { venta_id: venta.venta_id } }),
    prisma.venta.delete({ where: { id: venta.venta_id } }),
  ]);
  console.log("  ✓ Limpieza completada");

  console.log("\n✅ F3 verificado.\n");
}

main()
  .catch((e) => { console.error("❌", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
