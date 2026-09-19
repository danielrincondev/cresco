import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";

const estado = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
  activar: vi.fn(),
  startVerification: vi.fn(),
  attemptFirstFactorVerification: vi.fn(),
  passwordEnabled: true,
  status: "CanLoadMore",
  hijos: [] as { estudianteId: string; nombres: string; apellidos: string }[],
  loadMore: vi.fn(),
  citas: [] as any[],
}));
vi.mock("react-native", async () => ({
  ...(await import("../test/mockReactNative")).reactNative(),
  Platform: { OS: "web" },
  Modal: "Modal",
  Linking: { openURL: vi.fn() },
}));
vi.mock("@clerk/expo", () => ({
  useSession: () => ({ session: { getToken: estado.getToken, startVerification: estado.startVerification, attemptFirstFactorVerification: estado.attemptFirstFactorVerification } }),
  useUser: () => ({ user: { passwordEnabled: estado.passwordEnabled } }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("../theme/Icono", () => ({ Icono: "Icono" }));
vi.mock("convex/react", () => ({
  useQuery: () => estado.citas,
  usePaginatedQuery: () => ({ results: estado.hijos, status: estado.status, loadMore: estado.loadMore }),
  useMutation: () => vi.fn(),
  useAction: (ref: Parameters<typeof getFunctionName>[0]) => {
    if (getFunctionName(ref) === "interaccion:activarAlerta") return estado.activar;
    return vi.fn();
  },
}));
import { AgendaDocente, AlertaDocente, CitasFamilia } from "./InteraccionScreen";
import { Boton, Campo, Casilla, Opciones } from "../components/NucleoUI";

let vista: ReactTestRenderer;
const curso = { id: "curso", nombre: "Quinto A" } as React.ComponentProps<typeof AlertaDocente>["curso"];
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  estado.passwordEnabled = true;
  estado.status = "CanLoadMore";
  estado.hijos = [];
  estado.citas = [];
  estado.startVerification.mockResolvedValue({ supportedFirstFactors: [{ strategy: "password" }] });
  estado.attemptFirstFactorVerification.mockResolvedValue({ status: "complete" });
  estado.getToken.mockResolvedValue("existing-session-token");
  estado.activar.mockResolvedValue({ id: "alerta", entregas: 2 });
});
afterEach(async () => {
  if (vista) await act(async () => vista.unmount());
  vi.unstubAllGlobals();
});
async function completarAlerta() {
  await act(async () => { vista = create(<AlertaDocente curso={curso} />); });
  for (const [etiqueta, valor] of [["Título", "Evacuación"], ["Mensaje para las familias", "Estamos en el patio"], ["Escribe ENVIAR para confirmar", "ENVIAR"], ["Confirma tu contraseña", "contraseña-sintética"]]) {
    await act(async () => vista.root.findAllByType(Campo).find(c => c.props.etiqueta === etiqueta)!.props.onChangeText(valor));
  }
  await act(async () => vista.root.findByType(Casilla).props.onChange());
}
async function enviar() {
  const boton = vista.root.findAllByType(Boton).find(b => b.props.children === "Enviar alerta al curso")!;
  expect(boton.props.disabled).toBe(false);
  await act(async () => boton.props.onPress());
}


it("verifica la contraseña antes de publicar y no afirma entrega o lectura", async () => {
  await completarAlerta();
  await enviar();
  expect(estado.startVerification).toHaveBeenCalledWith({ level: "first_factor" });
  expect(estado.attemptFirstFactorVerification).toHaveBeenCalledWith({ strategy: "password", password: "contraseña-sintética" });
  expect(estado.activar).toHaveBeenCalledWith(expect.objectContaining({ tokenReautenticacion: "existing-session-token", esSimulacro: false }));
  expect(estado.activar.mock.calls[0][0]).not.toHaveProperty("reautenticadoEn");
  expect(JSON.stringify(vista.toJSON())).toContain("Alerta publicada");
  expect(JSON.stringify(vista.toJSON())).toContain("no confirma");
  expect(JSON.stringify(vista.toJSON())).not.toContain("ya la recibieron");
});

it.each(["contraseña incorrecta", "verificación incompleta", "token ausente"])("no envía con %s y borra la contraseña", async causa => {
  if (causa === "contraseña incorrecta") estado.attemptFirstFactorVerification.mockRejectedValue(new Error("invalid password"));
  if (causa === "verificación incompleta") estado.attemptFirstFactorVerification.mockResolvedValue({ status: "needs_first_factor" });
  if (causa === "token ausente") estado.getToken.mockResolvedValue(null);
  await completarAlerta();
  await enviar();
  expect(estado.activar).not.toHaveBeenCalled();
  expect(vista.root.findAllByType(Campo).find(c => c.props.etiqueta === "Confirma tu contraseña")!.props.value).toBe("");
});

it("bloquea todos los campos durante el envío y presenta el tipo que se envió", async () => {
  let resolver!: (token: string) => void;
  estado.getToken.mockImplementation(() => new Promise(resolve => { resolver = resolve; }));
  await completarAlerta();
  await enviar();
  expect(estado.activar).not.toHaveBeenCalled();
  expect(vista.root.findByType(Opciones).props.disabled).toBe(true);
  expect(vista.root.findByType(Casilla).props.disabled).toBe(true);
  for (const campo of vista.root.findAllByType(Campo)) expect(campo.props.editable).toBe(false);
  // Incluso si llega un evento nativo ya encolado, el resultado usa el snapshot.
  await act(async () => vista.root.findByType(Opciones).props.onChange("SIMULACRO"));
  await act(async () => resolver("existing-session-token"));
  expect(estado.activar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "EVACUACION", esSimulacro: false }));
  expect(JSON.stringify(vista.toJSON())).not.toContain("Se publicó marcada como simulacro");
});

