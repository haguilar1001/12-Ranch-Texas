import { beforeEach, describe, expect, it, vi } from "vitest";

const sesion = { id: "u1", usuario: "ana", nombre: "Ana", rol: "consulta" };
const db = {
  falla: null as null | Record<string, unknown>,
  update: vi.fn(),
  equipoUpdate: vi.fn(),
};
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("@/lib/auth/sesion", () => ({
  obtenerSesion: async () => sesion,
  tieneRol: (rol: string, min: string) => rol === "supervisor" || rol === min,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    reporteFalla: { findUnique: async () => db.falla },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ reporteFalla: { update: db.update }, equipo: { update: db.equipoUpdate } }),
  },
}));

const { editarFalla } = await import("../app/admin/equipos/mantenimiento/actions");

function form(extra: Record<string, string> = {}, fotos = 0) {
  const fd = new FormData();
  fd.set("falla_id", "f1"); fd.set("descripcion", "No arranca"); fd.set("prioridad", "media"); fd.set("detenido", "no");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  for (let i = 0; i < fotos; i++) fd.append("fotos", new File([new Uint8Array([1, 2, 3])], `f${i}.jpg`, { type: "image/jpeg" }));
  return fd;
}

describe("editar reporte de falla", () => {
  beforeEach(() => {
    sesion.id = "u1"; sesion.rol = "consulta";
    db.update.mockReset(); db.equipoUpdate.mockReset();
    db.falla = { id: "f1", equipo_id: "e1", descripcion: "No arranca", prioridad: "media", equipo_detenido: false, estado: "abierta", creado_por: "u1",
      equipo: { estado: "operativo" }, _count: { fotos: 0 } };
  });

  it("quien reportó agrega una foto a un reporte sin fotos", async () => {
    const r = await editarFalla(form({}, 1));
    expect(r.ok).toBe(true);
    expect(db.update.mock.calls[0][0].data.fotos.create).toHaveLength(1);
  });

  it("otro usuario que no es supervisor no puede editar", async () => {
    sesion.id = "otro";
    expect((await editarFalla(form({}, 1))).ok).toBe(false);
    sesion.rol = "supervisor";
    expect((await editarFalla(form({}, 1))).ok).toBe(true);
  });

  it("no pasa de 3 fotos en total", async () => {
    db.falla!._count = { fotos: 2 };
    const r = await editarFalla(form({}, 2));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/máximo es 3/);
  });

  it("cerrado no se edita; en atención solo acepta fotos", async () => {
    db.falla!.estado = "resuelta";
    expect((await editarFalla(form({}, 1))).ok).toBe(false);
    db.falla!.estado = "en_atencion";
    expect((await editarFalla(form({ descripcion: "Otra cosa" }))).ok).toBe(false); // sin cambios aplicables
    const r = await editarFalla(form({ descripcion: "Otra cosa" }, 1));
    expect(r.ok).toBe(true);
    expect(db.update.mock.calls[0][0].data.descripcion).toBeUndefined();
  });

  it("corrige descripción y prioridad; marcar detenido saca el equipo de servicio", async () => {
    const r = await editarFalla(form({ descripcion: "Se apaga", prioridad: "critica", detenido: "si" }));
    expect(r.ok).toBe(true);
    expect(db.update.mock.calls[0][0].data).toMatchObject({ descripcion: "Se apaga", prioridad: "critica", equipo_detenido: true });
    expect(db.equipoUpdate).toHaveBeenCalledOnce();
  });

  it("sin cambios avisa", async () => {
    expect((await editarFalla(form())).error).toMatch(/No hay cambios/);
  });
});
