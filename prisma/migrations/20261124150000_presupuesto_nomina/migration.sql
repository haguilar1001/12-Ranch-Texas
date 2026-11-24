-- Nómina presupuestada por empleado (hoja Nomina del P&G presupuestado).
-- CreateTable
CREATE TABLE "presupuesto_nomina" (
    "id" TEXT NOT NULL,
    "archivo_id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "salario" INTEGER NOT NULL,
    "aux_transporte" INTEGER NOT NULL,
    "sueldo_total" INTEGER NOT NULL,
    "prestaciones" INTEGER NOT NULL,
    "parafiscales" INTEGER NOT NULL,
    "seguridad_social" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presupuesto_nomina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "presupuesto_nomina_anio_idx" ON "presupuesto_nomina"("anio");

-- CreateIndex
CREATE INDEX "presupuesto_nomina_archivo_id_idx" ON "presupuesto_nomina"("archivo_id");

-- AddForeignKey
ALTER TABLE "presupuesto_nomina" ADD CONSTRAINT "presupuesto_nomina_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos_cargados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

