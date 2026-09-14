import { describe, it, expect } from "vitest";
import { aBase, costoCOP, factorBase, formatearBase, type AlimentoUnidad } from "../lib/animales/unidades";
import {
  cantidadTotalPeriodo,
  consumoBasePeriodo,
  consumoBaseDiario,
  consumoBaseMensual,
  costoMensual,
  cantidadPorEntrega,
  sugerenciaDeEntrega,
  describirRacion,
  type RacionCalculo,
} from "../lib/animales/racion";
import { calcularExistencia, diasDeAutonomia, quedaEnNegativo } from "../lib/animales/existencia";
import { franjasDeCategoria, esConsumoLibre, cantidadPorFranja, franjaMasCercana } from "../lib/animales/auto-alimentacion";

// Alimentos reales del parque (infografía de consumo mensual).
const ITALCAN: AlimentoUnidad = { unidad_medida: "bulto", equivalencia_g: 40_000, costo_unitario: 110_000 };
const LECHE16: AlimentoUnidad = { unidad_medida: "bulto", equivalencia_g: 40_000, costo_unitario: 85_000 };
const PREPICO: AlimentoUnidad = { unidad_medida: "bulto", equivalencia_g: 40_000, costo_unitario: 80_000 };
const CONEJINA: AlimentoUnidad = { unidad_medida: "kg", equivalencia_g: 1_000, costo_unitario: 5_000 };
const SIN_EQUIV: AlimentoUnidad = { unidad_medida: "bulto", equivalencia_g: null, costo_unitario: 90_000 };

describe("unidades de alimento", () => {
  it("convierte kg, g y libras a unidad base", () => {
    expect(aBase(15, "kg", CONEJINA)).toBe(15_000);
    expect(aBase(800, "g", ITALCAN)).toBe(800);
    expect(aBase(2, "lb", CONEJINA)).toBe(1_000);
  });

  it("usa la equivalencia del alimento para su unidad de compra", () => {
    expect(factorBase("bulto", ITALCAN)).toBe(40_000);
    expect(aBase(9, "bulto", PREPICO)).toBe(360_000);
  });

  it("no inventa conversiones cuando falta la equivalencia", () => {
    expect(factorBase("bulto", SIN_EQUIV)).toBeNull();
    expect(aBase(3, "bulto", SIN_EQUIV)).toBeNull();
    expect(costoCOP(1_000, SIN_EQUIV)).toBeNull();
  });

  it("calcula el costo en COP entero", () => {
    expect(costoCOP(360_000, PREPICO)).toBe(720_000); // 9 bultos de gallinas ponedoras
    expect(costoCOP(160_000, LECHE16)).toBe(340_000); // 4 bultos de las cabras
    expect(costoCOP(15_000, CONEJINA)).toBe(75_000); // 15 kg de los conejos
  });

  it("formatea mostrando la presentación de compra", () => {
    expect(formatearBase(8_000, ITALCAN)).toBe("8 kg (0,2 bultos)");
    expect(formatearBase(800, ITALCAN)).toBe("800 g (0,02 bultos)");
    expect(formatearBase(15_000, CONEJINA)).toBe("15 kg");
  });
});

describe("ración individual vs. grupal", () => {
  // Perros: "800 g por animal", 10 cabezas.
  const perros: RacionCalculo = { cantidad: 800, unidad: "g", modo: "individual", frecuencia: "diaria" };
  // Cabras: "5 kg diarios entre el lote", 12 cabezas.
  const cabras: RacionCalculo = { cantidad: 5, unidad: "kg", modo: "grupal", frecuencia: "diaria" };

  it("individual multiplica por el censo del grupo", () => {
    expect(cantidadTotalPeriodo(perros, 10)).toBe(8_000);
    expect(consumoBasePeriodo(perros, 10, ITALCAN)).toBe(8_000);
  });

  it("grupal NO multiplica por el censo", () => {
    expect(cantidadTotalPeriodo(cabras, 12)).toBe(5);
    expect(cantidadTotalPeriodo(cabras, 40)).toBe(5);
    expect(consumoBasePeriodo(cabras, 12, LECHE16)).toBe(5_000);
  });

  it("un grupo sin cabezas no consume nada en modo individual", () => {
    expect(cantidadTotalPeriodo(perros, 0)).toBe(0);
    expect(consumoBaseDiario(perros, 0, ITALCAN)).toBe(0);
  });

  it("reparte la cantidad según la frecuencia", () => {
    // 9 bultos AL MES para las gallinas ponedoras.
    const ponedoras: RacionCalculo = { cantidad: 9, unidad: "bulto", modo: "grupal", frecuencia: "mensual" };
    expect(consumoBasePeriodo(ponedoras, 96, PREPICO)).toBe(360_000);
    expect(consumoBaseDiario(ponedoras, 96, PREPICO)).toBe(12_000); // 12 kg/día
    expect(costoMensual(ponedoras, 96, PREPICO)).toBe(720_000);
  });

  it("escala a mes de 30 días una ración diaria individual", () => {
    expect(consumoBaseMensual(perros, 10, ITALCAN)).toBe(240_000); // 240 kg = 6 bultos
    expect(costoMensual(perros, 10, ITALCAN)).toBe(660_000);
  });

  it("lo que toca entregar HOY prorratea la ración mensual", () => {
    // Perros: 8 bultos AL MES documentados → 10,67 kg por día, no 320 kg.
    const perrosMes: RacionCalculo = { cantidad: 8, unidad: "bulto", modo: "grupal", frecuencia: "mensual" };
    expect(cantidadPorEntrega(perrosMes, 10, ITALCAN)).toBe(10_667);
    expect(sugerenciaDeEntrega(perrosMes, 10, ITALCAN)).toEqual({ cantidad: "10.67", unidad: "kg" });
    // Una ración diaria pequeña se sugiere en gramos.
    expect(sugerenciaDeEntrega(perros, 1, ITALCAN)).toEqual({ cantidad: "800", unidad: "g" });
  });

  it("describe la ración en texto claro", () => {
    expect(describirRacion(perros)).toBe("800 g por cabeza · diaria");
    expect(describirRacion(cabras)).toBe("5 kg al lote · diaria");
  });
});

