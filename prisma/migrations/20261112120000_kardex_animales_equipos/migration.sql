-- Kardex de animales y de equipos (novedades que alteran el inventario).
-- Escrita a mano a partir de prisma migrate diff + saldo inicial de lo que ya existe.

-- CreateEnum
CREATE TYPE "TipoMovimientoAnimal" AS ENUM ('saldo_inicial', 'nacimiento', 'compra', 'donacion_recibida', 'traslado_entrada', 'muerte', 'venta', 'sacrificio', 'entrega', 'perdida', 'traslado_salida', 'ajuste');

-- CreateEnum
CREATE TYPE "TipoMovimientoEquipo" AS ENUM ('saldo_inicial', 'compra', 'donacion_recibida', 'traslado_entrada', 'baja', 'robo', 'perdida', 'venta', 'entrega', 'traslado_salida', 'traslado', 'ajuste');

-- AlterTable
ALTER TABLE "equipos" ADD COLUMN     "cantidad" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "garantia_hasta" TIMESTAMP(3),
ADD COLUMN     "proveedor_id" TEXT,
ADD COLUMN     "referencia" TEXT,
ADD COLUMN     "responsable_id" TEXT,
ADD COLUMN     "valor_compra" INTEGER,
ADD COLUMN     "vida_util_meses" INTEGER;

-- CreateTable
CREATE TABLE "movimientos_animal" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "tipo" "TipoMovimientoAnimal" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "valor" INTEGER,
    "tercero" TEXT,
    "contraparte_id" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_anulacion" TEXT,
    "anulado_por" TEXT,
    "anulado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "movimientos_animal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_equipo" (
    "id" TEXT NOT NULL,
    "equipo_id" TEXT NOT NULL,
    "tipo" "TipoMovimientoEquipo" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "valor" INTEGER,
    "tercero" TEXT,
    "origen" TEXT,
    "destino" TEXT,
    "contraparte_id" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_anulacion" TEXT,
    "anulado_por" TEXT,
    "anulado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "movimientos_equipo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_animal_animal_id_idx" ON "movimientos_animal"("animal_id");

-- CreateIndex
CREATE INDEX "movimientos_animal_fecha_idx" ON "movimientos_animal"("fecha");

-- CreateIndex
CREATE INDEX "movimientos_animal_tipo_idx" ON "movimientos_animal"("tipo");

-- CreateIndex
CREATE INDEX "movimientos_equipo_equipo_id_idx" ON "movimientos_equipo"("equipo_id");

-- CreateIndex
CREATE INDEX "movimientos_equipo_fecha_idx" ON "movimientos_equipo"("fecha");

-- CreateIndex
CREATE INDEX "movimientos_equipo_tipo_idx" ON "movimientos_equipo"("tipo");

-- AddForeignKey
ALTER TABLE "movimientos_animal" ADD CONSTRAINT "movimientos_animal_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "empleados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_equipo" ADD CONSTRAINT "movimientos_equipo_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "equipos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Saldo inicial: el censo y el inventario actuales pasan a ser el primer movimiento de cada
-- registro, con la fecha en que se creó. Desde aquí la cantidad solo cambia por novedades.
INSERT INTO "movimientos_animal" ("id", "animal_id", "tipo", "cantidad", "fecha", "motivo", "creado_en", "creado_por", "actualizado_en")
SELECT gen_random_uuid()::text, a."id", 'saldo_inicial', a."cantidad", a."creado_en", 'Censo al iniciar el kardex', NOW(), 'migracion', NOW()
FROM "animales" a
WHERE a."cantidad" > 0;

INSERT INTO "movimientos_equipo" ("id", "equipo_id", "tipo", "cantidad", "fecha", "motivo", "creado_en", "creado_por", "actualizado_en")
SELECT gen_random_uuid()::text, e."id", 'saldo_inicial', e."cantidad", e."creado_en", 'Inventario al iniciar el kardex', NOW(), 'migracion', NOW()
FROM "equipos" e
WHERE e."cantidad" > 0;
