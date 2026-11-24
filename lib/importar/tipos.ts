import type { TipoArchivo } from "@prisma/client";

// Tipos de archivo que se cargan en Configuración → Carga de archivos. Para agregar uno nuevo:
// el valor en el enum TipoArchivo (schema.prisma), su entrada aquí y su lector en procesar.ts.
export const TIPOS_ARCHIVO: Record<TipoArchivo, { nombre: string; extensiones: string[]; ayuda: string }> = {
  estado_resultados: { nombre: "Estado de resultados mensual", extensiones: [".pdf"], ayuda: "El PDF de contabilidad de un mes (consolidado por unidad)." },
  cuadro_mes_producto: { nombre: "Venta por mes", extensiones: [".xlsx", ".xls"], ayuda: "El cuadro mes x producto de un año (Mes | Total | ENTRADAS | EVENTOS | ARRIENDOS…)." },
  venta_historica: { nombre: "Venta histórica", extensiones: [".xlsx", ".xls"], ayuda: "El Excel de operación con la hoja «Datos» (FECHA, PRODUCTO, VALOR, NEGOCIO). Reemplaza todo el histórico." },
  presupuesto: { nombre: "Presupuesto (P&G presupuestado)", extensiones: [".xlsx", ".xls"], ayuda: "El P&G presupuestado del año, con las hojas «Gastos» y «PYG». El año va en el nombre del archivo." },
};
