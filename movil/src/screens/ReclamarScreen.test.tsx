import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const estado = vi.hoisted(() => ({ llamadas: [] as unknown[] }));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", KeyboardAvoidingView: "KeyboardAvoidingView",
  Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput",
  View: "View", Platform: { OS: "web" }, StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
vi.mock("convex/react", () => ({
  useMutation: () => async (args: unknown) => { estado.llamadas.push(args); return "i1"; },
}));

const { DetalleAccion } = await import("./ReclamarScreen");
type Accion = Parameters<typeof DetalleAccion>[0]["accion"];
const { Boton, Campo, Opciones } = await import("../components/NucleoUI");

const pintar = (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  act(() => { v = create(e); });
  return v;
};
const texto = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());
const boton = (v: ReactTestRenderer, etiqueta: string) =>
  v.root.findAllByType(Boton).find((b) => b.props.children === etiqueta);

const NEGATIVA_VIGENTE = {
  id: "a1" as never, fecha: "2026-09-09", signo: "NEGATIVA" as const, puntos: -2,
  descripcion: "Se levantó varias veces durante la clase.", estado: "VIGENTE" as const,
};

// El tipo del componente, no el de la constante: las variantes de la
// prueba cambian `signo` y `estado`, que ahi estan fijados como literales.
const ver = (accion: Accion) =>
  pintar(<DetalleAccion accion={accion} nombre="Ana" onVolver={() => {}} />);

beforeEach(() => { estado.llamadas = []; });

/**
 * De las entrevistas del 1 de septiembre: el problema no es informar, es que
 * la familia **no acepta** lo que se le informa. Una aplicacion que presume de
 * derecho a replica y lo entierra en un submenu no lo esta dando.
 */
it("el botón de reclamar está a la vista en una negativa vigente", () => {
  const v = ver(NEGATIVA_VIGENTE);
  expect(boton(v, "Reclamar esta anotación")).toBeTruthy();
  expect(texto(v)).toContain("Se levantó varias veces");
});

/**
 * C8: lo bueno no se disputa, y lo ya anulado no tiene nada que reclamar. Pero
 * un boton apagado sin explicacion se lee como un fallo de la aplicacion.
 */
it.each([
  [{ ...NEGATIVA_VIGENTE, signo: "POSITIVA" as const, puntos: 2 }, "Lo bueno no se reclama"],
  [{ ...NEGATIVA_VIGENTE, estado: "ANULADA" as const }, "ya fue anulada"],
  [{ ...NEGATIVA_VIGENTE, estado: "MODIFICADA" as const }, "ya fue modificada"],
])("cuando no se puede reclamar, dice por qué (%#)", (accion, frase) => {
  const v = ver(accion);
  expect(boton(v, "Reclamar esta anotación")).toBeUndefined();
  expect(texto(v)).toContain(frase);
});

it("no envía el reclamo sin mensaje escrito", () => {
  const v = ver(NEGATIVA_VIGENTE);
  act(() => { boton(v, "Reclamar esta anotación")!.props.onPress(); });
  expect(boton(v, "Enviar el reclamo")!.props.disabled).toBe(true);
});

it("envía el motivo elegido junto al mensaje", async () => {
  const v = ver(NEGATIVA_VIGENTE);
  act(() => { boton(v, "Reclamar esta anotación")!.props.onPress(); });
  act(() => { v.root.findAllByType(Opciones)[0].props.onChange("SANCION_DESPROPORCIONADA"); });
  act(() => { v.root.findAllByType(Campo)[0].props.onChangeText("  Es excesivo para lo que pasó  "); });
  await act(async () => { boton(v, "Enviar el reclamo")!.props.onPress(); });

  expect(estado.llamadas[0]).toMatchObject({
    accionRegistradaId: "a1",
    motivo: "SANCION_DESPROPORCIONADA",
    mensaje: "Es excesivo para lo que pasó",
  });
});

/**
 * Lo que una familia necesita saber justo despues de reclamar: que hay plazo,
 * que la respuesta es por escrito, y que mientras tanto la anotacion cuenta.
 */
it("tras enviar explica el plazo y que la anotación sigue contando", async () => {
  const v = ver(NEGATIVA_VIGENTE);
  act(() => { boton(v, "Reclamar esta anotación")!.props.onPress(); });
  act(() => { v.root.findAllByType(Campo)[0].props.onChangeText("No fue así"); });
  await act(async () => { boton(v, "Enviar el reclamo")!.props.onPress(); });

  const t = texto(v);
  expect(t).toContain("30 días");
  expect(t).toContain("sigue contando");
});
