// Seed de DATOS INVENTADOS (boceto) para los módulos operativos F10:
//   Personal · Animales · Equipos
// Idempotente por conteo: si un módulo ya tiene filas, se omite.
// Cuando lleguen los datos reales, se cargan por Excel y este seed deja de usarse.
//
//   npx tsx scripts/seed-boceto.ts
import "dotenv/config";
import { prisma } from "../lib/db";

const POR = "seed-boceto";

// ---------------------------------------------------------------- PERSONAL
async function seedPersonal() {
  if ((await prisma.areaTrabajo.count()) > 0) return console.log("  · personal ya existe, se omite");

  const areasDef = [
    "Taquilla",
    "Mantenimiento",
    "Zoológico / Animales",
    "Aseo y Jardinería",
    "Seguridad",
    "Administración",
  ];
  const areas: Record<string, string> = {};
  for (const nombre of areasDef) {
    const a = await prisma.areaTrabajo.create({ data: { nombre, creado_por: POR } });
    areas[nombre] = a.id;
  }

  const cargosDef: Array<[string, string]> = [
    ["Cajero", "Taquilla"],
    ["Supervisor de taquilla", "Taquilla"],
    ["Técnico de mantenimiento", "Mantenimiento"],
    ["Electricista", "Mantenimiento"],
    ["Zootecnista", "Zoológico / Animales"],
    ["Cuidador de animales", "Zoológico / Animales"],
    ["Auxiliar de aseo", "Aseo y Jardinería"],
    ["Jardinero", "Aseo y Jardinería"],
    ["Guarda de seguridad", "Seguridad"],
    ["Administrador", "Administración"],
  ];
  const cargos: Record<string, string> = {};
  for (const [nombre, area] of cargosDef) {
    const c = await prisma.cargo.create({ data: { nombre, area_id: areas[area], creado_por: POR } });
    cargos[nombre] = c.id;
  }

  const empleadosDef: Array<[string, string, string, string]> = [
    // nombre, documento, cargo, area
    ["Carlos Ramírez", "1002345678", "Supervisor de taquilla", "Taquilla"],
    ["Laura Gómez", "1023456789", "Cajero", "Taquilla"],
    ["Andrés Torres", "72345678", "Técnico de mantenimiento", "Mantenimiento"],
    ["Miguel Ospina", "8456123", "Electricista", "Mantenimiento"],
    ["Diana Palacio", "1044567890", "Zootecnista", "Zoológico / Animales"],
    ["José Barrios", "1055678901", "Cuidador de animales", "Zoológico / Animales"],
    ["Yulieth Movilla", "1066789012", "Auxiliar de aseo", "Aseo y Jardinería"],
    ["Rafael Mendoza", "77890123", "Guarda de seguridad", "Seguridad"],
    ["Patricia León", "22345678", "Administrador", "Administración"],
  ];
  for (const [nombre, documento, cargo, area] of empleadosDef) {
    await prisma.empleado.create({
      data: {
        nombre,
        tipo_documento: "CC",
        documento,
        cargo_id: cargos[cargo],
        area_id: areas[area],
        fecha_ingreso: new Date("2025-01-15T00:00:00.000Z"),
        estado: "activo",
        creado_por: POR,
      },
    });
  }
  console.log(`  ✓ personal: ${areasDef.length} áreas, ${cargosDef.length} cargos, ${empleadosDef.length} empleados`);
}

