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
  notificaciones: [] as any[],
  bloques: [] as any[],
  mutaciones: {} as Record<string, ReturnType<typeof vi.fn>>,
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
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
    const nombre = getFunctionName(ref);
    if (nombre === "interaccion:misNotificaciones") return estado.notificaciones;
    if (nombre === "interaccion:misBloquesLibres") return estado.bloques;
    return estado.citas;
  },
  usePaginatedQuery: () => ({ results: estado.hijos, status: estado.status, loadMore: estado.loadMore }),
  // Una por función, para poder preguntar después con qué se llamó cada una.
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    (estado.mutaciones[getFunctionName(ref)] ??= vi.fn()),
  useAction: (ref: Parameters<typeof getFunctionName>[0]) => {
    if (getFunctionName(ref) === "interaccion:activarAlerta") return estado.activar;
    return vi.fn();
  },
}));
import { AgendaDocente, AlertaDocente, Ajustes, CitasFamilia, Notificaciones } from "./InteraccionScreen";
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
  estado.notificaciones = [];
  estado.bloques = [];
  estado.mutaciones = {};
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
      estado: "ATENDIDA",
      fechaHoraInicio: ahora - 10 * 86400000,
      fechaHoraFin: ahora - 10 * 86400000 + 1800000,
      modalidad: "PRESENCIAL",
      motivo: "Reunión antigua",
    },
    {
      _id: "pasada-reciente",
      estado: "ATENDIDA",
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
    estado: "ATENDIDA",
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

/* ---------- Citaciones, cancelaciones y asistencia ---------- */

const HORA = 3600000;
const botonQueDice = (texto: string) =>
  vista.root.findAllByType(Boton).find((b) => b.props.children === texto);
const tocar = async (texto: string) => {
  const boton = botonQueDice(texto);
  expect(boton, `no hay un botón "${texto}"`).toBeDefined();
  await act(async () => boton!.props.onPress());
};
const escribir = async (etiqueta: string, valor: string) =>
  act(async () => vista.root.findAllByType(Campo).find((c) => c.props.etiqueta === etiqueta)!.props.onChangeText(valor));
const cita = (extra: Record<string, unknown>) => ({
  _id: "c1", estado: "CONFIRMADA", origen: "SOLICITADA_POR_REPRESENTANTE",
  fechaHoraInicio: Date.now() + 2 * 86400000, fechaHoraFin: Date.now() + 2 * 86400000 + 900000,
  modalidad: "PRESENCIAL", estudianteNombre: "Ana Pérez", lugarOEnlace: null, ...extra,
});

it("una cita confirmada cuya hora llegó pregunta si la familia vino, y lo registra", async () => {
  estado.citas = [cita({ fechaHoraInicio: Date.now() - HORA, fechaHoraFin: Date.now() - HORA + 900000 })];
  await act(async () => { vista = create(<AgendaDocente curso={curso} />); });
  const texto = JSON.stringify(vista.toJSON());
  expect(texto).toContain("¿Vino la familia?");
  expect(texto).toContain("Ana Pérez");
  await tocar("No vino");
  expect(estado.mutaciones["interaccion:registrarAsistenciaCita"]).toHaveBeenCalledWith({ citaId: "c1", asistio: false });
});

it("tras 'Sí, vino' pregunta qué acordaron, y guarda los acuerdos", async () => {
  estado.citas = [cita({ fechaHoraInicio: Date.now() - HORA, fechaHoraFin: Date.now() - HORA + 900000 })];
  await act(async () => { vista = create(<AgendaDocente curso={curso} />); });
  await tocar("Sí, vino");
  expect(estado.mutaciones["interaccion:registrarAsistenciaCita"]).toHaveBeenCalledWith({ citaId: "c1", asistio: true });
  expect(JSON.stringify(vista.toJSON())).toContain("¿Qué acordaron?");
  expect(botonQueDice("Guardar acuerdos")!.props.disabled).toBe(true);
  await escribir("Acuerdos", "Revisar la agenda cada noche");
  await tocar("Guardar acuerdos");
  expect(estado.mutaciones["interaccion:anotarAcuerdos"]).toHaveBeenCalledWith({
    citaId: "c1", acuerdos: "Revisar la agenda cada noche",
  });
});

it("los acuerdos se pueden dejar para después sin perder la asistencia", async () => {
  estado.citas = [cita({ fechaHoraInicio: Date.now() - HORA, fechaHoraFin: Date.now() - HORA + 900000 })];
  await act(async () => { vista = create(<AgendaDocente curso={curso} />); });
  await tocar("Sí, vino");
  await tocar("Ahora no");
  expect(estado.mutaciones["interaccion:anotarAcuerdos"]).not.toHaveBeenCalled();
  expect(JSON.stringify(vista.toJSON())).toContain("Atención a familias");
});

it("en el historial, una reunión sin acuerdos ofrece anotarlos y una con acuerdos los muestra", async () => {
  estado.citas = [
    cita({ _id: "sin", estado: "ATENDIDA", fechaHoraInicio: Date.now() - 2 * HORA }),
    cita({ _id: "con", estado: "ATENDIDA", fechaHoraInicio: Date.now() - 3 * HORA, acuerdos: "Volver a conversar en dos semanas" }),
  ];
  await act(async () => { vista = create(<AgendaDocente curso={curso} />); });
  expect(JSON.stringify(vista.toJSON())).toContain("Acuerdos de la reunión: Volver a conversar en dos semanas");
  expect(vista.root.findAllByType(Boton).filter((b) => b.props.children === "Anotar acuerdos")).toHaveLength(1);
  await tocar("Anotar acuerdos");
  expect(JSON.stringify(vista.toJSON())).toContain("¿Qué acordaron?");
});

it("la familia lee los acuerdos en su lista de citas", async () => {
  estado.status = "Exhausted";
  estado.citas = [cita({ estado: "ATENDIDA", fechaHoraInicio: Date.now() - HORA, acuerdos: "Revisar la agenda" })];
  await act(async () => { vista = create(<CitasFamilia />); });
  expect(JSON.stringify(vista.toJSON())).toContain("Acuerdos de la reunión: Revisar la agenda");
});

it("el docente cancela una próxima cita solo después de escribir el motivo", async () => {
  estado.citas = [cita({})];
  await act(async () => { vista = create(<AgendaDocente curso={curso} />); });
  await tocar("Cancelar la cita");
  // Ahora es la pantalla del motivo: sin texto, el botón no hace nada.
  expect(botonQueDice("Cancelar la cita")!.props.disabled).toBe(true);
  await escribir("Motivo", "Tengo junta de área");
  expect(botonQueDice("Cancelar la cita")!.props.disabled).toBe(false);
  await tocar("Cancelar la cita");
  expect(estado.mutaciones["interaccion:cancelarCita"]).toHaveBeenCalledWith({
    citaId: "c1", como: "DOCENTE", motivo: "Tengo junta de área",
  });
});

it("una citación enviada espera a la familia y se puede retirar", async () => {
  estado.citas = [cita({ estado: "SOLICITADA", origen: "CITACION_DOCENTE", motivo: "Hablar de las tareas" })];
  await act(async () => { vista = create(<AgendaDocente curso={curso} />); });
  const texto = JSON.stringify(vista.toJSON());
  expect(texto).toContain("Citaciones enviadas");
  expect(texto).toContain("Esperando que la familia confirme");
  // No aparece entre lo que el docente tiene que confirmar: eso le toca a la familia.
  expect(botonQueDice("Confirmar")).toBeUndefined();
  expect(botonQueDice("Retirar la citación")).toBeDefined();
});

it("citar a una familia: estudiante, motivo y uno de sus bloques libres", async () => {
  estado.hijos = [{ estudianteId: "e1", nombres: "Ana", apellidos: "Pérez" }];
  estado.status = "Exhausted";
  estado.bloques = [
    { id: "pasado", fecha: "2020-01-01", horaInicio: "12:30", horaFin: "12:45", modalidad: "PRESENCIAL" },
    { id: "b1", fecha: "2099-09-10", horaInicio: "12:30", horaFin: "12:45", modalidad: "PRESENCIAL", lugarOEnlace: "Aula 5B" },
  ];
  await act(async () => { vista = create(<AgendaDocente curso={curso} />); });
  await tocar("Citar a una familia");
  await tocar("Citar a su familia");
  const texto = JSON.stringify(vista.toJSON());
  expect(texto).toContain("Citar a la familia de Ana Pérez");
  expect(texto).toContain("Aula 5B");
  // El bloque cuya hora ya pasó no se ofrece.
  expect(vista.root.findAllByType(Boton).filter((b) => b.props.children === "Citar en este horario")).toHaveLength(1);
  expect(botonQueDice("Citar en este horario")!.props.disabled).toBe(true);
  await escribir("Motivo", "Conversar sobre las tareas");
  await tocar("Citar en este horario");
  expect(estado.mutaciones["interaccion:citarFamilia"]).toHaveBeenCalledWith({
    disponibilidadDocenteId: "b1", estudianteId: "e1", motivo: "Conversar sobre las tareas",
  });
  expect(JSON.stringify(vista.toJSON())).toContain("Citación enviada");
});

it("sin bloques libres, citar explica que primero hay que publicar una franja", async () => {
  estado.hijos = [{ estudianteId: "e1", nombres: "Ana", apellidos: "Pérez" }];
  estado.status = "Exhausted";
  await act(async () => { vista = create(<AgendaDocente curso={curso} />); });
  await tocar("Citar a una familia");
  await tocar("Citar a su familia");
  expect(JSON.stringify(vista.toJSON())).toContain("No tienes bloques libres");
});

it("la familia ve la citación arriba y confirma que va", async () => {
  estado.status = "Exhausted";
  estado.citas = [cita({ estado: "SOLICITADA", origen: "CITACION_DOCENTE", motivo: "Hablar de las tareas" })];
  await act(async () => { vista = create(<CitasFamilia />); });
  const texto = JSON.stringify(vista.toJSON());
  expect(texto.indexOf("El docente te citó")).toBeLessThan(texto.indexOf("Pedir una cita"));
  expect(texto).toContain("Hablar de las tareas");
  await tocar("Voy a asistir");
  expect(estado.mutaciones["interaccion:responderCitacion"]).toHaveBeenCalledWith({ citaId: "c1", asistira: true });
});

it("decir que no puede asistir exige un mensaje para el docente", async () => {
  estado.status = "Exhausted";
  estado.citas = [cita({ estado: "SOLICITADA", origen: "CITACION_DOCENTE", motivo: "Hablar" })];
  await act(async () => { vista = create(<CitasFamilia />); });
  await tocar("No puedo asistir");
  expect(botonQueDice("Enviar al docente")!.props.disabled).toBe(true);
  await escribir("Tu mensaje para el docente", "Trabajo a esa hora");
  await tocar("Enviar al docente");
  expect(estado.mutaciones["interaccion:responderCitacion"]).toHaveBeenCalledWith({
    citaId: "c1", asistira: false, mensaje: "Trabajo a esa hora",
  });
});

it("en el historial se lee quién canceló y por qué, y una solicitud vencida no dice que espera", async () => {
  estado.status = "Exhausted";
  estado.citas = [
    cita({ _id: "x1", estado: "CANCELADA", canceladaPor: "DOCENTE", motivoCancelacion: "Junta de área" }),
    cita({ _id: "x2", estado: "SOLICITADA", fechaHoraInicio: Date.now() - HORA, fechaHoraFin: Date.now() - HORA + 900000 }),
  ];
  await act(async () => { vista = create(<CitasFamilia />); });
  const texto = JSON.stringify(vista.toJSON());
  expect(texto).toContain("La canceló el docente: Junta de área");
  expect(texto).toContain("Sin respuesta");
  expect(texto).not.toContain("No vayas hasta que el docente");
  // Nada de lo que ya pasó se puede cancelar.
  expect(botonQueDice("Cancelar la cita")).toBeUndefined();
  expect(botonQueDice("Retirar la solicitud")).toBeUndefined();
});

/* ---------- Ajustes: el interruptor de la barra inferior ---------- */

/**
 * El docente no tiene barra inferior (issue de UX de la familia): sin este
 * guardia, su pantalla de Ajustes ofrecería apagar algo que nunca existió
 * para él.
 */
it("el docente no ve la tarjeta de la barra inferior en Ajustes", async () => {
  await act(async () => { vista = create(<Ajustes esRepresentante={false} />); });
  expect(JSON.stringify(vista.toJSON())).not.toContain("Menú de abajo");
});

it("el representante ve el interruptor y refleja el estado que recibe", async () => {
  await act(async () => {
    vista = create(<Ajustes esRepresentante barraInferiorActiva={false} />);
  });
  const interruptor = vista.root.findByProps({
    accessibilityLabel: "Mostrar la barra de Cita, Inicio y Reporte",
  });
  expect(interruptor.props.accessibilityState.checked).toBe(false);
});

it("tocar el interruptor avisa con el valor invertido, sin decidir nada por su cuenta", async () => {
  const cambios: boolean[] = [];
  await act(async () => {
    vista = create(
      <Ajustes
        esRepresentante
        barraInferiorActiva
        onCambiarBarraInferior={(v) => cambios.push(v)}
      />,
    );
  });
  const interruptor = vista.root.findByProps({
    accessibilityLabel: "Mostrar la barra de Cita, Inicio y Reporte",
  });
  await act(async () => interruptor.props.onPress());
  expect(cambios).toEqual([false]);
});

/**
 * QA del 26 de septiembre: "al apretar una notificación debería enviar a la
 * pantalla que corresponde a esa notificación". Antes tocar una notificación
 * solo la marcaba leída y no navegaba a ningún sitio.
 */
it("al tocar una notificación, avisa con ella para que quien la use decida a dónde ir", async () => {
  estado.notificaciones = [
    { _id: "n1", tipo: "CITACION", titulo: "Tu cita fue confirmada", cuerpo: "", entidadTipo: "cita", entidadId: "c1", leidaEn: undefined, _creationTime: Date.now() },
  ];
  const abiertas: unknown[] = [];
  await act(async () => {
    vista = create(<Notificaciones onAbrir={(n) => abiertas.push(n)} />);
  });
  const fila = vista.root.findByProps({ accessibilityLabel: "Tu cita fue confirmada, sin leer" });
  await act(async () => fila.props.onPress());
  expect(abiertas).toEqual([expect.objectContaining({ tipo: "CITACION", entidadId: "c1" })]);
});

it("sin onAbrir, tocar una notificación solo la marca leída y no revienta", async () => {
  estado.notificaciones = [
    { _id: "n1", tipo: "SISTEMA", titulo: "Aviso", cuerpo: "", leidaEn: undefined, _creationTime: Date.now() },
  ];
  await act(async () => { vista = create(<Notificaciones />); });
  const fila = vista.root.findByProps({ accessibilityLabel: "Aviso, sin leer" });
  await expect(act(async () => fila.props.onPress())).resolves.toBeUndefined();
});
