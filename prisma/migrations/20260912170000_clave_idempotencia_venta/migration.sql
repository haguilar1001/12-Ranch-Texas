-- Llave que manda la taquilla al registrar una venta.
--
-- El 12 de septiembre de 2026 se cayó el internet a mitad de un registro: el botón
-- quedó pegado en "Registrando…", el cajero entregó las manillas y la venta nunca
-- llegó al servidor ($ 180.000 sin respaldo en Caja 2). Con esta llave, el cajero
-- puede volver a darle "Registrar" sin miedo: si la primera petición sí había
-- llegado, la segunda devuelve esa misma venta en vez de crear una repetida.
ALTER TABLE "ventas" ADD COLUMN "clave_idempotencia" TEXT;

CREATE UNIQUE INDEX "ventas_clave_idempotencia_key" ON "ventas"("clave_idempotencia");
