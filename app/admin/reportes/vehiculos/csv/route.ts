import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { indicadoresVehiculos } from "@/lib/reportes/vehiculos";
import { fechaBogota } from "@/lib/tiempo";
import { rangoDe } from "../../periodo";

export async function GET(req: Request) {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "consulta")) return new Response("No autorizado", { status: 401 });

  const url = new URL(req.url);
  const rango = rangoDe(
    { anio: url.searchParams.get("anio") ?? undefined, mes: url.searchParams.get("mes") ?? undefined, fecha: url.searchParams.get("fecha"), dia: url.searchParams.get("dia") },
    fechaBogota(),
  );
  const ind = await indicadoresVehiculos(rango.inicio, rango.fin);

  const filas: string[][] = [
    [`Control Vehículo — uso ${rango.etiqueta}`],
    ["Viajes cerrados", String(ind.totalViajes)],
    ["Kilómetros recorridos", String(ind.kmTotales)],
    [],
    ["Por solicitante", "Viajes", "Km"],
    ...ind.porSolicitante.map((f) => [f.nombre, String(f.viajes), String(f.km)]),
    [],
    ["Por chofer", "Viajes", "Km"],
    ...ind.porChofer.map((f) => [f.nombre, String(f.viajes), String(f.km)]),
    [],
    ["Por vehículo", "Viajes", "Km"],
    ...ind.porVehiculo.map((f) => [f.nombre, String(f.viajes), String(f.km)]),
  ];
  const csv = "﻿" + filas.map((f) => f.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");

  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="vehiculos-${rango.clave}.csv"` },
  });
}
