import { describe, expect, it, vi } from "vitest";

const rubrosBD = [
  { id: "g1", nombre: "OPERACIÓN", padre_id: null, orden: 0 },
  { id: "r1", nombre: "ASEO", padre_id: "g1", orden: 0 },
];
vi.mock("@/lib/db", () => ({ prisma: { rubroGasto: { findMany: async () => rubrosBD } } }));

const { aplicarCarga } = await import("@/lib/catalogos/carga-bd");

function txFalso() {
  let n = 0;
  const creados: Record<string, unknown>[] = [];
  const crear = vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const r = { id: `nuevo${++n}`, ...data }; creados.push(r); return r; });
  const tx = {
    rubroGasto: { create: crear, update: vi.fn() },
    proveedor: { findFirst: vi.fn(async () => null), create: crear },
    materiaPrima: { create: crear, update: vi.fn() },
  };
  return { tx, creados };
}

describe("guardar carga de rubros", () => {
  it("crea solo los niveles que faltan, encadenados y sin duplicar", async () => {
    const { tx, creados } = txFalso();
    const r = await aplicarCarga(tx as never, "rubros", [
      { fila: 2, id: null, nombre: "", ruta: ["Operación", "Aseo", "Jabón"], datos: { orden: 2 } },
      { fila: 3, id: null, nombre: "", ruta: ["Mercadeo", "Redes"], datos: {} },
      { fila: 4, id: null, nombre: "", ruta: ["Mercadeo", "Volantes"], datos: {} },
    ], [], "u1");
    expect(creados.map((c) => [c.nombre, c.nivel, c.padre_id])).toEqual([
      ["Jabón", "subrubro", "r1"],
      ["Mercadeo", "grupo", null],
      ["Redes", "rubro", "nuevo2"],
      ["Volantes", "rubro", "nuevo2"],
    ]);
    expect(creados[0].orden).toBe(2);
    expect(r).toEqual({ creados: 4, actualizados: 0 });
  });
});

describe("guardar carga de materias primas", () => {
  it("crea una sola vez el proveedor nuevo y lo enlaza", async () => {
    const { tx, creados } = txFalso();
    await aplicarCarga(tx as never, "materias", [
      { fila: 2, id: null, nombre: "Jabón", datos: { nombre: "Jabón", unidad_medida: "litro" }, proveedor_nuevo: "Ferretería Nueva" },
      { fila: 3, id: null, nombre: "Cloro", datos: { nombre: "Cloro", unidad_medida: "kg" }, proveedor_nuevo: "FERRETERÍA NUEVA" },
    ], [], "u1");
    const proveedores = creados.filter((c) => !("unidad_medida" in c));
    expect(proveedores).toHaveLength(1);
    const materias = creados.filter((c) => "unidad_medida" in c);
    expect(materias.map((m) => m.proveedor_id)).toEqual([proveedores[0].id, proveedores[0].id]);
    expect(materias[0].creado_por).toBe("u1");
  });
});

describe("guardar carga de insumos", () => {
  it("nuevo con conteo → saldo inicial; existente con conteo → ajuste; la existencia queda en lo contado", async () => {
    const movs: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const tx = {
      insumoGranja: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "nuevo", ...data })),
        update: vi.fn(async (a: Record<string, unknown>) => { updates.push(a); return a; }),
      },
      movimientoInsumo: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { movs.push(data); return data; }) },
    };
    await aplicarCarga(tx as never, "insumos", [
      { fila: 2, id: null, nombre: "Citronela", datos: { nombre: "Citronela", categoria: "fumigacion", unidad: "cc" }, existencia: 100 },
      { fila: 3, id: null, nombre: "Vinagre", datos: { nombre: "Vinagre", categoria: "aseo", unidad: "litro" }, existencia: null },
    ], [{ fila: 4, id: "i1", nombre: "Cloro", datos: {}, existencia: 5 }], "u1");
    expect(movs.map((m) => [m.insumo_id, m.tipo, m.cantidad])).toEqual([["nuevo", "saldo_inicial", 100], ["i1", "ajuste", 5]]);
    expect(updates.filter((u) => (u as { data: { existencia?: number } }).data.existencia !== undefined).map((u) => (u as { data: { existencia: number } }).data.existencia)).toEqual([100, 5]);
  });
});
