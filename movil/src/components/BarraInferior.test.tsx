import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const ajustes = vi.hoisted(() => ({ reducir: false }));

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise.resolve(ajustes.reducir),
    addEventListener: () => ({ remove: () => {} }),
  },
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
// El mismo mock que usa `MenuLateral.test.tsx`: en pruebas no hay pantalla,
// así que las medidas del sistema van a cero.
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { BarraInferior, CIRCULO_ACTIVO } = await import("./BarraInferior");

const pintar = async (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  // `await`: con movimiento normal la animacion arranca en un efecto, y
  // `useReduceMotion` resuelve una promesa al montar.
  await act(async () => {
    v = create(e);
  });
  return v;
};

beforeEach(() => {
  ajustes.reducir = false;
});

const PESTANAS = [
  { clave: "citas", icono: "calendar-blank" as const, etiqueta: "Pedir una cita" },
  { clave: "inicio", icono: "home" as const, etiqueta: "Inicio" },
  { clave: "reporteHoy", icono: "file-document" as const, etiqueta: "Reporte diario" },
];

const porEtiqueta = (v: ReactTestRenderer, etiqueta: string) =>
  v.root.findAll((n) => n.props.accessibilityLabel === etiqueta).at(0)!;

it("pinta las tres pestañas con su etiqueta de accesibilidad", async () => {
  const v = await pintar(
    <BarraInferior pestanas={PESTANAS} activa="inicio" visible onCambiar={() => {}} />,
  );
  for (const p of PESTANAS) {
    expect(porEtiqueta(v, p.etiqueta)).toBeTruthy();
  }
});

it("tocar una pestaña avisa con su clave", async () => {
  const cambios: string[] = [];
  const v = await pintar(
    <BarraInferior
      pestanas={PESTANAS}
      activa="inicio"
      visible
      onCambiar={(c) => cambios.push(c)}
    />,
  );
  act(() => porEtiqueta(v, "Pedir una cita").props.onPress());
  expect(cambios).toEqual(["citas"]);
});

/**
 * `activo` en `Icono` es lo que pinta el glifo relleno en vez de contorno:
 * es el "estás aquí" que ya usa el resto del sistema (menú lateral, chips de
 * estado). La pestaña activa tiene que pedirlo; las demás, no.
 */
it("solo la pestaña activa pide el icono relleno", async () => {
  const v = await pintar(
    <BarraInferior pestanas={PESTANAS} activa="reporteHoy" visible onCambiar={() => {}} />,
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
it("solo la pestaña activa lleva el círculo de realce, y con alfa", async () => {
  const v = await pintar(
    <BarraInferior pestanas={PESTANAS} activa="citas" visible onCambiar={() => {}} />,
  );
  const circuloDe = (nombreIcono: string) =>
    v.root.findAllByProps({ nombre: nombreIcono })[0].parent!.props.style as unknown[];

  const activo = circuloDe("calendar-blank").flat(Infinity) as { backgroundColor?: string }[];
  const inactivo = circuloDe("home").flat(Infinity) as { backgroundColor?: string }[];

  expect(activo.some((s) => s?.backgroundColor === CIRCULO_ACTIVO)).toBe(true);
  expect(inactivo.some((s) => s?.backgroundColor === CIRCULO_ACTIVO)).toBe(false);
  // Con alfa: un color de 8 dígitos hex, no una mancha sólida de 6.
  expect(CIRCULO_ACTIVO).toMatch(/^#[0-9A-Fa-f]{8}$/);
});

/**
 * Sin hijo aprobado no hay a qué reporte ir. Una pestaña que lleva a una
 * pantalla vacía es peor que una pestaña apagada que explica por qué.
 */
it("una pestaña marcada como no disponible se deshabilita", async () => {
  const pestanas = [...PESTANAS.slice(0, 2), { ...PESTANAS[2], disponible: false }];
  const v = await pintar(
    <BarraInferior pestanas={pestanas} activa="inicio" visible onCambiar={() => {}} />,
  );
  const boton = porEtiqueta(v, "Reporte diario");
  expect(boton.props.disabled).toBe(true);
  expect(boton.props.accessibilityState.disabled).toBe(true);
});

/**
 * `visible={false}` no es solo estética: mientras está deslizada fuera de la
 * pantalla no puede seguir robando el foco ni los toques de lo que haya
 * quedado a la vista debajo de su antiguo sitio.
 */
it("oculta no intercepta toques ni se anuncia a un lector de pantalla", async () => {
  const v = await pintar(
    <BarraInferior pestanas={PESTANAS} activa="inicio" visible={false} onCambiar={() => {}} />,
  );
  const raiz = v.toJSON() as unknown as { props: Record<string, unknown> };
  expect(raiz.props.pointerEvents).toBe("none");
  expect(raiz.props.accessibilityElementsHidden).toBe(true);
});

it("visible sí acepta toques y es accesible", async () => {
  const v = await pintar(
    <BarraInferior pestanas={PESTANAS} activa="inicio" visible onCambiar={() => {}} />,
  );
  const raiz = v.toJSON() as unknown as { props: Record<string, unknown> };
  expect(raiz.props.pointerEvents).toBe("auto");
  expect(raiz.props.accessibilityElementsHidden).toBe(false);
});

/**
 * Con "reducir movimiento" no se desliza, pero sigue apareciendo y
 * desapareciendo: apagar la animación no puede apagar la función.
 */
it("con movimiento reducido igual respeta visible/oculto", async () => {
  ajustes.reducir = true;
  const oculta = await pintar(
    <BarraInferior pestanas={PESTANAS} activa="inicio" visible={false} onCambiar={() => {}} />,
  );
  expect((oculta.toJSON() as unknown as { props: Record<string, unknown> }).props.pointerEvents)
    .toBe("none");

  const visible = await pintar(
    <BarraInferior pestanas={PESTANAS} activa="inicio" visible onCambiar={() => {}} />,
  );
  expect((visible.toJSON() as unknown as { props: Record<string, unknown> }).props.pointerEvents)
    .toBe("auto");
});
