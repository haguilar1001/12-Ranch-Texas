-- Los bonos y las compras por la web se escanean.
--
-- El bono de Coomeva, el de Comfamiliar, la compra por la página web y el QR de
-- redención ya se pagaron antes de llegar al parque: lo único que hace la taquilla
-- es verificar que ese bono sea válido y no se haya usado, y eso se hace en OTRA
-- aplicación, la que está instalada en los PC de caja.
--
-- Ese escaneo no dejaba rastro en la venta: nada distinguía un bono verificado de
-- uno que el cajero dejó pasar. Ahora el tipo de visitante dice si hay que escanear
-- (`requiere_escaneo`) y cada línea de la venta guarda que el cajero lo hizo
-- (`escaneado`). Sin esa marca la venta no se registra.
ALTER TABLE "tipos_visitante" ADD COLUMN "requiere_escaneo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "venta_detalle" ADD COLUMN "escaneado" BOOLEAN NOT NULL DEFAULT false;

-- Los cuatro tipos que se escanean hoy. Queda editable en /admin/tarifas.
UPDATE "tipos_visitante"
   SET "requiere_escaneo" = true
 WHERE "codigo" IN ('bono_coomeva', 'bono_comfamiliar', 'pagina_web', 'redencion_bono');
