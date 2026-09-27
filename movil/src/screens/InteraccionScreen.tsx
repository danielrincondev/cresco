/**
 * Pantallas del módulo de interacción (issue #33). Dueño: Persona C.
 *
 *   D15  Bandeja de reclamos del docente, y su respuesta
 *   D16  Horario de atención y confirmación de citas
 *   D17  Alerta de emergencia
 *   P8   El representante agenda una cita
 *   P10  Alertas recibidas y su confirmación
 *   P12  Ajustes
 *   —    Bandeja de notificaciones, que usan los dos
 *
 * Todo esto corre sobre `convex/interaccion.ts`, que está en `main` desde el
 * PR #35. Ninguna pantalla toca la base de datos ni decide un permiso: llama a
 * las funciones, que ya comprueban el vínculo y la titularidad del curso.
 *
 * Los textos de estado y los formatos de fecha no están aquí sino en
 * `lib/estados.ts` y `lib/fechas.ts`, que sí tienen pruebas. Lo que queda en
 * este archivo se verifica con pruebas de componentes, incluyendo errores
 * de reautenticación, cambios durante el envío y páginas vacías.
 */

import { useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useClerk, useSession, useUser } from "@clerk/expo";
import { ConvexError } from "convex/values";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MODALIDAD, REGLAS, TIPO_ALERTA } from "../../convex/lib/enums";
import { Chip, Chips, EstadoVacio } from "../components/Estado";
import { EsqueletoPagina } from "../components/Movimiento";
import { CampoFecha } from "../components/CampoFecha";
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Casilla,
  Cuerpo,
  ErrorMensaje,
  Interruptor,
  Opciones,
  Pagina,
  Subtitulo,
  Tarjeta,
  useOperacion,
} from "../components/NucleoUI";
import { avisoPrivacidad } from "../content/consentimiento";
import {
  etiquetaAlerta,
  etiquetaCitaAl,
  etiquetaReclamo,
  reclamoRespondible,
  textoModalidad,
  textoMotivo,
} from "../lib/estados";
import { parrafosLegibles } from "../lib/texto";
import {
  fechaHoraLegible,
  fechaLegible,
  hoyISO,
  plazoLegible,
} from "../lib/fechas";
import { Espacio, Radio, Semantico, Superficie, Tamano, Texto } from "../theme/Theme";

type Curso = FunctionReturnType<typeof api.nucleo.listarCursos>["cursos"][number];
type CitaDocente = FunctionReturnType<typeof api.interaccion.misCitasDocente>[number];
type CitaFamilia = FunctionReturnType<typeof api.interaccion.misCitasRepresentante>[number];
type Reclamo = FunctionReturnType<
  typeof api.interaccion.inconformidadesDelDocente
>[number];

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/* ==========================================================================
 * D15 — Bandeja de reclamos del docente
 * ======================================================================= */

/**
 * De las entrevistas del 1 de septiembre: cuando un docente informa algo
 * negativo, varios padres se enojan y no lo aceptan. El reclamo es lo que
 * convierte un reporte unilateral en una conversación, así que esta bandeja no
 * se diseña como una lista de tareas molestas: cada tarjeta muestra primero lo
 * que el representante escribió, y recién después la acción que lo originó.
 */
export function ReclamosDocente() {
  const reclamos = useQuery(api.interaccion.inconformidadesDelDocente);
  const [abierto, setAbierto] = useState<Reclamo>();

  if (abierto) {
    return <ResponderReclamo reclamo={abierto} onCerrar={() => setAbierto(undefined)} />;
  }
  return (
    <Pagina
      titulo="Reclamos"
      descripcion="De todos tus cursos. Lo que las familias no aceptaron de una anotación, con lo más urgente primero."
    >
      {reclamos === undefined ? (
        <Cargando mensaje="Cargando reclamos..." />
      ) : reclamos.length === 0 ? (
        <EstadoVacio icono="message-text" titulo="Ningún reclamo abierto">
          Cuando una familia no esté de acuerdo con una anotación, la vas a ver
          aquí. Tienes {REGLAS.INCONFORMIDAD_DIAS_PLAZO} días para responder.
        </EstadoVacio>
      ) : (
        reclamos.map((reclamo) => (
          <Tarjeta key={reclamo.id}>
            <Chips>
              <Chip etiqueta={etiquetaReclamo(reclamo.estado)} />
              <Text style={i.plazo}>{plazoLegible(reclamo.venceEn)}</Text>
            </Chips>
            <Subtitulo>
              {reclamo.estudiante ? reclamo.estudiante.nombre : textoMotivo(reclamo.motivo)}
            </Subtitulo>
            {reclamo.estudiante && <Cuerpo>{textoMotivo(reclamo.motivo)}</Cuerpo>}
            <Text style={i.etiqueta}>
              {reclamo.representante
                ? `Lo abrió ${reclamo.representante}`
                : "Lo abrió su representante"}
            </Text>
            <Cuerpo>{reclamo.mensaje}</Cuerpo>
            <View style={i.citado}>
              <Text style={i.etiqueta}>Sobre esta anotación</Text>
              <Cuerpo>{reclamo.accion.descripcion ?? "Sin descripción"}</Cuerpo>
              <Cuerpo>
                {fechaLegible(reclamo.accion.fechaOcurrencia)} ·{" "}
                {reclamo.accion.puntosAplicados} puntos
              </Cuerpo>
            </View>
            {reclamoRespondible(reclamo.estado) ? (
              <Boton onPress={() => setAbierto(reclamo)}>Responder</Boton>
            ) : (
              <Cuerpo>Ya respondiste este reclamo.</Cuerpo>
            )}
          </Tarjeta>
        ))
      )}
    </Pagina>
  );
}

const DESENLACES = [
  { valor: "MANTENIDA", texto: "Se mantiene" },
  { valor: "MODIFICADA", texto: "Se modifica" },
  { valor: "ANULADA", texto: "Se anula" },
] as const;

/**
 * Aqui es donde el docente puede **anular una sancion**, asi que el nombre del
 * estudiante encabeza la pantalla. Con dos reclamos abiertos a la vez, decidir
 * sin ese dato era cuestion de suerte.
 */
function ResponderReclamo({
  reclamo,
  onCerrar,
}: {
  reclamo: Reclamo;
  onCerrar: () => void;
}) {
  const resolver = useMutation(api.interaccion.resolverInconformidad);
  const [desenlace, setDesenlace] = useState<"MANTENIDA" | "MODIFICADA" | "ANULADA">(
    "MANTENIDA",
  );
  const [respuesta, setRespuesta] = useState("");
  const op = useOperacion();

  async function responder() {
    const r = await op.ejecutar(() =>
      resolver({
        inconformidadId: reclamo.id,
        desenlace,
        respuestaDocente: respuesta,
      }),
    );
    if (r.ok) onCerrar();
  }

  return (
    <Pagina
      titulo={
        reclamo.estudiante ? `Reclamo sobre ${reclamo.estudiante.nombre}` : "Responder el reclamo"
      }
      descripcion={textoMotivo(reclamo.motivo)}
    >
      <Tarjeta>
        <Text style={i.etiqueta}>Lo que escribió la familia</Text>
        <Cuerpo>{reclamo.mensaje}</Cuerpo>
      </Tarjeta>

      <Subtitulo>Qué pasa con la anotación</Subtitulo>
      <Opciones valor={desenlace} opciones={DESENLACES} onChange={setDesenlace} />
      <Aviso>
        {desenlace === "MANTENIDA"
          ? "La anotación queda como está y conserva sus puntos."
          : desenlace === "MODIFICADA"
            ? "La anotación pasa a 0 puntos y la familia ve que la corregiste."
            : "La anotación pasa a 0 puntos y queda anulada."}
      </Aviso>

      <Campo
        etiqueta="Tu respuesta a la familia"
        ayuda="La va a leer el representante. No se puede cerrar un reclamo en silencio."
        multiline
        numberOfLines={4}
        value={respuesta}
        onChangeText={setRespuesta}
        placeholder="Cuéntale qué pasó y qué decidiste."
      />
      <ErrorMensaje mensaje={op.error} />
      <Boton
        pendiente={op.pendiente}
        disabled={respuesta.trim().length === 0}
        onPress={() => void responder()}
      >
        Enviar respuesta
      </Boton>
      <Boton secundario onPress={onCerrar}>
        Volver
      </Boton>
    </Pagina>
  );
}