describe("existencia del alimento (kardex)", () => {
  const d = (dia: number) => new Date(Date.UTC(2026, 7, dia));

  it("suma entradas y resta salidas", () => {
    expect(
      calcularExistencia([
        { tipo: "entrada", cantidad_base: 400_000, fecha: d(1) },
        { tipo: "salida", cantidad_base: 8_000, fecha: d(2) },
        { tipo: "salida", cantidad_base: 8_000, fecha: d(3) },
      ]),
    ).toBe(384_000);
  });

  it("el ajuste por conteo físico fija el saldo", () => {
    expect(
      calcularExistencia([
        { tipo: "entrada", cantidad_base: 400_000, fecha: d(1) },
        { tipo: "ajuste", cantidad_base: 350_000, fecha: d(5) },
        { tipo: "salida", cantidad_base: 10_000, fecha: d(6) },
      ]),
    ).toBe(340_000);
  });

  it("ordena por fecha aunque lleguen desordenados", () => {
    const desordenado = calcularExistencia([
      { tipo: "salida", cantidad_base: 10_000, fecha: d(6) },
      { tipo: "ajuste", cantidad_base: 350_000, fecha: d(5) },
      { tipo: "entrada", cantidad_base: 400_000, fecha: d(1) },
    ]);
    expect(desordenado).toBe(340_000);
  });

  it("avisa cuando la entrega deja el inventario en negativo", () => {
    expect(quedaEnNegativo(5_000, 8_000)).toBe(true);
    expect(quedaEnNegativo(10_000, 8_000)).toBe(false);
    expect(quedaEnNegativo(null, 8_000)).toBe(false); // sin inventario cargado no se bloquea
  });

  it("calcula los días de autonomía", () => {
    expect(diasDeAutonomia(240_000, 8_000)).toBe(30);
    expect(diasDeAutonomia(1_000, 8_000)).toBe(0);
    expect(diasDeAutonomia(null, 8_000)).toBeNull();
    expect(diasDeAutonomia(240_000, 0)).toBeNull();
  });
});

