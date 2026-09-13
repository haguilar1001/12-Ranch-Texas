-- REDENCIÓN BONO también se escanea.
--
-- La migración anterior marcó los tipos por código y usó `redencion_bono`, que es el
-- código que tiene en la base local. En producción ese mismo tipo se llama `coomeva_qr`
-- (se creó a mano el primer día de operación), así que se quedó sin marcar mientras los
-- otros tres sí quedaron. Aquí se cubren los dos códigos para que las dos bases queden
-- iguales, y correr esto de nuevo no hace daño.
UPDATE "tipos_visitante"
   SET "requiere_escaneo" = true
 WHERE "codigo" IN ('coomeva_qr', 'redencion_bono');
