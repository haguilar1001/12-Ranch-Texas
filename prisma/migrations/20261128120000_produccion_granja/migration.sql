-- Producción y ventas de la granja (huevos, queso, suero) con su kardex.
CREATE TYPE "TipoMovProducto" AS ENUM ('produccion', 'venta', 'donacion', 'consumo_interno', 'perdida', 'ajuste');
CREATE TABLE "productos_granja" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "precio" INTEGER,
    "existencia" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,
    CONSTRAINT "productos_granja_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "movimientos_producto" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "tipo" "TipoMovProducto" NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "fecha" DATE NOT NULL,
    "precio_unitario" INTEGER,
    "valor" INTEGER,
    "cliente" TEXT,
    "empleado_id" TEXT,
    "motivo" TEXT,
    "venta_otra_id" TEXT,
    "clave_carga" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_anulacion" TEXT,
    "anulado_por" TEXT,
    "anulado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,
    CONSTRAINT "movimientos_producto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "movimientos_producto_venta_otra_id_key" ON "movimientos_producto"("venta_otra_id");
CREATE UNIQUE INDEX "movimientos_producto_clave_carga_key" ON "movimientos_producto"("clave_carga");
CREATE INDEX "movimientos_producto_producto_id_idx" ON "movimientos_producto"("producto_id");
CREATE INDEX "movimientos_producto_fecha_idx" ON "movimientos_producto"("fecha");
ALTER TABLE "movimientos_producto" ADD CONSTRAINT "movimientos_producto_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos_granja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movimientos_producto" ADD CONSTRAINT "movimientos_producto_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "movimientos_producto" ADD CONSTRAINT "movimientos_producto_venta_otra_id_fkey" FOREIGN KEY ("venta_otra_id") REFERENCES "ventas_otras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Productos iniciales (precio de referencia del Excel de la granja; se editan en la app).
INSERT INTO "productos_granja" ("id", "nombre", "unidad", "precio", "actualizado_en") VALUES
  (gen_random_uuid()::text, 'HUEVOS', 'unidad', 14000, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'QUESO', 'kg', 24000, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SUERO', 'litro', 14000, CURRENT_TIMESTAMP);
