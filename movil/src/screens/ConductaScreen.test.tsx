import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";

const estado = vi.hoisted(() => ({
  catalogo: [] as unknown[],
  estudiantes: [] as unknown[],
  status: "Exhausted",
  registrar: vi.fn(),
  recientes: [] as unknown[],
}));

vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  Platform: { OS: "web" },
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "nucleo:catalogoDeAcciones"
      ? estado.catalogo
      : getFunctionName(ref) === "conducta:anotacionesRecientesDelCurso"
        ? estado.recientes
        : undefined,
  usePaginatedQuery: () => ({
    results: estado.estudiantes, status: estado.status, loadMore: vi.fn(),
  }),
  useMutation: () => estado.registrar,
}));

const { AnotacionesRecientes, AnotarConducta } = await import("./ConductaScreen");
const { Boton, Campo, Opciones } = await import("../components/NucleoUI");

const pintar = (e: React.ReactElement) => {
  let v!: ReactTestRenderer;
  act(() => { v = create(e); });
  return v;
};
const texto = (v: ReactTestRenderer) => JSON.stringify(v.toJSON());

const TIPO_NEGATIVO = {
  id: "t1", nombre: "Indisciplina", descripcion: null, signo: "NEGATIVA",
  puntosDefecto: -1, puntosMin: -3, puntosMax: -1,
  requiereDescripcion: true, admiteInconformidad: true,
};
/** Como "Irresponsabilidad" en el catalogo sembrado: un unico valor posible. */
const TIPO_FIJO = {
  id: "t3", nombre: "Irresponsabilidad", descripcion: null, signo: "NEGATIVA",
  puntosDefecto: -1, puntosMin: -1, puntosMax: -1,
  requiereDescripcion: true, admiteInconformidad: true,
};
const TIPO_POSITIVO = {
  id: "t2", nombre: "Tarea entregada", descripcion: null, signo: "POSITIVA",
  puntosDefecto: 1, puntosMin: 1, puntosMax: 2,
  requiereDescripcion: true, admiteInconformidad: false,
};

beforeEach(() => {
  estado.registrar = vi.fn().mockResolvedValue("accion-1");
  estado.status = "Exhausted";
  estado.estudiantes = [{ estudianteId: "e1", nombres: "Ana", apellidos: "Pérez" }];
  estado.catalogo = [
    { id: "c1", codigo: "DISCIPLINA", nombre: "Disciplina", descripcion: null,
      tipos: [TIPO_NEGATIVO] },
    { id: "c2", codigo: "RESPONSABILIDAD", nombre: "Responsabilidad", descripcion: null,
      tipos: [TIPO_POSITIVO] },
  ];
});

/** Abre el formulario del primer estudiante. */
function abrirFormulario() {
  const v = pintar(<AnotarConducta cursoId={"curso" as never} onVolver={() => {}} />);
  act(() => { v.root.findAllByType(Boton)[0].props.onPress(); });
  return v;
}

it("sin estudiantes aprobados lo dice, en vez de dejar la pantalla vacía", () => {
  estado.estudiantes = [];
  const v = pintar(<AnotarConducta cursoId={"curso" as never} onVolver={() => {}} />);
  expect(texto(v)).toContain("Todavía no hay estudiantes aprobados");
});

/**
 * De las entrevistas del 1 de septiembre: el problema no es informar, es que
 * la familia **no acepta** lo que se le informa. Un numero sin explicacion es
 * justo lo que no se acepta, asi que no se puede enviar sin escribir nada.
 */
it("no deja registrar sin el mensaje, aunque haya tipo elegido", () => {
  const v = abrirFormulario();
  act(() => { v.root.findAllByType(Boton)[0].props.onPress(); }); // elige un tipo

  const registrar = v.root
    .findAllByType(Boton)
    .find((b) => b.props.children === "Registrar la anotación")!;
  expect(registrar.props.disabled).toBe(true);
});

/**
 * Obligar a elegir un numero cada vez es pedirle al docente que decida algo
 * que el catalogo ya decidio, de pie y entre clases.
 */
it("propone los puntos por defecto del tipo elegido", async () => {
  const v = abrirFormulario();
  act(() => { v.root.findAllByType(Campo)[0].props.onChangeText("Se levantó en clase"); });
  act(() => { v.root.findAllByType(Boton)[0].props.onPress(); });

  expect(v.root.findAllByType(Opciones)[0].props.valor).toBe("-1");

  const registrar = v.root
    .findAllByType(Boton)
    .find((b) => b.props.children === "Registrar la anotación")!;
  await act(async () => { registrar.props.onPress(); });

  expect(estado.registrar).toHaveBeenCalledWith({
    estudianteId: "e1",
    tipoAccionId: "t1",
    descripcion: "Se levantó en clase",
    puntosAplicados: -1,
  });
});

/**
 * Que el docente sepa, antes de enviar, que esto se le puede reclamar y va a
 * tener que responder por escrito. Cambia como lo escribe, y eso es deseable.
 */
