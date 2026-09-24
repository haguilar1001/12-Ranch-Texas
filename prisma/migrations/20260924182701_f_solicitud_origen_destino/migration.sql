-- AlterTable
ALTER TABLE "solicitudes_vehiculo" ADD COLUMN     "destino" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "origen" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "viaje_redondo" BOOLEAN NOT NULL DEFAULT false;
