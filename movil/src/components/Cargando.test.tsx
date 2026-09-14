import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", KeyboardAvoidingView: "KeyboardAvoidingView",
  Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput",
  View: "View", Platform: { OS: "android" }, StyleSheet: { create: (e: unknown) => e },
}));

// `NucleoUI` importa `Icono` desde #66 (el boton de atras del encabezado).
// Sin simularlo, vitest intenta parsear el JSX de `@expo/vector-icons`, que
// viene en archivos `.js`, y el archivo entero no carga. No se nota hasta que
// las dos ramas se juntan: por separado cada una pasa.
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));

const { Cargando } = await import("./NucleoUI");

const pintar = (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  act(() => { v = create(e); });
  return v;
};
const textos = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());

afterEach(() => { vi.useRealTimers(); });

/**
 * El estado que la aplicacion no sabia contar. `LimiteError` captura lo que se
 * **lanza**; sin red Convex no lanza nada -- el websocket no conecta,
 * `useQuery` se queda en `undefined` y la pantalla muestra "Cargando..." para
 * siempre, sin distinguirse de una consulta lenta y sin ninguna salida.
 *
 * Es el caso mas probable del piloto: una madre abriendo la aplicacion en la
 * puerta del aula con una barra de cobertura.
 */
it("al principio solo dice que carga, sin alarmar", () => {
  vi.useFakeTimers();
  const v = pintar(<Cargando />);
  expect(textos(v)).toContain("Cargando...");
  expect(textos(v)).not.toContain("Revisa tu conexión");
});

it("pasados unos segundos admite que algo va mal", () => {
  vi.useFakeTimers();
  const v = pintar(<Cargando mensaje="Cargando tu espacio..." />);
  act(() => { vi.advanceTimersByTime(8000); });
  const t = textos(v);
  expect(t).toContain("Cargando tu espacio...");
  expect(t).toContain("Revisa tu conexión");
  // No promete reintentar: Convex reconecta solo y entonces el dato llega.
  expect(t).toContain("esto se carga solo");
});

it("no deja el temporizador corriendo al desmontarse", () => {
  vi.useFakeTimers();
  const v = pintar(<Cargando />);
  act(() => { v.unmount(); });
  expect(() => act(() => { vi.advanceTimersByTime(9000); })).not.toThrow();
});
