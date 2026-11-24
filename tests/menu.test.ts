import { describe, it, expect, vi } from "vitest";

// La sesión lee cookies de Next; para el menú solo importan las funciones de rol.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { construirMenu } from "../lib/menu";
import { enlaceActivo } from "../lib/menu-activo";

const ids = (rol: string) => construirMenu(rol).map((s) => s.id);
const hrefs = (rol: string) => construirMenu(rol).flatMap((s) => (s.href ? [s.href] : (s.grupos ?? []).flatMap((g) => g.enlaces.map((e) => e.href))));

describe("menú lateral", () => {
  it("administrador ve las 9 secciones en el orden acordado", () => {
    expect(ids("administrador")).toEqual([
      "inicio", "taquilla", "equipos", "animales", "vehiculos", "reportes", "financiero", "administracion", "configuracion",
    ]);
  });

  it("no repite enlaces", () => {
    const h = hrefs("administrador");
    expect(new Set(h).size).toBe(h.length);
  });

  it("cada rol ve solo lo suyo (las secciones vacías no salen)", () => {
    expect(ids("granja")).toEqual(["inicio", "animales", "reportes"]);
    expect(ids("consulta")).toContain("financiero");
    expect(hrefs("consulta")).not.toContain("/admin/nomina-presupuesto");
    expect(hrefs("granja")).toContain("/admin/reportes/inventarios");
    expect(ids("chofer")).toEqual(["inicio", "vehiculos"]);
    expect(hrefs("chofer")).toEqual(["/", "/vehiculos/mis-viajes"]);
    expect(hrefs("cajero")).toContain("/taquilla");
    expect(ids("cajero")).not.toContain("configuracion");
    expect(hrefs("supervisor")).not.toContain("/admin/tarifas");
  });

  it("marca el enlace de ruta más larga y respeta la pestaña", () => {
    const menu = construirMenu("administrador");
    expect(enlaceActivo(menu, "/", null)).toBe("/");
    expect(enlaceActivo(menu, "/escaneo/fila", null)).toBe("/escaneo/fila");
    expect(enlaceActivo(menu, "/escaneo", null)).toBe("/escaneo");
    expect(enlaceActivo(menu, "/admin/reportes/cierre/por-caja", null)).toBe("/admin/reportes/cierre");
    expect(enlaceActivo(menu, "/admin/animales", "dieta")).toBe("/admin/animales?tab=dieta");
    expect(enlaceActivo(menu, "/admin/animales", null)).toBe("/admin/animales?tab=inventario");
    expect(enlaceActivo(menu, "/admin/equipos", "grupos")).toBe("/admin/equipos?tab=grupos");
    expect(enlaceActivo(menu, "/login", null)).toBeNull();
  });
});
