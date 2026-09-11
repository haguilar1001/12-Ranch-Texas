-- Catálogo de quiénes pueden autorizar cortesías y descuentos.
-- Separado de `usuarios`: el gerente autoriza sin tener que ser usuario de la app.
CREATE TABLE "autorizadores_cortesia" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "usuario_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" TEXT,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por" TEXT,

    CONSTRAINT "autorizadores_cortesia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "autorizadores_cortesia_usuario_id_key" ON "autorizadores_cortesia"("usuario_id");

-- Arranca con los supervisores y administradores que hoy salen en el selector
-- "Autoriza…" de taquilla, para no dejar la pantalla sin opciones.
INSERT INTO "autorizadores_cortesia" ("id", "nombre", "cargo", "activo", "usuario_id", "creado_en", "actualizado_en")
SELECT gen_random_uuid()::text, u."nombre", INITCAP(u."rol"::text), true, u."id", NOW(), NOW()
FROM "usuarios" u
WHERE u."activo" = true AND u."rol" IN ('supervisor', 'administrador');
