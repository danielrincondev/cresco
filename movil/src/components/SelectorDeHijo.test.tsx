import React from "react";
import { expect, it, vi } from "vitest";
import { act, create } from "react-test-renderer";

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  Modal: "Modal",
}));
// `HijoActivo` usa `Icono`, y ese arrastra JSX sin transpilar desde
// `@expo/vector-icons`.
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));

const { SelectorDeHijo, HijoActivo } = await import("./SelectorDeHijo");

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

/**
 * Con un solo hijo no hay nada que elegir: una flecha que abre una lista de
 * una opcion promete algo que no existe.
 */
it("con un hijo enseña el nombre y no ofrece cambiar", async () => {
  let v!: ReturnType<typeof create>;
  await act(async () => {
    v = create(<HijoActivo hijos={[hijos[0]]} activo="e1" onCambiar={() => {}} />);
  });
  const json = JSON.stringify(v.toJSON());
  expect(json).toContain("Ana");
  expect(v.root.findAll((n) => n.props.accessibilityState?.expanded !== undefined)).toHaveLength(0);
});

it("con varios hijos deja cambiar y dice a quién estás viendo", async () => {
  const cambios: string[] = [];
  let v!: ReturnType<typeof create>;
  await act(async () => {
    v = create(<HijoActivo hijos={hijos} activo="e1" onCambiar={(id) => cambios.push(id)} />);
  });
  const abrir = v.root
    .findAll((n) => typeof n.props.accessibilityLabel === "string" &&
      n.props.accessibilityLabel.startsWith("Viendo a Ana"))
    .at(0);
  expect(abrir).toBeTruthy();
  await act(async () => abrir!.props.onPress());
  const otro = v.root
    .findAll((n) => n.props.accessibilityState?.selected === false)
    .at(0);
  await act(async () => otro!.props.onPress());
  expect(cambios).toEqual(["e2"]);
});
