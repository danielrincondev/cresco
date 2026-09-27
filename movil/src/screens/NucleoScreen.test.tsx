import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { SolicitudRegistro } from "../lib/registroPendiente";
import { versionConsentimiento } from "../content/consentimiento";

type Perfil = FunctionReturnType<typeof api.nucleo.obtenerPerfil>;
const estado = vi.hoisted(() => ({
  llamadas: [] as { nombre: string; args: unknown }[],
  version: "2026-09-v1",
  guardada: null as SolicitudRegistro | null,
  perfil: undefined as Perfil | undefined,
  autenticado: true,
  sesion: "sesion-1" as string | null,
  fallosRegistro: 0,
  fallosAuditoria: 0,
  consentimientoDesactualizado: false,
  novedades: [] as { leidaEn?: number }[],
  funciones: new Map<string, (args: unknown) => Promise<unknown>>(),
  barraInferior: true,
  barraInferiorGuardada: [] as boolean[],
  hijos: [] as { estudianteId: string; nombres: string; apellidos: string; estadoVerificacion: string }[],
  estadoHijos: "Exhausted" as "Exhausted" | "LoadingFirstPage",
}));
vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  Platform: { OS: "web" },
  Modal: "Modal",
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  Share: { share: vi.fn() },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  // El menu lateral los usa para esquivar el recorte de camara y la barra
  // de navegacion; en pruebas no hay pantalla, asi que van a cero.
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({ sessionId: estado.sesion }),
  useUser: () => ({ user: { id: "usuario", firstName: "Prueba" } }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "solicitud-sintetica-1234" }));
vi.mock("../lib/registroPendiente", () => ({
  guardarRegistro: vi.fn(async (_id: string, solicitud: SolicitudRegistro) => { estado.guardada = solicitud; }),
  recuperarRegistro: vi.fn(async () => estado.guardada),
  borrarRegistro: vi.fn(async () => { estado.guardada = null; }),
}));
// Sin este mock, `preferenciasFamilia.ts` carga el `expo-secure-store` real,
// que referencia `__DEV__` -- una global que solo existe bajo Metro, no aqui.
vi.mock("../lib/preferenciasFamilia", () => ({
  leerBarraInferior: vi.fn(async () => estado.barraInferior),
  guardarBarraInferior: vi.fn(async (_id: string, activa: boolean) => {
    estado.barraInferior = activa;
    estado.barraInferiorGuardada.push(activa);
  }),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: estado.autenticado }),
  // El mock tiene que distinguir que se le pregunta: la pantalla consulta el
  // perfil **y** las novedades, y devolver el perfil para las dos hacia que
  // `sinLeer` operara sobre algo que no es una lista.
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const nombre = getFunctionName(ref);
    if (nombre === "interaccion:misNotificaciones") return estado.novedades;
    // El reporte del día trae también las novedades del curso (QA del 26 de
    // septiembre); sin esta rama, el mock genérico de abajo (`estado.perfil`,
    // un objeto) revienta el `.map` de `NovedadesDelCurso`.
    if (nombre === "conducta:comunicadosVigentes") return [];
    return estado.perfil;
  },
  usePaginatedQuery: () => ({ results: estado.hijos, status: estado.estadoHijos, loadMore: vi.fn() }),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const nombre = getFunctionName(ref);
    if (!estado.funciones.has(nombre)) estado.funciones.set(nombre, async (args: unknown) => {
      estado.llamadas.push({ nombre, args });
      if (nombre === "auditoria:registrarInicioSesion") {
        if (estado.fallosAuditoria-- > 0) throw new Error("Conexión interrumpida");
        return estado.perfil ? { registrado: true, motivo: null } : { registrado: false, motivo: "SIN_PERFIL" };
      }
      if (nombre === "nucleo:canjearInvitacion") {
        if (estado.fallosRegistro-- > 0) throw new Error("Respuesta perdida");
        if (estado.consentimientoDesactualizado) throw new ConvexError({
          codigo: "CONSENTIMIENTO_DESACTUALIZADO", mensaje: "Acepta la versión vigente.",
        });
      }
      if (nombre === "nucleo:consultarInvitacion") return {
        cursoId: "curso", nombreCurso: "Curso de prueba", institucion: "Escuela de prueba",
        expiraEn: Date.now() + 10000, versionDocumento: estado.version,
      };
      return { estudianteId: "estudiante", estadoVerificacion: "PENDIENTE" };
    });
    return estado.funciones.get(nombre);
  },
}));
import { NucleoScreen } from "./NucleoScreen";
import { Boton, Campo, Casilla, Opciones } from "../components/NucleoUI";

