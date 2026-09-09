-- Fila virtual por atracción: el visitante separa su turno con el QR de su manilla
-- y consulta su posición desde el celular, en vez de anotarse en una lista de papel
-- y quedarse esperando a que lo llamen.

-- CreateEnum
CREATE TYPE "EstadoTurnoFila" AS ENUM ('esperando', 'llamado', 'atendido', 'no_se_presento', 'cancelado');

-- AlterTable: configuración de la fila por atracción.
ALTER TABLE "atracciones" ADD COLUMN "fila_activa" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "atracciones" ADD COLUMN "cupo_por_tanda" INTEGER;
ALTER TABLE "atracciones" ADD COLUMN "minutos_por_tanda" INTEGER;

-- CreateTable
CREATE TABLE "turnos_fila" (
    "id" TEXT NOT NULL,
    "atraccion_id" TEXT NOT NULL,
    "manilla_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha_operativa" TEXT NOT NULL,
    "personas" INTEGER NOT NULL DEFAULT 1,
    "estado" "EstadoTurnoFila" NOT NULL DEFAULT 'esperando',
    "tomado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "llamado_en" TIMESTAMP(3),
    "cerrado_en" TIMESTAMP(3),
    "motivo" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "turnos_fila_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "turnos_fila_atraccion_id_fecha_operativa_numero_key" ON "turnos_fila"("atraccion_id", "fecha_operativa", "numero");
CREATE INDEX "turnos_fila_atraccion_id_estado_idx" ON "turnos_fila"("atraccion_id", "estado");
CREATE INDEX "turnos_fila_manilla_id_idx" ON "turnos_fila"("manilla_id");
CREATE INDEX "turnos_fila_fecha_operativa_idx" ON "turnos_fila"("fecha_operativa");

-- AddForeignKey
ALTER TABLE "turnos_fila" ADD CONSTRAINT "turnos_fila_atraccion_id_fkey" FOREIGN KEY ("atraccion_id") REFERENCES "atracciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "turnos_fila" ADD CONSTRAINT "turnos_fila_manilla_id_fkey" FOREIGN KEY ("manilla_id") REFERENCES "manillas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
