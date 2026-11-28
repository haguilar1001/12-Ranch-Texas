-- Tratamientos (reporte médico): caso clínico, medicamentos aplicados, fotos y seguimiento.
CREATE TYPE "EstadoTratamiento" AS ENUM ('en_curso', 'finalizado', 'anulado');
ALTER TABLE "movimientos_insumo" ADD COLUMN     "tratamiento_id" TEXT;
ALTER TABLE "fotos_granja" ADD COLUMN     "tratamiento_id" TEXT;
CREATE TABLE "tratamientos" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "animal_id" TEXT NOT NULL,
    "sintomas" TEXT,
    "diagnostico" TEXT NOT NULL,
    "indicaciones" TEXT,
    "veterinario" TEXT,
    "empleado_id" TEXT,
    "proxima_revision" DATE,
    "estado" "EstadoTratamiento" NOT NULL DEFAULT 'en_curso',
    "resultado" TEXT,
    "motivo_anulacion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,
    CONSTRAINT "tratamientos_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "seguimientos_tratamiento" (
    "id" TEXT NOT NULL,
    "tratamiento_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "nota" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    CONSTRAINT "seguimientos_tratamiento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tratamientos_animal_id_idx" ON "tratamientos"("animal_id");
CREATE INDEX "tratamientos_fecha_idx" ON "tratamientos"("fecha");
CREATE INDEX "tratamientos_estado_idx" ON "tratamientos"("estado");
CREATE INDEX "seguimientos_tratamiento_tratamiento_id_idx" ON "seguimientos_tratamiento"("tratamiento_id");
CREATE INDEX "movimientos_insumo_tratamiento_id_idx" ON "movimientos_insumo"("tratamiento_id");
CREATE INDEX "fotos_granja_tratamiento_id_idx" ON "fotos_granja"("tratamiento_id");
ALTER TABLE "movimientos_insumo" ADD CONSTRAINT "movimientos_insumo_tratamiento_id_fkey" FOREIGN KEY ("tratamiento_id") REFERENCES "tratamientos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fotos_granja" ADD CONSTRAINT "fotos_granja_tratamiento_id_fkey" FOREIGN KEY ("tratamiento_id") REFERENCES "tratamientos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "seguimientos_tratamiento" ADD CONSTRAINT "seguimientos_tratamiento_tratamiento_id_fkey" FOREIGN KEY ("tratamiento_id") REFERENCES "tratamientos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