/* ==========================================================================
 * D16 — Horario de atención y citas del docente
 * ======================================================================= */

/**
 * De las entrevistas: **el docente no elige libremente su horario.** En un
 * plantel fiscal la institución le asigna franjas fijas (martes y jueves de
 * 12:30 a 13:00, por ejemplo). Por eso la pantalla no propone horarios ni
 * sugiere una agenda: pregunta qué franja le asignaron y la publica tal cual.
 */
export function AgendaDocente({ curso }: { curso: Curso }) {
  const citas = useQuery(api.interaccion.misCitasDocente);
  const publicar = useMutation(api.interaccion.publicarDisponibilidad);
  const responder = useMutation(api.interaccion.responderCita);
  const registrar = useMutation(api.interaccion.registrarAsistenciaCita);
  const cancelar = useMutation(api.interaccion.cancelarCita);
  const [fecha, setFecha] = useState(hoyISO());
  const [horaInicio, setInicio] = useState("12:30");
  const [horaFin, setFin] = useState("13:00");
  const [modalidad, setModalidad] = useState<(typeof MODALIDAD)[number]>("PRESENCIAL");
  const [lugar, setLugar] = useState("");
  const [mostrarTodasPasadas, setMostrarTodasPasadas] = useState(false);
  const [citando, setCitando] = useState(false);
  const [cancelando, setCancelando] = useState<CitaDocente>();
  const publicacion = useOperacion();
  const respuesta = useOperacion();
  const asistencia = useOperacion();

  const fechaValida = FORMATO_FECHA.test(fecha);
  const horasValidas = FORMATO_HORA.test(horaInicio) && FORMATO_HORA.test(horaFin);

  async function publicarBloque() {
    const r = await publicacion.ejecutar(() =>
      publicar({
        cursoId: curso.id,
        fecha,
        horaInicio,
        horaFin,
        modalidad,
        lugarOEnlace: lugar.trim() || undefined,
      }),
    );
    if (r.ok) setLugar("");
  }

  if (citando) return <CitarFamilia curso={curso} onCerrar={() => setCitando(false)} />;
  if (cancelando) {
    const esCitacionPendiente =
      cancelando.origen === "CITACION_DOCENTE" && cancelando.estado === "SOLICITADA";
    return (
      <PedirMotivo
        titulo={esCitacionPendiente ? "Retirar la citación" : "Cancelar la cita"}
        descripcion={`${cancelando.estudianteNombre ?? "Cita"} · ${fechaHoraLegible(cancelando.fechaHoraInicio)}`}
        etiqueta="Motivo"
        ayuda="Lo va a leer la familia, y queda en el historial de la cita."
        placeholder="Surgió una reunión del área..."
        textoBoton={esCitacionPendiente ? "Retirar la citación" : "Cancelar la cita"}
        enviar={(motivo) => cancelar({ citaId: cancelando._id, como: "DOCENTE", motivo })}
        onCerrar={() => setCancelando(undefined)}
      />
    );
  }

  const ahora = Date.now();
  const futura = (c: CitaDocente) => c.fechaHoraInicio > ahora;
  const ascendente = (a: CitaDocente, b: CitaDocente) => a.fechaHoraInicio - b.fechaHoraInicio;
  const descendente = (a: CitaDocente, b: CitaDocente) => b.fechaHoraInicio - a.fechaHoraInicio;
  const lista = citas ?? [];

  // Lo que pidió una familia y espera tu respuesta.
  const pendientes = lista
    .filter((c) => c.estado === "SOLICITADA" && c.origen !== "CITACION_DOCENTE" && futura(c))
    .sort(ascendente);
  // Lo que citaste tú y espera la respuesta de la familia.
  const citaciones = lista
    .filter((c) => c.estado === "SOLICITADA" && c.origen === "CITACION_DOCENTE" && futura(c))
    .sort(ascendente);
  const proximas = lista.filter((c) => c.estado === "CONFIRMADA" && futura(c)).sort(ascendente);
  // Confirmadas cuya hora ya llegó: falta decir si la familia vino.
  const porRegistrar = lista
    .filter((c) => c.estado === "CONFIRMADA" && !futura(c))
    .sort(descendente);
  const enCurso = new Set([...pendientes, ...citaciones, ...proximas, ...porRegistrar]);
  const pasadas = lista.filter((c) => !enCurso.has(c)).sort(descendente);
  const pasadasVisibles = mostrarTodasPasadas ? pasadas : pasadas.slice(0, 5);

  return (
    <Pagina
      titulo="Atención a familias"
      descripcion={`Publica la franja que te asignaron. Se reparte en bloques de ${REGLAS.CITA_MINUTOS} minutos.`}
    >
      <Tarjeta>
        <Subtitulo>Publicar una franja</Subtitulo>
        <CampoFecha
          etiqueta="Día"
          ayuda={fechaValida ? fechaLegible(fecha) : "Escríbela o elígela en el calendario."}
          valor={fecha}
          onChange={setFecha}
        />
        <View style={i.dos}>
          <View style={i.mitad}>
            <Campo
              etiqueta="Desde"
              value={horaInicio}
              onChangeText={setInicio}
              placeholder="12:30"
            />
          </View>
          <View style={i.mitad}>
            <Campo etiqueta="Hasta" value={horaFin} onChangeText={setFin} placeholder="13:00" />
          </View>
        </View>
        <Opciones
          valor={modalidad}
          opciones={MODALIDAD.map((m) => ({ valor: m, texto: textoModalidad(m) }))}
          onChange={setModalidad}
        />
        <Campo
          etiqueta={modalidad === "VIRTUAL" ? "Enlace" : "Lugar"}
          ayuda="Opcional."
          value={lugar}
          onChangeText={setLugar}
          autoCapitalize="none"
          placeholder={modalidad === "VIRTUAL" ? "https://..." : "Sala de profesores"}
        />
        <ErrorMensaje mensaje={publicacion.error} />
        <Boton
          pendiente={publicacion.pendiente}
          disabled={!fechaValida || !horasValidas}
          onPress={() => void publicarBloque()}
        >
          Publicar franja
        </Boton>
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>Citar a una familia</Subtitulo>
        <Cuerpo>
          Usa uno de tus bloques libres. La familia confirma si puede asistir, y
          la citación queda en tu historial.
        </Cuerpo>
        <Boton secundario onPress={() => setCitando(true)}>
          Citar a una familia
        </Boton>
      </Tarjeta>

      <Subtitulo>Por confirmar</Subtitulo>
      <ErrorMensaje mensaje={respuesta.error} />
      {citas === undefined ? (
        <Cargando />
      ) : pendientes.length === 0 ? (
        <EstadoVacio icono="calendar-check" titulo="Nada por confirmar">
          Cuando una familia reserve uno de tus bloques, te va a aparecer aquí
          para que la aceptes o la rechaces.
        </EstadoVacio>
      ) : (
        pendientes.map((cita) => (
          <Tarjeta key={cita._id}>
            <DatosCita cita={cita} ahora={ahora} para="DOCENTE" />
            <Boton
              pendiente={respuesta.pendiente}
              onPress={() =>
                void respuesta.ejecutar(() =>
                  responder({ citaId: cita._id, aceptar: true }),
                )
              }
            >
              Confirmar
            </Boton>
            <Boton
              secundario
              pendiente={respuesta.pendiente}
              onPress={() =>
                void respuesta.ejecutar(() =>
                  responder({ citaId: cita._id, aceptar: false }),
                )
              }
            >
              No puedo ese día
            </Boton>
          </Tarjeta>
        ))
      )}

      {porRegistrar.length > 0 && (
        <>
          <Subtitulo>¿Vino la familia?</Subtitulo>
          <ErrorMensaje mensaje={asistencia.error} />
          {porRegistrar.map((cita) => (
            <Tarjeta key={cita._id}>
              <DatosCita cita={cita} ahora={ahora} para="DOCENTE" />
              <Boton
                pendiente={asistencia.pendiente}
                onPress={() =>
                  void asistencia.ejecutar(() =>
                    registrar({ citaId: cita._id, asistio: true }),
                  )
                }
              >
                Sí, vino
              </Boton>
              <Boton
                secundario
                pendiente={asistencia.pendiente}
                onPress={() =>
                  void asistencia.ejecutar(() =>
                    registrar({ citaId: cita._id, asistio: false }),
                  )
                }
              >
                No vino
              </Boton>
            </Tarjeta>
          ))}
        </>
      )}

      {citaciones.length > 0 && (
        <>
          <Subtitulo>Citaciones enviadas</Subtitulo>
          {citaciones.map((cita) => (
            <Tarjeta key={cita._id}>
              <DatosCita cita={cita} ahora={ahora} para="DOCENTE" />
              <Cuerpo>Esperando que la familia confirme.</Cuerpo>
              <Boton secundario onPress={() => setCancelando(cita)}>
                Retirar la citación
              </Boton>
            </Tarjeta>
          ))}
        </>
      )}

      {proximas.length > 0 && (
        <>
          <Subtitulo>Próximas citas</Subtitulo>
          {proximas.map((cita) => (
            <Tarjeta key={cita._id}>
              <DatosCita cita={cita} ahora={ahora} para="DOCENTE" />
              <Boton secundario onPress={() => setCancelando(cita)}>
                Cancelar la cita
              </Boton>
            </Tarjeta>
          ))}
        </>
      )}

      {pasadas.length > 0 && (
        <>
          <Subtitulo>Historial de citas</Subtitulo>
          {pasadasVisibles.map((cita) => (
            <Tarjeta key={cita._id}>
              <DatosCita cita={cita} ahora={ahora} para="DOCENTE" />
            </Tarjeta>
          ))}
          {pasadas.length > 5 && (
            <Boton
              secundario
              onPress={() => setMostrarTodasPasadas((v) => !v)}
            >
              {mostrarTodasPasadas
                ? "Ver menos citas"
                : `Ver anteriores (${pasadas.length - 5} más)`}
            </Boton>
          )}
        </>
      )}
    </Pagina>
  );
}