const perfil = {
  perfilUsuarioId: "perfil" as NonNullable<Perfil>["perfilUsuarioId"],
  nombres: "Kenny",
  apellidos: "Chung",
  // La identidad del perfil. Viaja para que la pantalla pueda enseñarla
  // bloqueada en vez de pedir que se reescriba de memoria.
  tipoDocumento: "CEDULA" as const,
  numeroDocumento: "0923062384",
  docenteId: null,
  representanteId: "representante" as NonNullable<Perfil>["representanteId"],
};
let vista: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  estado.llamadas = [];
  estado.funciones.clear();
  estado.version = versionConsentimiento;
  estado.guardada = null;
  estado.perfil = perfil;
  estado.autenticado = true;
  estado.sesion = "sesion-1";
  estado.fallosRegistro = 0;
  estado.fallosAuditoria = 0;
  estado.consentimientoDesactualizado = false;
  estado.novedades = [];
  estado.barraInferior = true;
  estado.barraInferiorGuardada = [];
  estado.hijos = [];
  estado.estadoHijos = "Exhausted";
});
afterEach(async () => {
  if (vista) await act(async () => vista!.unmount());
  vista = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function montar() { await act(async () => { vista = create(<NucleoScreen />); }); }
async function actualizar() { await act(async () => vista!.update(<NucleoScreen />)); }
const llamadas = (nombre: string) => estado.llamadas.filter((x) => x.nombre === nombre);
async function pulsar(texto: string) {
  const boton = vista!.root.findAllByType(Boton).find((x) => x.props.children === texto)!;
  expect(boton, texto).toBeTruthy();
  expect(boton.props.disabled).not.toBe(true);
  await act(async () => boton.props.onPress());
}
async function escribir(etiqueta: string, valor: string) {
  const campo = vista!.root.findAllByType(Campo).find((x) => x.props.etiqueta === etiqueta)!;
  await act(async () => campo.props.onChangeText(valor));
}
async function buscarCurso() {
  await pulsar("Registrar a mi hijo");
  await escribir("Código del curso", "CODIGO");
  await pulsar("Buscar curso");
}
async function completarRegistro() {
  await escribir("Nombres de tu hijo", "Estudiante");
  await escribir("Apellidos de tu hijo", "Sintético");
  const documento = vista!.root.findAllByType(Opciones).find((x) =>
    x.props.opciones.some((o: { valor: string }) => o.valor === "SIN_DOCUMENTO"))!;
  await act(async () => documento.props.onChange("SIN_DOCUMENTO"));
  for (const casilla of vista!.root.findAllByType(Casilla)) await act(async () => casilla.props.onChange());
}

it("audita la sesión una vez y vuelve a auditar una sesión nueva", async () => {
  await montar();
  expect(llamadas("auditoria:registrarInicioSesion")).toEqual([
    { nombre: "auditoria:registrarInicioSesion", args: { plataforma: "WEB" } },
  ]);
  await actualizar();
  expect(llamadas("auditoria:registrarInicioSesion")).toHaveLength(1);
  estado.sesion = "sesion-2";
  await actualizar();
  expect(llamadas("auditoria:registrarInicioSesion")).toHaveLength(2);
});

it("espera autenticación y perfil cargado; reintenta SIN_PERFIL al completar el alta", async () => {
  estado.autenticado = false;
  estado.perfil = undefined;
  await montar();
  expect(llamadas("auditoria:registrarInicioSesion")).toHaveLength(0);
  estado.autenticado = true;
  await actualizar();
  expect(llamadas("auditoria:registrarInicioSesion")).toHaveLength(0);
  estado.perfil = null;
  await actualizar();
  expect(llamadas("auditoria:registrarInicioSesion")).toHaveLength(1);
  estado.perfil = perfil;
  await actualizar();
  expect(llamadas("auditoria:registrarInicioSesion")).toHaveLength(2);
});

it("reintenta auditoría tras recuperar conexión sin registrar en cada render", async () => {
  vi.useFakeTimers();
  estado.fallosAuditoria = 1;
  await montar();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(llamadas("auditoria:registrarInicioSesion")).toHaveLength(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(llamadas("auditoria:registrarInicioSesion")).toHaveLength(2);
});

it("cancela los reintentos de auditoría al cerrar sesión", async () => {
  vi.useFakeTimers();
  estado.fallosAuditoria = 10;
  await montar();
  estado.autenticado = false;
  estado.sesion = null;
  await actualizar();
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(llamadas("auditoria:registrarInicioSesion")).toHaveLength(1);
});

it("bloquea una versión desconocida en lugar de aceptar con el texto antiguo", async () => {
  estado.version = `${versionConsentimiento}-desconocida`;
  await montar();
  await buscarCurso();
  expect(vista!.root.findAllByType(Casilla)).toHaveLength(0);
  expect(JSON.stringify(vista!.toJSON())).toContain("Actualiza Cresco");
  expect(llamadas("nucleo:canjearInvitacion")).toHaveLength(0);
  expect(estado.guardada).toBeNull();
});

it("envía la versión del texto mostrado cuando coincide con el servidor", async () => {
  await montar();
  await buscarCurso();
  await completarRegistro();
  await pulsar("Acepto y registro a mi hijo");
  expect(llamadas("nucleo:canjearInvitacion")[0].args).toMatchObject({
    versionDocumento: versionConsentimiento, aceptaTratamiento: true, declaraRepresentanteLegal: true,
  });
});

it("exige consultar nuevamente si el consentimiento cambia mientras se completa el formulario", async () => {
  await montar();
  await buscarCurso();
  await completarRegistro();
  estado.consentimientoDesactualizado = true;
  await pulsar("Acepto y registro a mi hijo");
  expect(estado.guardada).toBeNull();
  expect(vista!.root.findAllByType(Casilla)).toHaveLength(0);
  estado.version = `${versionConsentimiento}-desconocida`;
  await pulsar("Buscar curso");
  expect(JSON.stringify(vista!.toJSON())).toContain("Actualiza Cresco");
  expect(llamadas("nucleo:canjearInvitacion")).toHaveLength(1);
});

it("conserva solicitud y versión aceptada al reabrir tras un fallo de red", async () => {
  estado.fallosRegistro = 1;
  await montar();
  await buscarCurso();
  await completarRegistro();
  await pulsar("Acepto y registro a mi hijo");
  expect(estado.guardada).not.toBeNull();
  await act(async () => vista!.unmount());
  // El servidor puede haber cambiado desde el intento original: se recupera
  // esa solicitud exacta, nunca se inventa otra aceptación ni identificador.
  estado.version = `${versionConsentimiento}-desconocida`;
  await montar();
  await pulsar("Registrar a mi hijo");
  await pulsar("Reintentar registro");
  const solicitudes = llamadas("nucleo:canjearInvitacion");
  expect(solicitudes).toHaveLength(2);
  expect(solicitudes[1].args).toEqual(solicitudes[0].args);
  expect(estado.guardada).toBeNull();
});

/**
 * Sin insignia, la campana no distingue "nada nuevo" de "tres respuestas a tus
 * reclamos", y el representante tiene que acordarse de mirar. En una
 * aplicacion que existe para avisar, eso es dejar el aviso a medias.
 */
it("la campana dice cuantas novedades hay sin leer", async () => {
  estado.novedades = [{ leidaEn: 1 }, {}, {}];
  await montar();

  expect(
    vista!.root.findByProps({ accessibilityLabel: "Novedades, 2 sin leer" }),
  ).toBeTruthy();
  // El numero tambien a la vista, no solo para el lector de pantalla.
  expect(JSON.stringify(vista!.toJSON())).toContain("2");
});

it("con todo leido la campana no grita", async () => {
  estado.novedades = [{ leidaEn: 1 }];
  await montar();

  expect(
    vista!.root.findAllByProps({ accessibilityLabel: "Novedades" }).length,
  ).toBeGreaterThan(0);
});

/** Mas de nueve se resume: un numero de tres cifras no cabe en el icono. */
it("resume el contador a partir de diez", async () => {
  estado.novedades = Array.from({ length: 14 }, () => ({}));
  await montar();

  expect(JSON.stringify(vista!.toJSON())).toContain("9+");
});

/* ---------- Barra inferior de la familia ---------- */

const porTextoDeMenu = (texto: string) => {
  // El mock devuelve los componentes nativos como cadenas, y el tipo de
  // `n.type` no lo sabe: de ahi las comparaciones ensanchadas.
  const nodoTexto = vista!.root.findAll(
    (n) => (n.type as unknown) === "Text" && n.props.children === texto,
  )[0];
  let nodo = nodoTexto.parent!;
  while (nodo && (nodo.type as unknown) !== "Pressable") nodo = nodo.parent!;
  return nodo!;
};
async function abrirMenu() {
  await act(async () =>
    vista!.root.findByProps({ accessibilityLabel: "Abrir el menú" }).props.onPress(),
  );
}
const tablist = () =>
  vista!.root.findAllByProps({ accessibilityRole: "tablist" })[0];
const scroll = async (y: number) => {
  const sv = vista!.root.findByType("ScrollView" as never);
  await act(async () =>
    sv.props.onScroll({ nativeEvent: { contentOffset: { y } } }),
  );
};

it("la barra inferior existe para el representante y no para el docente", async () => {
  await montar();
  expect(tablist()).toBeTruthy();
  expect(
    vista!.root.findAll((n) => n.props.accessibilityLabel === "Inicio"),
  ).not.toHaveLength(0);

  // El mock de useQuery de este archivo solo conoce "obtenerPerfil" y
  // "misNotificaciones": para cualquier otra consulta -incluida
  // listarCursos, que usa la pantalla del docente- devuelve el perfil tal
  // cual, y `<Cursos>` revienta leyendo un campo que no existe ahi. Es un
  // hueco del mock compartido, no del producto: por eso el volcado de error
  // en stderr es ruido esperado, y la asercion que importa (sin barra
  // inferior para el docente) sigue siendo válida pese a él.
  estado.perfil = { ...perfil, representanteId: null, docenteId: "docente" as never };
  await actualizar();
  expect(tablist()).toBeUndefined();
});

/**
 * El corazon de lo que pidio Kenny: leer hacia abajo la esconde, volver hacia
 * arriba la trae de vuelta. Si `Pagina` no estuviera avisando de su scroll a
 * `NucleoScreen` -- el enganche entero via `ContextoBarraInferior` -- esto no
 * se moveria nunca, aunque cada pieza por separado (la propia `BarraInferior`)
 * pase sus pruebas sueltas.
 */
it("el scroll hacia abajo esconde la barra y hacia arriba la trae de vuelta", async () => {
  await montar();
  expect(tablist().props.pointerEvents).toBe("auto");

  await scroll(200);
  expect(tablist().props.pointerEvents).toBe("none");

  await scroll(60);
  expect(tablist().props.pointerEvents).toBe("auto");
});

/** Cerca del principio de la pantalla, la barra no se esconde aunque el scroll avance un poco. */
it("no se esconde cerca del principio de la pantalla", async () => {
  await montar();
  await scroll(15);
  expect(tablist().props.pointerEvents).toBe("auto");
});

/**
 * El interruptor de Ajustes tiene que apagar la barra de verdad (no solo
 * marcarse a si mismo) y quedar guardado para la proxima vez que se abra la
 * app -- las dos cosas a la vez, o el ajuste no sirve de nada.
 */
it("apagar el interruptor en Ajustes apaga la barra y lo deja guardado", async () => {
  await montar();
  expect(tablist()).toBeTruthy();

  await abrirMenu();
  await act(async () => porTextoDeMenu("Ajustes").props.onPress());

  const interruptor = vista!.root.findByProps({
    accessibilityLabel: "Mostrar la barra de Cita, Inicio y Reporte",
  });
  expect(interruptor.props.accessibilityState.checked).toBe(true);
  await act(async () => interruptor.props.onPress());

  expect(estado.barraInferiorGuardada).toEqual([false]);
  expect(tablist()).toBeUndefined();
});

/* ---------- Arranque en el reporte del dia ---------- */

const HIJO_APROBADO = {
  estudianteId: "estudiante-1",
  nombres: "Ana",
  apellidos: "Pérez",
  estadoVerificacion: "APROBADO",
};

/**
 * "Mis hijos" tiene funciones que solo hacen falta al inicio del año
 * lectivo. Con al menos un hijo aprobado, abrir la app debe ir directo a lo
 * que se usa cada tarde: el reporte de hoy.
 */
it("con un hijo aprobado, la app abre en su reporte del día", async () => {
  estado.hijos = [HIJO_APROBADO];
  await montar();
  expect(JSON.stringify(vista!.toJSON())).toContain("Lo de hoy, contado por su docente.");
});

/** Sin ningún hijo aprobado todavía, "Mis hijos" sigue siendo la portada. */
it("sin hijos aprobados, la portada sigue siendo Mis hijos", async () => {
  await montar();
  expect(JSON.stringify(vista!.toJSON())).toContain("Acompaña a tus hijos");
});

/**
 * El parpadeo que Kenny vio en el teléfono: "Mis hijos" se pintaba un
 * instante, antes de que llegaran los datos, y el efecto recién *después*
 * la reemplazaba por el reporte. Mientras `listarMisEstudiantes` sigue en su
 * primera carga, no debe verse ninguna de las dos pantallas reales — solo el
 * esqueleto — y al llegar los datos, pasa directo al reporte sin haber
 * pintado "Mis hijos" ni una sola vez.
 */
it("mientras carga no pinta Mis hijos, y pasa directo al reporte al resolver", async () => {
  estado.hijos = [HIJO_APROBADO];
  estado.estadoHijos = "LoadingFirstPage";
  await montar();
  const t1 = JSON.stringify(vista!.toJSON());
  expect(t1).not.toContain("Acompaña a tus hijos");
  expect(t1).not.toContain("Lo de hoy, contado por su docente.");
  expect(vista!.root.findByProps({ accessibilityRole: "progressbar" })).toBeTruthy();

  estado.estadoHijos = "Exhausted";
  await actualizar();
  const t2 = JSON.stringify(vista!.toJSON());
  expect(t2).toContain("Lo de hoy, contado por su docente.");
  expect(t2).not.toContain("Acompaña a tus hijos");
});

/**
 * El punto que distingue esto de un simple redirect fijo: "Inicio" tiene que
 * seguir significando algo. Si tocarlo rebotara siempre de vuelta al
 * reporte, apretarlo no llevaría a ningún lado.
 */
it("tocar Inicio después del arranque sí lleva a Mis hijos, y se queda ahí", async () => {
  estado.hijos = [HIJO_APROBADO];
  await montar();
  expect(JSON.stringify(vista!.toJSON())).toContain("Lo de hoy, contado por su docente.");

  await act(async () =>
    vista!.root.findByProps({ accessibilityLabel: "Inicio" }).props.onPress(),
  );
  expect(JSON.stringify(vista!.toJSON())).toContain("Acompaña a tus hijos");

  // Un segundo render (p.ej. una novedad que llega) no debe rebotarlo de
  // vuelta: el arranque automático ya se gastó, y ahora es Inicio de verdad.
  await actualizar();
  expect(JSON.stringify(vista!.toJSON())).toContain("Acompaña a tus hijos");
});
