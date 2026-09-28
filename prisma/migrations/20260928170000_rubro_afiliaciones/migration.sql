-- Rubro AFILIACIONES (seguridad social y ARL), pedido por el responsable el 2026-09-28.
-- Migración de DATOS, idempotente: no crea nada si ya existe (por nombre, sin importar mayúsculas).
--
--   NÓMINA Y PRESTACIONES (grupo)
--     └─ AFILIACIONES (rubro)
--          ├─ SEGURIDAD SOCIAL (EPS Y PENSIÓN) (subrubro)
--          └─ ARL (subrubro)
--
-- El rubro viejo NÓMINA Y PRESTACIONES / SEGURIDAD SOCIAL queda duplicado con esto: se DESACTIVA
-- (nunca se borra) solo si no tiene gastos, presupuestos ni gastos recurrentes. Si ya tiene, se deja activo.

DO $$
DECLARE
  v_nomina TEXT;
  v_afil   TEXT;
  v_viejo  TEXT;
BEGIN
  SELECT id INTO v_nomina FROM rubros_gasto
   WHERE upper(nombre) = 'NÓMINA Y PRESTACIONES' AND nivel = 'grupo' LIMIT 1;

  IF v_nomina IS NULL THEN
    v_nomina := gen_random_uuid()::text;
    INSERT INTO rubros_gasto (id, nombre, nivel, orden, activo, creado_por, actualizado_en)
    VALUES (v_nomina, 'NÓMINA Y PRESTACIONES', 'grupo', 1, true, 'migracion', now());
  END IF;

  SELECT id INTO v_afil FROM rubros_gasto
   WHERE upper(nombre) = 'AFILIACIONES' AND padre_id = v_nomina LIMIT 1;

  IF v_afil IS NULL THEN
    v_afil := gen_random_uuid()::text;
    INSERT INTO rubros_gasto (id, nombre, nivel, padre_id, orden, activo, creado_por, actualizado_en)
    VALUES (v_afil, 'AFILIACIONES', 'rubro', v_nomina, 2, true, 'migracion', now());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM rubros_gasto WHERE upper(nombre) = 'SEGURIDAD SOCIAL (EPS Y PENSIÓN)' AND padre_id = v_afil) THEN
    INSERT INTO rubros_gasto (id, nombre, nivel, padre_id, orden, activo, creado_por, actualizado_en)
    VALUES (gen_random_uuid()::text, 'SEGURIDAD SOCIAL (EPS Y PENSIÓN)', 'subrubro', v_afil, 1, true, 'migracion', now());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM rubros_gasto WHERE upper(nombre) = 'ARL' AND padre_id = v_afil) THEN
    INSERT INTO rubros_gasto (id, nombre, nivel, padre_id, orden, activo, creado_por, actualizado_en)
    VALUES (gen_random_uuid()::text, 'ARL', 'subrubro', v_afil, 2, true, 'migracion', now());
  END IF;

  SELECT id INTO v_viejo FROM rubros_gasto
   WHERE upper(nombre) = 'SEGURIDAD SOCIAL' AND padre_id = v_nomina AND activo LIMIT 1;

  IF v_viejo IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM gastos WHERE rubro_gasto_id = v_viejo)
     AND NOT EXISTS (SELECT 1 FROM presupuesto WHERE rubro_gasto_id = v_viejo)
     AND NOT EXISTS (SELECT 1 FROM gastos_recurrentes WHERE rubro_gasto_id = v_viejo) THEN
    UPDATE rubros_gasto SET activo = false, actualizado_por = 'migracion', actualizado_en = now() WHERE id = v_viejo;
  END IF;
END $$;
