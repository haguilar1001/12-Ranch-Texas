-- Hay plata que entra al parque ANTES del día de la visita: un bono de convenio
-- (Coomeva, Comfamiliar) o una compra por la página web ya se pagaron y están en el
-- banco. Cuando esa persona entra, la entrada SÍ es venta del día, pero NO es recaudo
-- de la caja: el cajero no recibe nada y el arqueo del cajón no debe moverse.
ALTER TABLE "medios_pago" ADD COLUMN "afecta_recaudo" BOOLEAN NOT NULL DEFAULT true;

-- El medio con el que se paga una entrada ya cobrada por banco.
INSERT INTO "medios_pago" ("id", "nombre", "codigo", "es_efectivo", "afecta_recaudo", "orden", "activo", "creado_en", "actualizado_en")
SELECT gen_random_uuid()::text, 'PREPAGADO (BANCO)', 'prepagado', false, false,
       COALESCE((SELECT MAX("orden") FROM "medios_pago"), 0) + 1, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "medios_pago" WHERE "codigo" = 'prepagado');
