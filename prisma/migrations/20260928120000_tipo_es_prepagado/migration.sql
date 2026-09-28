-- Casilla propia para las tarifas prepagadas (2026-09-28). Antes se deducía de "se escanea en la
-- app de bonos", que mezclaba dos cosas. Para no cambiar nada de lo que el cajero ve hoy, las
-- tarifas que se escanean arrancan marcadas como prepagadas; después se ajustan en Tarifas.

-- AlterTable
ALTER TABLE "tipos_visitante" ADD COLUMN "es_prepagado" BOOLEAN NOT NULL DEFAULT false;

UPDATE "tipos_visitante" SET "es_prepagado" = "requiere_escaneo";