// ---------------------------------------------------------------- ANIMALES
async function seedAnimales() {
  if ((await prisma.categoriaAnimal.count()) > 0) return console.log("  · animales ya existen, se omite");

  const catDef = ["Equinos", "Bovinos", "Aves de corral", "Caprinos", "Porcinos"];
  const cats: Record<string, string> = {};
  for (const nombre of catDef) {
    const c = await prisma.categoriaAnimal.create({ data: { nombre, creado_por: POR } });
    cats[nombre] = c.id;
  }

  const recDef: Array<[string, number]> = [
    ["Establo Principal", 12],
    ["Corral Norte", 20],
    ["Aviario", 60],
    ["Corral Sur", 15],
  ];
  const rec: Record<string, string> = {};
  for (const [nombre, capacidad] of recDef) {
    const r = await prisma.recinto.create({ data: { nombre, capacidad, creado_por: POR } });
    rec[nombre] = r.id;
  }

  const animalesDef: Array<{
    nombre: string;
    codigo: string;
    cat: string;
    recinto: string;
    especie: string;
    sexo: "macho" | "hembra";
  }> = [
    { nombre: "Relámpago", codigo: "EQ-01", cat: "Equinos", recinto: "Establo Principal", especie: "Caballo", sexo: "macho" },
    { nombre: "Lucero", codigo: "EQ-02", cat: "Equinos", recinto: "Establo Principal", especie: "Caballo", sexo: "hembra" },
    { nombre: "Canela", codigo: "PN-01", cat: "Equinos", recinto: "Establo Principal", especie: "Pony", sexo: "hembra" },
    { nombre: "Trueno", codigo: "PN-02", cat: "Equinos", recinto: "Establo Principal", especie: "Pony", sexo: "macho" },
    { nombre: "Manchas", codigo: "BV-01", cat: "Bovinos", recinto: "Corral Norte", especie: "Vaca", sexo: "hembra" },
    { nombre: "Torito", codigo: "BV-02", cat: "Bovinos", recinto: "Corral Norte", especie: "Ternero", sexo: "macho" },
    { nombre: "Copito", codigo: "CP-01", cat: "Caprinos", recinto: "Corral Sur", especie: "Cabra", sexo: "hembra" },
    { nombre: "Pancho", codigo: "PR-01", cat: "Porcinos", recinto: "Corral Sur", especie: "Cerdo", sexo: "macho" },
  ];
  for (const a of animalesDef) {
    await prisma.animal.create({
      data: {
        nombre: a.nombre,
        codigo: a.codigo,
        categoria_id: cats[a.cat],
        recinto_id: rec[a.recinto],
        especie: a.especie,
        sexo: a.sexo,
        estado: "activo",
        fecha_ingreso: new Date("2025-03-01T00:00:00.000Z"),
        creado_por: POR,
      },
    });
  }

  // `equiv` = gramos que trae una unidad de compra; `stock` está en unidades de compra.
  const alimDef: Array<{ nombre: string; tipo: string; unidad: string; costo: number; stock: number; equiv: number }> = [
    { nombre: "Concentrado equino", tipo: "concentrado", unidad: "bulto", costo: 95000, stock: 20, equiv: 40000 },
    { nombre: "Heno / forraje", tipo: "forraje", unidad: "paca", costo: 28000, stock: 40, equiv: 20000 },
    { nombre: "Maíz", tipo: "grano", unidad: "bulto", costo: 110000, stock: 15, equiv: 40000 },
    { nombre: "Concentrado avícola", tipo: "concentrado", unidad: "bulto", costo: 88000, stock: 10, equiv: 40000 },
    { nombre: "Sal mineralizada", tipo: "suplemento", unidad: "bulto", costo: 62000, stock: 8, equiv: 40000 },
    { nombre: "Frutas y verduras", tipo: "fresco", unidad: "kg", costo: 3500, stock: 50, equiv: 1000 },
  ];
  const alim: Record<string, string> = {};
  for (const a of alimDef) {
    const x = await prisma.alimento.create({
      data: {
        nombre: a.nombre, tipo: a.tipo, unidad_medida: a.unidad, costo_unitario: a.costo,
        equivalencia_g: a.equiv, existencia_base: a.stock * a.equiv, creado_por: POR,
      },
    });
    // La existencia inicial también entra al kardex, para que sea recalculable.
    await prisma.movimientoAlimento.create({
      data: { alimento_id: x.id, tipo: "entrada", cantidad_base: a.stock * a.equiv, motivo: "Existencia inicial (seed)", creado_por: POR },
    });
    alim[a.nombre] = x.id;
  }

  const racDef: Array<[string, string, number, string, "individual" | "grupal", string]> = [
    // categoría, alimento, cantidad, unidad, modo, horario
    ["Equinos", "Concentrado equino", 3, "kg", "individual", "6:00 a.m. y 4:00 p.m."],
    ["Equinos", "Heno / forraje", 5, "kg", "individual", "consumo libre"],
    ["Bovinos", "Heno / forraje", 8, "kg", "individual", "consumo libre"],
    ["Bovinos", "Sal mineralizada", 1, "kg", "grupal", "consumo libre"],
    ["Aves de corral", "Concentrado avícola", 1, "kg", "grupal", "7:00 a.m."],
    ["Aves de corral", "Maíz", 1, "kg", "grupal", "3:00 p.m."],
    ["Caprinos", "Heno / forraje", 3, "kg", "individual", "6:00 a.m."],
    ["Porcinos", "Frutas y verduras", 4, "kg", "grupal", "mediodía"],
  ];
  for (const [cat, ali, cantidad, unidad, modo, horario] of racDef) {
    await prisma.racion.create({
      data: { categoria_animal_id: cats[cat], alimento_id: alim[ali], cantidad, unidad, modo, horario, frecuencia: "diaria", creado_por: POR },
    });
  }
  console.log(
    `  ✓ animales: ${catDef.length} categorías, ${recDef.length} recintos, ${animalesDef.length} animales, ${alimDef.length} alimentos, ${racDef.length} raciones`,
  );
}

