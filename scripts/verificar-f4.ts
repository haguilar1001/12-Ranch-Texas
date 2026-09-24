import "dotenv/config";
import { prisma } from "../lib/db";
import { crearVenta } from "../lib/ventas/registrar";
import { firmar } from "../lib/consentimiento/registrar";
import { procesarEscaneo, type ResultadoEscaneo } from "../lib/acceso/procesar";
import type { EntradaVenta } from "../lib/ventas/tipos";

const FIRMA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function esOk(r: unknown): r is ResultadoEscaneo {
  return !!r && typeof r === "object" && "permitido" in r;
}

async function main() {
  console.log("\n✍️  Verificación F4 — consentimientos\n");
  const check = (cond: boolean, msg: string) => { console.log(`  ${cond ? "✓" : "✗"} ${msg}`); if (!cond) throw new Error("FALLO: " + msg); };

  const turno = await prisma.turnoCaja.findFirstOrThrow({ where: { estado: "abierto" }, include: { caja: true, usuario: true } });
  const tipos = await prisma.tipoVisitante.findMany();
  const efectivo = await prisma.medioPago.findFirstOrThrow({ where: { codigo: "efectivo" } });
  const entrada: EntradaVenta = {
    lineas: [{ tipo_visitante_id: tipos.find((t) => t.codigo === "adulto")!.id, cantidad: 1, tipo_linea: "pago" }],
    pagos: [{ medio_pago_id: efectivo.id, monto: 60000 }],
  };
  const venta = await crearVenta({ usuarioId: turno.usuario_id, usuarioNombre: turno.usuario.nombre, usuarioRol: turno.usuario.rol, turnoId: turno.id, cajaNombre: turno.caja.nombre }, entrada);
  if (!venta.ok) throw new Error("venta");
  const manilla = await prisma.manilla.findFirstOrThrow({ where: { venta_detalle: { venta_id: venta.venta_id } } });
  const payload = `${manilla.codigo_uuid}.${manilla.firma_hmac}`;

  const punto = await prisma.puntoControl.findFirstOrThrow({ where: { requiere_consentimiento: true, atraccion_id: { not: null } } });
  const atraccionId = punto.atraccion_id!;
  const accesoIds: string[] = [];

  // 1) Antes de firmar: acceso denegado por falta de consentimiento
  const antes = await procesarEscaneo(turno.usuario_id, punto.id, payload);
  if (esOk(antes)) accesoIds.push(antes.acceso_id);
  check(esOk(antes) && !antes.permitido && antes.motivo === "Falta consentimiento firmado", "Sin firmar → acceso DENEGADO (falta consentimiento)");

  // 2) Firmar el consentimiento (adulto)
  const f1 = await firmar({ payload, atraccion_id: atraccionId, nombre_firmante: "Juan Pérez", documento_firmante: "1234567", es_menor: false, acepta: true, firma_imagen: FIRMA }, { ip: "10.0.0.1", userAgent: "test" });
  check(f1.ok && !("yaExistia" in f1 && f1.yaExistia), "Consentimiento firmado y guardado");

  const consent = await prisma.consentimiento.findFirstOrThrow({ where: { manilla_id: manilla.id, atraccion_id: atraccionId } });
  check(consent.nombre_firmante === "Juan Pérez" && consent.texto_consentimiento_id != null, "Consentimiento con firmante y versión de texto");

  // 3) Después de firmar: acceso permitido
  const despues = await procesarEscaneo(turno.usuario_id, punto.id, payload);
  if (esOk(despues)) accesoIds.push(despues.acceso_id);
  check(esOk(despues) && despues.permitido, "Ya firmado → acceso PERMITIDO (desbloqueado)");

  // 4) Menor de edad (otra atracción con consentimiento)
  const punto2 = await prisma.puntoControl.findFirst({ where: { requiere_consentimiento: true, atraccion_id: { not: atraccionId } } });
  const atraccion2 = punto2?.atraccion_id;
  if (atraccion2) {
    const f2 = await firmar({ payload, atraccion_id: atraccion2, nombre_firmante: "Pedrito", documento_firmante: "TI-999", es_menor: true, nombre_acudiente: "María", documento_acudiente: "555", parentesco: "Madre", acepta: true, firma_imagen: FIRMA });
    check(f2.ok, "Consentimiento de menor firmado");
    const cm = await prisma.consentimiento.findFirstOrThrow({ where: { manilla_id: manilla.id, atraccion_id: atraccion2 } });
    check(cm.es_menor && cm.nombre_acudiente === "María", "Menor marcado con datos del acudiente");
  }

  // 5) Idempotencia: firmar de nuevo la misma atracción
  const f3 = await firmar({ payload, atraccion_id: atraccionId, nombre_firmante: "Juan Pérez", documento_firmante: "1234567", es_menor: false, acepta: true, firma_imagen: FIRMA });
  check(f3.ok && "yaExistia" in f3 && f3.yaExistia, "Re-firmar la misma atracción es idempotente (no duplica)");

  // Limpieza
  await prisma.acceso.deleteMany({ where: { id: { in: accesoIds } } });
  await prisma.consentimiento.deleteMany({ where: { manilla_id: manilla.id } });
  await prisma.impresion.deleteMany({ where: { manilla_id: manilla.id } });
  await prisma.manilla.deleteMany({ where: { id: manilla.id } });
  await prisma.ventaDetalle.deleteMany({ where: { venta_id: venta.venta_id } });
  await prisma.ventaPago.deleteMany({ where: { venta_id: venta.venta_id } });
  await prisma.venta.delete({ where: { id: venta.venta_id } });
  console.log("  ✓ Limpieza completada");

  console.log("\n✅ F4 verificado.\n");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
