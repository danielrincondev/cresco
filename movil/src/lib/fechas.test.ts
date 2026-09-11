import { describe, expect, it } from "vitest";

import {
  diasEntre,
  fechaHoraLegible,
  fechaISO,
  fechaLegible,
  horaISO,
  hoyISO,
  plazoLegible,
} from "./fechas";

/** 2026-09-09 a las 15:00 UTC = 10:00 en Guayaquil. */
const MEDIODIA = Date.parse("2026-09-09T15:00:00Z");
/** 2026-09-10 a las 02:00 UTC = 21:00 del 9 en Guayaquil. */
const NOCHE = Date.parse("2026-09-10T02:00:00Z");
const DIA = 86_400_000;

describe("fechas — la zona del piloto", () => {
  it("usa la hora de Guayaquil, no la UTC", () => {
    expect(fechaISO(MEDIODIA)).toBe("2026-09-09");
    expect(horaISO(MEDIODIA)).toBe("10:00");
  });

  /**
   * El bug que esto evita es el mismo que hubo en Postgres con `now()::date`:
   * a las 21:00 en Guayaquil ya es el día siguiente en UTC, y una cita o una
   * matrícula quedaba fechada un día adelante.
   */
  it("de noche no adelanta el día", () => {
    expect(fechaISO(NOCHE)).toBe("2026-09-09");
    expect(horaISO(NOCHE)).toBe("21:00");
  });

  it("hoyISO es fechaISO del instante dado", () => {
    expect(hoyISO(NOCHE)).toBe("2026-09-09");
  });
});

describe("fechas — texto legible", () => {
  it("escribe el día de la semana y el mes en español", () => {
    expect(fechaLegible("2026-09-09")).toBe("miércoles 9 de septiembre");
    expect(fechaLegible("2027-01-01")).toBe("viernes 1 de enero");
  });

  it("junta fecha y hora en Guayaquil", () => {
    expect(fechaHoraLegible(NOCHE)).toBe("miércoles 9 de septiembre, 21:00");
  });

  it("devuelve la entrada tal cual si no es una fecha", () => {
    expect(fechaLegible("mañana")).toBe("mañana");
  });
});

describe("fechas — distancias en días", () => {
  it("cuenta días de calendario, no de 24 horas", () => {
    // De las 21:00 del 9 a las 10:00 del 10 hay 13 horas, pero es un día.
    expect(diasEntre(NOCHE, NOCHE + 13 * 60 * 60 * 1000)).toBe(1);
  });

  /**
   * Cruzar un cambio de mes es donde se rompe la aritmética ingenua: si el mes
   * se pasa 1-based a `Date.UTC`, "31 de enero" se desborda a marzo y la
   * diferencia sale negativa.
   */
  it("cruza fin de mes y fin de año sin desbordarse", () => {
    const treintaYUnoEnero = Date.parse("2027-01-31T15:00:00Z");
    const unoFebrero = Date.parse("2027-02-01T15:00:00Z");
    expect(diasEntre(treintaYUnoEnero, unoFebrero)).toBe(1);

    const finDeAnio = Date.parse("2026-12-31T15:00:00Z");
    const anioNuevo = Date.parse("2027-01-01T15:00:00Z");
    expect(diasEntre(finDeAnio, anioNuevo)).toBe(1);
  });

  it("es negativo hacia atrás", () => {
    expect(diasEntre(MEDIODIA, MEDIODIA - 3 * DIA)).toBe(-3);
  });
});

describe("fechas — el plazo de un reclamo", () => {
  it.each([
    [0, "vence hoy"],
    [1, "vence mañana"],
    [5, "vence en 5 días"],
    [-1, "venció ayer"],
    [-3, "venció hace 3 días"],
  ])("con %i días de diferencia dice %s", (dias, esperado) => {
    expect(plazoLegible(MEDIODIA + dias * DIA, MEDIODIA)).toBe(esperado);
  });

  it("cuenta el día de calendario aunque falten pocas horas", () => {
    // 21:00 de hoy → 10:00 de mañana: 13 horas, pero se lee "mañana".
    expect(plazoLegible(NOCHE + 13 * 60 * 60 * 1000, NOCHE)).toBe("vence mañana");
  });
});
