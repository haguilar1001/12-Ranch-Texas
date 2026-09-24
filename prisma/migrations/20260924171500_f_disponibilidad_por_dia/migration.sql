-- CreateEnum
CREATE TYPE "DisponibilidadTipo" AS ENUM ('todos', 'semana', 'fin_semana_festivo');

-- DropIndex
DROP INDEX "tarifas_tipo_visitante_id_dia_tipo_vigente_desde_idx";

-- AlterTable
ALTER TABLE "tarifas" DROP COLUMN "dia_tipo";

-- AlterTable
ALTER TABLE "tipos_visitante" ADD COLUMN     "disponible_dias" "DisponibilidadTipo" NOT NULL DEFAULT 'todos';

-- DropEnum
DROP TYPE "DiaTarifa";

-- CreateIndex
CREATE INDEX "tarifas_tipo_visitante_id_vigente_desde_idx" ON "tarifas"("tipo_visitante_id", "vigente_desde");

