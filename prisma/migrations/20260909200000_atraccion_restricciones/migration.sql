-- Restricciones reales por atracción, según el reglamento del parque.
-- Antes solo se guardaba un mínimo de edad y de estatura; el reglamento maneja
-- RANGOS (Karts Areneros: 115–160 cm y 20–55 kg) y también TOPES (en Motocross no
-- cabe alguien de más de 170 cm).
ALTER TABLE "atracciones" ADD COLUMN "edad_maxima" INTEGER;
ALTER TABLE "atracciones" ADD COLUMN "estatura_maxima" INTEGER;
ALTER TABLE "atracciones" ADD COLUMN "peso_minimo" INTEGER;
ALTER TABLE "atracciones" ADD COLUMN "peso_maximo" INTEGER;
