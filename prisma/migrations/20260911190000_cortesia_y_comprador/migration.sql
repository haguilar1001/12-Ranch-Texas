-- Tercer tipo de cortesía, además de atención e invitación.
ALTER TYPE "TipoLineaVenta" ADD VALUE IF NOT EXISTS 'cortesia';

-- Contacto del comprador, para poder ubicarlo después de la venta.
ALTER TABLE "ventas" ADD COLUMN "comprador_celular" TEXT;
ALTER TABLE "ventas" ADD COLUMN "comprador_email" TEXT;
