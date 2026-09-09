import { prisma } from "@/lib/db";
import { obtenerSesion, tieneRol } from "@/lib/auth/sesion";
import { respuestaXlsx, type CeldaExcel } from "@/lib/reportes/xlsx";
import { costoEmpresa, consolidarNomina, FACTOR_PRESTACIONAL } from "@/lib/personal/costo";
import { fechaBogota } from "@/lib/tiempo";

// Exporta el personal para completarlo por fuera y volverlo a cargar.
// La hoja se llama PERSONAL: `npm run import:personal` reconoce ese nombre y lee
// este mismo formato, así el archivo va y vuelve sin tener que reacomodar columnas.
export async function GET() {
  const s = await obtenerSesion();
  if (!s || !tieneRol(s.rol, "supervisor")) return new Response("No autorizado", { status: 401 });

  const empleados = await prisma.empleado.findMany({
    include: { area: { select: { nombre: true } }, cargo: { select: { nombre: true } } },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  const encabezado: CeldaExcel[] = [
    "NOMBRE",
    "DOCUMENTO",
    "CARGO",
    "AREA",
    "UNIDAD",
    "SALARIO",
    "COSTO REAL (calculado, no editar)",
    "ESTADO",
  ];

  const filas: CeldaExcel[][] = empleados.map((e) => [
    e.nombre,
    e.documento ?? "",
    e.cargo?.nombre ?? "",
    e.area?.nombre ?? "",
    e.unidad_negocio ?? "",
    e.salario_base ?? null,
    e.salario_base ? costoEmpresa(e.salario_base) : null,
    e.estado,
  ]);

  const costo = consolidarNomina(empleados.filter((e) => e.activo).map((e) => e.salario_base));

  const instrucciones: CeldaExcel[][] = [
    ["Cómo usar este archivo"],
    [],
    ["1.", "Completa las columnas DOCUMENTO y CARGO, que son las que faltan."],
    ["2.", "Puedes corregir NOMBRE, AREA, UNIDAD, SALARIO y ESTADO."],
    ["3.", "NO cambies el nombre de la hoja PERSONAL ni el orden de las columnas."],
    ["4.", "Devuélvelo y se carga con: npm run import:personal -- \"ruta\\del\\archivo.xlsx\""],
    [],
    ["Reglas"],
    ["·", "La persona se empareja por DOCUMENTO; si está vacío, por NOMBRE."],
    ["·", "ESTADO acepta: activo, inactivo, retirado."],
    ["·", "COSTO REAL no se importa: se calcula como SALARIO x " + (1 + FACTOR_PRESTACIONAL) + "."],
    ["·", "Quien se borre de esta hoja NO se elimina: queda marcado retirado."],
    [],
    ["Resumen al momento de exportar"],
    ["Empleados activos", empleados.filter((e) => e.activo).length],
    ["Con documento", empleados.filter((e) => e.activo && e.documento).length],
    ["Con cargo", empleados.filter((e) => e.activo && e.cargo_id).length],
    ["Salarios base", costo.salarios],
    ["Carga prestacional", costo.carga],
    ["Costo real mensual", costo.total],
  ];

  return respuestaXlsx(
    [
      { nombre: "PERSONAL", filas: [encabezado, ...filas] },
      { nombre: "Instrucciones", filas: instrucciones },
    ],
    `personal-ranch-texas-${fechaBogota()}`,
  );
}
