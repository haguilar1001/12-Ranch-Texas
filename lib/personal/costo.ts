// Costo real de un empleado para la empresa.
//
// En Colombia el salario NO es lo que cuesta un empleado: encima van las prestaciones
// sociales (cesantías, intereses sobre cesantías, prima, vacaciones), la seguridad
// social a cargo del empleador y los parafiscales. La regla de bolsillo del negocio
// es que un empleado vale 1,5 veces su salario.
//
// El costo NO se guarda en la base: se calcula desde el salario, para que cambiar el
// factor no obligue a recalcular filas ni deje datos viejos conviviendo con nuevos.

/** Recargo sobre el salario base. 0,5 = 50% → el empleado vale 1,5 veces su sueldo. */
export const FACTOR_PRESTACIONAL = 0.5;

/** Lo que le cuesta a la empresa un salario, en COP entero. */
export function costoEmpresa(salarioBase: number, factor: number = FACTOR_PRESTACIONAL): number {
  if (!Number.isFinite(salarioBase) || salarioBase <= 0) return 0;
  return Math.round(salarioBase * (1 + factor));
}

/** Solo la carga prestacional, sin el salario. Útil para mostrarla aparte en el P&G. */
export function cargaPrestacional(salarioBase: number, factor: number = FACTOR_PRESTACIONAL): number {
  return costoEmpresa(salarioBase, factor) - Math.round(Math.max(0, salarioBase));
}

export interface CostoNomina {
  personas: number;
  salarios: number;
  carga: number;
  total: number;
}

/** Consolida el costo de un grupo de empleados. Ignora a los que no tienen salario. */
export function consolidarNomina(
  salarios: (number | null | undefined)[],
  factor: number = FACTOR_PRESTACIONAL,
): CostoNomina {
  const validos = salarios.filter((s): s is number => typeof s === "number" && s > 0);
  const suma = validos.reduce((a, s) => a + Math.round(s), 0);
  const total = validos.reduce((a, s) => a + costoEmpresa(s, factor), 0);
  return {
    personas: validos.length,
    salarios: suma,
    carga: total - suma,
    total,
  };
}