/**
 * Lo que se dice de una cita en cualquier lista, del lado que sea: su estado,
 * cuándo, de qué estudiante, y lo que cada parte escribió. Todo lo escrito lo
 * ven las dos partes — ver `notasDocente` en el esquema —, así que aquí no
 * hay nada que esconderle a nadie; solo cambia cómo se nombra a quién.
 */
function DatosCita({
  cita,
  ahora,
  para,
}: {
  cita: CitaDocente | CitaFamilia;
  ahora: number;
  para: "DOCENTE" | "REPRESENTANTE";
}) {
  const quien = cita.estudianteNombre;
  return (
    <>
      <Chip etiqueta={etiquetaCitaAl(cita.estado, cita.fechaHoraInicio, ahora)} />
      {cita.origen === "CITACION_DOCENTE" && (
        <Text style={i.etiqueta}>
          {para === "DOCENTE" ? "Citación tuya" : "Citación del docente"}
        </Text>
      )}
      <Subtitulo>{fechaHoraLegible(cita.fechaHoraInicio)}</Subtitulo>
      <Cuerpo>
        {quien ? `${quien} · ${textoModalidad(cita.modalidad)}` : textoModalidad(cita.modalidad)}
      </Cuerpo>
      {cita.lugarOEnlace && <Cuerpo>{cita.lugarOEnlace}</Cuerpo>}
      {cita.motivo && <Cuerpo>{cita.motivo}</Cuerpo>}
      {cita.notasDocente && <Cuerpo>{cita.notasDocente}</Cuerpo>}
      {cita.mensajeRepresentante && (
        <Cuerpo>
          {para === "DOCENTE"
            ? `La familia escribió: ${cita.mensajeRepresentante}`
            : `Le escribiste: ${cita.mensajeRepresentante}`}
        </Cuerpo>
      )}
      {cita.estado === "CANCELADA" && cita.motivoCancelacion && (
        <Cuerpo>
          {`${
            cita.canceladaPor === para
              ? "La cancelaste tú"
              : cita.canceladaPor === "DOCENTE"
                ? "La canceló el docente"
                : "La canceló la familia"
          }: ${cita.motivoCancelacion}`}
        </Cuerpo>
      )}
    </>
  );
}

/**
 * Cancelar una cita y decir que no se puede asistir a una citación piden lo
 * mismo: un texto que va a leer la otra parte. Ninguna de las dos cosas se
 * hace en silencio, así que el botón no se habilita hasta que haya algo
 * escrito — la misma regla que ya sigue la respuesta a un reclamo.
 */
