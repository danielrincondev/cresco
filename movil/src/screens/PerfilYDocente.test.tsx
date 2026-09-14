import React from "react";
import { expect, it, vi, beforeEach } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";

const estado = vi.hoisted(() => ({
  ficha: null as unknown,
  perfil: { nombres: "María", apellidos: "Loor" } as unknown,
  guardar: vi.fn(),
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", KeyboardAvoidingView: "KeyboardAvoidingView",
  Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput",
  View: "View", Modal: "Modal", Platform: { OS: "web" },
  Linking: { openURL: vi.fn() }, StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("@clerk/expo", () => ({
  useSession: () => ({ session: {} }), useUser: () => ({ user: {} }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "interaccion:docenteACargo" ? estado.ficha : estado.perfil,
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
  useMutation: () => estado.guardar,
  useAction: () => vi.fn(),
}));

const { PerfilDocente, ProfesorACargo } = await import("./InteraccionScreen");
const { Boton, Campo } = await import("../components/NucleoUI");

const pintar = (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  act(() => { v = create(e); });
  return v;
};
const texto = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());

beforeEach(() => { estado.guardar = vi.fn().mockResolvedValue({ ok: true }); });

/* ---------- P9 ---------- */

it("sin titular asignado lo dice con el nombre del hijo, no deja la pantalla vacia", () => {
  estado.ficha = null;
  const v = pintar(<ProfesorACargo estudianteId={"e1" as never} nombre="Ana" />);
  expect(texto(v)).toContain("Todavía no hay docente asignado");
  expect(texto(v)).toContain("Ana");
});

/**
 * El docente puede no haber llenado nada. Una tarjeta de contacto vacia se lee
 * como un error de la aplicacion; decirlo con palabras, no.
 */
it("con ficha sin datos de contacto lo explica y no ofrece botones muertos", () => {
  estado.ficha = {
    docenteId: "d1", nombre: "María Loor", curso: "Quinto A",
    tituloProfesional: null, correoContacto: null, telefonoContacto: null, horarioAtencion: null,
  };
  const v = pintar(<ProfesorACargo estudianteId={"e1" as never} nombre="Ana" />);
  expect(texto(v)).toContain("todavía no publicó cómo prefiere que lo contacten");
  expect(v.root.findAllByType(Boton)).toHaveLength(0);
});

it("con ficha completa muestra nombre, curso y un boton por cada via de contacto", () => {
  estado.ficha = {
    docenteId: "d1", nombre: "María Loor", curso: "Quinto A",
    tituloProfesional: "Licenciada en Educación Básica",
    correoContacto: "mloor@colegio.edu.ec", telefonoContacto: "0990000000",
    horarioAtencion: "Martes de 10:00 a 11:00",
  };
  const v = pintar(<ProfesorACargo estudianteId={"e1" as never} nombre="Ana" />);
  const t = texto(v);
  expect(t).toContain("María Loor");
  expect(t).toContain("Titular de Quinto A");
  expect(t).toContain("Martes de 10:00 a 11:00");
  expect(v.root.findAllByType(Boton)).toHaveLength(2);
});

/**
 * Un perfil anterior a #52 no tiene nombres. La pantalla no puede quedarse
 * callada: el punto entero de P9 es que el padre sepa quien le escribe.
 */
it("si el docente es anterior a los nombres, explica por que no aparece", () => {
  estado.ficha = {
    docenteId: "d1", nombre: null, curso: "Quinto A",
    tituloProfesional: null, correoContacto: null, telefonoContacto: null, horarioAtencion: null,
  };
  expect(texto(pintar(<ProfesorACargo estudianteId={"e1" as never} nombre="Ana" />)))
    .toContain("completó su cuenta antes");
});

/* ---------- D18 ---------- */

/**
 * Los campos vacios **se mandan igual**: cadena vacia es como se borra un dato
 * en `actualizarDatosDocente`. Si la pantalla los omitiera, un docente no
 * podria quitar el telefono que publico -- solo cambiarlo por otro.
 */
it("manda tambien los campos vacios, que es como se borra un dato", async () => {
  estado.ficha = null;
  const v = pintar(<PerfilDocente />);
  const campos = v.root.findAllByType(Campo);
  await act(async () => { campos[0].props.onChangeText("Licenciada"); });
  await act(async () => {
    v.root.findAllByType(Boton)[0].props.onPress();
  });
  expect(estado.guardar).toHaveBeenCalledWith({
    tituloProfesional: "Licenciada",
    correoContacto: "",
    telefonoContacto: "",
    horarioAtencion: "",
  });
});
