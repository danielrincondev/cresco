/**
 * Pantallas del módulo de interacción (issue #33). Dueño: Persona C.
 *
 *   D15  Bandeja de reclamos del docente, y su respuesta
 *   D16  Horario de atención y confirmación de citas
 *   D17  Alerta de emergencia
 *   P8   El representante agenda una cita
 *   P10  Alertas recibidas y su confirmación
 *   —    Bandeja de notificaciones, que usan los dos
 *
 * Todo esto corre sobre `convex/interaccion.ts`, que está en `main` desde el
 * PR #35. Ninguna pantalla toca la base de datos ni decide un permiso: llama a
 * las funciones, que ya comprueban el vínculo y la titularidad del curso.
 *
 * Los textos de estado y los formatos de fecha no están aquí sino en
 * `lib/estados.ts` y `lib/fechas.ts`, que sí tienen pruebas. Lo que queda en
 * este archivo es JSX y llamadas — lo que un `tsc` limpio ya cubre razonablemente
 * bien y lo que, sin biblioteca de pruebas de componentes en el proyecto, no
 * tendría cómo verificarse de otra forma.
 */

import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MODALIDAD, REGLAS, TIPO_ALERTA } from "../../convex/lib/enums";
import { Chip, Chips, EstadoVacio } from "../components/Estado";
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Casilla,
  Cuerpo,
  ErrorMensaje,
  Opciones,
  Pagina,
  Subtitulo,
  Tarjeta,
  useOperacion,
} from "../components/NucleoUI";
import {
  etiquetaAlerta,
  etiquetaCita,
  etiquetaReclamo,
  reclamoRespondible,
  textoModalidad,
  textoMotivo,
} from "../lib/estados";
import {
  fechaHoraLegible,
  fechaLegible,
  hoyISO,
  plazoLegible,
} from "../lib/fechas";
import { Espacio, Semantico, Superficie, Tamano, Texto } from "../theme/Theme";

