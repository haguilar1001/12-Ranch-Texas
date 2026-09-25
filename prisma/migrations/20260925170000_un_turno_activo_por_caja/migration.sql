-- Una caja = un turno activo, y un usuario = un turno activo (2026-09-25).
-- La app ya lo valida con un candado (lib/caja/turno.ts); estos índices son la segunda
-- barrera, en la base misma. Son índices PARCIALES: Prisma no los puede declarar en
-- schema.prisma, así que viven solo aquí (igual que las vistas de `analitica`). Si algún día
-- `prisma migrate dev` propone borrarlos, NO aceptarlo.

CREATE UNIQUE INDEX "turnos_caja_un_activo_por_caja"
  ON "turnos_caja" ("caja_id")
  WHERE "estado" IN ('abierto', 'reabierto');

CREATE UNIQUE INDEX "turnos_caja_un_activo_por_usuario"
  ON "turnos_caja" ("usuario_id")
  WHERE "estado" IN ('abierto', 'reabierto');