it("avisa de que la anotación es reclamable, solo cuando lo es", () => {
  const v = abrirFormulario();
  act(() => { v.root.findAllByType(Boton)[0].props.onPress(); }); // Indisciplina
  expect(texto(v)).toContain("va a poder reclamar esta anotación");

  const positivo = v.root
    .findAllByType(Boton)
    .find((b) => b.props.children === "Tarea entregada")!;
  act(() => { positivo.props.onPress(); });
  expect(texto(v)).not.toContain("va a poder reclamar esta anotación");
});

/**
 * El docente decide "una grave" o "una leve", no en el signo del numero: para
 * una negativa se listan de mayor a menor severidad.
 */
it("ordena los puntos por severidad según el signo", () => {
  const v = abrirFormulario();
  act(() => { v.root.findAllByType(Boton)[0].props.onPress(); });
  expect(v.root.findAllByType(Opciones)[0].props.opciones.map((o: { texto: string }) => o.texto))
    .toEqual(["-3", "-2", "-1"]);

  const positivo = v.root
    .findAllByType(Boton)
    .find((b) => b.props.children === "Tarea entregada")!;
  act(() => { positivo.props.onPress(); });
  expect(v.root.findAllByType(Opciones)[0].props.opciones.map((o: { texto: string }) => o.texto))
    .toEqual(["+2", "+1"]);
});

it("tras registrar, confirma y no deja el formulario abierto", async () => {
  const v = abrirFormulario();
  act(() => { v.root.findAllByType(Campo)[0].props.onChangeText("Se levantó en clase"); });
  act(() => { v.root.findAllByType(Boton)[0].props.onPress(); });
  const registrar = v.root
    .findAllByType(Boton)
    .find((b) => b.props.children === "Registrar la anotación")!;
  await act(async () => { registrar.props.onPress(); });

  const t = texto(v);
  expect(t).toContain("Anotación registrada");
  expect(t).not.toContain("¿Qué pasó?");
});

/**
 * Varios tipos del catalogo real tienen minimo y maximo iguales. Un selector
 * de una sola opcion pide al docente una decision que no existe: se le dice
 * cuanto vale y ya.
 */
it("con un solo valor posible no pinta selector, lo dice", () => {
  estado.catalogo = [
    { id: "c1", codigo: "DISCIPLINA", nombre: "Disciplina", descripcion: null,
      tipos: [TIPO_FIJO] },
  ];
  const v = abrirFormulario();
  act(() => { v.root.findAllByType(Boton)[0].props.onPress(); });

  expect(v.root.findAllByType(Opciones)).toHaveLength(0);
  expect(texto(v)).toContain("vale -1 punto");
});

/* ---------- Deshacer ---------- */

const RECIENTE_NEGATIVA = {
  id: "a1", estudiante: "Ana Pérez", tipo: "Indisciplina", signo: "NEGATIVA",
  puntos: -1, descripcion: "Se levantó en clase", fecha: "2026-09-09",
  estado: "VIGENTE", anulable: true, creadaEn: 2,
};
const RECIENTE_POSITIVA = {
  ...RECIENTE_NEGATIVA, id: "a2", tipo: "Tarea", signo: "POSITIVA", puntos: 1,
  anulable: false, creadaEn: 1,
};

const recientes = () =>
  pintar(<AnotacionesRecientes cursoId={"curso" as never} onVolver={() => {}} />);

/**
 * El motivo queda en la bitacora como ANULAR: es lo que se le enseña a una
 * institucion que pregunte por que desaparecio una sancion. Un campo vacio no
 * sirve.
 */
it("no deja anular sin motivo", () => {
  estado.recientes = [RECIENTE_NEGATIVA];
  const v = recientes();
  act(() => { v.root.findAllByType(Boton).find((b) => b.props.children === "Anular")!.props.onPress(); });
  const anular = v.root.findAllByType(Boton).find((b) => b.props.children === "Anular la anotación")!;
  expect(anular.props.disabled).toBe(true);
});

it("anula con el motivo escrito, sin espacios de sobra", async () => {
  estado.recientes = [RECIENTE_NEGATIVA];
  const v = recientes();
  act(() => { v.root.findAllByType(Boton).find((b) => b.props.children === "Anular")!.props.onPress(); });
  act(() => { v.root.findAllByType(Campo)[0].props.onChangeText("  Me equivoqué de alumno  "); });
  await act(async () => {
    v.root.findAllByType(Boton).find((b) => b.props.children === "Anular la anotación")!.props.onPress();
  });
  expect(estado.registrar).toHaveBeenCalledWith({
    accionRegistradaId: "a1", motivo: "Me equivoqué de alumno",
  });
});

/**
 * `anulable` viene del servidor. Una positiva no ofrece boton, y se dice por
 * que, en vez de dejar al docente buscando una opcion que no existe.
 */
it("una positiva no ofrece anular, y lo explica", () => {
  estado.recientes = [RECIENTE_POSITIVA];
  const v = recientes();
  expect(v.root.findAllByType(Boton).find((b) => b.props.children === "Anular")).toBeUndefined();
  expect(texto(v)).toContain("Las positivas no se anulan desde aquí");
});
