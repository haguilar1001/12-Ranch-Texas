-- CreateEnum
CREATE TYPE "EstadoCompraAlimento" AS ENUM ('registrada', 'anulada');

-- AlterTable
ALTER TABLE "movimientos_alimento" ADD COLUMN     "compra_id" TEXT;

-- CreateTable
CREATE TABLE "compras_alimento" (
    "id" TEXT NOT NULL,
    "proveedor_id" TEXT,
    "fecha_compra" TIMESTAMP(3) NOT NULL,
    "numero_factura" TEXT,
    "observaciones" TEXT,
    "total" INTEGER NOT NULL,
    "estado" "EstadoCompraAlimento" NOT NULL DEFAULT 'registrada',
    "motivo_anulacion" TEXT,
    "gasto_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "compras_alimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras_alimento_detalle" (
    "id" TEXT NOT NULL,
    "compra_id" TEXT NOT NULL,
    "alimento_id" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidad_base" INTEGER NOT NULL,
    "precio_unitario" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "compras_alimento_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compras_alimento_gasto_id_key" ON "compras_alimento"("gasto_id");

-- CreateIndex
CREATE INDEX "compras_alimento_fecha_compra_idx" ON "compras_alimento"("fecha_compra");

-- CreateIndex
CREATE INDEX "compras_alimento_detalle_compra_id_idx" ON "compras_alimento_detalle"("compra_id");

-- CreateIndex
CREATE INDEX "compras_alimento_detalle_alimento_id_idx" ON "compras_alimento_detalle"("alimento_id");

-- CreateIndex
CREATE INDEX "movimientos_alimento_compra_id_idx" ON "movimientos_alimento"("compra_id");

-- AddForeignKey
ALTER TABLE "movimientos_alimento" ADD CONSTRAINT "movimientos_alimento_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras_alimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_alimento" ADD CONSTRAINT "compras_alimento_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_alimento" ADD CONSTRAINT "compras_alimento_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_alimento_detalle" ADD CONSTRAINT "compras_alimento_detalle_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras_alimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras_alimento_detalle" ADD CONSTRAINT "compras_alimento_detalle_alimento_id_fkey" FOREIGN KEY ("alimento_id") REFERENCES "alimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