// ---------------------------------------------------------------- EQUIPOS
async function seedEquipos() {
  if ((await prisma.categoriaEquipo.count()) > 0) return console.log("  · equipos ya existen, se omite");

  const catDef = ["Plantas eléctricas", "Bombas de agua", "Aires acondicionados", "Equipos de sonido", "Refrigeración"];
  const cats: Record<string, string> = {};
  for (const nombre of catDef) {
    const c = await prisma.categoriaEquipo.create({ data: { nombre, creado_por: POR } });
    cats[nombre] = c.id;
  }

  const area = await prisma.areaTrabajo.findFirst({ where: { nombre: "Mantenimiento" } });

  const eqDef: Array<{
    nombre: string;
    codigo: string;
    cat: string;
    marca: string;
    modelo: string;
    ubicacion: string;
    estado: "operativo" | "en_mantenimiento" | "fuera_servicio";
  }> = [
    { nombre: "Planta eléctrica 60 kVA", codigo: "PL-01", cat: "Plantas eléctricas", marca: "Cummins", modelo: "C60D5", ubicacion: "Cuarto de máquinas", estado: "operativo" },
    { nombre: "Planta eléctrica 20 kVA (respaldo)", codigo: "PL-02", cat: "Plantas eléctricas", marca: "Honda", modelo: "EM20", ubicacion: "Bodega", estado: "en_mantenimiento" },
    { nombre: "Bomba sumergible piscina", codigo: "BO-01", cat: "Bombas de agua", marca: "Pedrollo", modelo: "TOP-3", ubicacion: "Piscina principal", estado: "operativo" },
    { nombre: "Bomba de presión riego", codigo: "BO-02", cat: "Bombas de agua", marca: "Barnes", modelo: "IHF-2", ubicacion: "Zona verde", estado: "operativo" },
    { nombre: "Aire acondicionado oficina admin", codigo: "AA-01", cat: "Aires acondicionados", marca: "LG", modelo: "Dual Inverter 24k", ubicacion: "Administración", estado: "operativo" },
    { nombre: "Consola de sonido principal", codigo: "SO-01", cat: "Equipos de sonido", marca: "Yamaha", modelo: "MG16XU", ubicacion: "Tarima central", estado: "operativo" },
    { nombre: "Parlante activo escenario", codigo: "SO-02", cat: "Equipos de sonido", marca: "JBL", modelo: "EON615", ubicacion: "Tarima central", estado: "fuera_servicio" },
    { nombre: "Nevera cafetería", codigo: "RF-01", cat: "Refrigeración", marca: "Haceb", modelo: "Assento", ubicacion: "Cafetería", estado: "operativo" },
  ];
  const eq: Record<string, string> = {};
  for (const e of eqDef) {
    const x = await prisma.equipo.create({
      data: {
        nombre: e.nombre,
        codigo: e.codigo,
        categoria_id: cats[e.cat],
        area_id: area?.id ?? null,
        marca: e.marca,
        modelo: e.modelo,
        ubicacion: e.ubicacion,
        estado: e.estado,
        fecha_instalacion: new Date("2024-11-01T00:00:00.000Z"),
        creado_por: POR,
      },
    });
    eq[e.codigo] = x.id;
  }

  await prisma.mantenimientoEquipo.create({
    data: {
      equipo_id: eq["PL-02"],
      tipo: "correctivo",
      descripcion: "Cambio de aceite y revisión de arranque",
      fecha_programada: new Date("2026-08-10T00:00:00.000Z"),
      estado: "programado",
      responsable: "Andrés Torres",
      costo: 180000,
      creado_por: POR,
    },
  });
  await prisma.mantenimientoEquipo.create({
    data: {
      equipo_id: eq["PL-01"],
      tipo: "preventivo",
      descripcion: "Mantenimiento trimestral (filtros, refrigerante)",
      fecha_programada: new Date("2026-07-01T00:00:00.000Z"),
      fecha_realizada: new Date("2026-07-03T00:00:00.000Z"),
      estado: "realizado",
      responsable: "Andrés Torres",
      costo: 250000,
      creado_por: POR,
    },
  });
  console.log(`  ✓ equipos: ${catDef.length} categorías, ${eqDef.length} equipos, 2 mantenimientos`);
}

async function main() {
  console.log("\n🌵 Seed BOCETO (datos inventados) — Personal · Animales · Equipos\n");
  await seedPersonal();
  await seedAnimales();
  await seedEquipos();
  console.log("\n✅ Seed boceto completado.\n");
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed boceto:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
