import "dotenv/config";
import { prisma } from "../lib/db";
import { NivelRubro, TipoReglaAcceso } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";
import { filasDimFecha } from "./gen-dim-fecha";
import { CONSENTIMIENTO_TITULO, CONSENTIMIENTO_CUERPO, CONSENTIMIENTO_VERSION } from "./consentimiento-texto";

const DEMO = process.argv.includes("--demo");
const POR = "seed";
const VIGENTE_DESDE = new Date("2020-01-01T00:00:00.000Z");

async function seedUsuarios() {
  const usuario = process.env.SEED_ADMIN_USUARIO ?? "admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Ranch2026*";
  await prisma.usuario.upsert({
    where: { usuario },
    update: {},
    create: {
      nombre: "Administrador",
      usuario,
      hash_password: await hashPassword(password),
      rol: "administrador",
      creado_por: POR,
    },
  });
  console.log(`  ✓ usuario admin: ${usuario}`);

  if (DEMO) {
    const demo: Array<[string, string, "supervisor" | "cajero" | "control_acceso" | "consulta"]> = [
      ["Supervisor Demo", "supervisor", "supervisor"],
      ["Cajero Demo", "cajero", "cajero"],
      ["Control Demo", "control", "control_acceso"],
      ["Consulta Demo", "consulta", "consulta"],
    ];
    for (const [nombre, u, rol] of demo) {
      await prisma.usuario.upsert({
        where: { usuario: u },
        update: {},
        create: { nombre, usuario: u, hash_password: await hashPassword("demo1234"), rol, creado_por: POR },
      });
    }
    console.log("  ✓ usuarios demo (contraseña: demo1234)");
  }
}

async function seedCajas() {
  const count = await prisma.caja.count();
  if (count > 0) return console.log("  · cajas ya existen, se omite");
  for (let i = 1; i <= 6; i++) {
    await prisma.caja.create({ data: { nombre: `Caja ${i}`, creado_por: POR } });
  }
  console.log("  ✓ 6 cajas");
}

async function seedTiposYTarifas() {
  const tipos: Array<{
    codigo: string;
    nombre: string;
    requiere_pago: boolean;
    valor: number;
    edad_min?: number;
    edad_max?: number;
    orden: number;
  }> = [
    { codigo: "adulto", nombre: "Adulto", requiere_pago: true, valor: 60000, orden: 1 },
    { codigo: "nino", nombre: "Niño", requiere_pago: true, valor: 60000, orden: 2 },
    { codigo: "adulto_mayor", nombre: "Adulto Mayor", requiere_pago: false, valor: 0, edad_min: 70, orden: 3 },
    { codigo: "bebe", nombre: "Bebé", requiere_pago: false, valor: 0, edad_max: 2, orden: 4 },
  ];
  for (const t of tipos) {
    const tipo = await prisma.tipoVisitante.upsert({
      where: { codigo: t.codigo },
      update: {},
      create: {
        codigo: t.codigo,
        nombre: t.nombre,
        requiere_pago: t.requiere_pago,
        edad_min: t.edad_min ?? null,
        edad_max: t.edad_max ?? null,
        orden: t.orden,
        creado_por: POR,
      },
    });
    // Tarifa vigente en cada franja (solo si no tiene una abierta). Nace igual en las
    // dos franjas; se diferencia después desde /admin/tarifas.
    for (const dia of ["semana", "fin_semana_festivo"] as const) {
      const abierta = await prisma.tarifa.findFirst({
        where: { tipo_visitante_id: tipo.id, dia_tipo: dia, vigente_hasta: null },
      });
      if (!abierta) {
        await prisma.tarifa.create({
          data: {
            tipo_visitante_id: tipo.id,
            dia_tipo: dia,
            valor: t.valor,
            vigente_desde: VIGENTE_DESDE,
            motivo_cambio: "Tarifa inicial (seed)",
            creado_por: POR,
          },
        });
      }
    }
  }
  console.log("  ✓ tipos de visitante + tarifas (adulto/niño $60.000; bebé y adulto mayor $0; misma tarifa en las dos franjas)");
}

async function seedMediosPago() {
  const medios: Array<[string, string, boolean]> = [
    ["efectivo", "Efectivo", true],
    ["debito", "Tarjeta Débito", false],
    ["credito", "Tarjeta Crédito", false],
    ["nequi", "Nequi", false],
    ["daviplata", "Daviplata", false],
    ["transferencia", "Transferencia", false],
    ["bono", "Bono / Convenio", false],
  ];
  let orden = 1;
  for (const [codigo, nombre, es_efectivo] of medios) {
    await prisma.medioPago.upsert({
      where: { codigo },
      update: {},
      create: { codigo, nombre, es_efectivo, orden: orden++, creado_por: POR },
    });
  }
  console.log("  ✓ medios de pago (provisional, ver decisiones P3)");
}

async function seedMotivosCortesia() {
  const count = await prisma.motivoCortesia.count();
  if (count > 0) return console.log("  · motivos de cortesía ya existen, se omite");
  const motivos = [
    "Cortesía comercial",
    "Patrocinador",
    "Prensa",
    "Cumpleaños",
    "Personal",
    "Convenio",
    "Otro",
  ];
  for (const nombre of motivos) {
    await prisma.motivoCortesia.create({ data: { nombre, creado_por: POR } });
  }
  console.log("  ✓ motivos de cortesía");
}

