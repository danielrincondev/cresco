import React from "react";
import { expect, it, vi } from "vitest";
import { act, create } from "react-test-renderer";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", KeyboardAvoidingView: "KeyboardAvoidingView",
  Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput",
  View: "View", Platform: { OS: "android" }, StyleSheet: { create: (e: unknown) => e },
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));

const { Campo, Pagina } = await import("./NucleoUI");

const pintar = (elemento: React.ReactElement) => {
  let vista!: ReturnType<typeof create>;
  act(() => { vista = create(elemento); });
  return vista;
};

/** Todo el texto pintado, aplanado. `Text` es una cadena porque el mock de
 * `react-native` sustituye los componentes por nombres de etiqueta. */
const textos = (vista: ReturnType<typeof create>) =>
  JSON.stringify(vista.toJSON());

/**
 * Un "0/500" bajo un campo vacio es ruido permanente. El numero importa justo
 * cuando el docente esta a punto de quedarse sin espacio describiendo lo que
 * paso, que es cuando aparece.
 */
it("el contador de caracteres solo aparece cerca del tope", () => {
  const corto = pintar(<Campo etiqueta="Descripción" value="hola" maxLength={500} />);
  expect(textos(corto)).not.toContain("/500");

  const largo = pintar(<Campo etiqueta="Descripción" value={"x".repeat(485)} maxLength={500} />);
  expect(textos(largo)).toContain("485");
});

it.each([
  { tope: 1, desde: 1 },
  { tope: 10, desde: 8 },
  { tope: 25, desde: 20 },
  { tope: 100, desde: 80 },
  { tope: 500, desde: 480 },
])("el contador con límite $tope aparece desde $desde caracteres", ({ tope, desde }) => {
  const vista = pintar(<Campo etiqueta="Documento" value="" maxLength={tope} />);
  for (const largo of [0, desde - 1, desde, tope]) {
    act(() => {
      vista.update(<Campo etiqueta="Documento" value={"x".repeat(largo)} maxLength={tope} />);
    });
    expect(vista.root.findAllByProps({
      accessibilityLabel: `${largo} de ${tope} caracteres`,
    })).toHaveLength(largo >= desde ? 1 : 0);
  }
  act(() => { vista.unmount(); });
});

it("no muestra contador sin límite o con límite cero", () => {
  for (const tope of [undefined, 0]) {
    const vista = pintar(<Campo etiqueta="Documento" value="" maxLength={tope} />);
    expect(textos(vista)).not.toContain("caracteres");
    act(() => { vista.unmount(); });
  }
});

/**
 * Dos lineas bajo un campo, una de las cuales ya no aplica, es como se ignoran
 * las dos. El error sustituye a la ayuda en vez de acumularse.
 */
it("el error sustituye a la ayuda, no se suma", () => {
  const vista = pintar(
    <Campo etiqueta="Cédula" ayuda="Diez dígitos" error="Revisa la cédula." value="" />,
  );
  const todo = textos(vista);
  expect(todo).toContain("Revisa la cédula.");
  expect(todo).not.toContain("Diez dígitos");
});

it("el boton de atras se anuncia con palabras, no con una flecha", () => {
  const onPress = vi.fn();
  const vista = pintar(
    <Pagina titulo="Ficha" atras={{ onPress }}>
      <React.Fragment />
    </Pagina>,
  );
  const boton = vista.root.findByProps({ accessibilityLabel: "Volver" });
  act(() => boton.props.onPress());
  expect(onPress).toHaveBeenCalled();
});

it("sin atras ni accion, la pantalla no dibuja barra de encabezado", () => {
  const vista = pintar(
    <Pagina titulo="Inicio">
      <React.Fragment />
    </Pagina>,
  );
  expect(vista.root.findAllByProps({ accessibilityLabel: "Volver" })).toHaveLength(0);
});
