-- Datos que trae la nómina y que el maestro de personal no tenía:
--   unidad_negocio: Parque o Caballos (son dos nóminas distintas).
--   salario_base:   salario mensual en COP entero. Dato sensible.
ALTER TABLE "empleados" ADD COLUMN "unidad_negocio" TEXT;
ALTER TABLE "empleados" ADD COLUMN "salario_base" INTEGER;
