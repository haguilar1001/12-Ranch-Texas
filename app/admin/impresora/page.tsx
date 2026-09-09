import { redirect } from "next/navigation";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { construirZpl, ZPL_GEO, type DatosManilla } from "@/lib/impresion";
import { formatearFechaHoraBogota } from "@/lib/tiempo";
import ImpresoraClient from "./ImpresoraClient";

export const dynamic = "force-dynamic";

export default async function ImpresoraPage() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  if (!tieneRol(s.rol, "supervisor")) {
    return <main className="p-6"><p className="rounded bg-red-50 px-4 py-3 text-red-700">Solo supervisores y administradores.</p></main>;
  }

  const ahora = new Date();
  // Manilla de PRUEBA. El QR lleva una firma falsa a propósito: si alguien la escanea
  // en la puerta, el lector la rechaza. Sirve para ver calidad de impresión, no para entrar.
  const datos: DatosManilla = {
    parque: "Ranch Texas",
    tipoVisitante: "PRUEBA",
    consecutivo: "0-0",
    payloadQr: "prueba-impresion.no-valida",
    caja: "Diagnóstico",
    cajero: s.nombre,
    emitida: formatearFechaHoraBogota(ahora),
    valida: formatearFechaHoraBogota(ahora),
    esCortesia: false,
  };

  return <ImpresoraClient zplPrueba={construirZpl(datos)} geo={ZPL_GEO} />;
}