function PedirMotivo({
  titulo,
  descripcion,
  etiqueta,
  ayuda,
  placeholder,
  textoBoton,
  enviar,
  onCerrar,
}: {
  titulo: string;
  descripcion: string;
  etiqueta: string;
  ayuda: string;
  placeholder: string;
  textoBoton: string;
  enviar: (texto: string) => Promise<unknown>;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const op = useOperacion();

  async function confirmar() {
    const r = await op.ejecutar(() => enviar(texto.trim()));
    if (r.ok) onCerrar();
  }

  return (
    <Pagina titulo={titulo} descripcion={descripcion} atras={{ onPress: onCerrar }}>
      <Campo
        etiqueta={etiqueta}
        ayuda={ayuda}
        multiline
        numberOfLines={3}
        maxLength={500}
        value={texto}
        onChangeText={setTexto}
        placeholder={placeholder}
        editable={!op.pendiente}
      />
      <ErrorMensaje mensaje={op.error} />
      <Boton pendiente={op.pendiente} disabled={!texto.trim()} onPress={() => void confirmar()}>
        {textoBoton}
      </Boton>
      <Boton secundario onPress={onCerrar}>
        Volver
      </Boton>
    </Pagina>
  );
}

/**
 * El docente cita a una familia: a quién, en cuál de sus bloques libres, y
 * por qué. El bloque sale de la franja que ya publicó — en un plantel fiscal
 * se recibe a las familias en el horario que asigna la institución, no a
 * cualquier hora —, y el motivo es obligatorio porque es lo primero que la
 * familia lee y lo que queda en el historial.
 */
function CitarFamilia({ curso, onCerrar }: { curso: Curso; onCerrar: () => void }) {
  const { results: estudiantes, status, loadMore } = usePaginatedQuery(
    api.nucleo.listarEstudiantes,
    { cursoId: curso.id },
    { initialNumItems: 40 },
  );
  const bloques = useQuery(api.interaccion.misBloquesLibres, { desde: hoyISO() });
  const citar = useMutation(api.interaccion.citarFamilia);
  const [elegido, setElegido] = useState<{ id: Id<"estudiante">; nombre: string }>();
  const [motivo, setMotivo] = useState("");
  const [enviada, setEnviada] = useState(false);
  const op = useOperacion();

  if (elegido && enviada) {
    return (
      <Pagina titulo="Citación enviada" descripcion={elegido.nombre}>
        <Tarjeta>
          <Cuerpo>
            La familia la ve en Cresco y te avisamos cuando responda. Mientras
            tanto, ese bloque queda reservado para ella.
          </Cuerpo>
        </Tarjeta>
        <Boton onPress={onCerrar}>Volver a la agenda</Boton>
      </Pagina>
    );
  }

  if (!elegido) {
    return (
      <Pagina
        titulo="Citar a una familia"
        descripcion={`${curso.nombre}. Elige al estudiante.`}
        atras={{ onPress: onCerrar }}
      >
        {status === "LoadingFirstPage" ? (
          <Cargando mensaje="Cargando el curso..." />
        ) : estudiantes.length === 0 ? (
          <EstadoVacio icono="account-group" titulo="Todavía no hay estudiantes aprobados">
            Cuando apruebes los registros de las familias, vas a poder citarlas aquí.
          </EstadoVacio>
        ) : (
          estudiantes.map((e) => (
            <Tarjeta key={e.estudianteId}>
              <Subtitulo>
                {e.nombres} {e.apellidos}
              </Subtitulo>
              <Boton
                secundario
                onPress={() =>
                  setElegido({ id: e.estudianteId, nombre: `${e.nombres} ${e.apellidos}` })
                }
              >
                Citar a su familia
              </Boton>
            </Tarjeta>
          ))
        )}
        {status === "CanLoadMore" && (
          <Boton secundario onPress={() => loadMore(40)}>
            Ver más estudiantes
          </Boton>
        )}
        <Boton secundario onPress={onCerrar}>
          Volver
        </Boton>
      </Pagina>
    );
  }

  // Un bloque de hoy cuya hora ya pasó sigue "libre" en la base, pero el
  // servidor lo rechazaría: mejor no ofrecerlo.
  const ahora = Date.now();
  const libres = (bloques ?? []).filter(
    (b) => new Date(`${b.fecha}T${b.horaInicio}:00-05:00`).getTime() > ahora,
  );

  async function citarEn(disponibilidadDocenteId: Id<"disponibilidadDocente">) {
    if (!elegido) return;
    const r = await op.ejecutar(() =>
      citar({ disponibilidadDocenteId, estudianteId: elegido.id, motivo: motivo.trim() }),
    );
    if (r.ok) setEnviada(true);
  }

  return (
    <Pagina
      titulo={`Citar a la familia de ${elegido.nombre}`}
      descripcion="Escribe el motivo y elige uno de tus bloques libres."
      atras={{ onPress: () => setElegido(undefined) }}
    >
      <Campo
        etiqueta="Motivo"
        ayuda="Obligatorio. Es lo primero que lee la familia, y queda en el historial de la cita."
        multiline
        numberOfLines={3}
        maxLength={500}
        value={motivo}
        onChangeText={setMotivo}
        placeholder="Quisiera conversar sobre..."
        editable={!op.pendiente}
      />
      <ErrorMensaje mensaje={op.error} />
      {bloques === undefined ? (
        <Cargando />
      ) : libres.length === 0 ? (
        <EstadoVacio icono="calendar-remove" titulo="No tienes bloques libres">
          La citación usa uno de tus bloques de atención. Publica primero una
          franja desde tu agenda.
        </EstadoVacio>
      ) : (
        libres.map((bloque) => (
          <Tarjeta key={bloque.id}>
            <Subtitulo>{fechaLegible(bloque.fecha)}</Subtitulo>
            <Cuerpo>
              {bloque.horaInicio} — {bloque.horaFin} · {textoModalidad(bloque.modalidad)}
            </Cuerpo>
            {bloque.lugarOEnlace && <Cuerpo>{bloque.lugarOEnlace}</Cuerpo>}
            <Boton
              pendiente={op.pendiente}
              disabled={!motivo.trim()}
              onPress={() => void citarEn(bloque.id)}
            >
              Citar en este horario
            </Boton>
          </Tarjeta>
        ))
      )}
      <Boton secundario onPress={() => setElegido(undefined)}>
        Elegir otro estudiante
      </Boton>
    </Pagina>
  );
}

/* ==========================================================================
 * D17 — Alerta de emergencia
 * ======================================================================= */

/**
 * ⚠️ **La app declara visiblemente que esto no sustituye al ECU 911.** Está
 * decidido, no es opcional, y no va escondido en unos términos — issue #18 y
 * sección 10 del aviso de privacidad. Por eso el aviso está arriba del
 * formulario y no debajo del botón.
 *
 * G1: cada envío exige reingresar la contraseña mediante Clerk. El servidor
 * verifica la firma, la sesión y la edad del factor del token resultante.
 */
export function AlertaDocente({ curso }: { curso: Curso }) {
  const { session } = useSession();
  const { user } = useUser();
  const activar = useAction(api.interaccion.activarAlerta);
  const [tipo, setTipo] = useState<(typeof TIPO_ALERTA)[number]>("EVACUACION");
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [entendido, setEntendido] = useState(false);
  const [password, setPassword] = useState("");
  const [enviada, setEnviada] = useState<{ entregas: number; esSimulacro: boolean }>();
  const op = useOperacion();

  const esSimulacro = tipo === "SIMULACRO";
  const palabra = esSimulacro ? "SIMULACRO" : "ENVIAR";
  const listo =
    !!session && user?.passwordEnabled === true && password.length > 0 &&
    entendido &&
    confirmacion.trim().toUpperCase() === palabra &&
    titulo.trim().length > 0 &&
    mensaje.trim().length > 0;

  async function enviar() {
    if (!listo || op.pendiente || !session) return;
    const datos = { cursoId: curso.id, alcance: "CURSO" as const, tipo, titulo, mensaje, esSimulacro };
    const clave = password;
    setPassword("");
    const r = await op.ejecutar(async () => {
      const fallo = (mensaje: string) => new ConvexError({ codigo: "REAUTENTICACION_REQUERIDA", mensaje });
      try {
        const inicio = await session.startVerification({ level: "first_factor" });
        if (!inicio.supportedFirstFactors?.some(f => f.strategy === "password")) {
          throw fallo("Tu cuenta necesita una contraseña para activar alertas.");
        }
        const verificacion = await session.attemptFirstFactorVerification({ strategy: "password", password: clave });
        if (verificacion.status !== "complete") throw fallo("No se completó la verificación de tu identidad.");
      } catch (error) {
        if (error instanceof ConvexError) throw error;
        throw fallo("No pudimos verificar tu contraseña. Revísala y vuelve a intentarlo.");
      }
      const tokenReautenticacion = await session.getToken({ skipCache: true });
      if (!tokenReautenticacion) throw fallo("Tu sesión ya no está disponible. Vuelve a iniciar sesión.");
      return await activar({ ...datos, tokenReautenticacion });
    });
    if (r.ok) {
      setEnviada({ entregas: r.valor.entregas, esSimulacro: datos.esSimulacro });
      setConfirmacion("");
      setEntendido(false);
    }
  }

  if (enviada !== undefined) {
    return (
      <Pagina titulo="Alerta publicada">
        <EstadoVacio icono="bell-ring" titulo={enviada.entregas === 0 ? "Alerta publicada sin destinatarios" : "Disponible para las familias"}>
          {enviada.entregas === 0
            ? "Este curso no tiene familias vinculadas que puedan recibir este aviso."
            : enviada.esSimulacro
            ? "Se publicó marcada como simulacro. Esto no confirma que las familias la hayan recibido o leído."
            : "La alerta está disponible en Cresco. Esto no confirma que las familias la hayan recibido o leído."}
        </EstadoVacio>
        <Boton secundario onPress={() => setEnviada(undefined)}>
          Volver
        </Boton>
      </Pagina>
    );
  }

  return (
    <Pagina titulo="Alerta de emergencia" descripcion={curso.nombre}>
      <View style={i.ecu}>
        <Text style={i.ecuTitulo}>Esto no sustituye al ECU 911</Text>
        <Text style={i.ecuTexto}>
          Sirve para avisar a las familias del curso, no para pedir auxilio.
          Ante una emergencia real, llama primero al ECU 911.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openURL("tel:911")}
          style={i.ecuBoton}
        >
          <Text style={i.ecuBotonTexto}>Llamar al 911</Text>
        </Pressable>
      </View>

      <Subtitulo>Qué está pasando</Subtitulo>
      <Opciones
        valor={tipo}
        opciones={TIPO_ALERTA.map((t) => ({
          valor: t,
          texto: t === "SIMULACRO" ? "Simulacro" : etiquetaAlerta(t, false).texto,
        }))}
        disabled={op.pendiente}
        onChange={setTipo}
      />
      {esSimulacro && (
        <Aviso>
          Se publicará marcada como simulacro. Es a propósito: si una práctica se
          ve igual que una emergencia, las familias aprenden a ignorarlas.
        </Aviso>
      )}

      <Campo
        editable={!op.pendiente}
        etiqueta="Título"
        value={titulo}
        onChangeText={setTitulo}
        placeholder="Evacuación por sismo"
      />
      <Campo
        editable={!op.pendiente}
        etiqueta="Mensaje para las familias"
        multiline
        numberOfLines={4}
        value={mensaje}
        onChangeText={setMensaje}
        placeholder="Qué pasó, dónde están los estudiantes y qué debe hacer la familia."
      />

      <Casilla
        disabled={op.pendiente}
        texto={`Confirmo que quiero publicar este aviso para las familias del curso ${curso.nombre}.`}
        marcada={entendido}
        onChange={() => setEntendido(!entendido)}
      />
      <Campo
        editable={!op.pendiente}
        etiqueta={`Escribe ${palabra} para confirmar`}
        ayuda="Es el paso que evita que se dispare sin querer."
        value={confirmacion}
        onChangeText={setConfirmacion}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {user?.passwordEnabled ? (
        <Campo
          etiqueta="Confirma tu contraseña"
          ayuda="Verificamos tu identidad antes de publicar cada alerta."
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          editable={!op.pendiente}
        />
      ) : (
        <Aviso>Tu cuenta necesita una contraseña para activar alertas. Si ingresaste con Google, configura primero una contraseña en tu cuenta.</Aviso>
      )}
      <ErrorMensaje mensaje={op.error} />
      <Boton pendiente={op.pendiente} disabled={!listo} onPress={() => void enviar()}>
        {esSimulacro ? "Enviar simulacro" : "Enviar alerta al curso"}
      </Boton>
    </Pagina>
  );
}