async function seedAtraccionesYControl() {
  const countA = await prisma.atraccion.count();
  if (countA === 0) {
    // Lista real (responsable, 2026-08-05): atracciones que EXIGEN consentimiento firmado.
    const atracciones = [
      "Mario Karts",
      "Karts Fórmula 1",
      "Karts Buggies",
      "Karts Areneros",
      "Karts Playeros",
      "Motocross",
      "Botes",
      "Paseo Caballo",
      "Paseo Pony",
    ];
    for (const nombre of atracciones) {
      const atr = await prisma.atraccion.create({
        data: { nombre, requiere_consentimiento: true, creado_por: POR },
      });
      await prisma.puntoControl.create({
        data: {
          nombre: `Control ${nombre}`,
          atraccion_id: atr.id,
          tipo_regla: TipoReglaAcceso.reingreso,
          requiere_consentimiento: true,
          creado_por: POR,
        },
      });
    }
    console.log("  ✓ 9 atracciones con consentimiento + sus puntos de control");
  } else {
    console.log("  · atracciones ya existen, se omite");
  }

  const entrada = await prisma.puntoControl.findFirst({ where: { nombre: "Entrada Principal" } });
  if (!entrada) {
    await prisma.puntoControl.create({
      data: {
        nombre: "Entrada Principal",
        tipo_regla: TipoReglaAcceso.entrada_salida, // reingreso el mismo día
        aforo_maximo: 3000,
        creado_por: POR,
      },
    });
    console.log("  ✓ punto de control: Entrada Principal (aforo 3.000, entrada/salida)");
  }
}

async function seedRubrosGasto() {
  const count = await prisma.rubroGasto.count();
  if (count > 0) return console.log("  · rubros de gasto ya existen, se omite");

  const arbol: Record<string, string[]> = {
    "Nómina y prestaciones": ["Salarios", "Seguridad social", "Parafiscales", "Prestaciones", "Dotación", "Horas extras"],
    "Honorarios y servicios profesionales": [],
    "Servicios públicos": ["Energía", "Acueducto", "Gas", "Internet", "Telefonía"],
    "Arriendo y administración": [],
    "Mantenimiento": ["Atracciones", "Infraestructura", "Jardinería", "Piscinas"],
    "Insumos y suministros": ["Aseo", "Cafetería", "Papelería", "Insumos de operación"],
    "Manillas, tirillas y material de taquilla": [],
    "Seguros y pólizas": [],
    "Seguridad y vigilancia": [],
    "Transporte y combustible": [],
    "Publicidad y mercadeo": ["Pauta digital"],
    "Comisiones bancarias y de datáfono": [],
    "Impuestos, tasas y contribuciones": [],
    "Gastos financieros": [],
    "Depreciaciones y amortizaciones": [],
    "Otros gastos": [],
  };

  let ordenG = 1;
  for (const [grupo, rubros] of Object.entries(arbol)) {
    const g = await prisma.rubroGasto.create({
      data: { nombre: grupo, nivel: NivelRubro.grupo, orden: ordenG++, creado_por: POR },
    });
    let ordenR = 1;
    for (const rubro of rubros) {
      await prisma.rubroGasto.create({
        data: { nombre: rubro, nivel: NivelRubro.rubro, padre_id: g.id, orden: ordenR++, creado_por: POR },
      });
    }
  }
  console.log("  ✓ rubros de gasto (grupos + rubros representativos)");
}

async function seedTextoConsentimiento() {
  // Texto legal OFICIAL provisto por el responsable (DIVERSIONES DEL OCCIDENTE S.A.S.).
  // Versionado: se registra como una versión nueva; nunca se sobrescribe una anterior.
  const existe = await prisma.textoConsentimiento.findFirst({
    where: { codigo: "general", version: CONSENTIMIENTO_VERSION },
  });
  if (existe) return console.log("  · texto de consentimiento oficial ya existe, se omite");

  // Cerrar cualquier versión anterior aún abierta.
  await prisma.textoConsentimiento.updateMany({
    where: { codigo: "general", vigente_hasta: null },
    data: { vigente_hasta: new Date(), activo: false },
  });

  await prisma.textoConsentimiento.create({
    data: {
      codigo: "general",
      version: CONSENTIMIENTO_VERSION,
      titulo: CONSENTIMIENTO_TITULO,
      cuerpo: CONSENTIMIENTO_CUERPO,
      activo: true,
      creado_por: POR,
    },
  });
  console.log(`  ✓ texto de consentimiento OFICIAL v${CONSENTIMIENTO_VERSION} (DIVERSIONES DEL OCCIDENTE S.A.S.)`);
}

async function seedDimFecha() {
  const count = await prisma.dimFecha.count();
  if (count > 0) return console.log("  · dim_fecha ya poblada, se omite");
  const filas = filasDimFecha(2023, 2035);
  // createMany en lotes
  const lote = 1000;
  for (let i = 0; i < filas.length; i += lote) {
    await prisma.dimFecha.createMany({ data: filas.slice(i, i + lote), skipDuplicates: true });
  }
  console.log(`  ✓ dim_fecha: ${filas.length} días (2023–2035) con festivos y temporada alta`);
}

async function main() {
  console.log(`\n🌵 Seed Parque Ranch Texas${DEMO ? " (con datos demo)" : ""}\n`);
  await seedUsuarios();
  await seedCajas();
  await seedTiposYTarifas();
  await seedMediosPago();
  await seedMotivosCortesia();
  await seedAtraccionesYControl();
  await seedRubrosGasto();
  await seedTextoConsentimiento();
  await seedDimFecha();
  console.log("\n✅ Seed completado.\n");
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
