-- Carga de archivos (Configuración) y líneas del estado de resultados mensual.
-- CreateEnum
CREATE TYPE "TipoArchivo" AS ENUM ('estado_resultados', 'cuadro_mes_producto', 'venta_historica', 'presupuesto');

-- CreateEnum
CREATE TYPE "EstadoArchivo" AS ENUM ('procesado', 'reemplazado', 'anulado');

-- CreateTable
CREATE TABLE "archivos_cargados" (
    "id" TEXT NOT NULL,
    "tipo" "TipoArchivo" NOT NULL,
    "nombre" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "contenido" BYTEA NOT NULL,
    "anio" INTEGER,
    "mes" INTEGER,
    "estado" "EstadoArchivo" NOT NULL DEFAULT 'procesado',
    "resumen" JSONB,
    "motivo_anulacion" TEXT,
    "anulado_por" TEXT,
    "anulado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "archivos_cargados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estado_resultados_lineas" (
    "id" TEXT NOT NULL,
    "archivo_id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "unidad" TEXT NOT NULL,
    "seccion" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estado_resultados_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "archivos_cargados_tipo_anio_mes_idx" ON "archivos_cargados"("tipo", "anio", "mes");

-- CreateIndex
CREATE INDEX "archivos_cargados_estado_idx" ON "archivos_cargados"("estado");

-- CreateIndex
CREATE INDEX "estado_resultados_lineas_anio_mes_idx" ON "estado_resultados_lineas"("anio", "mes");

-- CreateIndex
CREATE INDEX "estado_resultados_lineas_archivo_id_idx" ON "estado_resultados_lineas"("archivo_id");

-- AddForeignKey
ALTER TABLE "estado_resultados_lineas" ADD CONSTRAINT "estado_resultados_lineas_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos_cargados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