it("publica el simulacro con la bandera correcta", async () => {
  await completarAlerta();
  await act(async () => vista.root.findByType(Opciones).props.onChange("SIMULACRO"));
  await act(async () => vista.root.findAllByType(Campo).find(c => c.props.etiqueta === "Escribe SIMULACRO para confirmar")!.props.onChangeText("SIMULACRO"));
  await act(async () => vista.root.findAllByType(Boton).find(b => b.props.children === "Enviar simulacro")!.props.onPress());
  expect(estado.activar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "SIMULACRO", esSimulacro: true }));
  expect(JSON.stringify(vista.toJSON())).toContain("Se publicó marcada como simulacro");
});

it("no permite enviar desde una cuenta sin contraseña", async () => {
  estado.passwordEnabled = false;
  await act(async () => { vista = create(<AlertaDocente curso={curso} />); });
  expect(vista.root.findAllByType(Boton).find(b => b.props.children === "Enviar alerta al curso")!.props.disabled).toBe(true);
  expect(JSON.stringify(vista.toJSON())).toContain("necesita una contraseña");
});

it("avisa cuando no existen destinatarios en el curso", async () => {
  estado.activar.mockResolvedValue({ id: "alerta", entregas: 0 });
  await completarAlerta();
  await enviar();
  expect(JSON.stringify(vista.toJSON())).toContain("sin destinatarios");
  expect(JSON.stringify(vista.toJSON())).not.toContain("Disponible para las familias");
});

it("permite continuar una página vacía y encontrar al hijo en la siguiente", async () => {
  await act(async () => { vista = create(<CitasFamilia />); });
  expect(JSON.stringify(vista.toJSON())).not.toContain("Todavía no tienes hijos registrados");
  await act(async () => vista.root.findByType(Boton).props.onPress());
  expect(estado.loadMore).toHaveBeenCalledWith(20);
  estado.hijos = [{ estudianteId: "estudiante", nombres: "Ana", apellidos: "Pérez" }];
  estado.status = "Exhausted";
  await act(async () => vista.update(<CitasFamilia />));
  expect(JSON.stringify(vista.toJSON())).toContain("Ana");
  expect(vista.root.findByType(Boton).props.children).toBe("Ver horarios del docente");
});

