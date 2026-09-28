import { afterEach, expect, it, vi } from "vitest";

import { guardarModoOscuro, leerModoOscuro } from "./modo";

function almacenFalso() {
  const datos: Record<string, string> = {};
  return {
    datos,
    getItem: (clave: string) => datos[clave] ?? null,
    setItem: (clave: string, valor: string) => {
      datos[clave] = valor;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

it("sin nada guardado, el modo es el claro de siempre", () => {
  vi.stubGlobal("localStorage", almacenFalso());
  expect(leerModoOscuro()).toBe(false);
});

it("guarda la preferencia y la lee en el próximo arranque (en web, en localStorage)", () => {
  const almacen = almacenFalso();
  vi.stubGlobal("localStorage", almacen);
  expect(guardarModoOscuro(true)).toBe(true);
  expect(almacen.datos["cresco.modoOscuro"]).toBe("1");
  expect(leerModoOscuro()).toBe(true);
  expect(guardarModoOscuro(false)).toBe(true);
  expect(leerModoOscuro()).toBe(false);
});

it("si el almacén falla, se queda en claro y no revienta", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("lleno");
    },
  });
  expect(leerModoOscuro()).toBe(false);
  expect(guardarModoOscuro(true)).toBe(false);
});

it("sin ningún almacén, se queda en claro y avisa que no pudo guardar", () => {
  vi.stubGlobal("localStorage", undefined);
  expect(leerModoOscuro()).toBe(false);
  expect(guardarModoOscuro(true)).toBe(false);
});

it("en React Native, si el módulo nativo no carga, también se queda en claro", () => {
  vi.stubGlobal("navigator", { product: "ReactNative" });
  expect(leerModoOscuro()).toBe(false);
});
