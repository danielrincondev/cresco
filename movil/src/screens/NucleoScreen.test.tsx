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
  funciones: new Map<string, (args: unknown) => Promise<unknown>>(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", KeyboardAvoidingView: "KeyboardAvoidingView",
  Pressable: "Pressable", ScrollView: "ScrollView", Text: "Text", TextInput: "TextInput",
  View: "View", Modal: "Modal", Platform: { OS: "web" },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  Share: { share: vi.fn() }, StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
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
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: estado.autenticado }),
  useQuery: () => estado.perfil,
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
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
  estado.version = "2026-09-v2";
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
  estado.version = "2026-09-v2";
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
  estado.version = "2026-09-v2";
  await montar();
  await pulsar("Registrar a mi hijo");
  await pulsar("Reintentar registro");
  const solicitudes = llamadas("nucleo:canjearInvitacion");
  expect(solicitudes).toHaveLength(2);
  expect(solicitudes[1].args).toEqual(solicitudes[0].args);
  expect(estado.guardada).toBeNull();
});