// Los caballos son el mayor gasto de alimento del parque y su dieta tiene dos
// trampas: la alfalfa se compra seca y se entrega humedecida (el bulto rinde el
// doble), y el heno se mide en pacas, no en kilos. Estas pruebas fijan las cifras
// del cuadro de septiembre de 2026 para que un cambio de precio o de censo no las
// mueva sin que nos demos cuenta.
describe("dieta de los equinos (cuadro de septiembre de 2026)", () => {
  // El bulto trae 25 kg en seco y rinde ~50 kg humedecido: la dieta se mide húmeda.
  const ALFALFA: AlimentoUnidad = { unidad_medida: "bulto", equivalencia_g: 50_000, costo_unitario: 101_010 };
  const PODIUM: AlimentoUnidad = { unidad_medida: "bulto", equivalencia_g: 40_000, costo_unitario: 87_360 };
  const BRIO: AlimentoUnidad = { unidad_medida: "bulto", equivalencia_g: 40_000, costo_unitario: 89_985 };
  const BRIOSAL: AlimentoUnidad = { unidad_medida: "bulto", equivalencia_g: 20_000, costo_unitario: 63_000 };
  // La paca no es exacta: 15 kg en promedio. El costo no depende de eso (la dieta
  // se mide en pacas); el peso solo sirve para leer los kilos de la bitácora.
  const HENO: AlimentoUnidad = { unidad_medida: "paca", equivalencia_g: 15_000, costo_unitario: 14_500 };

  const porCabeza = (cantidad: number): RacionCalculo => ({ cantidad, unidad: "kg", modo: "individual", frecuencia: "diaria" });

  it("la alfalfa húmeda de los 60 equinos da 3.180 kg y 63,6 bultos al mes", () => {
    const caballos = consumoBaseMensual(porCabeza(2), 36, ALFALFA)!; // 72 kg/día
    const potros = consumoBaseMensual(porCabeza(2), 10, ALFALFA)!; //   20 kg/día
    const minis = consumoBaseMensual(porCabeza(1), 14, ALFALFA)!; //    14 kg/día
    expect((caballos + potros + minis) / 1_000).toBe(3_180);

    const costo =
      costoMensual(porCabeza(2), 36, ALFALFA)! +
      costoMensual(porCabeza(2), 10, ALFALFA)! +
      costoMensual(porCabeza(1), 14, ALFALFA)!;
    expect(costo).toBe(6_424_236);
  });

  it("el Podium lo comen los 36 caballos y los 14 minis: 91,5 bultos", () => {
    const costo = costoMensual(porCabeza(3), 36, PODIUM)! + costoMensual(porCabeza(1), 14, PODIUM)!;
    expect(costo).toBe(7_993_440);
  });

  it("el Brío Potros es solo de los 10 potros", () => {
    expect(costoMensual(porCabeza(2), 10, BRIO)).toBe(1_349_775);
  });

  it("el Briosal son 40 kg al mes para todo el lote, sin multiplicar por cabezas", () => {
    const racion: RacionCalculo = { cantidad: 40, unidad: "kg", modo: "grupal", frecuencia: "mensual" };
    expect(costoMensual(racion, 60, BRIOSAL)).toBe(126_000);
  });

  it("el heno se mide en pacas: 40 al día son 1.200 al mes y $17.400.000", () => {
    const racion: RacionCalculo = { cantidad: 40, unidad: "paca", modo: "grupal", frecuencia: "diaria" };
    expect(consumoBaseMensual(racion, 60, HENO)! / 15_000).toBe(1_200);
    expect(consumoBaseMensual(racion, 60, HENO)! / 1_000).toBe(18_000); // kg al mes
    expect(costoMensual(racion, 60, HENO)).toBe(17_400_000);
  });

  // La conejina se compra por libras y el cuadro la calculó con la libra imperial
  // (0,4536 kg). El responsable confirmó que es la libra colombiana: 500 g.
  it("la conejina se cobra por libra de 500 g, no por libra imperial", () => {
    const CONEJINA_LIBRA: AlimentoUnidad = { unidad_medida: "libra", equivalencia_g: 500, costo_unitario: 1_785 };
    const racion: RacionCalculo = { cantidad: 500, unidad: "g", modo: "grupal", frecuencia: "diaria" };
    expect(consumoBaseMensual(racion, 7, CONEJINA_LIBRA)! / 500).toBe(30); // 15 kg = 30 libras
    expect(costoMensual(racion, 7, CONEJINA_LIBRA)).toBe(53_550);
  });
});

// Reparto automático de la dieta por franja horaria: los equinos comen 3 veces
// (7 a.m., 12 m., 4 p.m.); el resto, 2 veces (7 a.m., 4 p.m.).
describe("reparto automático por franja horaria", () => {
  it("los equinos tienen 3 franjas; el resto, 2", () => {
    expect(franjasDeCategoria("EQUINOS")).toEqual(["07:00", "12:00", "16:00"]);
    expect(franjasDeCategoria("equinos")).toEqual(["07:00", "12:00", "16:00"]); // sin distinguir mayúsculas
    expect(franjasDeCategoria("BOVINOS")).toEqual(["07:00", "16:00"]);
    expect(franjasDeCategoria("AVES DE CORRAL")).toEqual(["07:00", "16:00"]);
  });

  it("reconoce el consumo libre sin importar mayúsculas o espacios", () => {
    expect(esConsumoLibre("CONSUMO LIBRE")).toBe(true);
    expect(esConsumoLibre(" consumo libre ")).toBe(true);
    expect(esConsumoLibre("6:00 a.m.")).toBe(false);
    expect(esConsumoLibre(null)).toBe(false);
    expect(esConsumoLibre(undefined)).toBe(false);
  });

  it("reparte la ración diaria entre el número de franjas", () => {
    expect(cantidadPorFranja(72_000, 3)).toBe(24_000); // 72 kg/día de alfalfa de los caballos → 24 kg por franja
    expect(cantidadPorFranja(8_000, 2)).toBe(4_000); // 8 kg/día de los perros → 4 kg por franja
    expect(cantidadPorFranja(100, 3)).toBe(33); // no reparte exacto; redondea
    expect(cantidadPorFranja(100, 0)).toBe(0);
  });

  it("ubica la hora real del cron en su franja más cercana, con tolerancia", () => {
    expect(franjaMasCercana("07:00")).toBe("07:00");
    expect(franjaMasCercana("07:05")).toBe("07:00"); // el cron se atrasó un poco
    expect(franjaMasCercana("11:55")).toBe("12:00");
    expect(franjaMasCercana("16:00")).toBe("16:00");
    expect(franjaMasCercana("10:00")).toBeNull(); // no cae cerca de ninguna franja
  });
});
