-- CreateEnum
CREATE TYPE "DiaTarifa" AS ENUM ('semana', 'fin_semana_festivo');

-- DropIndex
DROP INDEX "tarifas_tipo_visitante_id_vigente_desde_idx";

-- AlterTable
ALTER TABLE "cajas" ADD COLUMN     "es_prueba" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tarifas" ADD COLUMN     "dia_tipo" "DiaTarifa" NOT NULL DEFAULT 'semana';

-- AlterTable
ALTER TABLE "tipos_visitante" ADD COLUMN     "permite_descuento" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "tarifas_tipo_visitante_id_dia_tipo_vigente_desde_idx" ON "tarifas"("tipo_visitante_id", "dia_tipo", "vigente_desde");
