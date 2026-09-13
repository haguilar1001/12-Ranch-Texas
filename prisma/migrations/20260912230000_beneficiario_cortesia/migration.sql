-- A nombre de QUIÉN entró la cortesía.
--
-- El 12/09/2026 el informe de cortesías mostraba "POLICIA ALEX GUZMAN" en la columna
-- de MOTIVO: no había dónde poner el nombre, así que lo metían creando un motivo por
-- persona y el catálogo se llenaba de nombres. El motivo dice POR QUÉ se dio la
-- cortesía; el beneficiario dice A QUIÉN.
ALTER TABLE "venta_detalle" ADD COLUMN "beneficiario" TEXT;
