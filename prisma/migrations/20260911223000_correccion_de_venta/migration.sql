-- Corregir una venta = anular la original y crear la corregida apuntando a ella.
-- No se edita en sitio: el cuadre y la auditoría conservan las dos caras.
ALTER TABLE "ventas" ADD COLUMN "corrige_venta_id" TEXT;

CREATE UNIQUE INDEX "ventas_corrige_venta_id_key" ON "ventas"("corrige_venta_id");

ALTER TABLE "ventas" ADD CONSTRAINT "ventas_corrige_venta_id_fkey"
  FOREIGN KEY ("corrige_venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