/* ==========================================================================
 * P8 — El representante agenda una cita
 * ======================================================================= */

export function CitasFamilia() {
  const { results: hijos, status, loadMore } = usePaginatedQuery(
    api.nucleo.listarMisEstudiantes,
    {},
    { initialNumItems: 20 },
  );
  const citas = useQuery(api.interaccion.misCitasRepresentante);
  const responderCitacion = useMutation(api.interaccion.responderCitacion);
  const cancelar = useMutation(api.interaccion.cancelarCita);
  const [eligiendo, setEligiendo] = useState<Id<"estudiante">>();
  const [declinando, setDeclinando] = useState<CitaFamilia>();
  const [cancelando, setCancelando] = useState<CitaFamilia>();
  const respuesta = useOperacion();

  const hijo = hijos.find((h) => h.estudianteId === eligiendo);
  if (hijo) {
    return (
      <ElegirBloque
        estudianteId={hijo.estudianteId}
        nombre={`${hijo.nombres} ${hijo.apellidos}`}
        onCerrar={() => setEligiendo(undefined)}
      />
    );
  }
  if (declinando) {
    return (
      <PedirMotivo
        titulo="No puedo asistir"
        descripcion={`${declinando.estudianteNombre ?? "Citación"} · ${fechaHoraLegible(declinando.fechaHoraInicio)}`}
        etiqueta="Tu mensaje para el docente"
        ayuda="Obligatorio. Cuéntale por qué, y si puedes, cuándo sí podrías."
        placeholder="Trabajo a esa hora; podría el..."
        textoBoton="Enviar al docente"
        enviar={(mensaje) =>
          responderCitacion({ citaId: declinando._id, asistira: false, mensaje })
        }
        onCerrar={() => setDeclinando(undefined)}
      />
    );
  }
  if (cancelando) {
    const esSolicitud = cancelando.estado === "SOLICITADA";
    return (
      <PedirMotivo
        titulo={esSolicitud ? "Retirar la solicitud" : "Cancelar la cita"}
        descripcion={`${cancelando.estudianteNombre ?? "Cita"} · ${fechaHoraLegible(cancelando.fechaHoraInicio)}`}
        etiqueta="Motivo"
        ayuda="Lo va a leer el docente."
        placeholder="No voy a poder llegar porque..."
        textoBoton={esSolicitud ? "Retirar la solicitud" : "Cancelar la cita"}
        enviar={(motivo) =>
          cancelar({ citaId: cancelando._id, como: "REPRESENTANTE", motivo })
        }
        onCerrar={() => setCancelando(undefined)}
      />
    );
  }

  const ahora = Date.now();
  // Una citación sin responder va arriba de todo: es lo único de esta
  // pantalla que alguien está esperando de la familia.
  const citaciones = (citas ?? [])
    .filter(
      (c) =>
        c.origen === "CITACION_DOCENTE" && c.estado === "SOLICITADA" && c.fechaHoraInicio > ahora,
    )
    .sort((a, b) => a.fechaHoraInicio - b.fechaHoraInicio);
  const resto = (citas ?? []).filter((c) => !citaciones.includes(c));

  return (
    <Pagina
      titulo="Citas"
      descripcion="Reserva un momento con el docente. Él confirma si puede."
    >
      {citaciones.length > 0 && (
        <>
          <Subtitulo>El docente te citó</Subtitulo>
          <ErrorMensaje mensaje={respuesta.error} />
          {citaciones.map((cita) => (
            <Tarjeta key={cita._id}>
              <DatosCita cita={cita} ahora={ahora} para="REPRESENTANTE" />
              <Boton
                pendiente={respuesta.pendiente}
                onPress={() =>
                  void respuesta.ejecutar(() =>
                    responderCitacion({ citaId: cita._id, asistira: true }),
                  )
                }
              >
                Voy a asistir
              </Boton>
              <Boton secundario onPress={() => setDeclinando(cita)}>
                No puedo asistir
              </Boton>
            </Tarjeta>
          ))}
        </>
      )}

      <Subtitulo>Pedir una cita</Subtitulo>
      {status === "LoadingFirstPage" ? (
        <Cargando />
      ) : hijos.length === 0 && status === "Exhausted" ? (
        <EstadoVacio icono="account-group" titulo="Todavía no tienes hijos registrados">
          Registra a tu hijo con el código del curso para poder pedir una cita.
        </EstadoVacio>
      ) : (
        hijos.map((h) => (
          <Tarjeta key={h.estudianteId}>
            <Subtitulo>
              {h.nombres} {h.apellidos}
            </Subtitulo>
            <Boton secundario onPress={() => setEligiendo(h.estudianteId)}>
              Ver horarios del docente
            </Boton>
          </Tarjeta>
        ))
      )}

      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Boton secundario pendiente={status === "LoadingMore"} onPress={() => loadMore(20)}>
          Ver más hijos
        </Boton>
      )}

      {/* La franja se publica **para este curso** (`cursoId` va en la
          mutation), pero la lista de abajo es tu agenda entera: una cita es
          tuya, no de un curso. Se dice para que no parezca filtrada. */}
      <Subtitulo>Tus citas, de todos tus cursos</Subtitulo>
      {citas === undefined ? (
        <Cargando />
      ) : resto.length === 0 ? (
        <EstadoVacio icono="calendar-blank" titulo="Sin citas por ahora">
          Aquí van a aparecer las que pidas y las citaciones del docente, con su estado.
        </EstadoVacio>
      ) : (
        resto.map((cita) => {
          const porVenir = cita.fechaHoraInicio > ahora;
          return (
            <Tarjeta key={cita._id}>
              <DatosCita cita={cita} ahora={ahora} para="REPRESENTANTE" />
              {cita.estado === "SOLICITADA" && porVenir && (
                <Cuerpo>
                  Todavía no está confirmada. No vayas hasta que el docente
                  responda.
                </Cuerpo>
              )}
              {(cita.estado === "SOLICITADA" || cita.estado === "CONFIRMADA") && porVenir && (
                <Boton secundario onPress={() => setCancelando(cita)}>
                  {cita.estado === "SOLICITADA" ? "Retirar la solicitud" : "Cancelar la cita"}
                </Boton>
              )}
            </Tarjeta>
          );
        })
      )}
    </Pagina>
  );
}

