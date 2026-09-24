-- AlterTable
ALTER TABLE "solicitudes_vehiculo" ADD COLUMN     "hora_fin_real" TIMESTAMP(3),
ADD COLUMN     "hora_inicio_real" TIMESTAMP(3),
ADD COLUMN     "observaciones" TEXT;
