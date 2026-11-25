-- Módulo de mantenimiento de equipos: planes preventivos, horómetro, fallas, repuestos, fotos y gasto.
-- CreateEnum
CREATE TYPE "EjecutorMantenimiento" AS ENUM ('interno', 'externo');

-- CreateEnum
CREATE TYPE "PrioridadFalla" AS ENUM ('baja', 'media', 'alta', 'critica');

-- CreateEnum
CREATE TYPE "EstadoFalla" AS ENUM ('abierta', 'en_atencion', 'resuelta', 'descartada');

-- CreateEnum
CREATE TYPE "TipoFotoMantenimiento" AS ENUM ('falla', 'antes', 'despues', 'factura');

-- AlterTable
ALTER TABLE "equipos" ADD COLUMN     "horometro" INTEGER,
ADD COLUMN     "usa_horometro" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "mantenimientos_equipo" ADD COLUMN     "ejecutor" "EjecutorMantenimiento",
ADD COLUMN     "empleado_id" TEXT,
ADD COLUMN     "fecha_inicio" TIMESTAMP(3),
ADD COLUMN     "gasto_id" TEXT,
ADD COLUMN     "horas_fuera_servicio" INTEGER,
ADD COLUMN     "horometro" INTEGER,
ADD COLUMN     "horometro_objetivo" INTEGER,
ADD COLUMN     "mano_obra" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "motivo_cancelacion" TEXT,
ADD COLUMN     "numero_factura" TEXT,
ADD COLUMN     "observaciones" TEXT,
ADD COLUMN     "plan_id" TEXT,
ADD COLUMN     "proveedor_id" TEXT,
ADD COLUMN     "repuestos_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trabajos_realizados" TEXT;

-- CreateTable
CREATE TABLE "planes_mantenimiento" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "instrucciones" TEXT,
    "equipo_id" TEXT,
    "categoria_id" TEXT,
    "frecuencia_dias" INTEGER,
    "frecuencia_horas" INTEGER,
    "aviso_dias" INTEGER NOT NULL DEFAULT 7,
    "costo_estimado" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "planes_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lecturas_horometro" (
    "id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horas" INTEGER NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,

    CONSTRAINT "lecturas_horometro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reportes_falla" (
    "id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "prioridad" "PrioridadFalla" NOT NULL DEFAULT 'media',
    "equipo_detenido" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoFalla" NOT NULL DEFAULT 'abierta',
    "mantenimiento_id" TEXT,
    "motivo_cierre" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "reportes_falla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repuestos_mantenimiento" (
    "id" TEXT NOT NULL,
    "mantenimiento_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "unidad" TEXT,
    "precio_unitario" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,

    CONSTRAINT "repuestos_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotos_mantenimiento" (
    "id" TEXT NOT NULL,
    "falla_id" TEXT,
    "mantenimiento_id" TEXT,
    "tipo" "TipoFotoMantenimiento" NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "contenido" BYTEA NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,

    CONSTRAINT "fotos_mantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planes_mantenimiento_equipo_id_idx" ON "planes_mantenimiento"("equipo_id");

-- CreateIndex
CREATE INDEX "planes_mantenimiento_categoria_id_idx" ON "planes_mantenimiento"("categoria_id");

-- CreateIndex
CREATE INDEX "lecturas_horometro_equipo_id_fecha_idx" ON "lecturas_horometro"("equipo_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "reportes_falla_mantenimiento_id_key" ON "reportes_falla"("mantenimiento_id");

-- CreateIndex
CREATE INDEX "reportes_falla_equipo_id_idx" ON "reportes_falla"("equipo_id");

-- CreateIndex
CREATE INDEX "reportes_falla_estado_idx" ON "reportes_falla"("estado");

-- CreateIndex
CREATE INDEX "repuestos_mantenimiento_mantenimiento_id_idx" ON "repuestos_mantenimiento"("mantenimiento_id");

-- CreateIndex
CREATE INDEX "fotos_mantenimiento_falla_id_idx" ON "fotos_mantenimiento"("falla_id");

-- CreateIndex
CREATE INDEX "fotos_mantenimiento_mantenimiento_id_idx" ON "fotos_mantenimiento"("mantenimiento_id");

-- CreateIndex
CREATE UNIQUE INDEX "mantenimientos_equipo_gasto_id_key" ON "mantenimientos_equipo"("gasto_id");

-- CreateIndex
CREATE INDEX "mantenimientos_equipo_plan_id_idx" ON "mantenimientos_equipo"("plan_id");

-- AddForeignKey
ALTER TABLE "mantenimientos_equipo" ADD CONSTRAINT "mantenimientos_equipo_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "planes_mantenimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_equipo" ADD CONSTRAINT "mantenimientos_equipo_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_equipo" ADD CONSTRAINT "mantenimientos_equipo_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_equipo" ADD CONSTRAINT "mantenimientos_equipo_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_mantenimiento" ADD CONSTRAINT "planes_mantenimiento_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_equipo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecturas_horometro" ADD CONSTRAINT "lecturas_horometro_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_falla" ADD CONSTRAINT "reportes_falla_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_falla" ADD CONSTRAINT "reportes_falla_mantenimiento_id_fkey" FOREIGN KEY ("mantenimiento_id") REFERENCES "mantenimientos_equipo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repuestos_mantenimiento" ADD CONSTRAINT "repuestos_mantenimiento_mantenimiento_id_fkey" FOREIGN KEY ("mantenimiento_id") REFERENCES "mantenimientos_equipo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_mantenimiento" ADD CONSTRAINT "fotos_mantenimiento_falla_id_fkey" FOREIGN KEY ("falla_id") REFERENCES "reportes_falla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fotos_mantenimiento" ADD CONSTRAINT "fotos_mantenimiento_mantenimiento_id_fkey" FOREIGN KEY ("mantenimiento_id") REFERENCES "mantenimientos_equipo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

