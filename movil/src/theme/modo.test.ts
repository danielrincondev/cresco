import { afterEach, expect, it, vi } from "vitest";

import {
  esquemaDelSistema,
  guardarPreferenciaTema,
  leerPreferenciaTema,
  resolverModoOscuro,
} from "./modo";

function almacenFalso(inicial: Record<string, string> = {}) {
  const datos: Record<string, string> = { ...inicial };
  return {
    datos,
    getItem: (clave: string) => datos[clave] ?? null,
    setItem: (clave: string, valor: string) => {
      datos[clave] = valor;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

it("sin nada guardado, el tema es el claro de siempre", () => {
  vi.stubGlobal("localStorage", almacenFalso());
  expect(leerPreferenciaTema()).toBe("claro");
});

it("guarda la preferencia y la lee en el próximo arranque (en web, en localStorage)", () => {
  const almacen = almacenFalso();
  vi.stubGlobal("localStorage", almacen);
  for (const tema of ["oscuro", "sistema", "claro"] as const) {
    expect(guardarPreferenciaTema(tema)).toBe(true);
    expect(almacen.datos["cresco.tema"]).toBe(tema);
    expect(leerPreferenciaTema()).toBe(tema);
  }
});

it("respeta el modo oscuro que se guardó con el interruptor del 28 de septiembre", () => {
  vi.stubGlobal("localStorage", almacenFalso({ "cresco.modoOscuro": "1" }));
  expect(leerPreferenciaTema()).toBe("oscuro");
  vi.stubGlobal("localStorage", almacenFalso({ "cresco.modoOscuro": "0" }));
  expect(leerPreferenciaTema()).toBe("claro");
});

it("un valor desconocido guardado cuenta como claro", () => {
  vi.stubGlobal("localStorage", almacenFalso({ "cresco.tema": "violeta" }));
  expect(leerPreferenciaTema()).toBe("claro");
});

it("si el almacén falla, se queda en claro y avisa que no pudo guardar", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("lleno");
    },
  });
  expect(leerPreferenciaTema()).toBe("claro");
  expect(guardarPreferenciaTema("oscuro")).toBe(false);
});

it("sin ningún almacén, se queda en claro", () => {
  vi.stubGlobal("localStorage", undefined);
  expect(leerPreferenciaTema()).toBe("claro");
  expect(guardarPreferenciaTema("oscuro")).toBe(false);
});

it("en React Native, si los módulos nativos no cargan, también se queda en claro", () => {
  vi.stubGlobal("navigator", { product: "ReactNative" });
  expect(leerPreferenciaTema()).toBe("claro");
  expect(esquemaDelSistema()).toBeNull();
});

it("'como el teléfono' sigue al sistema; claro y oscuro no le hacen caso", () => {
  expect(resolverModoOscuro("sistema", "dark")).toBe(true);
  expect(resolverModoOscuro("sistema", "light")).toBe(false);
  expect(resolverModoOscuro("sistema", null)).toBe(false);
  expect(resolverModoOscuro("oscuro", "light")).toBe(true);
  expect(resolverModoOscuro("claro", "dark")).toBe(false);
});

it("en web, el modo del sistema sale de prefers-color-scheme", () => {
  vi.stubGlobal("matchMedia", (consulta: string) => ({ matches: consulta.includes("dark") }));
  expect(esquemaDelSistema()).toBe("dark");
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  expect(esquemaDelSistema()).toBe("light");
});
