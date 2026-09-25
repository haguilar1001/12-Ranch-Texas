-- Comprobante impreso de los movimientos manuales de caja (ingresos y egresos).
-- `numero` es un consecutivo por tipo; `tercero` es a quién se pagó o de quién se recibió.

-- AlterTable
ALTER TABLE "movimientos_caja" ADD COLUMN "numero" INTEGER,
ADD COLUMN "tercero" TEXT;

-- Los movimientos que ya existían reciben su número en orden de creación, para que el
-- consecutivo arranque donde va y los viejos también se puedan reimprimir.
UPDATE "movimientos_caja" m
   SET "numero" = n.fila
  FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tipo" ORDER BY "creado_en", "id") AS fila
      FROM "movimientos_caja"
     WHERE "tipo" IN ('ingreso', 'egreso')
  ) n
 WHERE m."id" = n."id";

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_caja_tipo_numero_key" ON "movimientos_caja"("tipo", "numero");
