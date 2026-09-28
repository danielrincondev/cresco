import { describe, expect, it } from "vitest";

import { Marca, Paletas, Semantico, Superficie, Texto, TonoEstado, modoOscuro } from "./Theme";

/** Contraste WCAG 2 entre dos colores `#RRGGBB`. */
function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const canal = (i: number) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  };
  const [mayor, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (mayor + 0.05) / (menor + 0.05);
}

describe("el tema", () => {
  it("sin preferencia guardada usa la paleta clara, y la clara es la de siempre", () => {
    expect(modoOscuro).toBe(false);
    expect(Marca).toEqual({ claro: "#EBF4FA", base: "#00509E", oscuro: "#002A5C" });
    expect(Superficie).toEqual({ fondo: "#EBF4FA", tarjeta: "#FFFFFF", borde: "#E2E8F0", separador: "#E2E8F0" });
    expect(Texto).toEqual({ primario: "#002A5C", secundario: "#4A5568", deshabilitado: "#A0AEC0", sobreColor: "#FFFFFF" });
    expect(Semantico).toEqual({ negativa: "#E53E3E", error: "#C53030", emergencia: "#9B2C2C", positiva: "#16A34A" });
    expect(TonoEstado.critico).toEqual({ fondo: "#9B2C2C", borde: "#9B2C2C", texto: "#FFFFFF" });
  });

  it("las dos paletas tienen exactamente los mismos nombres", () => {
    const forma = (paleta: object) =>
      Object.entries(paleta).map(([grupo, valores]) => [grupo, Object.keys(valores as object)]);
    expect(forma(Paletas.oscuro)).toEqual(forma(Paletas.claro));
  });

  for (const nombre of ["claro", "oscuro"] as const) {
    it(`en modo ${nombre}, cada texto que usan las pantallas pasa AA (4.5:1) sobre su fondo`, () => {
      const { Marca: M, Superficie: S, Texto: T, Semantico: E, TonoEstado: tonos } = Paletas[nombre];
      const pares: [string, string, string][] = [
        ["texto primario sobre el fondo", T.primario, S.fondo],
        ["texto primario sobre una tarjeta", T.primario, S.tarjeta],
        ["texto primario sobre un resaltado", T.primario, M.claro],
        ["texto secundario sobre el fondo", T.secundario, S.fondo],
        ["texto secundario sobre una tarjeta", T.secundario, S.tarjeta],
        ["texto secundario sobre un resaltado", T.secundario, M.claro],
        ["enlace o icono de marca sobre el fondo", M.base, S.fondo],
        ["enlace o icono de marca sobre una tarjeta", M.base, S.tarjeta],
        ["enlace o icono de marca sobre un resaltado", M.base, M.claro],
        ["texto de un botón de marca", T.sobreColor, M.base],
        ["texto de la opción elegida", T.sobreColor, M.oscuro],
        ["marca fuerte como texto sobre un resaltado", M.oscuro, M.claro],
        ["error como texto sobre el fondo", E.error, S.fondo],
        ["error como texto sobre una tarjeta", E.error, S.tarjeta],
        ["texto de un aviso de error", T.sobreColor, E.error],
        ["texto de la banda de emergencia", T.sobreColor, E.emergencia],
        ["botón invertido de la emergencia", E.emergencia, T.sobreColor],
        ["puntos ganados del resumen sobre una tarjeta", tonos.positivo.texto, S.tarjeta],
        ["puntos perdidos del resumen sobre una tarjeta", tonos.negativo.texto, S.tarjeta],
        ...Object.entries(tonos).map(
          ([tono, t]) => [`chip de estado ${tono}`, t.texto, t.fondo] as [string, string, string],
        ),
      ];
      const fallan = pares
        .map(([que, texto, fondo]) => ({ que, contraste: Number(contraste(texto, fondo).toFixed(2)) }))
        .filter((par) => par.contraste < 4.5);
      expect(fallan).toEqual([]);
    });
  }

  it("en oscuro, un error de formulario y una emergencia no son el mismo rojo", () => {
    const { error, emergencia } = Paletas.oscuro.Semantico;
    expect(contraste(error, emergencia)).toBeGreaterThan(1.4);
  });
});
