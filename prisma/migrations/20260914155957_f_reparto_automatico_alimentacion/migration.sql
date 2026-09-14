-- AlterTable
ALTER TABLE "registros_alimentacion" ADD COLUMN     "automatico" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "franja" TEXT;

-- CreateIndex
CREATE INDEX "registros_alimentacion_racion_id_idx" ON "registros_alimentacion"("racion_id");
