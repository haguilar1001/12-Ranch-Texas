-- Catálogos: proveedor ampliado y materias primas.
ALTER TABLE "proveedores"
  ADD COLUMN "direccion" TEXT,
  ADD COLUMN "ciudad" TEXT,
  ADD COLUMN "tipo" TEXT,
  ADD COLUMN "suministra" TEXT,
  ADD COLUMN "condiciones_pago" TEXT,
  ADD COLUMN "observaciones" TEXT;

CREATE TABLE "materias_primas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT,
    "unidad_medida" TEXT NOT NULL DEFAULT 'unidad',
    "costo_referencia" INTEGER,
    "proveedor_id" TEXT,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,
    CONSTRAINT "materias_primas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "materias_primas_proveedor_id_idx" ON "materias_primas"("proveedor_id");

ALTER TABLE "materias_primas" ADD CONSTRAINT "materias_primas_proveedor_id_fkey"
  FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