function ElegirBloque({
  estudianteId,
  nombre,
  onCerrar,
}: {
  estudianteId: Id<"estudiante">;
  nombre: string;
  onCerrar: () => void;
}) {
  const bloques = useQuery(api.interaccion.bloquesDisponibles, {
    estudianteId,
    desde: hoyISO(),
  });
  const solicitar = useMutation(api.interaccion.solicitarCita);
  const [motivo, setMotivo] = useState("");
  const op = useOperacion();

  async function reservar(disponibilidadDocenteId: Id<"disponibilidadDocente">) {
    const r = await op.ejecutar(() =>
      solicitar({
        disponibilidadDocenteId,
        estudianteId,
        motivo: motivo.trim() || undefined,
      }),
    );
    if (r.ok) onCerrar();
  }

  return (
    <Pagina titulo="Horarios disponibles" descripcion={nombre}>
      <Campo
        etiqueta="Motivo"
        ayuda="Opcional, pero le ayuda al docente a preparar la conversación."
        multiline
        numberOfLines={3}
        value={motivo}
        onChangeText={setMotivo}
        placeholder="Quisiera conversar sobre..."
      />
      <ErrorMensaje mensaje={op.error} />
      {bloques === undefined ? (
        <Cargando />
      ) : bloques.length === 0 ? (
        <EstadoVacio icono="calendar-remove" titulo="El docente no tiene horarios publicados">
          Los docentes publican las franjas que la institución les asigna.
          Vuelve a mirar en unos días.
        </EstadoVacio>
      ) : (
        bloques.map((bloque) => (
          <Tarjeta key={bloque.id}>
            <Subtitulo>{fechaLegible(bloque.fecha)}</Subtitulo>
            <Cuerpo>
              {bloque.horaInicio} — {bloque.horaFin} · {textoModalidad(bloque.modalidad)}
            </Cuerpo>
            {bloque.lugarOEnlace && <Cuerpo>{bloque.lugarOEnlace}</Cuerpo>}
            <Boton pendiente={op.pendiente} onPress={() => void reservar(bloque.id)}>
              Reservar este horario
            </Boton>
          </Tarjeta>
        ))
      )}
      <Boton secundario onPress={onCerrar}>
        Volver
      </Boton>
    </Pagina>
  );
}

/* ==========================================================================
 * P10 — Alertas recibidas
 * ======================================================================= */

export function AlertasFamilia() {
  const alertas = useQuery(api.interaccion.misAlertas);
  const confirmar = useMutation(api.interaccion.confirmarAlerta);
  const op = useOperacion();

  return (
    <Pagina titulo="Alertas" descripcion="Avisos del docente sobre el curso de tu hijo.">
      <Aviso>
        Cresco no sustituye al ECU 911. Ante una emergencia real, llama al 911.
      </Aviso>
      <ErrorMensaje mensaje={op.error} />
      {alertas === undefined ? (
        <Cargando />
      ) : alertas.length === 0 ? (
        <EstadoVacio icono="bell" titulo="Sin alertas">
          Ojalá siga así. Si el docente activa una, la vas a ver aquí y en tu
          teléfono.
        </EstadoVacio>
      ) : (
        alertas.map((alerta) => (
          <Tarjeta key={alerta.entregaId}>
            <Chip etiqueta={etiquetaAlerta(alerta.tipo, alerta.esSimulacro)} />
            <Subtitulo>{alerta.titulo}</Subtitulo>
            <Cuerpo>{alerta.mensaje}</Cuerpo>
            <Cuerpo>{fechaHoraLegible(alerta.activadaEn)}</Cuerpo>
            {alerta.confirmada ? (
              <Cuerpo>Confirmaste que la leíste.</Cuerpo>
            ) : (
              <Boton
                pendiente={op.pendiente}
                onPress={() =>
                  void op.ejecutar(() =>
                    confirmar({ entregaAlertaId: alerta.entregaId }),
                  )
                }
              >
                Confirmar que la leí
              </Boton>
            )}
          </Tarjeta>
        ))
      )}
    </Pagina>
  );
}

/* =======================================================================
 * D18 — Perfil del docente
 * ======================================================================= */

/**
 * Lo que el docente publica sobre si mismo, y que el representante ve en P9.
 *
 * Los cuatro campos son opcionales y **todos se pueden borrar**: dejar uno en
 * blanco lo quita. Un docente que publico su telefono personal y se arrepiente
 * tiene que poder deshacerlo sin pedirle permiso a nadie, y obligarlo a
 * publicarlo para usar la aplicacion seria pedirle un dato que el servicio no
 * necesita.
 *
 * El nombre no se edita aqui: vive en el perfil de la cuenta, junto al
 * documento, porque es la identidad y no un dato de contacto.
 */
