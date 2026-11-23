-- Ventas que no pasan por taquilla (arriendos, chucherías…), digitadas en /admin/ventas-otras.
-- CreateEnum
CREATE TYPE "EstadoVentaOtra" AS ENUM ('activa', 'anulada');

-- CreateTable
CREATE TABLE "ventas_otras" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "linea" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" "EstadoVentaOtra" NOT NULL DEFAULT 'activa',
    "motivo_anulacion" TEXT,
    "anulada_por" TEXT,
    "anulada_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "ventas_otras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ventas_otras_fecha_idx" ON "ventas_otras"("fecha");

-- CreateIndex
CREATE INDEX "ventas_otras_linea_idx" ON "ventas_otras"("linea");

-- CreateIndex
CREATE INDEX "ventas_otras_estado_idx" ON "ventas_otras"("estado");