it("muestra el estado vacío solo al agotar todas las páginas", async () => {
  estado.status = "Exhausted";
  await act(async () => { vista = create(<CitasFamilia />); });
  expect(JSON.stringify(vista.toJSON())).toContain("Todavía no tienes hijos registrados");
});

it("organiza las citas del docente en pendientes, próximas ascendentes e historial descendente", async () => {
  const ahora = Date.now();
  estado.citas = [
    {
      _id: "pasada-antigua",
      estado: "CONFIRMADA",
      fechaHoraInicio: ahora - 10 * 86400000,
      fechaHoraFin: ahora - 10 * 86400000 + 1800000,
      modalidad: "PRESENCIAL",
      motivo: "Reunión antigua",
    },
    {
      _id: "pasada-reciente",
      estado: "CONFIRMADA",
      fechaHoraInicio: ahora - 86400000,
      fechaHoraFin: ahora - 86400000 + 1800000,
      modalidad: "PRESENCIAL",
      motivo: "Reunión de ayer",
    },
    {
      _id: "proxima-lejana",
      estado: "CONFIRMADA",
      fechaHoraInicio: ahora + 3 * 86400000,
      fechaHoraFin: ahora + 3 * 86400000 + 1800000,
      modalidad: "PRESENCIAL",
      motivo: "Cita en 3 días",
    },
    {
      _id: "proxima-cercana",
      estado: "CONFIRMADA",
      fechaHoraInicio: ahora + 86400000,
      fechaHoraFin: ahora + 86400000 + 1800000,
      modalidad: "PRESENCIAL",
      motivo: "Cita de mañana",
    },
    {
      _id: "pendiente-1",
      estado: "SOLICITADA",
      fechaHoraInicio: ahora + 2 * 86400000,
      fechaHoraFin: ahora + 2 * 86400000 + 1800000,
      modalidad: "PRESENCIAL",
      motivo: "Por confirmar",
    },
  ];

  await act(async () => {
    vista = create(<AgendaDocente curso={curso} />);
  });

  const texto = JSON.stringify(vista.toJSON());
  expect(texto).toContain("Por confirmar");
  expect(texto).toContain("Próximas citas");
  expect(texto).toContain("Historial de citas");

  // Verificar orden en próximas citas: mañana antes que en 3 días
  const idxManana = texto.indexOf("Cita de mañana");
  const idxTresDias = texto.indexOf("Cita en 3 días");
  expect(idxManana).toBeLessThan(idxTresDias);

  // Verificar orden en historial: ayer antes que hace 10 días
  const idxAyer = texto.indexOf("Reunión de ayer");
  const idxAntigua = texto.indexOf("Reunión antigua");
  expect(idxAyer).toBeLessThan(idxAntigua);
});

it("acota el historial a 5 citas y permite expandirlo", async () => {
  const ahora = Date.now();
  estado.citas = Array.from({ length: 7 }, (_, i) => ({
    _id: `pasada-${i}`,
    estado: "CONFIRMADA",
    fechaHoraInicio: ahora - (i + 1) * 86400000,
    fechaHoraFin: ahora - (i + 1) * 86400000 + 1800000,
    modalidad: "PRESENCIAL",
    motivo: `Motivo ${i + 1}`,
  }));

  await act(async () => {
    vista = create(<AgendaDocente curso={curso} />);
  });

  let texto = JSON.stringify(vista.toJSON());
  expect(texto).toContain("Motivo 1");
  expect(texto).toContain("Motivo 5");
  expect(texto).not.toContain("Motivo 6");
  expect(texto).toContain("Ver anteriores (2 más)");

  // Expandir
  const botonExpandir = vista.root
    .findAllByType(Boton)
    .find((b) => b.props.children === "Ver anteriores (2 más)")!;
  await act(async () => {
    botonExpandir.props.onPress();
  });

  texto = JSON.stringify(vista.toJSON());
  expect(texto).toContain("Motivo 6");
  expect(texto).toContain("Motivo 7");
  expect(texto).toContain("Ver menos citas");
});
