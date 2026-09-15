import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";

const estado = vi.hoisted(() => ({
  asistencia: undefined as unknown,
  campos: undefined as unknown,
  llamadas: [] as { nombre: string; args: unknown }[],
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", KeyboardAvoidingView: "KeyboardAvoidingView",
  Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput",
  View: "View", Platform: { OS: "web" }, StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "conducta:asistenciaDelDia" ? estado.asistencia : estado.campos,
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const nombre = getFunctionName(ref);
    return async (args: unknown) => {
      estado.llamadas.push({ nombre, args });
      return null;
    };
  },
}));

const { PublicarComunicado, ReporteGeneral, TomarAsistencia } =
  await import("./JornadaScreen");
const { Boton, Campo, Opciones } = await import("../components/NucleoUI");

const pintar = (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  act(() => { v = create(e); });
  return v;
};
const texto = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());
const boton = (v: ReactTestRenderer, etiqueta: string) =>
  v.root.findAllByType(Boton).find((b) => b.props.children === etiqueta)!;

beforeEach(() => {
  estado.llamadas = [];
  estado.asistencia = {
    fecha: "2026-09-15",
    estudiantes: [
      { estudianteId: "e1", nombres: "Ana", apellidos: "Pérez", estado: null },
      { estudianteId: "e2", nombres: "Luis", apellidos: "Mora", estado: "PRESENTE" },
    ],
  };
  estado.campos = {
    plantillaReporteId: "p1",
    campos: [
      { id: "c1", codigo: "ANUNCIOS", etiqueta: "Anuncios", tipoDato: "TEXTO_LARGO",
        textoAyuda: null, longitudMaxima: 500 },
      { id: "c2", codigo: "TAREAS", etiqueta: "Tareas", tipoDato: "TEXTO_LARGO",
        textoAyuda: null, longitudMaxima: 500 },
    ],
  };
});

/* ---------- D12 ---------- */

/**
 * Un "presente" por defecto convierte un descuido en un dato falso sobre un
 * menor, y el docente ni se entera de que lo firmó. Nada se marca solo.
 */
it("no marca a nadie por defecto y dice cuántos faltan", () => {
  estado.asistencia = {
    fecha: "2026-09-15",
    estudiantes: [
      { estudianteId: "e1", nombres: "Ana", apellidos: "Pérez", estado: null },
      { estudianteId: "e2", nombres: "Luis", apellidos: "Mora", estado: null },
    ],
  };
  const v = pintar(<TomarAsistencia cursoId={"curso" as never} onVolver={() => {}} />);
  expect(texto(v)).toContain("Quedan 2 estudiantes sin marcar");
  expect(boton(v, "Guardar asistencia").props.disabled).toBe(true);
});

/**
 * Repetir la lista corrige, no duplica — así que lo ya marcado hoy tiene que
 * verse antes de cambiarlo.
 */
it("precarga lo que ya estaba marcado hoy", () => {
  const v = pintar(<TomarAsistencia cursoId={"curso" as never} onVolver={() => {}} />);
  const selectores = v.root.findAllByType(Opciones);
  expect(selectores[0].props.valor).toBe("");
  expect(selectores[1].props.valor).toBe("PRESENTE");
  expect(texto(v)).toContain("Queda 1 estudiante sin marcar");
});

it("envía solo las marcas puestas, no una fila por estudiante", async () => {
  const v = pintar(<TomarAsistencia cursoId={"curso" as never} onVolver={() => {}} />);
  await act(async () => { boton(v, "Guardar asistencia").props.onPress(); });

  const envio = estado.llamadas.find((l) => l.nombre === "conducta:tomarAsistencia")!;
  expect(envio.args).toMatchObject({
    marcas: [{ estudianteId: "e2", estado: "PRESENTE" }],
  });
});

/* ---------- D13 ---------- */

/**
 * El borrador se repite; la publicación sale hacia cuarenta familias y ocurre
 * una vez. Mezclarlos haría que media frase escrita a media tarde llegara a
 * todas.
 */
it("guardar deja borrador y no publica", async () => {
  const v = pintar(<ReporteGeneral cursoId={"curso" as never} onVolver={() => {}} />);
  act(() => { v.root.findAllByType(Campo)[0].props.onChangeText("Mañana traer el cuaderno"); });
  await act(async () => { boton(v, "Guardar borrador").props.onPress(); });

  expect(estado.llamadas.map((l) => l.nombre)).toEqual(["conducta:guardarReporteGeneral"]);
  expect(texto(v)).toContain("Todavía no lo ve nadie");
});

it("publicar guarda primero y luego publica, en ese orden", async () => {
  const v = pintar(<ReporteGeneral cursoId={"curso" as never} onVolver={() => {}} />);
  act(() => { v.root.findAllByType(Campo)[0].props.onChangeText("Mañana traer el cuaderno"); });
  await act(async () => { boton(v, "Publicar a las familias").props.onPress(); });

  expect(estado.llamadas.map((l) => l.nombre)).toEqual([
    "conducta:guardarReporteGeneral",
    "conducta:publicarReporteGeneral",
  ]);
});

it("no manda los campos vacíos", async () => {
  const v = pintar(<ReporteGeneral cursoId={"curso" as never} onVolver={() => {}} />);
  act(() => { v.root.findAllByType(Campo)[1].props.onChangeText("  Página 12  "); });
  await act(async () => { boton(v, "Guardar borrador").props.onPress(); });

  expect(estado.llamadas[0].args).toMatchObject({
    valores: [{ plantillaCampoId: "c2", valorTexto: "Página 12" }],
  });
});

it("sin nada escrito no deja ni guardar ni publicar", () => {
  const v = pintar(<ReporteGeneral cursoId={"curso" as never} onVolver={() => {}} />);
  expect(boton(v, "Guardar borrador").props.disabled).toBe(true);
  expect(boton(v, "Publicar a las familias").props.disabled).toBe(true);
});

/* ---------- D14 ---------- */

/** Una nota no ocurre un día: el campo de fecha solo existe para un evento. */
it("la fecha solo aparece en un evento", () => {
  const v = pintar(<PublicarComunicado cursoId={"curso" as never} onVolver={() => {}} />);
  expect(texto(v)).not.toContain("Fecha del evento");

  act(() => { v.root.findAllByType(Opciones)[0].props.onChange("EVENTO"); });
  expect(texto(v)).toContain("Fecha del evento");
});

it("no envía fechaEvento en una nota, aunque se hubiera escrito antes", async () => {
  const v = pintar(<PublicarComunicado cursoId={"curso" as never} onVolver={() => {}} />);
  act(() => { v.root.findAllByType(Opciones)[0].props.onChange("EVENTO"); });
  const campos = () => v.root.findAllByType(Campo);
  act(() => { campos()[0].props.onChangeText("Salida"); });
  act(() => { campos()[1].props.onChangeText("Vamos al museo"); });
  act(() => { campos()[2].props.onChangeText("2026-09-30"); });
  act(() => { v.root.findAllByType(Opciones)[0].props.onChange("NOTA_PROFESOR"); });

  await act(async () => { boton(v, "Publicar al curso").props.onPress(); });

  const envio = estado.llamadas[0].args as Record<string, unknown>;
  expect(envio.tipo).toBe("NOTA_PROFESOR");
  expect(envio.fechaEvento).toBeUndefined();
});

it("avisa de que no sustituye a una alerta de emergencia", () => {
  const v = pintar(<PublicarComunicado cursoId={"curso" as never} onVolver={() => {}} />);
  expect(texto(v)).toContain("No sustituye a una alerta de emergencia");
});
