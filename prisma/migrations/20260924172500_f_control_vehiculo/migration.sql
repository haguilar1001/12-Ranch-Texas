-- CreateEnum
CREATE TYPE "PrioridadVehiculo" AS ENUM ('baja', 'media', 'alta', 'urgente');

-- CreateEnum
CREATE TYPE "EstadoSolicitudVehiculo" AS ENUM ('pendiente', 'aprobada', 'rechazada', 'completada', 'cancelada');

-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'chofer';

-- AlterTable
ALTER TABLE "tipos_visitante" ADD COLUMN     "solo_administrador" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "vehiculos" (
    "id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "chofer_habitual_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "vehiculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitantes_vehiculo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "solicitantes_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_vehiculo" (
    "id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "hora_inicio" TIMESTAMP(3) NOT NULL,
    "hora_fin" TIMESTAMP(3) NOT NULL,
    "prioridad" "PrioridadVehiculo" NOT NULL DEFAULT 'media',
    "descripcion" TEXT NOT NULL,
    "estado" "EstadoSolicitudVehiculo" NOT NULL DEFAULT 'pendiente',
    "vehiculo_id" TEXT,
    "chofer_id" TEXT,
    "aprobado_por" TEXT,
    "aprobado_en" TIMESTAMP(3),
    "motivo_rechazo" TEXT,
    "km_inicial" INTEGER,
    "km_final" INTEGER,
    "cerrado_en" TIMESTAMP(3),
    "motivo_cancelacion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "solicitudes_vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_placa_key" ON "vehiculos"("placa");

-- CreateIndex
CREATE INDEX "solicitudes_vehiculo_estado_idx" ON "solicitudes_vehiculo"("estado");

-- CreateIndex
CREATE INDEX "solicitudes_vehiculo_chofer_id_idx" ON "solicitudes_vehiculo"("chofer_id");

-- CreateIndex
CREATE INDEX "solicitudes_vehiculo_solicitante_id_idx" ON "solicitudes_vehiculo"("solicitante_id");

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_chofer_habitual_id_fkey" FOREIGN KEY ("chofer_habitual_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_vehiculo" ADD CONSTRAINT "solicitudes_vehiculo_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "solicitantes_vehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_vehiculo" ADD CONSTRAINT "solicitudes_vehiculo_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_vehiculo" ADD CONSTRAINT "solicitudes_vehiculo_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
