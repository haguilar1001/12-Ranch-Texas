-- Cara del tipo de visitante en taquilla (emoji o ruta de imagen) y si exige carnet.
ALTER TABLE "tipos_visitante" ADD COLUMN "icono" TEXT;
ALTER TABLE "tipos_visitante" ADD COLUMN "requiere_carnet" BOOLEAN NOT NULL DEFAULT false;
