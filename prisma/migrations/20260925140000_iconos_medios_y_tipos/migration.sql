-- Íconos para los medios de pago (campo nuevo). En Ranch Texas los tipos de visitante ya tienen
-- los suyos (scripts/iconos-tipos-visitante.ts), así que aquí no se tocan.
-- Solo se llenan los que están vacíos: si alguien ya puso su propio ícono, se respeta.

-- AlterTable
ALTER TABLE "medios_pago" ADD COLUMN "icono" TEXT;

UPDATE "medios_pago" SET "icono" = CASE "codigo"
    WHEN 'efectivo'      THEN '💵'
    WHEN 'debito'        THEN '💳'
    WHEN 'credito'       THEN '💳'
    WHEN 'nequi'         THEN '📱'
    WHEN 'daviplata'     THEN '📱'
    WHEN 'transferencia' THEN '🏦'
    WHEN 'bono'          THEN '🎟️'
    WHEN 'prepagado'     THEN '🧾'
  END
WHERE "icono" IS NULL;