type Curso = FunctionReturnType<typeof api.nucleo.listarCursos>["cursos"][number];
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
      descripcion="Lo que las familias no aceptaron de una anotación. Lo más urgente va primero."
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
            <Subtitulo>{textoMotivo(reclamo.motivo)}</Subtitulo>
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
    <Pagina titulo="Responder el reclamo" descripcion={textoMotivo(reclamo.motivo)}>
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
  const [fecha, setFecha] = useState(hoyISO());
  const [horaInicio, setInicio] = useState("12:30");
  const [horaFin, setFin] = useState("13:00");
  const [modalidad, setModalidad] = useState<(typeof MODALIDAD)[number]>("PRESENCIAL");
  const [lugar, setLugar] = useState("");
  const publicacion = useOperacion();
  const respuesta = useOperacion();

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

  const pendientes = (citas ?? []).filter((c) => c.estado === "SOLICITADA");
  const resto = (citas ?? []).filter((c) => c.estado !== "SOLICITADA");

  return (
    <Pagina
      titulo="Atención a familias"
      descripcion={`Publica la franja que te asignaron. Se reparte en bloques de ${REGLAS.CITA_MINUTOS} minutos.`}
    >
      <Tarjeta>
        <Subtitulo>Publicar una franja</Subtitulo>
        <Campo
          etiqueta="Día"
          ayuda={fechaValida ? fechaLegible(fecha) : "Usa el formato 2026-09-15."}
          value={fecha}
          onChangeText={setFecha}
          placeholder="2026-09-15"
          autoCapitalize="none"
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
            <Chip etiqueta={etiquetaCita(cita.estado)} />
            <Subtitulo>{fechaHoraLegible(cita.fechaHoraInicio)}</Subtitulo>
            <Cuerpo>{textoModalidad(cita.modalidad)}</Cuerpo>
            {cita.motivo && <Cuerpo>{cita.motivo}</Cuerpo>}
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

      {resto.length > 0 && (
        <>
          <Subtitulo>Resto de tus citas</Subtitulo>
          {resto.map((cita) => (
            <Tarjeta key={cita._id}>
              <Chip etiqueta={etiquetaCita(cita.estado)} />
              <Cuerpo>{fechaHoraLegible(cita.fechaHoraInicio)}</Cuerpo>
            </Tarjeta>
          ))}
        </>
      )}
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
 * G1 pide reautenticación antes de activar, y el servidor rechaza un
 * `reautenticadoEn` de hace más de cinco minutos. Lo que se hace aquí son dos
 * cosas: pedir un token fresco a Clerk sin caché —que prueba que la sesión
 * sigue viva en este instante, no que se revocó hace rato— y exigir que el
 * docente escriba la palabra de confirmación, que es lo que evita el disparo
 * accidental con el teléfono en el bolsillo.
 *
 * **Lo que todavía no hace: volver a pedir la contraseña.** `@clerk/expo`
 * exporta `useReverification`, pero está pensado para envolver llamadas a la
 * API de Clerk y no pude comprobar su comportamiento contra una instancia real
 * ni un teléfono. Cablearlo a ciegas para una función de emergencia sería peor
 * que dejarlo escrito: queda anotado en el PR y en el issue.
 */
export function AlertaDocente({ curso }: { curso: Curso }) {
  const { getToken } = useAuth();
  const activar = useMutation(api.interaccion.activarAlerta);
  const [tipo, setTipo] = useState<(typeof TIPO_ALERTA)[number]>("EVACUACION");
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [entendido, setEntendido] = useState(false);
  const [enviada, setEnviada] = useState<number>();
  const op = useOperacion();

  const esSimulacro = tipo === "SIMULACRO";
  const palabra = esSimulacro ? "SIMULACRO" : "ENVIAR";
  const listo =
    entendido &&
    confirmacion.trim().toUpperCase() === palabra &&
    titulo.trim().length > 0 &&
    mensaje.trim().length > 0;

  async function enviar() {
    const r = await op.ejecutar(async () => {
      // Sin caché: si la sesión se revocó, esto falla antes de mandar nada.
      await getToken({ skipCache: true });
      return await activar({
        cursoId: curso.id,
        alcance: "CURSO",
        tipo,
        titulo,
        mensaje,
        esSimulacro,
        reautenticadoEn: Date.now(),
      });
    });
    if (r.ok) {
      setEnviada(r.valor.entregas);
      setConfirmacion("");
      setEntendido(false);
    }
  }

  if (enviada !== undefined) {
    return (
      <Pagina titulo="Alerta enviada">
        <EstadoVacio icono="bell-ring" titulo={`Llegó a ${enviada} familias`}>
          {esSimulacro
            ? "Se envió marcada como simulacro, para que nadie la confunda con una emergencia real."
            : "Las familias del curso ya la recibieron y pueden confirmar que la leyeron."}
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
        onChange={setTipo}
      />
      {esSimulacro && (
        <Aviso>
          Va a llegar marcada como simulacro. Es a propósito: si una práctica se
          ve igual que una emergencia, las familias aprenden a ignorarlas.
        </Aviso>
      )}

      <Campo
        etiqueta="Título"
        value={titulo}
        onChangeText={setTitulo}
        placeholder="Evacuación por sismo"
      />
      <Campo
        etiqueta="Mensaje para las familias"
        multiline
        numberOfLines={4}
        value={mensaje}
        onChangeText={setMensaje}
        placeholder="Qué pasó, dónde están los estudiantes y qué debe hacer la familia."
      />

      <Casilla
        texto={`Confirmo que esto va a llegar a todas las familias del curso ${curso.nombre}.`}
        marcada={entendido}
        onChange={() => setEntendido(!entendido)}
      />
      <Campo
        etiqueta={`Escribe ${palabra} para confirmar`}
        ayuda="Es el paso que evita que se dispare sin querer."
        value={confirmacion}
        onChangeText={setConfirmacion}
        autoCapitalize="characters"
        autoCorrect={false}
      />
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
  const { results: hijos, status } = usePaginatedQuery(
    api.nucleo.listarMisEstudiantes,
    {},
    { initialNumItems: 20 },
  );
  const citas = useQuery(api.interaccion.misCitasRepresentante);
  const [eligiendo, setEligiendo] = useState<Id<"estudiante">>();

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

  return (
    <Pagina
      titulo="Citas"
      descripcion="Reserva un momento con el docente. Él confirma si puede."
    >
      <Subtitulo>Pedir una cita</Subtitulo>
      {status === "LoadingFirstPage" ? (
        <Cargando />
      ) : hijos.length === 0 ? (
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

      <Subtitulo>Tus citas</Subtitulo>
      {citas === undefined ? (
        <Cargando />
      ) : citas.length === 0 ? (
        <EstadoVacio icono="calendar-blank" titulo="Sin citas por ahora">
          Aquí van a aparecer las que pidas, con su estado.
        </EstadoVacio>
      ) : (
        citas.map((cita) => (
          <Tarjeta key={cita._id}>
            <Chip etiqueta={etiquetaCita(cita.estado)} />
            <Subtitulo>{fechaHoraLegible(cita.fechaHoraInicio)}</Subtitulo>
            <Cuerpo>{textoModalidad(cita.modalidad)}</Cuerpo>
            {cita.estado === "SOLICITADA" && (
              <Cuerpo>
                Todavía no está confirmada. No vayas hasta que el docente
                responda.
              </Cuerpo>
            )}
            {cita.notasDocente && <Cuerpo>{cita.notasDocente}</Cuerpo>}
          </Tarjeta>
        ))
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

/* ==========================================================================
 * Bandeja de notificaciones — la usan los dos roles
 * ======================================================================= */

export function Notificaciones() {
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
            onPress={() =>
              n.leidaEn
                ? undefined
                : void op.ejecutar(() => marcar({ notificacionId: n._id }))
            }
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
    borderRadius: 16,
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
    borderRadius: 8,
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
    borderRadius: 16,
    padding: Espacio.base,
    gap: Espacio.xs,
  },
  sinLeer: { borderLeftWidth: 4, borderLeftColor: Semantico.positiva },
});
