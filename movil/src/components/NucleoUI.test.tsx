import React from "react";
import { expect, it, vi } from "vitest";
import { act, create } from "react-test-renderer";

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));

const { Campo, ContextoBarraInferior, Interruptor, Pagina } = await import("./NucleoUI");

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

/* ---------- Interruptor ---------- */

it("el interruptor dice si está encendido, no solo lo pinta", () => {
  const vista = pintar(
    <Interruptor etiqueta="Mostrar la barra" encendido onChange={() => {}} />,
  );
  const boton = vista.root.findByProps({ accessibilityLabel: "Mostrar la barra" });
  expect(boton.props.accessibilityRole).toBe("switch");
  expect(boton.props.accessibilityState.checked).toBe(true);
});

it("tocar el interruptor avisa del cambio; no decide el valor por su cuenta", () => {
  const cambios: number[] = [];
  const vista = pintar(
    <Interruptor
      etiqueta="Mostrar la barra"
      encendido={false}
      onChange={() => cambios.push(Date.now())}
    />,
  );
  act(() => vista.root.findByProps({ accessibilityLabel: "Mostrar la barra" }).props.onPress());
  expect(cambios).toHaveLength(1);
});

/* ---------- ContextoBarraInferior en Pagina ---------- */

it("sin proveedor, Pagina no reserva relleno ni reporta scroll", () => {
  const vista = pintar(
    <Pagina titulo="Inicio">
      <React.Fragment />
    </Pagina>,
  );
  const scroll = vista.root.findByType("ScrollView" as never);
  expect(scroll.props.onScroll).toBeUndefined();
});

/**
 * `Pagina` es la que decide reservar sitio y avisar del scroll -- pero solo
 * cuando alguien puso el contexto por encima. Es justo lo que hace posible
 * que `BarraInferior` funcione sin que las ~25 pantallas que usan `Pagina`
 * tengan que declarar un prop nuevo cada una.
 */
it("con proveedor, Pagina reserva el relleno pedido y reenvía el scroll", () => {
  const scrolls: number[] = [];
  const vista = pintar(
    <ContextoBarraInferior.Provider value={{ onScroll: (y) => scrolls.push(y), relleno: 88 }}>
      <Pagina titulo="Inicio">
        <React.Fragment />
      </Pagina>
    </ContextoBarraInferior.Provider>,
  );
  const scroll = vista.root.findByType("ScrollView" as never);
  expect(
    [scroll.props.contentContainerStyle].flat(Infinity).some(
      (s: unknown) => (s as { paddingBottom?: number })?.paddingBottom === 88,
    ),
  ).toBe(true);
  act(() => scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 42 } } }));
  expect(scrolls).toEqual([42]);
});

/* ---------- Botón ---------- */

it("un botón con tono que no es secundario va relleno de su tono: el texto se lee", async () => {
  const { Boton } = await import("./NucleoUI");
  const { TonoEstado } = await import("../theme/Theme");
  const vista = pintar(<Boton tono="NEGATIVA" onPress={() => {}}>Eliminar curso</Boton>);
  const boton = vista.root.findByProps({ accessibilityRole: "button" });
  const estilos = [boton.props.style].flat(Infinity).filter(Boolean);
  expect(estilos).toContainEqual({ backgroundColor: TonoEstado.negativo.fondo });
});

it("al pulsar se marca y al soltar vuelve; el toque llega igual", async () => {
  const { Boton } = await import("./NucleoUI");
  const onPress = vi.fn();
  const vista = pintar(<Boton onPress={onPress}>Guardar</Boton>);
  const boton = () => vista.root.findByProps({ accessibilityRole: "button" });
  const opacidad = () =>
    [boton().props.style].flat(Infinity).filter(Boolean).some((e: { opacity?: number }) => e.opacity === 0.8);
  act(() => boton().props.onPressIn());
  expect(opacidad()).toBe(true);
  act(() => boton().props.onPressOut());
  expect(opacidad()).toBe(false);
  act(() => boton().props.onPress());
  expect(onPress).toHaveBeenCalledTimes(1);
});
