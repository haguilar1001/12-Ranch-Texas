import "dotenv/config";
import { prisma } from "../lib/db";
import { crearVenta } from "../lib/ventas/registrar";
import { procesarEscaneo, type ResultadoEscaneo } from "../lib/acceso/procesar";
import type { EntradaVenta } from "../lib/ventas/tipos";

function esOk(r: unknown): r is ResultadoEscaneo { return !!r && typeof r === "object" && "permitido" in r; }

async function main() {
  console.log("\n📶 Verificación F9 — sincronización offline (idempotencia)\n");
  const check = (cond: boolean, msg: string) => { console.log(`  ${cond ? "✓" : "✗"} ${msg}`); if (!cond) throw new Error("FALLO: " + msg); };

  const turno = await prisma.turnoCaja.findFirstOrThrow({ where: { estado: "abierto" }, include: { caja: true, usuario: true } });
  const tipos = await prisma.tipoVisitante.findMany();
  const efectivo = await prisma.medioPago.findFirstOrThrow({ where: { codigo: "efectivo" } });
  const entrada: EntradaVenta = { lineas: [{ tipo_visitante_id: tipos.find((t) => t.codigo === "adulto")!.id, cantidad: 1, tipo_linea: "pago" }], pagos: [{ medio_pago_id: efectivo.id, monto: 60000 }] };
  const venta = await crearVenta({ usuarioId: turno.usuario_id, usuarioNombre: turno.usuario.nombre, usuarioRol: turno.usuario.rol, turnoId: turno.id, cajaNombre: turno.caja.nombre }, entrada);
  if (!venta.ok) throw new Error("venta");
  const manilla = await prisma.manilla.findFirstOrThrow({ where: { venta_detalle: { venta_id: venta.venta_id } } });
  const payload = `${manilla.codigo_uuid}.${manilla.firma_hmac}`;

  const entradaPrincipal = await prisma.puntoControl.findFirstOrThrow({ where: { nombre: "Entrada Principal" } });
  const idCliente = "test-offline-" + manilla.id;
  const cuando = new Date(Date.now() - 3600000); // hace 1 hora (escaneo offline previo)

  // 1) Primer sync del escaneo offline
  const r1 = await procesarEscaneo(turno.usuario_id, entradaPrincipal.id, payload, "offline", { idCliente, escaneadoEn: cuando, sincronizado: true });
  check(esOk(r1) && r1.permitido, "Escaneo offline sincronizado → PERMITIDO");

  // 2) Reenvío del mismo escaneo (id_cliente repetido) → idempotente
  const r2 = await procesarEscaneo(turno.usuario_id, entradaPrincipal.id, payload, "offline", { idCliente, escaneadoEn: cuando, sincronizado: true });
  check(esOk(r2) && r2.acceso_id === (esOk(r1) ? r1.acceso_id : ""), "Reenvío con misma id_cliente devuelve el MISMO acceso (idempotente)");

  const cuantos = await prisma.acceso.count({ where: { id_cliente: idCliente } });
  check(cuantos === 1, `Solo 1 acceso registrado para la id_cliente (${cuantos})`);

  const acc = await prisma.acceso.findUniqueOrThrow({ where: { id_cliente: idCliente } });
  check(acc.sincronizado === true && Math.abs(acc.escaneado_en.getTime() - cuando.getTime()) < 1000, "Guarda la hora real del evento y marca sincronizado");

  // Limpieza
  await prisma.acceso.deleteMany({ where: { manilla_id: manilla.id } });
  await prisma.impresion.deleteMany({ where: { manilla_id: manilla.id } });
  await prisma.manilla.deleteMany({ where: { id: manilla.id } });
  await prisma.ventaDetalle.deleteMany({ where: { venta_id: venta.venta_id } });
  await prisma.ventaPago.deleteMany({ where: { venta_id: venta.venta_id } });
  await prisma.venta.delete({ where: { id: venta.venta_id } });
  console.log("  ✓ Limpieza completada");
  console.log("\n✅ F9 verificado.\n");
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
