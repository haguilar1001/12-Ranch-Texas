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
