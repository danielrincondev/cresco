import { describe, expect, it } from "vitest";
import { consejoPorCategoria, fraseDeAliento, fraseDeLecturas } from "./insights";

const BASE = {
  puntajeActual: 60,
  puntajeAnterior: null as number | null,
  puntosPositivos: 0,
  puntosNegativos: 0,
  ultimaNegativa: null as string | null,
  inicioParcial: "2026-09-01",
  hoy: "2026-09-10",
};

describe("fraseDeAliento", () => {
  it("celebra la mejora respecto al parcial anterior antes que cualquier otra señal", () => {
    const frase = fraseDeAliento({ ...BASE, puntajeActual: 65, puntajeAnterior: 60 });
    expect(frase).toContain("Subió 5 puntos");
  });

  it("usa singular cuando la mejora es de un solo punto", () => {
    const frase = fraseDeAliento({ ...BASE, puntajeActual: 61, puntajeAnterior: 60 });
    expect(frase).toContain("Subió 1 punto ");
  });

  it("no dice nada si el puntaje bajó o quedó igual respecto al anterior -- pasa a la siguiente señal", () => {
    // Igual, y sin racha (negativa de hoy mismo) ni balance: se queda en silencio.
    expect(fraseDeAliento({ ...BASE, puntajeActual: 60, puntajeAnterior: 60, ultimaNegativa: "2026-09-10" })).toBeNull();
    // Bajó, pero hay una racha real: la racha sí se dice, la caída no.
    const frase = fraseDeAliento({ ...BASE, puntajeActual: 55, puntajeAnterior: 60, ultimaNegativa: "2026-09-01" });
    expect(frase).not.toContain("Subió");
    expect(frase).toContain("días sin una anotación negativa");
  });

  it("cuenta la racha desde la última negativa cuando sí hubo alguna", () => {
    const frase = fraseDeAliento({ ...BASE, ultimaNegativa: "2026-09-05" });
    expect(frase).toBe("Van 5 días sin una anotación negativa — se nota el acompañamiento.");
  });

  it("cuenta la racha desde el inicio del parcial cuando no hubo ninguna negativa todavía", () => {
    const frase = fraseDeAliento({ ...BASE, inicioParcial: "2026-09-04" });
    expect(frase).toBe("Ninguna anotación negativa en lo que va del parcial — se nota el acompañamiento.");
  });

  it("no cuenta una racha de menos de tres días -- dos días sin novedades es lo normal", () => {
    const frase = fraseDeAliento({ ...BASE, ultimaNegativa: "2026-09-09", puntosPositivos: 0, puntosNegativos: 0 });
    expect(frase).toBeNull();
  });

  it("cae al balance positivo cuando no hay mejora ni racha, pero suma más de lo que resta", () => {
    const frase = fraseDeAliento({
      ...BASE, ultimaNegativa: "2026-09-09", puntosPositivos: 4, puntosNegativos: -2,
    });
    expect(frase).toBe("Este parcial va sumando más de lo que resta.");
  });

  it("se queda en silencio en vez de decir algo negativo cuando ninguna señal es positiva", () => {
    const frase = fraseDeAliento({
      ...BASE, ultimaNegativa: "2026-09-09", puntosPositivos: 1, puntosNegativos: -3,
    });
    expect(frase).toBeNull();
  });

  it("un balance en cero (sin ninguna acción) no cuenta como positivo", () => {
    expect(fraseDeAliento({ ...BASE, ultimaNegativa: "2026-09-09" })).toBeNull();
  });
});

describe("consejoPorCategoria", () => {
  it("no dice nada ante un incidente aislado -- hace falta un patrón, no una vez", () => {
    expect(consejoPorCategoria(["DISCIPLINA"])).toBeNull();
  });

  it("da el consejo de la categoría que más se repite", () => {
    expect(consejoPorCategoria(["DISCIPLINA", "RESPONSABILIDAD", "DISCIPLINA"]))
      .toBe("Conversar sobre cómo se sintió hoy en clase puede ayudar a entender qué está pasando.");
  });

  it("sin ninguna categoría, no hay nada que decir", () => {
    expect(consejoPorCategoria([])).toBeNull();
  });

  it("una categoría repetida sin consejo escrito para ella no revienta, solo se queda callada", () => {
    expect(consejoPorCategoria(["OTRO", "OTRO"])).toBeNull();
  });
});

describe("fraseDeLecturas", () => {
  it("no celebra una sola lectura -- todavía no es un patrón de acompañamiento", () => {
    expect(fraseDeLecturas(1)).toBeNull();
    expect(fraseDeLecturas(0)).toBeNull();
  });

  it("reconoce al representante desde la segunda lectura del parcial", () => {
    expect(fraseDeLecturas(3)).toBe("Revisaste el reporte diario 3 veces este parcial — se nota el acompañamiento.");
  });
});
