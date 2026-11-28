-- Insumos de granja (aseo, desinfección, fumigación, medicamentos), su kardex y las fumigaciones.
CREATE TYPE "CategoriaInsumo" AS ENUM ('aseo', 'desinfeccion', 'fumigacion', 'medicamento', 'otro');
CREATE TYPE "TipoMovInsumo" AS ENUM ('saldo_inicial', 'compra', 'entrada_otra', 'consumo', 'fumigacion', 'tratamiento', 'perdida', 'vencido', 'ajuste');
CREATE TYPE "EstadoFumigacion" AS ENUM ('registrada', 'anulada');

CREATE TABLE "insumos_granja" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "categoria" "CategoriaInsumo" NOT NULL,
    "unidad" TEXT NOT NULL,
    "stock_minimo" DECIMAL(12,3),
    "existencia" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,
    CONSTRAINT "insumos_granja_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "insumos_granja_categoria_idx" ON "insumos_granja"("categoria");

CREATE TABLE "fumigaciones" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "recinto_id" TEXT,
    "zona" TEXT,
    "plaga" TEXT,
    "empleado_id" TEXT,
    "observaciones" TEXT,
    "estado" "EstadoFumigacion" NOT NULL DEFAULT 'registrada',
    "motivo_anulacion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,
    CONSTRAINT "fumigaciones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fumigaciones_fecha_idx" ON "fumigaciones"("fecha");

CREATE TABLE "movimientos_insumo" (
    "id" TEXT NOT NULL,
    "insumo_id" TEXT NOT NULL,
    "tipo" "TipoMovInsumo" NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "valor" INTEGER,
    "proveedor_id" TEXT,
    "lote" TEXT,
    "vencimiento" DATE,
    "fumigacion_id" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_anulacion" TEXT,
    "anulado_por" TEXT,
    "anulado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,
    CONSTRAINT "movimientos_insumo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "movimientos_insumo_insumo_id_idx" ON "movimientos_insumo"("insumo_id");
CREATE INDEX "movimientos_insumo_fecha_idx" ON "movimientos_insumo"("fecha");
CREATE INDEX "movimientos_insumo_fumigacion_id_idx" ON "movimientos_insumo"("fumigacion_id");

CREATE TABLE "fotos_granja" (
    "id" TEXT NOT NULL,
    "fumigacion_id" TEXT,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "contenido" BYTEA NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    CONSTRAINT "fotos_granja_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fotos_granja_fumigacion_id_idx" ON "fotos_granja"("fumigacion_id");

ALTER TABLE "movimientos_insumo" ADD CONSTRAINT "movimientos_insumo_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos_granja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_insumo" ADD CONSTRAINT "movimientos_insumo_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "movimientos_insumo" ADD CONSTRAINT "movimientos_insumo_fumigacion_id_fkey" FOREIGN KEY ("fumigacion_id") REFERENCES "fumigaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fumigaciones" ADD CONSTRAINT "fumigaciones_recinto_id_fkey" FOREIGN KEY ("recinto_id") REFERENCES "recintos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fumigaciones" ADD CONSTRAINT "fumigaciones_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fotos_granja" ADD CONSTRAINT "fotos_granja_fumigacion_id_fkey" FOREIGN KEY ("fumigacion_id") REFERENCES "fumigaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
