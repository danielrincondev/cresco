import React from "react";
import { expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
// El mismo mock que usa `MenuLateral.test.tsx`: en pruebas no hay pantalla,
// así que las medidas del sistema van a cero salvo que una prueba diga otra.
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { BarraInferior, CIRCULO_ACTIVO } = await import("./BarraInferior");

const pintar = (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  act(() => {
    v = create(e);
  });
  return v;
};

const PESTANAS = [
  { clave: "citas", icono: "calendar-blank" as const, etiqueta: "Pedir una cita" },
  { clave: "inicio", icono: "home" as const, etiqueta: "Inicio" },
  { clave: "reporteHoy", icono: "file-document" as const, etiqueta: "Reporte diario" },
];

const porEtiqueta = (v: ReactTestRenderer, etiqueta: string) =>
  v.root.findAll((n) => n.props.accessibilityLabel === etiqueta).at(0)!;

it("pinta las tres pestañas con su etiqueta de accesibilidad", () => {
  const v = pintar(
    <BarraInferior pestanas={PESTANAS} activa="inicio" onCambiar={() => {}} />,
  );
  for (const p of PESTANAS) {
    expect(porEtiqueta(v, p.etiqueta)).toBeTruthy();
  }
});

it("tocar una pestaña avisa con su clave", () => {
  const cambios: string[] = [];
  const v = pintar(
    <BarraInferior pestanas={PESTANAS} activa="inicio" onCambiar={(c) => cambios.push(c)} />,
  );
  act(() => porEtiqueta(v, "Pedir una cita").props.onPress());
  expect(cambios).toEqual(["citas"]);
});

/**
 * `activo` en `Icono` es lo que pinta el glifo relleno en vez de contorno:
 * es el "estás aquí" que ya usa el resto del sistema (menú lateral, chips de
 * estado). La pestaña activa tiene que pedirlo; las demás, no.
 */
it("solo la pestaña activa pide el icono relleno", () => {
  const v = pintar(
    <BarraInferior pestanas={PESTANAS} activa="reporteHoy" onCambiar={() => {}} />,
  );
  expect(v.root.findAllByProps({ nombre: "file-document" })[0].props.activo).toBe(true);
  expect(v.root.findAllByProps({ nombre: "home" })[0].props.activo).toBe(false);
});

/**
 * El círculo de realce tiene que notarse **solo** en la pestaña activa, y con
 * alfa -- no una mancha sólida -- para que el icono se siga viendo a través.
 * `.parent` sube del icono al círculo que lo envuelve, sin depender de en qué
 * posición exacta del árbol quede ese envoltorio.
 */
it("solo la pestaña activa lleva el círculo de realce, y con alfa", () => {
  const v = pintar(
    <BarraInferior pestanas={PESTANAS} activa="citas" onCambiar={() => {}} />,
  );
  const circuloDe = (nombreIcono: string) =>
    v.root.findAllByProps({ nombre: nombreIcono })[0].parent!.props.style as unknown[];

  const activo = circuloDe("calendar-blank").flat(Infinity) as { backgroundColor?: string }[];
  const inactivo = circuloDe("home").flat(Infinity) as { backgroundColor?: string }[];

  expect(activo.some((s) => s?.backgroundColor === CIRCULO_ACTIVO)).toBe(true);
  expect(inactivo.some((s) => s?.backgroundColor === CIRCULO_ACTIVO)).toBe(false);
  // Con alfa: un color de 8 dígitos hex, no una mancha solida de 6.
  expect(CIRCULO_ACTIVO).toMatch(/^#[0-9A-Fa-f]{8}$/);
});

/**
 * Sin hijo aprobado no hay a qué reporte ir. Una pestaña que lleva a una
 * pantalla vacía es peor que una pestaña apagada que explica por qué.
 */
it("una pestaña marcada como no disponible se deshabilita", () => {
  const pestanas = [...PESTANAS.slice(0, 2), { ...PESTANAS[2], disponible: false }];
  const v = pintar(<BarraInferior pestanas={pestanas} activa="inicio" onCambiar={() => {}} />);
  const boton = porEtiqueta(v, "Reporte diario");
  expect(boton.props.disabled).toBe(true);
  expect(boton.props.accessibilityState.disabled).toBe(true);
});

/**
 * `SafeAreaView` ya reserva la franja de gestos de Android para toda la
 * pantalla, pero `MenuLateral` demostró que no basta con confiar en eso para
 * un elemento pegado al borde. La barra pide sus propios márgenes y los usa.
 */
it("suma el margen inferior del sistema a su propio relleno", async () => {
  vi.resetModules();
  vi.doMock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 30, left: 0, right: 0 }),
  }));
  vi.doMock("react-native", async () => ({
    ...(await import("../test/mockReactNative")).reactNative(),
  }));
  vi.doMock("../theme/Icono", () => ({ Icono: "Icono" }));
  const { BarraInferior: ConMargen } = await import("./BarraInferior");

  const v = pintar(<ConMargen pestanas={PESTANAS} activa="inicio" onCambiar={() => {}} />);
  const raiz = v.toJSON() as unknown as { props: { style: unknown[] } };
  const estilos = [raiz.props.style].flat(Infinity) as { paddingBottom?: number }[];
  expect(estilos.some((s) => s?.paddingBottom === 30)).toBe(true);
});
