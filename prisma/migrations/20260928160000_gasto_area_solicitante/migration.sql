-- AlterTable
ALTER TABLE "gastos" ADD COLUMN     "area_id" TEXT,
ADD COLUMN     "solicitante_id" TEXT;

-- CreateIndex
CREATE INDEX "gastos_area_id_idx" ON "gastos"("area_id");

-- CreateIndex
CREATE INDEX "gastos_solicitante_id_idx" ON "gastos"("solicitante_id");

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

