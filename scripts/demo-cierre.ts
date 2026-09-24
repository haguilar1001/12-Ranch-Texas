// Llena la base LOCAL con un domingo de operación para poder mirar el informe de
// cierre con datos parecidos a los de verdad: dos cajas, entradas de todos los tipos,
// un grupo con descuento, cortesías, una venta anulada y pagos mixtos.
//
// Se niega a correr contra producción.
//
//   npm run demo:cierre
import "dotenv/config";
import { prisma } from "../lib/db";
import { crearVenta } from "../lib/ventas/registrar";
import type { EntradaLinea } from "../lib/ventas/tipos";


async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error("Este script solo corre contra la base LOCAL. No toca producción.");
  }
  console.log("\n🎪 Domingo de prueba · base LOCAL\n");

  const [usuarios, cajas, tipos, medios, motivos, autorizadores] = await Promise.all([
    prisma.usuario.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    prisma.caja.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    prisma.tipoVisitante.findMany({ where: { activo: true } }),
    prisma.medioPago.findMany({ where: { activo: true } }),
    prisma.motivoCortesia.findMany({ where: { activo: true } }),
    prisma.autorizadorCortesia.findMany({ where: { activo: true } }),
  ]);

  const tipo = (codigo: string) => {
    const t = tipos.find((x) => x.codigo === codigo);
    if (!t) throw new Error(`falta el tipo ${codigo} (corre el seed)`);
    return t;
  };
  const medio = (busca: string) => {
    const m = medios.find((x) => x.nombre.toLowerCase().includes(busca));
    if (!m) throw new Error(`falta el medio de pago ${busca}`);
    return m;
  };

  const efectivo = medio("efectivo");
  const tarjeta = medios.find((m) => !m.es_efectivo) ?? efectivo;
  const motivo = motivos[0];
  const autoriza = autorizadores[0];
  if (!motivo || !autoriza) throw new Error("faltan motivos de cortesía o autorizadores");

  const adulto = tipo("adulto");
  const nino = tipo("nino");
  const mayor = tipo("adulto_mayor");
  const bebe = tipo("bebe");

  // Tarifa vigente de cada tipo, para poder armar los pagos que cuadren.
  const valor = new Map<string, number>();
  for (const t of tipos) {
    const tarifa = await prisma.tarifa.findFirst({
      where: { tipo_visitante_id: t.id, vigente_hasta: null },
      orderBy: { vigente_desde: "desc" },
    });
    valor.set(t.id, tarifa?.valor ?? 0);
  }

  // Dos turnos abiertos, uno por caja, con dos cajeros distintos si los hay.
  const turnos = [];
  for (let i = 0; i < Math.min(2, cajas.length); i++) {
    const u = usuarios[i % usuarios.length];
    const caja = cajas[i];
    let turno = await prisma.turnoCaja.findFirst({
      where: { usuario_id: u.id, estado: { in: ["abierto", "reabierto"] } },
      include: { caja: true },
    });
    if (!turno) {
      turno = await prisma.turnoCaja.create({
        data: { usuario_id: u.id, caja_id: caja.id, estado: "abierto", base_inicial: 300000, abierto_en: new Date(), creado_por: u.id },
        include: { caja: true },
      });
    }
    turnos.push({ turno, usuario: u });
  }
  console.log(`  Turnos listos: ${turnos.map((t) => `${t.turno.caja.nombre} (${t.usuario.nombre})`).join(", ")}`);

  const total = (ls: EntradaLinea[]) =>
    ls.reduce((a, l) => {
      if (l.tipo_linea !== "pago") return a;
      const lista = valor.get(l.tipo_visitante_id) ?? 0;
      return a + (l.valor_cobrado ?? lista) * l.cantidad;
    }, 0);

  /** Grupos de visitantes típicos de un domingo. */
  const guiones: { lineas: EntradaLinea[]; comprador?: string; conTarjeta?: boolean }[] = [];

  // Familias: 2 adultos + 1 a 3 niños, a veces con bebé o abuelo.
  for (let i = 0; i < 18; i++) {
    const ls: EntradaLinea[] = [
      { tipo_visitante_id: adulto.id, cantidad: 2, tipo_linea: "pago" },
      { tipo_visitante_id: nino.id, cantidad: 1 + (i % 3), tipo_linea: "pago" },
    ];
    if (i % 4 === 0) ls.push({ tipo_visitante_id: bebe.id, cantidad: 1, tipo_linea: "pago" });
    if (i % 5 === 0) ls.push({ tipo_visitante_id: mayor.id, cantidad: 1, tipo_linea: "pago" });
    guiones.push({ lineas: ls, comprador: `Familia ${i + 1}`, conTarjeta: i % 3 === 0 });
  }

  // Parejas y grupos de adultos.
  for (let i = 0; i < 10; i++) {
    guiones.push({
      lineas: [{ tipo_visitante_id: adulto.id, cantidad: 2 + (i % 3), tipo_linea: "pago" }],
      conTarjeta: i % 2 === 0,
    });
  }

  // Un colegio: 40 niños y 4 adultos con descuento autorizado.
  guiones.push({
    comprador: "Colegio San José",
    lineas: [
      { tipo_visitante_id: nino.id, cantidad: 40, tipo_linea: "pago", valor_cobrado: 45000, motivo_descuento: "Grupo escolar", autorizado_por: autoriza.id },
      { tipo_visitante_id: adulto.id, cantidad: 4, tipo_linea: "pago", valor_cobrado: 45000, motivo_descuento: "Grupo escolar", autorizado_por: autoriza.id },
    ],
  });

  // Cortesías: reparte clases, motivos y autorizadores para que la relación de
  // atenciones tenga de dónde agrupar.
  const buscarMotivo = (busca: string) =>
    motivos.find((m) => m.nombre.toLowerCase().includes(busca)) ?? motivo;
  const otroAutoriza = autorizadores[1] ?? autoriza;

  const cortesias: { clase: "atencion" | "invitacion" | "cortesia"; motivo: string; quien: string; adultos: number; ninos: number; comprador: string }[] = [
    { clase: "invitacion", motivo: "prensa", quien: autoriza.id, adultos: 2, ninos: 2, comprador: "Prensa — El Heraldo" },
    { clase: "invitacion", motivo: "patrocinador", quien: autoriza.id, adultos: 4, ninos: 6, comprador: "Patrocinador Postobón" },
    { clase: "invitacion", motivo: "convenio", quien: otroAutoriza.id, adultos: 2, ninos: 3, comprador: "Convenio Alcaldía" },
    { clase: "atencion", motivo: "cumpleaños", quien: autoriza.id, adultos: 2, ninos: 1, comprador: "Cumpleaños Martínez" },
    { clase: "atencion", motivo: "comercial", quien: otroAutoriza.id, adultos: 3, ninos: 0, comprador: "Agencia de viajes" },
    { clase: "atencion", motivo: "personal", quien: otroAutoriza.id, adultos: 2, ninos: 2, comprador: "Familia de operario" },
    { clase: "cortesia", motivo: "otro", quien: autoriza.id, adultos: 1, ninos: 0, comprador: "Reposición por lluvia" },
    { clase: "cortesia", motivo: "comercial", quien: autoriza.id, adultos: 2, ninos: 2, comprador: "Queja atención" },
  ];

  for (const c of cortesias) {
    const ls: EntradaLinea[] = [];
    if (c.adultos > 0) {
      ls.push({ tipo_visitante_id: adulto.id, cantidad: c.adultos, tipo_linea: c.clase, motivo_cortesia_id: buscarMotivo(c.motivo).id, autorizado_por: c.quien });
    }
    if (c.ninos > 0) {
      ls.push({ tipo_visitante_id: nino.id, cantidad: c.ninos, tipo_linea: c.clase, motivo_cortesia_id: buscarMotivo(c.motivo).id, autorizado_por: c.quien });
    }
    guiones.push({ lineas: ls, comprador: c.comprador });
  }

  let creadas = 0;
  let anuladas = 0;
  for (const [i, g] of guiones.entries()) {
    const { turno, usuario } = turnos[i % turnos.length];
    const aCobrar = total(g.lineas);
    const pagos = aCobrar === 0
      ? []
      : g.conTarjeta
        ? [{ medio_pago_id: tarjeta.id, monto: aCobrar }]
        : [{ medio_pago_id: efectivo.id, monto: aCobrar }];

    const r = await crearVenta(
      { usuarioId: usuario.id, usuarioNombre: usuario.nombre, usuarioRol: usuario.rol, turnoId: turno.id, cajaNombre: turno.caja.nombre },
      { lineas: g.lineas, pagos, comprador_nombre: g.comprador },
    );
    if (!r.ok) {
      console.log(`  ✗ venta ${i + 1}: ${r.error}`);
      continue;
    }
    creadas++;

    // Una de cada quince se anula, para comprobar que el informe no la cuenta.
    // Solo entre las ventas normales: las cortesías van al final y se dejan vivas.
    if (i > 0 && i % 15 === 0 && i < 28) {
      await prisma.venta.update({
        where: { id: r.venta_id },
        data: { estado: "anulada", motivo_anulacion: "Prueba de anulación", anulada_por: usuario.id, anulada_en: new Date() },
      });
      await prisma.manilla.updateMany({
        where: { venta_detalle: { venta_id: r.venta_id } },
        data: { estado: "anulada", anulada_en: new Date(), anulada_por: usuario.id, motivo_anulacion: "Prueba de anulación" },
      });
      anuladas++;
    }
  }

  console.log(`\n✅ ${creadas} ventas creadas (${anuladas} anuladas a propósito).`);
  console.log("   Mira el informe en /admin/reportes/cierre\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
