import { describe, expect, it } from "vitest";
import { COLUMNAS, claveDuplicado, fecha, leerFilas, normalizar, type Catalogos, type Celda } from "../lib/equipos/importar";

const cat = (): Catalogos => ({
  grupos: new Map([[normalizar("SILLAS Y MESAS"), "g1"], [normalizar("PLANTAS ELÉCTRICAS"), "g2"]]),
  areas: new Map([[normalizar("RESTAURANTE"), "a1"]]),
  empleados: new Map([[normalizar("JUAN PÉREZ"), "e1"]]),
  proveedores: new Map([[normalizar("FERRETERÍA EL SOL"), "p1"]]),
  codigosExistentes: new Set([normalizar("PE-01")]),
});

const encabezado = COLUMNAS.map((c) => (c.obligatoria ? `${c.titulo} *` : c.titulo));
const fila = (datos: Partial<Record<string, Celda>>): Celda[] => COLUMNAS.map((c) => datos[c.clave] ?? null);

describe("carga de equipos desde Excel", () => {
  it("acepta una fila completa y resuelve los catálogos sin importar tildes ni mayúsculas", () => {
    const r = leerFilas([encabezado, fila({
      grupo: "sillas y mesas", nombre: "Silla plástica", cantidad: 20, codigo: "SI-001", marca: "RIMAX",
      area: "restaurante", estado: "operativo", origen: "Compra", proveedor: "ferreteria el sol",
      valor_compra: "$ 45.000", fecha_compra: "15/03/2025", vida_util_meses: 60, responsable: "juan perez",
    })], cat());
    expect(r.errores).toEqual([]);
    expect(r.validas).toHaveLength(1);
    expect(r.validas[0]).toMatchObject({
      categoria_id: "g1", cantidad: 20, area_id: "a1", origen: "compra", proveedor_id: "p1",
      valor_compra: 45000, fecha_compra: "2025-03-15", responsable_id: "e1", estado: "operativo",
    });
  });

  it("los vacíos toman el valor por defecto: operativo y ya estaba", () => {
    const r = leerFilas([encabezado, fila({ grupo: "SILLAS Y MESAS", nombre: "MESA", cantidad: 5 })], cat());
    expect(r.validas[0]).toMatchObject({ estado: "operativo", origen: "saldo_inicial", area_id: null });
  });

  it("reporta los errores con el número de fila de Excel", () => {
    const r = leerFilas([
      encabezado,
      fila({ grupo: "SILLAS Y MESAS", nombre: "MESA", cantidad: 5 }),
      fila({ grupo: "KARTS", nombre: "", cantidad: 0, area: "LUNA", responsable: "NADIE" }),
    ], cat());
    expect(r.validas).toHaveLength(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].fila).toBe(3);
    expect(r.errores[0].errores.join(" ")).toMatch(/KARTS.*no existe/);
    expect(r.errores[0].errores.join(" ")).toMatch(/NOMBRE/);
    expect(r.errores[0].errores.join(" ")).toMatch(/CANTIDAD/);
    expect(r.errores[0].errores.join(" ")).toMatch(/LUNA/);
    expect(r.errores[0].errores.join(" ")).toMatch(/NADIE/);
  });

  it("no deja repetir códigos: ni con lo ya cargado ni dentro del archivo", () => {
    const r = leerFilas([
      encabezado,
      fila({ grupo: "PLANTAS ELÉCTRICAS", nombre: "PLANTA", cantidad: 1, codigo: "pe-01" }),
      fila({ grupo: "SILLAS Y MESAS", nombre: "MESA", cantidad: 1, codigo: "ME-1" }),
      fila({ grupo: "SILLAS Y MESAS", nombre: "MESA", cantidad: 1, codigo: "me-1" }),
    ], cat());
    expect(r.errores.map((e) => e.fila)).toEqual([2, 4]);
    expect(r.errores[1].errores[0]).toMatch(/fila 3/);
  });

  it("ignora filas vacías y avisa los proveedores nuevos", () => {
    const r = leerFilas([
      encabezado,
      fila({}),
      fila({ grupo: "SILLAS Y MESAS", nombre: "MESA", cantidad: 1, proveedor: "Muebles Nuevos" }),
    ], cat());
    expect(r.validas).toHaveLength(1);
    expect(r.validas[0].proveedor_nuevo).toBe("Muebles Nuevos");
    expect(r.avisos[0]).toMatch(/MUEBLES NUEVOS/);
  });

  it("detecta columnas obligatorias que faltan", () => {
    expect(leerFilas([["NOMBRE", "MARCA"]], cat()).faltanColumnas).toEqual(["GRUPO", "CANTIDAD"]);
  });

  it("lee fechas en varios formatos y rechaza las imposibles", () => {
    expect(fecha(new Date(Date.UTC(2025, 2, 15)))).toBe("2025-03-15");
    expect(fecha(45731)).toBe("2025-03-15"); // número serial de Excel
    expect(fecha("2025-03-15")).toBe("2025-03-15");
    expect(fecha("31/02/2025")).toBe("error");
    expect(fecha("mañana")).toBe("error");
  });

  it("avisa (sin bloquear) un posible duplicado sin código", () => {
    const c = { ...cat(), existentes: new Set([claveDuplicado("MESA PLEGABLE", "g1", "Restaurante")]) };
    const r = leerFilas([encabezado, fila({ grupo: "SILLAS Y MESAS", nombre: "mesa plegable", cantidad: 3, ubicacion: "RESTAURANTE" })], c);
    expect(r.validas).toHaveLength(1);
    expect(r.avisos.join(" ")).toMatch(/Posible duplicado: la\(s\) fila\(s\) 2/);
  });
});
