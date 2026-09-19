import React from "react";
import { expect, it, vi } from "vitest";
import { act, create } from "react-test-renderer";

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
}));

const { SelectorDeHijo } = await import("./SelectorDeHijo");

const hijos = [
  { estudianteId: "e1", nombre: "Ana" },
  { estudianteId: "e2", nombre: "Luis" },
];

const pintar = (elemento: React.ReactElement) => {
  let vista!: ReturnType<typeof create>;
  act(() => { vista = create(elemento); });
  return vista;
};

/**
 * La mayoria de representantes del piloto tiene un solo hijo. Una barra con
 * una sola opcion siempre seleccionada no es un control: es un adorno donde
 * deberia empezar el reporte.
 */
it("no dibuja nada con uno o ningun hijo", () => {
  for (const lista of [[], [hijos[0]]]) {
    const vista = pintar(
      <SelectorDeHijo hijos={lista} activo={lista[0]?.estudianteId ?? null} onCambiar={() => {}} />,
    );
    expect(vista.toJSON()).toBeNull();
  }
});

it("marca cual esta abierto para el lector de pantalla, no solo con color", () => {
  const vista = pintar(<SelectorDeHijo hijos={hijos} activo="e2" onCambiar={() => {}} />);
  const pestanas = vista.root.findAllByProps({ accessibilityRole: "tab" });
  expect(pestanas).toHaveLength(2);
  expect(pestanas[0].props.accessibilityState).toEqual({ selected: false });
  expect(pestanas[1].props.accessibilityState).toEqual({ selected: true });
});

it("avisa hacia arriba del hijo elegido, no lo guarda por su cuenta", () => {
  const onCambiar = vi.fn();
  const vista = pintar(<SelectorDeHijo hijos={hijos} activo="e1" onCambiar={onCambiar} />);
  act(() => {
    vista.root.findAllByProps({ accessibilityRole: "tab" })[1].props.onPress();
  });
  expect(onCambiar).toHaveBeenCalledWith("e2");
});