export function PerfilDocente() {
  const guardar = useMutation(api.nucleo.actualizarDatosDocente);
  const perfil = useQuery(api.nucleo.obtenerPerfil);
  const [titulo, setTitulo] = useState("");
  const [correo, setCorreo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [horario, setHorario] = useState("");
  const [guardado, setGuardado] = useState(false);
  const op = useOperacion();

  async function enviar() {
    setGuardado(false);
    const r = await op.ejecutar(() =>
      guardar({
        tituloProfesional: titulo,
        correoContacto: correo,
        telefonoContacto: telefono,
        horarioAtencion: horario,
      }),
    );
    if (r.ok) setGuardado(true);
  }

  if (perfil === undefined) return <EsqueletoPagina etiqueta="Cargando el perfil" />;

  return (
    <Pagina
      titulo="Tu perfil profesional"
      descripcion="Esto es lo que los representantes de tu curso ven sobre ti. Todo es opcional."
    >
      <Tarjeta>
        <Subtitulo>
          {perfil?.nombres
            ? `${perfil.nombres} ${perfil.apellidos ?? ""}`.trim()
            : "Tu cuenta"}
        </Subtitulo>
        <Cuerpo>
          Tu nombre y tu documento se cambian desde el perfil de la cuenta, no
          desde aquí.
        </Cuerpo>
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>Cómo te ven las familias</Subtitulo>
        <Campo
          etiqueta="Título profesional"
          value={titulo}
          onChangeText={setTitulo}
          ayuda="Por ejemplo: Licenciado en Educación Básica."
          maxLength={80}
          editable={!op.pendiente}
        />
        <Campo
          etiqueta="Correo de contacto"
          value={correo}
          onChangeText={setCorreo}
          autoCapitalize="none"
          keyboardType="email-address"
          maxLength={120}
          editable={!op.pendiente}
        />
        <Campo
          etiqueta="Teléfono de contacto"
          value={telefono}
          onChangeText={setTelefono}
          keyboardType="phone-pad"
          ayuda="Solo si quieres que te escriban. Puedes dejarlo vacío."
          maxLength={25}
          editable={!op.pendiente}
        />
        <Campo
          etiqueta="Horario de atención"
          value={horario}
          onChangeText={setHorario}
          ayuda="Por ejemplo: martes de 10:00 a 11:00."
          maxLength={120}
          editable={!op.pendiente}
        />
        <Aviso>
          Deja un campo vacío para quitarlo. Lo que borres deja de verse en la
          ficha que consultan los representantes.
        </Aviso>
      </Tarjeta>

      <ErrorMensaje mensaje={op.error} />
      {guardado && !op.error && <Aviso>Guardado. Ya se ve así en la ficha.</Aviso>}
      <Boton onPress={() => void enviar()} pendiente={op.pendiente}>
        Guardar
      </Boton>
    </Pagina>
  );
}

/* =======================================================================
 * P9 — El docente a cargo
 * ======================================================================= */

/**
 * Quien es la persona que le escribe sobre su hijo.
 *
 * Hasta #52 la aplicacion hacia conversar a un docente y a un representante
 * sin que ninguno supiera el nombre del otro. De las entrevistas del 1 de
 * septiembre salio que el problema es que los padres **no aceptan** lo que se
 * les informa: saber quien se lo esta diciendo no es un adorno.
 *
 * Si el docente no ha llenado su ficha, esto no inventa nada ni deja la
 * pantalla en blanco como si fuera un error: dice que todavia no la publico.
 */
export function ProfesorACargo({
  estudianteId,
  nombre,
}: {
  estudianteId: Id<"estudiante">;
  nombre: string;
}) {
  const ficha = useQuery(api.interaccion.docenteACargo, { estudianteId });

  if (ficha === undefined) return <EsqueletoPagina etiqueta="Cargando la ficha" />;

  if (ficha === null) {
    return (
      <Pagina titulo="Docente a cargo">
        <EstadoVacio icono="account-question" titulo="Todavía no hay docente asignado">
          Cuando la institución asigne al titular de {nombre}, vas a verlo aquí
          con sus datos de contacto.
        </EstadoVacio>
      </Pagina>
    );
  }

  const sinDatos =
    ficha.tituloProfesional === null &&
    ficha.correoContacto === null &&
    ficha.telefonoContacto === null &&
    ficha.horarioAtencion === null;

  return (
    <Pagina
      titulo="Docente a cargo"
      descripcion={ficha.curso ? `Titular de ${ficha.curso}.` : undefined}
    >
      <Tarjeta>
        <Subtitulo>{ficha.nombre ?? "Docente titular"}</Subtitulo>
        {ficha.tituloProfesional && <Cuerpo>{ficha.tituloProfesional}</Cuerpo>}
        {ficha.nombre === null && (
          <Cuerpo>
            Su nombre todavía no aparece porque completó su cuenta antes de que
            la aplicación los pidiera.
          </Cuerpo>
        )}
      </Tarjeta>

      {sinDatos ? (
        <Tarjeta>
          <Cuerpo>
            El docente todavía no publicó cómo prefiere que lo contacten. Puedes
            pedirle una cita desde la sección Citas.
          </Cuerpo>
        </Tarjeta>
      ) : (
        <Tarjeta>
          <Subtitulo>Cómo contactarlo</Subtitulo>
          {ficha.horarioAtencion && <Cuerpo>Atiende: {ficha.horarioAtencion}</Cuerpo>}
          {ficha.correoContacto && (
            <Boton
              secundario
              onPress={() => void Linking.openURL(`mailto:${ficha.correoContacto}`)}
            >
              Escribirle al correo
            </Boton>
          )}
          {ficha.telefonoContacto && (
            <Boton
              secundario
              onPress={() => void Linking.openURL(`tel:${ficha.telefonoContacto}`)}
            >
              Llamar a {ficha.telefonoContacto}
            </Boton>
          )}
        </Tarjeta>
      )}

      <Aviso>
        Para algo urgente fuera del horario, usa los canales de la institución.
        Cresco no es un servicio de emergencia.
      </Aviso>
    </Pagina>
  );
}
/* ==========================================================================
 * P12 — Ajustes
 * ======================================================================= */

/**
 * Lo que esta pantalla **no** hace, y por qué se dice en vez de esconderse.
 *
 * Un ajuste que no ajusta nada es peor que no tenerlo: entrena a la persona a
 * no creerle a la pantalla. Así que aquí no hay un interruptor de
 * notificaciones que no encienda nada, ni un botón de exportar que no exporte,
 * ni un "retirar consentimiento" que no retire. Hay tres explicaciones de por
 * qué todavía no, cada una con su motivo real.
 *
 * El texto del consentimiento ya le promete al representante que podrá
 * retirarlo desde Ajustes. Mientras eso no exista, este es el sitio donde
 * tiene que encontrarse la verdad — si busca aquí y no halla nada, la promesa
 * queda como una mentira en vez de como un pendiente declarado.
 */
export function Ajustes({
  esRepresentante = false,
  barraInferiorActiva = true,
  onCambiarBarraInferior,
}: {
  /** El docente no tiene barra inferior: sin este dato, la tarjeta de abajo
   * saldría en su pantalla ofreciendo apagar algo que nunca tuvo. */
  esRepresentante?: boolean;
  barraInferiorActiva?: boolean;
  onCambiarBarraInferior?: (activa: boolean) => void;
}) {
  const { signOut } = useClerk();
  const [privacidad, setPrivacidad] = useState(false);
  const op = useOperacion();

  return (
    <Pagina titulo="Ajustes">
      {esRepresentante && (
        <Tarjeta>
          <Subtitulo>Menú de abajo</Subtitulo>
          <Interruptor
            etiqueta="Mostrar la barra de Cita, Inicio y Reporte"
            encendido={barraInferiorActiva}
            onChange={() => onCambiarBarraInferior?.(!barraInferiorActiva)}
          />
          <Cuerpo>
            Viene encendida por defecto. Se esconde sola mientras lees algo
            largo, para dejarte ver el contenido completo, y vuelve al
            desplazarte hacia arriba.
          </Cuerpo>
        </Tarjeta>
      )}

      <Tarjeta>
        <Subtitulo>Avisos en el teléfono</Subtitulo>
        <Cuerpo>
          Las novedades ya te llegan a la bandeja de la aplicación. El aviso que
          suena en el teléfono todavía no está disponible: necesita una versión
          de la aplicación instalada, no la de desarrollo.
        </Cuerpo>
        <Cuerpo>
          Mientras tanto, revisa Novedades desde la campana de la barra superior.
        </Cuerpo>
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>Privacidad y datos</Subtitulo>
        <Cuerpo>
          Puedes leer completo qué guardamos, quién lo ve y qué derechos tienes.
        </Cuerpo>
        <Boton secundario onPress={() => setPrivacidad(true)}>
          Leer el aviso de privacidad
        </Boton>
        <Aviso>
          Retirar el consentimiento todavía no se puede hacer desde aquí. El
          texto que aceptaste dice que podrás, y va a poder ser — pero en esta
          versión no está construido. Si quieres retirarlo ahora, pídeselo al
          docente o a la institución.
        </Aviso>
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>Exportar un informe</Subtitulo>
        <Cuerpo>
          El informe imprimible no entra en esta versión. Está decidido y
          escrito (DP-009): es la primera función de la siguiente, porque de las
          entrevistas salió que para un docente fiscal lo que vale ante el
          distrito es el papel.
        </Cuerpo>
        <Cuerpo>
          Cresco no reemplaza el expediente en papel de la institución.
        </Cuerpo>
      </Tarjeta>

      <Tarjeta>
        <Subtitulo>Emergencias</Subtitulo>
        <Cuerpo>
          Las alertas de Cresco sirven para que el docente avise a las familias
          del curso. No sustituyen al ECU 911 ni a ningún servicio de
          emergencia. Ante una emergencia real, llama al 911.
        </Cuerpo>
        <Boton secundario onPress={() => void Linking.openURL("tel:911")}>
          Llamar al 911
        </Boton>
      </Tarjeta>

      <ErrorMensaje mensaje={op.error} />
      <Boton
        secundario
        pendiente={op.pendiente}
        onPress={() => void op.ejecutar(() => signOut())}
      >
        Cerrar sesión
      </Boton>

      <Modal
        visible={privacidad}
        animationType="slide"
        onRequestClose={() => setPrivacidad(false)}
      >
        <Pagina titulo="Aviso de privacidad">
          <Boton secundario onPress={() => setPrivacidad(false)}>
            Volver a Ajustes
          </Boton>
          {parrafosLegibles(avisoPrivacidad).map((parrafo, indice) => (
            <Cuerpo key={indice}>{parrafo}</Cuerpo>
          ))}
        </Pagina>
      </Modal>
    </Pagina>
  );
}

/* ==========================================================================
 * Bandeja de notificaciones — la usan los dos roles
 * ======================================================================= */

export type Notificacion = NonNullable<
  FunctionReturnType<typeof api.interaccion.misNotificaciones>
>[number];

export function Notificaciones({
  onAbrir,
}: {
  /**
   * Al tocar una notificación, además de marcarla leída (QA del 26 de
   * septiembre: "al apretar una notificación debería enviar a la pantalla
   * que corresponde"). Opcional: sin esto la campana sigue funcionando como
   * antes, solo marcando la lectura.
   */
  onAbrir?: (n: Notificacion) => void;
}) {
  const notificaciones = useQuery(api.interaccion.misNotificaciones);
  const marcar = useMutation(api.interaccion.marcarNotificacionLeida);
  const op = useOperacion();

  return (
    <Pagina titulo="Novedades">
      <ErrorMensaje mensaje={op.error} />
      {notificaciones === undefined ? (
        <Cargando />
      ) : notificaciones.length === 0 ? (
        <EstadoVacio icono="bell" titulo="Nada nuevo">
          Aquí llegan los avisos del docente, las respuestas a tus reclamos y el
          estado de tus citas.
        </EstadoVacio>
      ) : (
        notificaciones.map((n) => (
          <Pressable
            key={n._id}
            accessibilityRole="button"
            accessibilityLabel={n.leidaEn ? `${n.titulo}, leída` : `${n.titulo}, sin leer`}
            onPress={() => {
              if (!n.leidaEn) void op.ejecutar(() => marcar({ notificacionId: n._id }));
              onAbrir?.(n);
            }}
          >
            <View style={[i.notificacion, !n.leidaEn && i.sinLeer]}>
              <Subtitulo>{n.titulo}</Subtitulo>
              {n.cuerpo.length > 0 && <Cuerpo>{n.cuerpo}</Cuerpo>}
              <Cuerpo>{fechaHoraLegible(n._creationTime)}</Cuerpo>
            </View>
          </Pressable>
        ))
      )}
    </Pagina>
  );
}

const i = StyleSheet.create({
  etiqueta: {
    fontFamily: "Inter-Semibold",
    color: Texto.primario,
    fontSize: Tamano.sm,
  },
  plazo: {
    fontFamily: "Inter",
    color: Texto.secundario,
    fontSize: Tamano.sm,
  },
  citado: {
    borderLeftWidth: 3,
    borderLeftColor: Superficie.borde,
    paddingLeft: Espacio.base,
    gap: Espacio.xs,
  },
  dos: { flexDirection: "row", gap: Espacio.base },
  mitad: { flex: 1 },
  ecu: {
    backgroundColor: Semantico.emergencia,
    borderRadius: Radio.lg,
    padding: Espacio.base,
    gap: Espacio.sm,
  },
  ecuTitulo: {
    fontFamily: "Inter-Semibold",
    color: Texto.sobreColor,
    fontSize: Tamano.lg,
  },
  ecuTexto: {
    fontFamily: "Inter",
    color: Texto.sobreColor,
    fontSize: Tamano.base,
    lineHeight: 24,
  },
  ecuBoton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Texto.sobreColor,
    borderRadius: Radio.base,
    paddingHorizontal: Espacio.base,
  },
  ecuBotonTexto: {
    fontFamily: "Inter-Semibold",
    color: Semantico.emergencia,
    fontSize: Tamano.base,
  },
  notificacion: {
    backgroundColor: Superficie.tarjeta,
    borderWidth: 1,
    borderColor: Superficie.borde,
    borderRadius: Radio.lg,
    padding: Espacio.base,
    gap: Espacio.xs,
  },
  sinLeer: { borderLeftWidth: 4, borderLeftColor: Semantico.positiva },
});
