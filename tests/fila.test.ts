import { describe, it, expect } from "vitest";
import {
  estaCerrado, personasAdelante, posicion, esperaEstimada, textoEspera,
  siguienteNumero, resumirFila, type TurnoEnFila,
} from "../lib/fila/calculo";

// Karts: entran 8 por vuelta y la vuelta dura 10 minutos.
const KARTS = { cupo_por_tanda: 8, minutos_por_tanda: 10 };

const t = (numero: number, estado: TurnoEnFila["estado"], personas = 1): TurnoEnFila => ({ numero, estado, personas });

describe("estado del turno", () => {
  it("sabe cuáles ya salieron de la fila", () => {
    expect(estaCerrado("atendido")).toBe(true);
    expect(estaCerrado("no_se_presento")).toBe(true);
    expect(estaCerrado("cancelado")).toBe(true);
    expect(estaCerrado("esperando")).toBe(false);
    // El llamado todavía ocupa cupo: no ha subido al kart.
    expect(estaCerrado("llamado")).toBe(false);
  });
});

describe("cuántos van adelante", () => {
  const fila = [
    t(41, "atendido"),
    t(42, "no_se_presento"),
    t(43, "llamado"),
    t(44, "esperando", 4), // familia de 4
    t(45, "esperando"),
    t(46, "esperando"),
  ];

  it("no cuenta a los que ya pasaron ni a los que no se presentaron", () => {
    // Delante del 45 quedan: el 43 (llamado, 1) y el 44 (4 personas) = 5
    expect(personasAdelante(fila, 45)).toBe(5);
  });

  it("cuenta PERSONAS, no turnos: un grupo de 4 ocupa 4 puestos", () => {
    expect(personasAdelante(fila, 46)).toBe(6); // 43 + 44(4) + 45
    expect(posicion(fila, 46)).toBe(4); // pero es el 4.º turno en la fila
  });

  it("el primero de la fila no tiene a nadie adelante", () => {
    expect(personasAdelante(fila, 43)).toBe(0);
    expect(posicion(fila, 43)).toBe(1);
  });

  it("una fila vacía deja a cualquiera de primero", () => {
    expect(personasAdelante([], 1)).toBe(0);
    expect(posicion([], 1)).toBe(1);
  });

  it("un turno sin personas declaradas cuenta como uno", () => {
    expect(personasAdelante([t(1, "esperando", 0)], 2)).toBe(1);
  });
});

describe("espera estimada", () => {
  it("calcula por tandas completas", () => {
    expect(esperaEstimada(0, KARTS)).toBe(0); // entra en la próxima
    expect(esperaEstimada(7, KARTS)).toBe(0); // todavía cabe en la próxima
    expect(esperaEstimada(8, KARTS)).toBe(10); // le toca esperar una vuelta
    expect(esperaEstimada(20, KARTS)).toBe(20); // dos vueltas
  });

  it("no inventa un número si falta la configuración", () => {
    expect(esperaEstimada(10, { cupo_por_tanda: null, minutos_por_tanda: 10 })).toBeNull();
    expect(esperaEstimada(10, { cupo_por_tanda: 8, minutos_por_tanda: null })).toBeNull();
    expect(esperaEstimada(10, { cupo_por_tanda: 0, minutos_por_tanda: 10 })).toBeNull();
  });

  it("lo dice en palabras", () => {
    expect(textoEspera(null)).toBe("—");
    expect(textoEspera(0)).toBe("ya casi");
    expect(textoEspera(15)).toBe("~15 min");
    expect(textoEspera(60)).toBe("~1 h");
    expect(textoEspera(70)).toBe("~1 h 10 min");
  });
});

describe("consecutivo del día", () => {
  it("arranca en 1 cuando la atracción no tiene turnos hoy", () => {
    expect(siguienteNumero([])).toBe(1);
  });

  it("sigue desde el mayor, aunque hayan cancelado turnos en medio", () => {
    expect(siguienteNumero([1, 2, 3])).toBe(4);
    expect(siguienteNumero([1, 5, 3])).toBe(6);
  });
});

describe("resumen para el operario", () => {
  const fila = [
    t(1, "atendido"),
    t(2, "no_se_presento"),
    t(3, "llamado"),
    t(4, "esperando", 4),
    t(5, "esperando"),
  ];

  it("dice a quién está llamando y cuánta gente queda", () => {
    expect(resumirFila(fila)).toEqual({
      esperando: 2,
      personasEsperando: 5,
      llamado: 3,
      atendidosHoy: 1,
      noSePresentaron: 1,
    });
  });

  it("sin nadie llamado lo reporta como null", () => {
    expect(resumirFila([t(1, "esperando")]).llamado).toBeNull();
  });

  it("con fila vacía no rompe", () => {
    expect(resumirFila([])).toEqual({
      esperando: 0, personasEsperando: 0, llamado: null, atendidosHoy: 0, noSePresentaron: 0,
    });
  });
});
