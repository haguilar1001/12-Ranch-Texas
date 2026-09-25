-- Lista de beneficiarios de caja: a quién se le puede entregar plata en un egreso.
-- El egreso la exige (validado en la app); los movimientos viejos quedan sin beneficiario.

-- CreateTable
CREATE TABLE "beneficiarios_caja" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "beneficiarios_caja_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "movimientos_caja" ADD COLUMN "beneficiario_id" TEXT;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_beneficiario_id_fkey" FOREIGN KEY ("beneficiario_id") REFERENCES "beneficiarios_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
