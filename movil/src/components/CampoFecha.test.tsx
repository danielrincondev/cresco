import React from "react";
import { expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  Modal: "Modal",
  Platform: { OS: "web" },
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));

const { CampoFecha, leerFecha } = await import("./CampoFecha");

const pintar = (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  act(() => {
    v = create(e);
  });
  return v;
};
const texto = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());
const porEtiqueta = (v: ReactTestRenderer, etiqueta: string) =>
  v.root.findAll((n) => n.props.accessibilityLabel === etiqueta).at(0);

/**
 * `new Date("2026-02-31")` no protesta: devuelve el 3 de marzo. Una fecha de
 * parcial corrida tres dias sin avisar es justo el fallo que este campo
 * existe para evitar, asi que se comprueba el viaje de ida y vuelta.
 */
it("rechaza fechas que no existen en vez de correrlas", () => {
  expect(leerFecha("2026-02-31")).toBeNull();
  expect(leerFecha("2026-13-01")).toBeNull();
  expect(leerFecha("2026-1-1")).toBeNull();
  expect(leerFecha("mañana")).toBeNull();
  expect(leerFecha("2026-02-28")).toEqual({ anio: 2026, mes: 1, dia: 28 });
  // Bisiesto: 2028 si lo es, y el campo tiene que dejarlo pasar.
  expect(leerFecha("2028-02-29")).toEqual({ anio: 2028, mes: 1, dia: 29 });
});

it("el campo de texto sigue funcionando", () => {
  const cambios: string[] = [];
  const v = pintar(
    <CampoFecha etiqueta="Inicio" valor="" onChange={(f) => cambios.push(f)} />,
  );
  // El calendario es la otra puerta, no la unica: quien sabe la fecha la
  // escribe mas rapido de lo que la busca.
  expect(texto(v)).toContain("AAAA-MM-DD");
});

it("el calendario está cerrado hasta que se pide", () => {
  const v = pintar(<CampoFecha etiqueta="Inicio" valor="" onChange={() => {}} />);
  // El mock devuelve los componentes nativos como cadenas, y el tipo de
  // `n.type` no lo sabe: de ahi la comparacion ensanchada.
  const modal = v.root.findAll((n) => (n.type as unknown) === "Modal").at(0);
  expect(modal?.props.visible).toBe(false);
});

it("abrir el calendario enseña el mes de la fecha ya escrita", () => {
  const v = pintar(
    <CampoFecha etiqueta="Inicio" valor="2026-05-04" onChange={() => {}} />,
  );
  act(() =>
    porEtiqueta(v, "Elegir inicio en un calendario")!.props.onPress(),
  );
  // Abrir siempre en el mes de hoy obligaria a navegar a mano al corregir.
  expect(texto(v)).toContain("mayo");
  expect(texto(v)).toContain("2026");
});

it("elegir un día escribe la fecha en formato del servidor", () => {
  const cambios: string[] = [];
  const v = pintar(
    <CampoFecha
      etiqueta="Inicio"
      valor="2026-05-04"
      onChange={(f) => cambios.push(f)}
    />,
  );
  act(() =>
    porEtiqueta(v, "Elegir inicio en un calendario")!.props.onPress(),
  );
  act(() => porEtiqueta(v, "9 de mayo de 2026")!.props.onPress());
  expect(cambios).toEqual(["2026-05-09"]);
});

/** Diciembre → enero tiene que cambiar de año, no dar el mes 12. */
it("pasar de diciembre lleva a enero del año siguiente", () => {
  const v = pintar(
    <CampoFecha etiqueta="Inicio" valor="2026-12-10" onChange={() => {}} />,
  );
  act(() =>
    porEtiqueta(v, "Elegir inicio en un calendario")!.props.onPress(),
  );
  act(() => porEtiqueta(v, "Mes siguiente")!.props.onPress());
  const t = texto(v);
  expect(t).toContain("enero");
  expect(t).toContain("2027");
});

it("retroceder desde enero lleva a diciembre del año anterior", () => {
  const v = pintar(
    <CampoFecha etiqueta="Inicio" valor="2026-01-10" onChange={() => {}} />,
  );
  act(() =>
    porEtiqueta(v, "Elegir inicio en un calendario")!.props.onPress(),
  );
  act(() => porEtiqueta(v, "Mes anterior")!.props.onPress());
  const t = texto(v);
  expect(t).toContain("diciembre");
  expect(t).toContain("2025");
});
