import { describe, it, expect } from "vitest";
import { aMayusculas, mayus, CAMPOS_MAYUSCULAS } from "../lib/db/mayusculas";

describe("texto a mayúsculas al guardar", () => {
  it("sube el texto y le quita los espacios de los bordes", () => {
    expect(mayus("  maría josé camargo ")).toBe("MARÍA JOSÉ CAMARGO");
    expect(mayus("niño")).toBe("NIÑO");
  });

  it("sube los campos del modelo y deja los demás quietos", () => {
    const r = aMayusculas("Venta", {
      comprador_nombre: "familia martínez",
      comprador_documento: "cc 1234",
      comprador_email: "Correo@Gmail.com",
      comprador_celular: "3001234567",
      total_cobrado: 120000,
    });
    expect(r).toEqual({
      comprador_nombre: "FAMILIA MARTÍNEZ",
      comprador_documento: "CC 1234",
      comprador_email: "Correo@Gmail.com",
      comprador_celular: "3001234567",
      total_cobrado: 120000,
    });
  });

  it("un modelo que no está en la lista pasa intacto", () => {
    const data = { payload: "^XA^FO20,20^A0N,30^FDmanilla^FS^XZ" };
    expect(aMayusculas("Impresion", data)).toBe(data);
  });

  it("no toca el código de tipo de visitante, que el código compara", () => {
    const r = aMayusculas("TipoVisitante", { nombre: "bebé", codigo: "bebe", icono: "👶" });
    expect(r).toEqual({ nombre: "BEBÉ", codigo: "bebe", icono: "👶" });
  });

  it("no toca la firma del QR ni el uuid de la manilla", () => {
    const data = { codigo_uuid: "a1b2-c3d4", firma_hmac: "aB9xYz", motivo_anulacion: "mal impresa" };
    expect(aMayusculas("Manilla", data)).toEqual({
      codigo_uuid: "a1b2-c3d4",
      firma_hmac: "aB9xYz",
      motivo_anulacion: "MAL IMPRESA",
    });
  });

  it("no toca el usuario de login ni el hash de la clave", () => {
    const r = aMayusculas("Usuario", { nombre: "ana lópez", usuario: "alopez", hash_password: "$2a$10$Abc" });
    expect(r).toEqual({ nombre: "ANA LÓPEZ", usuario: "alopez", hash_password: "$2a$10$Abc" });
  });

  it("no toca los ids de llave foránea que viajan como texto", () => {
    const r = aMayusculas("VentaDetalle", {
      motivo_descuento: "grupo escolar",
      autorizado_por: "d205b99e-9e39-4eab-af32-4ac726eee03a",
      tipo_visitante_id: "9f8e7d6c",
    });
    expect(r).toEqual({
      motivo_descuento: "GRUPO ESCOLAR",
      autorizado_por: "d205b99e-9e39-4eab-af32-4ac726eee03a",
      tipo_visitante_id: "9f8e7d6c",
    });
  });

  it("entiende la forma { campo: { set: ... } } de los updates", () => {
    expect(aMayusculas("Caja", { nombre: { set: "caja principal" } })).toEqual({
      nombre: { set: "CAJA PRINCIPAL" },
    });
  });

  it("deja pasar null, undefined y lo que no sea objeto", () => {
    expect(aMayusculas("Venta", { comprador_nombre: null })).toEqual({ comprador_nombre: null });
    expect(aMayusculas("Venta", undefined)).toBeUndefined();
    expect(aMayusculas(undefined, { nombre: "ana" })).toEqual({ nombre: "ana" });
  });

  it("no crea una copia si no había nada que cambiar", () => {
    const data = { nombre: "CAJA 1" };
    expect(aMayusculas("Caja", data)).toBe(data);
  });

  it("la lista no incluye campos que romperían la app", () => {
    const prohibidos = ["codigo_uuid", "firma_hmac", "payload", "hash_password", "usuario", "email", "cuerpo", "firma_imagen", "icono"];
    for (const [modelo, campos] of Object.entries(CAMPOS_MAYUSCULAS)) {
      for (const campo of campos) {
        expect(prohibidos, `${modelo}.${campo}`).not.toContain(campo);
        expect(campo.endsWith("_id"), `${modelo}.${campo}`).toBe(false);
      }
    }
  });
});
