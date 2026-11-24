-- P&G presupuestado por cuenta (se carga desde Configuración → Carga de archivos).
-- CreateTable
CREATE TABLE "presupuesto_pyg_lineas" (
    "id" TEXT NOT NULL,
    "archivo_id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER,
    "seccion" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presupuesto_pyg_lineas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "presupuesto_pyg_lineas_anio_idx" ON "presupuesto_pyg_lineas"("anio");

-- CreateIndex
CREATE INDEX "presupuesto_pyg_lineas_archivo_id_idx" ON "presupuesto_pyg_lineas"("archivo_id");

-- AddForeignKey
ALTER TABLE "presupuesto_pyg_lineas" ADD CONSTRAINT "presupuesto_pyg_lineas_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos_cargados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

