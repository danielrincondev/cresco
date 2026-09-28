import { useEffect, useRef, useState } from "react";
import {
  BackHandler,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useClerk, useUser } from "@clerk/expo";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { randomUUID } from "expo-crypto";
import { api } from "../../convex/_generated/api";
import { PARENTESCO } from "../../convex/lib/enums";
import { Icono } from "../theme/Icono";
import { CampoFecha } from "../components/CampoFecha";
import { EsqueletoPagina } from "../components/Movimiento";
import {
  ALTO_CONTENIDO_BARRA,
  BarraInferior,
  type PestanaInferior,
} from "../components/BarraInferior";
import {
  EncabezadoPerfil,
  ItemMenu,
  MenuLateral,
  PieMenu,
  SeccionMenu,
  SeparadorMenu,
  useGestoParaAbrirMenu,
} from "../components/MenuLateral";
import {
  Espacio,
  Marca,
  Radio,
  Semantico,
  Superficie,
  Tamano,
  Texto,
} from "../theme/Theme";
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Casilla,
  ContextoBarraInferior,
  Cuerpo,
  ErrorMensaje,
  LimiteError,
  Opciones,
  Pagina,
  Subtitulo,
  Tarjeta,
  useOperacion,
} from "../components/NucleoUI";
import { PaywallDocente, PaywallRepresentante } from "./PaywallScreen";
import { AnotacionesRecientes, AnotarConducta } from "./ConductaScreen";
import { DetalleAccion, type AccionDeLaBitacora } from "./ReclamarScreen";
import {
  PublicarComunicado,
  ReporteGeneral,
  TomarAsistencia,
} from "./JornadaScreen";
import {
  ReporteAcumulado,
  ReporteDeHoy,
  ReportesAnteriores,
} from "./ReporteScreen";
import {
  AgendaDocente,
  HistorialFamilia,
  Ajustes,
  PerfilDocente,
  ProfesorACargo,
  AlertaDocente,
  AlertasFamilia,
  CitasFamilia,
  Notificaciones,
  type Notificacion,
  ReclamosDocente,
} from "./InteraccionScreen";
import { parrafosLegibles } from "../lib/texto";
import {
  avisoPrivacidad,
  textoConsentimiento,
  versionConsentimiento,
} from "../content/consentimiento";
import { useAuditoriaSesion } from "../lib/useAuditoriaSesion";
import { useLecturaSensible } from "../lib/useLecturaSensible";
import {
  borrarRegistro,
  guardarRegistro,
  recuperarRegistro,
  type SolicitudRegistro,
} from "../lib/registroPendiente";
import {
  guardarBarraInferior,
  leerBarraInferior,
} from "../lib/preferenciasFamilia";
import { fechaISO } from "../lib/fechas";
import { useAvisosDelTelefono } from "../lib/avisosDelTelefono";
import { Chip } from "../components/Estado";
import { EliminarCurso } from "./EliminarCursoScreen";

type Rol = "DOCENTE" | "REPRESENTANTE";
type Curso = FunctionReturnType<
  typeof api.nucleo.listarCursos
>["cursos"][number];
type Alumno = FunctionReturnType<
  typeof api.nucleo.listarPendientes
>["page"][number];
type Perfil = NonNullable<FunctionReturnType<typeof api.nucleo.obtenerPerfil>>;
type Invitacion = FunctionReturnType<typeof api.nucleo.crearInvitacion>;
type Ruta =
  | { tipo: "inicio" | "perfil" | "registro" | "crearCurso" }
  // Interaccion (#33). Las de familia no llevan curso: el permiso sale del
  // vinculo del representante, no de un curso que la pantalla elija.
  | {
      tipo:
        | "notificaciones"
        | "citas"
        | "alertas"
        | "ajustes"
        | "plan"
        | "perfilDocente"
        // Los reclamos son de **todos** los cursos del docente, no de uno:
        // `inconformidadesDelDocente` no recibe curso. Viajaba con uno que la
        // pantalla nunca leyo, y eso hacia creer que estaba acotada.
        | "reclamos";
    }
  // Las cuatro que hablan de un hijo concreto viajan con el: un representante
  // con dos hijos tiene dos docentes a cargo y dos reportes distintos, y la
  // pantalla no puede adivinar cual mira.
  | {
      tipo: "docenteACargo" | "reporteHoy" | "reportesAnteriores" | "acumulado";
      estudianteId: Id<"estudiante">;
      nombre: string;
      /** Solo "reporteHoy", cuando un aviso lleva al reporte de otro día. */
      fecha?: string;
    }
  // P7 lleva la anotacion entera y no solo su id: la bitacora ya la trajo, y
  // volver a pedirla al servidor para pintar lo mismo seria trabajo de mas.
  | {
      tipo: "detalleAccion";
      estudianteId: Id<"estudiante">;
      nombre: string;
      accion: AccionDeLaBitacora;
    }
  | {
      tipo:
        | "curso" | "periodos" | "agenda" | "alerta" | "anotar" | "anioLectivo" | "eliminarCurso"
        // El cierre de jornada (D12, D13, D14): las tres son de un curso
        // concreto, a diferencia de los reclamos.
        | "asistencia" | "reporteDia" | "comunicado"
        | "recientes";
      curso: Curso;
    }
  // Lleva el curso para que "atrás" vuelva a él, como las demás de un curso.
  | { tipo: "historialFamilia"; curso: Curso; estudianteId: Id<"estudiante">; nombre: string }
  | { tipo: "invitacion"; invitacion: Invitacion; curso: Curso }
  | { tipo: "aprobar"; curso: Curso; alumno: Alumno };

/**
 * Los avisos que hablan de **un día**: al tocarlos se abre el reporte de ese
 * día, no el de hoy. Un comunicado no está en la lista porque se ve desde el
 * reporte de cualquier día mientras siga vigente.
 */
const DE_UN_DIA = new Set<Notificacion["tipo"]>([
  "REPORTE_DIARIO", "ACCION_POSITIVA", "ACCION_NEGATIVA", "RESUMEN_SEMANAL",
]);

const documentosAdulto = [
  { valor: "CEDULA", texto: "Cédula" },
  { valor: "PASAPORTE", texto: "Pasaporte" },
] as const;
const documentosHijo = [
  ...documentosAdulto,
  { valor: "SIN_DOCUMENTO", texto: "Sin documento" },
] as const;

/**
 * El contenido del menú lateral del docente.
 *
 * Dos secciones y una raya entre ellas, porque son dos clases distintas de
 * cosa: lo del curso abierto deja de existir cuando sales de él; lo de la
 * cuenta, no. Sin esa separación "Pasar lista" y "Tu plan" parecen lo mismo.
 *
 * Las opciones de curso solo aparecen con un curso en contexto. **Anotaciones
 * recientes vive arriba, en la cuenta, como pidió el diseño**, pero la
 * consulta que la alimenta es `anotacionesRecientesDelCurso` y necesita uno:
 * se resuelve con el curso abierto o, si el docente solo tiene uno, con ese.
 * Sin ninguno de los dos no se ofrece, porque llevaría a una pantalla vacía.
 */
function MenuDocente({
  ruta,
  cursoActivo,
  nombre,
  ir,
  onSalir,
}: {
  ruta: Ruta;
  cursoActivo: Curso | undefined;
  nombre: string;
  ir: (ruta: Ruta) => void;
  onSalir: () => void;
}) {
  const curso = "curso" in ruta ? ruta.curso : undefined;

  // Dentro de un curso el menú es **del curso**: sus acciones, más las dos
  // salidas que hacen falta para movserse — volver a la lista de cursos y las
  // anotaciones recientes. Plan, perfil y ajustes no pintan nada aquí: se
  // llega a ellos saliendo del curso, y meterlos convertía el menú secundario
  // en una copia del principal con cosas de más.
  if (curso) {
    return (
      <>
        {/* Arriba del todo: es la salida del curso, y abajo del cajón no se
            veía sin desplazarse. */}
        <ItemMenu
          icono="home"
          texto="Inicio"
          onPress={() => ir({ tipo: "inicio" })}
        />
        <SeccionMenu titulo={curso.nombre} />
        <ItemMenu
          icono="notebook"
          texto="Anotar conducta"
          activo={ruta.tipo === "anotar"}
          onPress={() => ir({ tipo: "anotar", curso })}
        />
        <ItemMenu
          icono="calendar-check"
          texto="Pasar lista"
          activo={ruta.tipo === "asistencia"}
          onPress={() => ir({ tipo: "asistencia", curso })}
        />
        <ItemMenu
          icono="file-document"
          texto="Reporte del día"
          activo={ruta.tipo === "reporteDia"}
          onPress={() => ir({ tipo: "reporteDia", curso })}
        />
        <ItemMenu
          icono="book-open"
          texto="Anotaciones recientes"
          activo={ruta.tipo === "recientes"}
          onPress={() => ir({ tipo: "recientes", curso })}
        />
        <ItemMenu
          icono="calendar-blank"
          texto="Definir parciales"
          activo={ruta.tipo === "periodos"}
          onPress={() => ir({ tipo: "periodos", curso })}
        />
        <ItemMenu
          icono="message-text"
          texto="Avisar al curso"
          activo={ruta.tipo === "comunicado"}
          onPress={() => ir({ tipo: "comunicado", curso })}
        />
        <ItemMenu
          icono="account-group"
          texto="Atención a familias"
          activo={ruta.tipo === "agenda"}
          onPress={() => ir({ tipo: "agenda", curso })}
        />
        <ItemMenu
          icono="alert"
          texto="Alerta de emergencia"
          activo={ruta.tipo === "alerta"}
          onPress={() => ir({ tipo: "alerta", curso })}
        />
        <PieMenu>
          <ItemMenu icono="logout" texto="Cerrar sesión" peligro onPress={onSalir} />
        </PieMenu>
      </>
    );
  }

  return (
    <>
      <EncabezadoPerfil nombre={nombre} rol="Docente" />
      <SeccionMenu titulo="Tu cuenta" />
      <ItemMenu
        icono="school"
        texto="Cursos"
        activo={ruta.tipo === "inicio"}
        onPress={() => ir({ tipo: "inicio" })}
      />
      {/* `anotacionesRecientesDelCurso` necesita un curso: aquí se resuelve con
          el único del docente cuando solo tiene uno. Sin curso no se ofrece,
          porque llevaría a una pantalla vacía. */}
      {cursoActivo && (
        <ItemMenu
          icono="book-open"
          texto="Anotaciones recientes"
          activo={ruta.tipo === "recientes"}
          onPress={() => ir({ tipo: "recientes", curso: cursoActivo })}
        />
      )}
      <ItemMenu
        icono="account"
        texto="Mi perfil profesional"
        activo={ruta.tipo === "perfilDocente"}
        onPress={() => ir({ tipo: "perfilDocente" })}
      />
      <ItemMenu
        icono="cog"
        texto="Mi plan"
        activo={ruta.tipo === "plan"}
        onPress={() => ir({ tipo: "plan" })}
      />
      <SeparadorMenu />
      <ItemMenu
        icono="account"
        texto="Mi perfil y roles"
        activo={ruta.tipo === "perfil"}
        onPress={() => ir({ tipo: "perfil" })}
      />
      <ItemMenu
        icono="cog"
        texto="Ajustes"
        activo={ruta.tipo === "ajustes"}
        onPress={() => ir({ tipo: "ajustes" })}
      />
      <PieMenu>
        <ItemMenu icono="logout" texto="Cerrar sesión" peligro onPress={onSalir} />
      </PieMenu>
    </>
  );
}

/**
 * El menú lateral de la familia.
 *
 * Mismo panel que el del docente, otro contenido. Aquí no hay "curso
 * abierto": la familia trabaja siempre sobre **un hijo**, así que el hijo hace
 * de contexto igual que allí lo hacía el curso.
 *
 * "Reporte diario" y "Reporte acumulado" necesitan un estudiante concreto —
 * `reporteDelDia` y `reporteAcumulado` lo reciben— así que se resuelven con el
 * hijo de la pantalla abierta o, si solo hay uno aprobado, con ese. Con varios
 * hijos y ninguno abierto no se ofrecen: llevarían al reporte del hermano
 * equivocado, que es peor que no llevar a ninguno.
 */
function MenuRepresentante({
  ruta,
  hijo,
  nombre,
  ir,
  onSalir,
}: {
  ruta: Ruta;
  hijo: { estudianteId: Id<"estudiante">; nombre: string } | undefined;
  nombre: string;
  ir: (ruta: Ruta) => void;
  onSalir: () => void;
}) {
  return (
    <>
      <EncabezadoPerfil nombre={nombre} rol="Representante" />
      <SeccionMenu titulo="Tu perfil" />
      <ItemMenu
        icono="account-group"
        texto="Mis hijos"
        activo={ruta.tipo === "inicio"}
        onPress={() => ir({ tipo: "inicio" })}
      />
      {hijo && (
        <>
          <ItemMenu
            icono="file-document"
            texto="Reporte diario"
            activo={ruta.tipo === "reporteHoy"}
            onPress={() =>
              ir({ tipo: "reporteHoy", estudianteId: hijo.estudianteId, nombre: hijo.nombre })
            }
          />
          <ItemMenu
            icono="book-open"
            texto="Reporte acumulado"
            activo={ruta.tipo === "acumulado"}
            onPress={() =>
              ir({ tipo: "acumulado", estudianteId: hijo.estudianteId, nombre: hijo.nombre })
            }
          />
        </>
      )}
      <ItemMenu
        icono="calendar-blank"
        texto="Pedir una cita"
        activo={ruta.tipo === "citas"}
        onPress={() => ir({ tipo: "citas" })}
      />
      <ItemMenu
        icono="alert"
        texto="Alertas del curso"
        activo={ruta.tipo === "alertas"}
        onPress={() => ir({ tipo: "alertas" })}
      />
      <ItemMenu
        icono="cog"
        texto="Tu plan"
        activo={ruta.tipo === "plan"}
        onPress={() => ir({ tipo: "plan" })}
      />
      <SeparadorMenu />
      <ItemMenu
        icono="account"
        texto="Mi perfil y roles"
        activo={ruta.tipo === "perfil"}
        onPress={() => ir({ tipo: "perfil" })}
      />
      <ItemMenu
        icono="cog"
        texto="Ajustes"
        activo={ruta.tipo === "ajustes"}
        onPress={() => ir({ tipo: "ajustes" })}
      />
      <PieMenu>
        <ItemMenu icono="logout" texto="Cerrar sesión" peligro onPress={onSalir} />
      </PieMenu>
    </>
  );
}

export function NucleoScreen() {
  const perfil = useQuery(api.nucleo.obtenerPerfil);
  useAuditoriaSesion(perfil === null ? null : perfil?.perfilUsuarioId);
  const { user } = useUser();
  const { signOut } = useClerk();
  /**
   * Cuantas novedades no ha abierto la persona.
   *
   * Sin esto la campana no distingue "nada nuevo" de "tres respuestas a tus
   * reclamos", y el representante tiene que acordarse de mirar. En una
   * aplicacion que existe para avisar, eso es dejar el aviso a medias.
   *
   * No cuesta una consulta de mas: `misNotificaciones` ya esta acotada a las
   * cien mas recientes y Convex la mantiene viva por suscripcion, asi que
   * abrir la bandeja no vuelve a pedir nada.
   */
  // `"skip"` hasta que haya perfil: preguntar por la bandeja de alguien que
  // todavia no tiene cuenta es una llamada sin sentido, y era la que rompia
  // la pantalla justo despues de registrarse.
  const novedades = useQuery(
    api.interaccion.misNotificaciones,
    perfil ? {} : "skip",
  );
  const sinLeer = (novedades ?? []).filter((n) => n.leidaEn === undefined).length;
  const [ruta, setRuta] = useState<Ruta>({ tipo: "inicio" });
  const [rolElegido, setRol] = useState<Rol>();
  const [menu, setMenu] = useState(false);
  const salida = useOperacion();
  const rol = rolElegido ?? (perfil?.docenteId ? "DOCENTE" : "REPRESENTANTE");
  const volver = () => setRuta({ tipo: "inicio" });
  /**
   * El curso con el que trabaja el menú.
   *
   * El de la ruta si la ruta lleva uno; si no, el único del docente cuando
   * tiene uno solo — que es el caso del plan gratuito. Con varios cursos y
   * ninguno abierto no hay forma de adivinar, y el menú omite lo que necesite
   * curso en vez de llevar a una pantalla vacía.
   */
  const cursos = useQuery(
    api.nucleo.listarCursos,
    perfil?.docenteId ? {} : "skip",
  );
  /**
   * Los hijos, a nivel de la aplicación y no solo de la pantalla de inicio.
   * El menú los necesita para resolver "Reporte diario" y "Reporte acumulado",
   * y el arranque para saber si ya hay alguno aprobado. Convex comparte la
   * suscripción con la pantalla de inicio: no es una consulta de más.
   */
  const { results: hijos, status: estadoHijos } = usePaginatedQuery(
    api.nucleo.listarMisEstudiantes,
    perfil?.representanteId ? {} : "skip",
    { initialNumItems: 20 },
  );
  const hijosAprobados = (hijos ?? [])
    .filter((h) => h.estadoVerificacion === "APROBADO")
    .map((h) => ({
      estudianteId: h.estudianteId as string,
      nombre: `${h.nombres} ${h.apellidos}`,
    }));
  const hijoAprobado = (hijos ?? []).find(
    (h) => h.estadoVerificacion === "APROBADO",
  );
  /**
   * QA del 26 de septiembre: "al apretar una notificación debería enviar a
   * la pantalla que corresponde a esa notificación". Antes solo se marcaba
   * leída y no pasaba nada más.
   *
   * Se resuelve con lo que la propia notificación ya trae —`tipo`,
   * `entidadTipo`, `entidadId`— sin pedir nada nuevo al servidor. Para lo que
   * habla de un hijo concreto (una acción, un reporte, un comunicado),
   * `entidadTipo` es "estudiante" y `entidadId` su id: así se decidió al
   * emitirlas en `conducta.ts`, precisamente para que esto pudiera resolverse
   * en el cliente. El nombre sale de `hijosAprobados` cuando está disponible;
   * si no, se usa el propio título de la notificación antes que dejar la
   * pantalla en blanco.
   */
  const navegarDesdeNotificacion = (n: Notificacion) => {
    if (n.tipo === "ALERTA_EMERGENCIA") {
      setRuta({ tipo: "alertas" });
      return;
    }
    if (n.tipo === "CITACION" || n.tipo === "RECORDATORIO_CITA") {
      if (rol === "REPRESENTANTE") {
        setRuta({ tipo: "citas" });
        return;
      }
      // La agenda del docente vive dentro de un curso (D16). El servidor
      // manda el de la cita en `cursoId`; si no llega, sirve el único curso
      // del docente. Con varios y ninguno identificado, se queda en la
      // campana en vez de adivinar.
      const suyos = cursos?.cursos ?? [];
      const curso =
        suyos.find((c) => c.id === n.cursoId) ??
        (suyos.length === 1 ? suyos[0] : undefined);
      if (curso) setRuta({ tipo: "agenda", curso });
      return;
    }
    if (n.tipo === "RESPUESTA_INCONFORMIDAD") {
      if (rol === "DOCENTE") setRuta({ tipo: "reclamos" });
      return;
    }
    if (n.entidadTipo === "estudiante" && n.entidadId) {
      const hijo = hijosAprobados.find((h) => h.estudianteId === n.entidadId);
      setRuta({
        tipo: "reporteHoy",
        estudianteId: n.entidadId as Id<"estudiante">,
        nombre: hijo?.nombre ?? n.titulo,
        // Lo que habla de un día concreto abre ese día: el reporte de las
        // 22:00 casi siempre se toca a la mañana siguiente, y ahí "hoy" ya
        // es otro día, todavía sin nada. Los avisos del curso no: se ven
        // mientras sigan vigentes, desde el reporte de cualquier día.
        ...(DE_UN_DIA.has(n.tipo) ? { fecha: fechaISO(n._creationTime) } : {}),
      });
    }
  };
  /**
   * Con al menos un hijo aprobado, la aplicación abre en **su reporte de
   * hoy**, no en "Mis hijos". Es a lo que una familia entra cada tarde; "Mis
   * hijos" tiene funciones que solo hacen falta al inicio del año lectivo
   * —registrar, ver el estado de una solicitud— y obligar a pasar por ahí
   * cada vez era un toque de más para lo que de verdad se usa a diario.
   *
   * **Solo una vez por apertura, y solo desde `inicio`.** Sin la bandera,
   * cada vez que alguien tocara "Inicio" a propósito —desde el menú o la
   * barra inferior— la aplicación lo rebotaría de vuelta al reporte, y
   * "Inicio" dejaría de significar nada: apretarlo y no ir a ningún lado es
   * peor que no tenerlo. La decisión solo se toma la primera vez que hay
   * datos, justo después de abrir la app; a partir de ahí, "Inicio" vuelve a
   * ser una decisión de quien lo toca, no una sugerencia que se deshace sola.
   *
   * ## Por qué es estado y no una ref, y por qué existe `decisionTomada`
   *
   * La primera versión usaba una `ref` y dejaba que `MisHijos` se pintara un
   * instante mientras `listarMisEstudiantes` todavía cargaba, y el efecto
   * recién *después* mandaba al reporte — un parpadeo real, no solo
   * percibido: "Mis hijos" alcanza a pintarse una vez antes de que la
   * redirección lo reemplace. `decisionTomada` es estado (no ref) justamente
   * para poder **leerlo en el render** y no pintar "Mis hijos" hasta saber
   * de verdad hacia dónde se va: con un representante, eso es esperar a que
   * `estadoHijos` deje de estar en su primera carga.
   */
  /**
   * Tocar un aviso en el teléfono hace lo mismo que tocarlo en la campana:
   * lo marca leído y abre su pantalla. Si la app estaba cerrada, el aviso
   * llega antes que la bandeja; se guarda y se resuelve en cuanto carga.
   */
  const marcarLeida = useMutation(api.interaccion.marcarNotificacionLeida);
  const [avisoTocado, setAvisoTocado] = useState<string>();
  useAvisosDelTelefono(perfil?.perfilUsuarioId, setAvisoTocado);
  useEffect(() => {
    if (!avisoTocado || !novedades) return;
    setAvisoTocado(undefined);
    const tocada = novedades.find((n) => n._id === avisoTocado);
    if (!tocada) return;
    if (tocada.leidaEn === undefined) {
      void marcarLeida({ notificacionId: tocada._id }).catch(() => {});
    }
    navegarDesdeNotificacion(tocada);
  }, [avisoTocado, novedades]);
  const [decisionTomada, setDecisionTomada] = useState(false);
  const esperandoHijos = !!perfil?.representanteId && estadoHijos === "LoadingFirstPage";
  useEffect(() => {
    if (decisionTomada || ruta.tipo !== "inicio" || esperandoHijos) return;
    setDecisionTomada(true);
    if (!hijoAprobado) return;
    setRuta({
      tipo: "reporteHoy",
      estudianteId: hijoAprobado.estudianteId,
      nombre: `${hijoAprobado.nombres} ${hijoAprobado.apellidos}`,
    });
  }, [decisionTomada, ruta.tipo, esperandoHijos, hijoAprobado]);
  const hijoDelMenu =
    "estudianteId" in ruta
      ? { estudianteId: ruta.estudianteId, nombre: ruta.nombre }
      : hijoAprobado
        ? {
            estudianteId: hijoAprobado.estudianteId,
            nombre: `${hijoAprobado.nombres} ${hijoAprobado.apellidos}`,
          }
        : undefined;
  const nombreDelPerfil =
    `${perfil?.nombres ?? ""} ${perfil?.apellidos ?? ""}`.trim() || "Tu cuenta";
  /**
   * Las tres pestañas de la familia. Orden pedido: cita, inicio, reporte —
   * el reporte del día queda a la derecha, más cerca del pulgar de quien
   * sostiene el teléfono con una mano, porque es la que más se toca.
   *
   * "Reporte diario" se deshabilita sin `hijoDelMenu`: antes de tener un hijo
   * aprobado no hay a qué reporte ir, y llevaría a una pantalla vacía en vez
   * de a nada.
   */
  const pestanasFamilia: PestanaInferior[] = [
    { clave: "citas", icono: "calendar-blank", etiqueta: "Pedir una cita" },
    { clave: "inicio", icono: "home", etiqueta: "Inicio" },
    {
      clave: "reporteHoy",
      icono: "file-document",
      etiqueta: "Reporte diario",
      disponible: hijoDelMenu !== undefined,
    },
  ];
  const pestanaActiva =
    ruta.tipo === "citas" || ruta.tipo === "inicio" || ruta.tipo === "reporteHoy"
      ? ruta.tipo
      : "";
  const irAPestana = (clave: string) => {
    if (clave === "reporteHoy") {
      if (!hijoDelMenu) return;
      setRuta({ tipo: "reporteHoy", estudianteId: hijoDelMenu.estudianteId, nombre: hijoDelMenu.nombre });
      return;
    }
    setRuta({ tipo: clave as "citas" | "inicio" });
  };

  /**
   * La preferencia de la familia: si quiere la barra o la apagó desde
   * Ajustes. Vive en el teléfono (`preferenciasFamilia.ts`), no en Convex —
   * ver ahí por qué. Empieza en `true` porque es el valor con el que llega
   * toda cuenta nueva y porque la lectura es casi instantánea: el parpadeo de
   * quien la apagó, entre montar y que la lectura resuelva, es imperceptible
   * frente a que todo el mundo vea la pantalla sin barra un instante en cada
   * apertura.
   */
  const [barraInferiorActiva, setBarraInferiorActiva] = useState(true);
  useEffect(() => {
    if (!perfil?.perfilUsuarioId) return;
    let vivo = true;
    void leerBarraInferior(perfil.perfilUsuarioId).then((activa) => {
      if (vivo) setBarraInferiorActiva(activa);
    });
    return () => { vivo = false; };
  }, [perfil?.perfilUsuarioId]);
  const cambiarBarraInferior = (activa: boolean) => {
    setBarraInferiorActiva(activa);
    if (perfil?.perfilUsuarioId) void guardarBarraInferior(perfil.perfilUsuarioId, activa);
  };

  /**
   * Esconderse al leer, aparecer al volver hacia arriba.
   *
   * `ultimoY` no es estado: cambia en cada evento de scroll, y ponerlo en
   * `useState` forzaría un re-render por cada uno de ellos. `UMBRAL` evita que
   * el temblor normal de un dedo parado cuente como "cambié de dirección" y
   * la barra parpadee; `CERCA_DEL_TOPE` la mantiene siempre visible al
   * principio de la pantalla, donde ocultarla a los dos primeros píxeles se
   * sentiría roto en vez de útil.
   */
  const [barraVisible, setBarraVisible] = useState(true);
  const ultimoY = useRef(0);
  const manejarScrollPagina = (y: number) => {
    const UMBRAL = 10;
    const CERCA_DEL_TOPE = 24;
    const delta = y - ultimoY.current;
    ultimoY.current = y;
    if (y < CERCA_DEL_TOPE) setBarraVisible(true);
    else if (delta > UMBRAL) setBarraVisible(false);
    else if (delta < -UMBRAL) setBarraVisible(true);
  };
  /**
   * El mismo número que `BarraInferior` usa para su propio alto: `Pagina`
   * necesita saber cuánto reservar de sitio para que la barra, cuando está
   * visible, no tape el último elemento de la pantalla que esté abierta.
   */
  const margenesSistema = useSafeAreaInsets();
  const rellenoBarraInferior =
    ALTO_CONTENIDO_BARRA + Math.max(margenesSistema?.bottom ?? 0, Espacio.sm);
  const contextoBarra =
    perfil && rol === "REPRESENTANTE" && barraInferiorActiva
      ? { onScroll: manejarScrollPagina, relleno: rellenoBarraInferior }
      : null;
  // Al cambiar de pantalla, la barra vuelve a mostrarse y el rastro de scroll
  // se reinicia: si no, llegar a una pantalla nueva "escondido" porque la
  // anterior habia quedado scrolleada hacia abajo se sentiria como un fallo.
  useEffect(() => {
    setBarraVisible(true);
    ultimoY.current = 0;
  }, [ruta]);
  const listaCursos = cursos?.cursos;
  const cursoActivo =
    "curso" in ruta
      ? ruta.curso
      : listaCursos?.length === 1
        ? listaCursos[0]
        : undefined;
  /**
   * Las dos pantallas del docente desde las que no hay a dónde volver: la
   * lista de cursos y el curso abierto. Ahí manda la hamburguesa; más
   * adentro, la flecha.
   *
   * El representante no tiene este dilema: un solo menú, sin "curso abierto"
   * de por medio, así que la hamburguesa es siempre la respuesta correcta —
   * ver `esRaizRepresentante` más abajo, donde se usa.
   */
  const esRaizDocente = ruta.tipo === "inicio" || ruta.tipo === "curso";
  /** Ir a un sitio desde el menú: navegar y cerrarlo, siempre juntos. */
  const irDesdeMenu = (destino: Ruta) => {
    setRuta(destino);
    setMenu(false);
  };
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      // El menú se cierra antes que nada: si está abierto, es lo que la
      // persona ve, y el boton de atras tiene que actuar sobre lo que ve.
      if (menu) {
        setMenu(false);
        return true;
      }
      if (ruta.tipo === "inicio") return false;
      if ("curso" in ruta && ruta.tipo !== "curso")
        setRuta({ tipo: "curso", curso: ruta.curso });
      else volver();
      return true;
    });
    return () => listener.remove();
  }, [ruta, menu]);
  const retroceder = () => {
    if ("curso" in ruta && ruta.tipo !== "curso")
      setRuta({ tipo: "curso", curso: ruta.curso });
    else volver();
  };
  /** Donde está la hamburguesa, el menú también se abre deslizando desde el borde. */
  const hayMenu = !!perfil && (rol === "DOCENTE" ? esRaizDocente : true);
  const gestoMenu = useGestoParaAbrirMenu(() => setMenu(true), hayMenu && !menu);
  return (
    <SafeAreaView style={styles.pantalla} {...gestoMenu}>
      <View style={styles.barra}>
        {/* **Un solo icono a la izquierda.** Para el docente: hamburguesa en
            las dos raíces —la lista de cursos y el curso abierto—, flecha en
            las pantallas de dentro. Ahí sí hace falta la flecha, porque hay
            "curso abierto" como nivel intermedio de navegación.

            Para el representante: **siempre hamburguesa**. Solo tiene un
            menú, sin nada intermedio como el curso del docente, así que un
            botón de "volver" no llevaba a ningún sitio más útil que el propio
            menú — era peor experiencia, no mejor. Salir de una pantalla se
            hace desde el menú (eligiendo "Mis hijos" u otra opción) o con el
            gesto/botón de atrás del sistema, que sigue funcionando igual.

            Donde hay hamburguesa, el menú también se abre deslizando desde
            el borde izquierdo (`useGestoParaAbrirMenu`). La hamburguesa sigue
            siendo la afordancia que descubre todo el mundo. */}
        {hayMenu ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir el menú"
            accessibilityState={{ expanded: menu }}
            onPress={() => setMenu(true)}
            style={styles.iconButton}
          >
            <Icono nombre="menu" decorativo />
          </Pressable>
        ) : ruta.tipo !== "inicio" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={retroceder}
            style={styles.iconButton}
          >
            <Icono nombre="arrow-left" decorativo />
          </Pressable>
        ) : (
          <View style={styles.marcaIcono}>
            <Icono nombre="school" color={Marca.base} decorativo />
          </View>
        )}
        <View style={styles.marcaTexto}>
          <Text style={styles.marca} numberOfLines={1} adjustsFontSizeToFit>
            CRESCO
          </Text>
          <Text style={styles.rol}>
            {perfil
              ? rol === "DOCENTE"
                ? "Espacio docente"
                : "Espacio familiar"
              : "Tu comunidad educativa"}
          </Text>
        </View>
        {/* En todas las pantallas, no solo en el inicio (pedido de Kenny, 27
            de septiembre): un aviso llega en cualquier momento, y sin la
            campana ese rincón quedaba vacío. Solo se oculta en la propia
            bandeja, donde apuntaría a sí misma. */}
        {perfil && ruta.tipo !== "notificaciones" && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                sinLeer === 0
                  ? "Novedades"
                  : `Novedades, ${sinLeer} sin leer`
              }
              onPress={() => setRuta({ tipo: "notificaciones" })}
              style={styles.iconButton}
            >
              {/* La campana suena distinto cuando hay algo: el icono relleno
                  es el mismo recurso que ya usa la navegacion para "estas
                  aqui", asi que no hace falta un glifo nuevo. */}
              <Icono nombre={sinLeer > 0 ? "bell-ring" : "bell"} activo={sinLeer > 0} decorativo />
              {sinLeer > 0 && (
                <View style={styles.contador}>
                  <Text style={styles.contadorTexto}>
                    {sinLeer > 9 ? "9+" : sinLeer}
                  </Text>
                </View>
              )}
            </Pressable>
            {/* Perfil, ajustes y salir viven en el menú cuando hay menú. La
                campana se queda en la barra: lleva el contador de sin leer, y
                un aviso escondido detrás de un toque es medio aviso. */}
          </>
        )}
        {!perfil && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
            disabled={salida.pendiente}
            onPress={() => void salida.ejecutar(() => signOut())}
            style={styles.iconButton}
          >
            <Icono nombre="logout" decorativo />
          </Pressable>
        )}
      </View>
      <ErrorMensaje mensaje={salida.error} />
      <ContextoBarraInferior.Provider value={contextoBarra}>
      <LimiteError key={`${ruta.tipo}-${rol}`} onVolver={volver}>
        {perfil === undefined ? (
          <Cargando mensaje="Cargando tu espacio..." />
        ) : !perfil || ruta.tipo === "perfil" ? (
          <PerfilForm perfil={perfil} onGuardar={volver} />
        ) : ruta.tipo === "crearCurso" ? (
          <CrearCurso
            onGuardar={(curso) => setRuta({ tipo: "curso", curso })}
          />
        ) : ruta.tipo === "curso" ? (
          <DetalleCurso curso={ruta.curso} navegar={setRuta} />
        ) : ruta.tipo === "periodos" ? (
          <PeriodosForm
            curso={ruta.curso}
            onGuardar={() => setRuta({ tipo: "curso", curso: ruta.curso })}
          />
        ) : ruta.tipo === "invitacion" ? (
          <InvitacionScreen curso={ruta.curso} invitacion={ruta.invitacion} />
        ) : ruta.tipo === "aprobar" ? (
          <AprobarForm
            curso={ruta.curso}
            alumno={ruta.alumno}
            onGuardar={() => setRuta({ tipo: "curso", curso: ruta.curso })}
          />
        ) : ruta.tipo === "registro" ? (
          <RegistroForm perfil={perfil} onGuardar={volver} />
        ) : ruta.tipo === "notificaciones" ? (
          <Notificaciones onAbrir={(n) => navegarDesdeNotificacion(n)} />
        ) : ruta.tipo === "ajustes" ? (
          <Ajustes
            esRepresentante={rol === "REPRESENTANTE"}
            barraInferiorActiva={barraInferiorActiva}
            onCambiarBarraInferior={cambiarBarraInferior}
          />
        ) : ruta.tipo === "reclamos" ? (
          <ReclamosDocente />
        ) : ruta.tipo === "agenda" ? (
          <AgendaDocente curso={ruta.curso} />
        ) : ruta.tipo === "eliminarCurso" ? (
          <EliminarCurso
            curso={ruta.curso}
            onEliminado={() => setRuta({ tipo: "inicio" })}
            onVolver={() => setRuta({ tipo: "curso", curso: ruta.curso })}
          />
        ) : ruta.tipo === "anioLectivo" ? (
          <EditarAnioLectivo
            curso={ruta.curso}
            onVolver={() => setRuta({ tipo: "curso", curso: ruta.curso })}
          />
        ) : ruta.tipo === "historialFamilia" ? (
          <HistorialFamilia
            estudianteId={ruta.estudianteId}
            nombre={ruta.nombre}
            onVolver={() => setRuta({ tipo: "curso", curso: ruta.curso })}
          />
        ) : ruta.tipo === "alerta" ? (
          <AlertaDocente curso={ruta.curso} />
        ) : ruta.tipo === "anotar" ? (
          <AnotarConducta
            cursoId={ruta.curso.id}
            onVolver={() => setRuta({ tipo: "curso", curso: ruta.curso })}
          />
        ) : ruta.tipo === "recientes" ? (
          <AnotacionesRecientes
            cursoId={ruta.curso.id}
            onVolver={() => setRuta({ tipo: "curso", curso: ruta.curso })}
            onAnotar={() => setRuta({ tipo: "anotar", curso: ruta.curso })}
          />
        ) : ruta.tipo === "asistencia" ? (
          <TomarAsistencia
            cursoId={ruta.curso.id}
            onVolver={() => setRuta({ tipo: "curso", curso: ruta.curso })}
          />
        ) : ruta.tipo === "reporteDia" ? (
          <ReporteGeneral
            cursoId={ruta.curso.id}
            onVolver={() => setRuta({ tipo: "curso", curso: ruta.curso })}
          />
        ) : ruta.tipo === "comunicado" ? (
          <PublicarComunicado
            cursoId={ruta.curso.id}
            onVolver={() => setRuta({ tipo: "curso", curso: ruta.curso })}
          />
        ) : ruta.tipo === "citas" ? (
          <CitasFamilia />
        ) : ruta.tipo === "alertas" ? (
          <AlertasFamilia />
        ) : ruta.tipo === "reporteHoy" ? (
          <ReporteDeHoy
            estudianteId={ruta.estudianteId}
            nombre={ruta.nombre}
            fecha={ruta.fecha}
            onVerHoy={() =>
              setRuta({ tipo: "reporteHoy", estudianteId: ruta.estudianteId, nombre: ruta.nombre })
            }
            hijos={hijosAprobados}
            onCambiarHijo={(estudianteId, nombre) =>
              setRuta({ tipo: "reporteHoy", estudianteId: estudianteId as Id<"estudiante">, nombre })
            }
            onVerAnteriores={() => setRuta({ ...ruta, tipo: "reportesAnteriores" })}
            onVerAcumulado={() => setRuta({ ...ruta, tipo: "acumulado" })}
          />
        ) : ruta.tipo === "reportesAnteriores" ? (
          <ReportesAnteriores
            estudianteId={ruta.estudianteId}
            nombre={ruta.nombre}
            onVolver={() => setRuta({ ...ruta, tipo: "reporteHoy" })}
            onVerPlan={() => setRuta({ tipo: "plan" })}
          />
        ) : ruta.tipo === "acumulado" ? (
          <ReporteAcumulado
            estudianteId={ruta.estudianteId}
            nombre={ruta.nombre}
            hijos={hijosAprobados}
            onCambiarHijo={(estudianteId, nombre) =>
              setRuta({ tipo: "acumulado", estudianteId: estudianteId as Id<"estudiante">, nombre })
            }
            onVolver={() => setRuta({ ...ruta, tipo: "reporteHoy" })}
            onVerAccion={(accion) => setRuta({ ...ruta, tipo: "detalleAccion", accion })}
          />
        ) : ruta.tipo === "detalleAccion" ? (
          <DetalleAccion
            accion={ruta.accion}
            nombre={ruta.nombre}
            onVolver={() =>
              setRuta({
                tipo: "acumulado",
                estudianteId: ruta.estudianteId,
                nombre: ruta.nombre,
              })
            }
          />
        ) : ruta.tipo === "perfilDocente" ? (
          <PerfilDocente />
        ) : ruta.tipo === "docenteACargo" ? (
          <ProfesorACargo estudianteId={ruta.estudianteId} nombre={ruta.nombre} />
        ) : ruta.tipo === "plan" ? (
          // Un solo destino para los dos muros: cual se pinta lo decide el rol
          // activo, y `miSuscripcion` devuelve null en la rama que la persona
          // no tiene, asi que nadie ve el plan de un rol que no usa.
          rol === "DOCENTE" ? <PaywallDocente /> : <PaywallRepresentante />
        ) : (
          <>
            {perfil.docenteId && perfil.representanteId && (
              <View style={styles.selectorRol}>
                <Opciones
                  valor={rol}
                  opciones={[
                    { valor: "DOCENTE", texto: "Docente" },
                    { valor: "REPRESENTANTE", texto: "Representante" },
                  ]}
                  onChange={setRol}
                />
              </View>
            )}
            {rol === "DOCENTE" ? (
              <Cursos nombre={user?.firstName ?? ""} navegar={setRuta} />
            ) : !decisionTomada ? (
              // Mientras no se sabe si hay un hijo aprobado, no se pinta
              // "Mis hijos": es exactamente lo que dejaba ver un parpadeo
              // real cuando esa pantalla se pintaba un instante antes de que
              // el efecto la reemplazara por el reporte del día.
              <EsqueletoPagina etiqueta="Cargando tu espacio" />
            ) : (
              <MisHijos
                nombre={user?.firstName ?? ""}
                registrar={() => setRuta({ tipo: "registro" })}
                navegar={setRuta}
              />
            )}
          </>
        )}
      </LimiteError>
      </ContextoBarraInferior.Provider>
      {/* Fuera de `LimiteError` y como hermana del contenido, no dentro: es
          navegación fija, tiene que sobrevivir aunque la pantalla de arriba
          reviente. Absoluta a propósito -- ver la cabecera de
          `BarraInferior.tsx` para por qué, y por qué eso es lo que le permite
          esconderse al leer sin dejar un hueco donde estaba. Se apaga del
          todo (ni se monta) cuando la familia la desactivó desde Ajustes. */}
      {perfil && rol === "REPRESENTANTE" && barraInferiorActiva && (
        <BarraInferior
          pestanas={pestanasFamilia}
          activa={pestanaActiva}
          visible={barraVisible}
          onCambiar={irAPestana}
        />
      )}
      {/* Al final del árbol para que pinte por encima de todo lo demás. Se
          desmonta solo al terminar de cerrarse, así que no se queda
          interceptando toques invisible sobre la pantalla. */}
      {perfil && (
        <MenuLateral abierto={menu} onCerrar={() => setMenu(false)}>
          {rol === "REPRESENTANTE" ? (
            <MenuRepresentante
              ruta={ruta}
              hijo={hijoDelMenu}
              nombre={nombreDelPerfil}
              ir={irDesdeMenu}
              onSalir={() => {
                setMenu(false);
                void salida.ejecutar(() => signOut());
              }}
            />
          ) : (
            <MenuDocente
              ruta={ruta}
              cursoActivo={cursoActivo}
              nombre={nombreDelPerfil}
              ir={irDesdeMenu}
              onSalir={() => {
                setMenu(false);
                void salida.ejecutar(() => signOut());
              }}
            />
          )}
        </MenuLateral>
      )}
    </SafeAreaView>
  );
}

function PerfilForm({
  perfil,
  onGuardar,
}: {
  perfil: Perfil | null;
  onGuardar: () => void;
}) {
  const completar = useMutation(api.nucleo.completarPerfil);
  const { user } = useUser();
  // Clerk ya sabe como se llama la persona si se registro con Google o si lo
  // escribio al crear la cuenta. Se propone, no se impone: el nombre legal que
  // el docente firma no siempre es el que puso en su correo, y es un campo
  // editable, no de solo lectura.
  const [nombres, setNombres] = useState(perfil?.nombres ?? user?.firstName ?? "");
  const [apellidos, setApellidos] = useState(perfil?.apellidos ?? user?.lastName ?? "");
  // El documento se precarga del perfil y queda bloqueado: es la identidad de
  // la cuenta y `completarPerfil` rechaza cambiarla. Antes salia vacio, asi que
  // anadirse un rol obligaba a reescribir la cedula de memoria.
  const identidadFijada = perfil !== null;
  // `SIN_DOCUMENTO` existe en el esquema para estudiantes sin cedula, nunca
  // para un adulto: `completarPerfil` solo acepta CEDULA o PASAPORTE.
  const [documento, setDocumento] = useState<"CEDULA" | "PASAPORTE">(
    perfil?.tipoDocumento === "PASAPORTE" ? "PASAPORTE" : "CEDULA",
  );
  const [numero, setNumero] = useState(perfil?.numeroDocumento ?? "");
  const [telefono, setTelefono] = useState("");
  const [docente, setDocente] = useState(!!perfil?.docenteId);
  const [representante, setRepresentante] = useState(!!perfil?.representanteId);
  const op = useOperacion();
  async function guardar() {
    const roles: Rol[] = [
      ...(docente ? ["DOCENTE" as const] : []),
      ...(representante ? ["REPRESENTANTE" as const] : []),
    ];
    const r = await op.ejecutar(() =>
      completar({
        nombres,
        apellidos,
        tipoDocumento: documento,
        numeroDocumento: numero,
        telefono: telefono.trim() || undefined,
        roles,
      }),
    );
    if (r.ok) onGuardar();
  }
  return (
    <Pagina
      titulo={perfil ? "Tu perfil" : "Bienvenido a Cresco"}
      descripcion={
        perfil
          ? "Puedes añadir otro rol con el mismo documento de tu cuenta."
          : "Cuéntanos cómo vas a participar. Puedes ser docente y representante a la vez."
      }
    >
      <Tarjeta>
        <Subtitulo>¿Cómo usarás Cresco?</Subtitulo>
        <Casilla
          texto="Soy docente"
          marcada={docente}
          disabled={op.pendiente || !!perfil?.docenteId}
          onChange={() => setDocente(!docente)}
        />
        <Casilla
          texto="Soy representante legal"
          marcada={representante}
          disabled={op.pendiente || !!perfil?.representanteId}
          onChange={() => setRepresentante(!representante)}
        />
      </Tarjeta>
      <Tarjeta>
        <Subtitulo>Tu identificación</Subtitulo>
        <Campo
          etiqueta="Nombres"
          value={nombres}
          onChangeText={setNombres}
          autoCapitalize="words"
          maxLength={60}
          editable={!op.pendiente}
        />
        <Campo
          etiqueta="Apellidos"
          value={apellidos}
          onChangeText={setApellidos}
          autoCapitalize="words"
          maxLength={60}
          editable={!op.pendiente}
        />
        {/* El documento es la identidad, y `completarPerfil` rechaza cambiarlo
            con CONFLICTO. Hasta aqui la pantalla lo pintaba editable de todas
            formas: un formulario que ofrece algo que el servidor prohibe, y el
            unico aviso llegaba como error despues de guardar. El nombre si se
            corrige, porque un apellido mal escrito es una errata, no otra
            persona. */}
        <Opciones
          valor={documento}
          opciones={documentosAdulto}
          onChange={setDocumento}
          disabled={op.pendiente || identidadFijada}
        />
        <Campo
          etiqueta="Número de documento"
          ayuda={
            identidadFijada
              ? "Tu documento identifica tu cuenta y no se puede cambiar. Si está mal, escríbenos."
              : undefined
          }
          value={numero}
          onChangeText={setNumero}
          autoCapitalize="characters"
          keyboardType={documento === "CEDULA" ? "number-pad" : "default"}
          maxLength={documento === "CEDULA" ? 10 : 30}
          editable={!op.pendiente && !identidadFijada}
        />
        <Campo
          etiqueta="Teléfono (opcional)"
          value={telefono}
          onChangeText={setTelefono}
          keyboardType="phone-pad"
          maxLength={25}
          editable={!op.pendiente}
        />
      </Tarjeta>
      <ErrorMensaje mensaje={op.error} />
      <Boton
        onPress={() => void guardar()}
        pendiente={op.pendiente}
        disabled={
          !nombres.trim() || !apellidos.trim() || !numero.trim() || (!docente && !representante)
        }
      >
        Guardar y continuar
      </Boton>
    </Pagina>
  );
}

function Cursos({
  nombre,
  navegar,
}: {
  nombre: string;
  navegar: (ruta: Ruta) => void;
}) {
  const datos = useQuery(api.nucleo.listarCursos);
  const [verAnteriores, setVerAnteriores] = useState(false);
  const anteriores = datos?.anteriores ?? [];
  return (
    <Pagina
      titulo={nombre ? `Hola, ${nombre}` : "Tus cursos"}
      descripcion="Un espacio para acompañar a tus estudiantes y sus familias."
    >
      <View style={styles.sectionRow}>
        <Subtitulo>Mis cursos</Subtitulo>
        {datos && (
          <Text style={styles.etiqueta}>
            {datos.cursos.length} / {datos.limitePlan}
          </Text>
        )}
      </View>
      {!datos ? (
        <Cargando />
      ) : datos.cursos.length === 0 ? (
        <Tarjeta>
          <Icono nombre="book-open" tamano={40} color={Marca.base} decorativo />
          <Subtitulo>Tu primer curso empieza aquí</Subtitulo>
          <Cuerpo>
            Crea un curso, define sus parciales e invita a las familias.
          </Cuerpo>
        </Tarjeta>
      ) : (
        datos.cursos.map((curso) => (
          <Pressable
            key={curso.id}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${curso.nombre}`}
            onPress={() => navegar({ tipo: "curso", curso })}
          >
            <Tarjeta>
              <View style={styles.sectionRow}>
                <Subtitulo>{curso.nombre}</Subtitulo>
                <Icono nombre="chevron-right" decorativo />
              </View>
              <Cuerpo>{curso.institucion}</Cuerpo>
              <Text style={styles.etiqueta}>
                {curso.totalEstudiantes} estudiantes · {curso.nivel}
              </Text>
            </Tarjeta>
          </Pressable>
        ))
      )}
      {/* Los cursos de un año lectivo que ya terminó: no cuentan para el
          plan, así que el del año siguiente se puede abrir de inmediato. Van
          plegados para que la pantalla muestre primero lo del año en curso. */}
      {anteriores.length > 0 && (
        <Boton secundario onPress={() => setVerAnteriores(!verAnteriores)}>
          {verAnteriores ? "Ocultar cursos anteriores" : `Cursos anteriores (${anteriores.length})`}
        </Boton>
      )}
      {verAnteriores &&
        anteriores.map((curso) => (
          <Pressable
            key={curso.id}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${curso.nombre}, finalizado`}
            onPress={() => navegar({ tipo: "curso", curso })}
          >
            <Tarjeta>
              <View style={styles.sectionRow}>
                <Subtitulo>{curso.nombre}</Subtitulo>
                <Chip etiqueta={{ tono: "neutro", texto: "Finalizado" }} />
              </View>
              <Cuerpo>{curso.institucion}</Cuerpo>
              <Text style={styles.etiqueta}>
                {curso.totalEstudiantes} estudiantes · {curso.nivel}
              </Text>
            </Tarjeta>
          </Pressable>
        ))}
      {/* Vive aqui y no dentro de un curso porque cubre todos: con el plan
          PRO son hasta cinco, y abrirla desde uno hacia creer lo contrario. */}
      <Boton secundario onPress={() => navegar({ tipo: "reclamos" })}>
        Reclamos de las familias
      </Boton>
      {datos &&
        (datos.cursos.length < datos.limitePlan ? (
          <Boton onPress={() => navegar({ tipo: "crearCurso" })}>
            Crear curso
          </Boton>
        ) : datos.limitePlan === 1 ? (
          // El momento exacto en que el plan gratuito se queda corto: aquí se
          // ofrece PRO, no en la portada. Decía "disponible próximamente" desde
          // antes de que existiera la compra, y ya existe.
          <>
            <Aviso>
              Tu plan incluye un curso y ya lo estás usando. Con el plan PRO
              puedes tener más cursos, y más estudiantes en cada uno.
            </Aviso>
            <Boton onPress={() => navegar({ tipo: "plan" })}>Ver el plan PRO</Boton>
          </>
        ) : (
          <Aviso>
            {`Has alcanzado los ${datos.limitePlan} cursos de tu plan. Cuando termina el año lectivo de un curso, deja de contar para el límite.`}
          </Aviso>
        ))}
    </Pagina>
  );
}

function CrearCurso({ onGuardar }: { onGuardar: (curso: Curso) => void }) {
  const crear = useMutation(api.nucleo.crearCurso);
  const [datos, setDatos] = useState({
    nombreInstitucion: "",
    nombreCurso: "",
    nivel: "",
    paralelo: "",
    anioInicio: "",
    anioFin: "",
  });
  const op = useOperacion();
  const campos = [
    {
      clave: "nombreInstitucion",
      etiqueta: "Nombre de la escuela",
      placeholder: "Escribe el nombre de tu escuela",
    },
    {
      clave: "nombreCurso",
      etiqueta: "Nombre del curso",
      placeholder: "Quinto A",
    },
    { clave: "nivel", etiqueta: "Nivel", placeholder: "5.º de básica" },
    { clave: "paralelo", etiqueta: "Paralelo", placeholder: "A" },
    {
      clave: "anioInicio",
      etiqueta: "Inicio del año lectivo",
      placeholder: "AAAA-MM-DD",
    },
    {
      clave: "anioFin",
      etiqueta: "Fin del año lectivo",
      placeholder: "AAAA-MM-DD",
    },
  ] as const;
  async function guardar() {
    const r = await op.ejecutar(() => crear(datos));
    if (r.ok) onGuardar(r.valor);
  }
  return (
    <Pagina
      titulo="Crear curso"
      descripcion="La escuela se registra con el nombre que escribas."
    >
      <Tarjeta>
        {campos.map((c) => (
          <Campo
            key={c.clave}
            etiqueta={c.etiqueta}
            placeholder={c.placeholder}
            value={datos[c.clave]}
            onChangeText={(valor) => setDatos({ ...datos, [c.clave]: valor })}
            editable={!op.pendiente}
            autoCapitalize={c.clave.startsWith("anio") ? "none" : "sentences"}
            maxLength={c.clave.startsWith("anio") ? 10 : 160}
          />
        ))}
      </Tarjeta>
      <ErrorMensaje mensaje={op.error} />
      <Boton
        pendiente={op.pendiente}
        disabled={Object.values(datos).some((v) => !v.trim())}
        onPress={() => void guardar()}
      >
        Crear mi curso
      </Boton>
    </Pagina>
  );
}

function DetalleCurso({
  curso,
  navegar,
}: {
  curso: Curso;
  navegar: (ruta: Ruta) => void;
}) {
  const calendario = useQuery(api.nucleo.obtenerCalendarioCurso, {
    cursoId: curso.id,
  });
  // QA del 26 de septiembre: "debería ir primero el botón de 'estudiante' en
  // vez del botón 'por aprobar'" — es lo que un docente mira más seguido, una
  // vez que el curso ya tiene alumnos matriculados.
  const [pestana, setPestana] = useState<"ESTUDIANTES" | "PENDIENTES">(
    "ESTUDIANTES",
  );
  const [masOpciones, setMasOpciones] = useState(false);
  // QA del 27 de septiembre: "conocer los 3 estudiantes con más acciones
  // negativas... que no falle y salga que es por falta de conexión". Se
  // pide en cuanto se conoce el curso, no solo cuando se despliega: así el
  // aviso de "sin ninguna anotación" (que sí va siempre a la vista) no
  // depende de que el docente haya abierto el desplegable primero.
  const panorama = useQuery(
    api.conducta.panoramaDelCurso,
    calendario && calendario.periodos.length > 0 ? { cursoId: curso.id } : "skip",
  );
  const [verTop, setVerTop] = useState(false);
  const avisos = useQuery(api.interaccion.familiasSinAvisos, { cursoId: curso.id });
  const [verSinAvisos, setVerSinAvisos] = useState(false);
  const invitar = useMutation(api.nucleo.crearInvitacion);
  const op = useOperacion();
  async function invitarFamilias() {
    const r = await op.ejecutar(() => invitar({ cursoId: curso.id }));
    if (r.ok) navegar({ tipo: "invitacion", curso, invitacion: r.valor });
  }
  // Sin parciales no se puede aprobar a nadie, asi que el curso esta a medio
  // montar y lo unico que importa es terminarlo. Con ellos, la pantalla pasa a
  // servir al dia a dia.
  const sinMontar = calendario !== undefined && calendario.periodos.length === 0;

  return (
    <Pagina titulo={curso.nombre} descripcion={curso.institucion}>
      {!calendario ? (
        <Cargando />
      ) : sinMontar ? (
        <>
          <Aviso>
            Este curso todavía no tiene parciales. Defínelos antes de aprobar
            estudiantes: el puntaje de cada uno vive dentro de un parcial.
          </Aviso>
          <Boton onPress={() => navegar({ tipo: "periodos", curso })}>
            Definir parciales
          </Boton>
        </>
      ) : null}

      {/* El dia a dia primero, y solo tres. Un docente hace estas tres cosas
          cada jornada; las demas, de vez en cuando. */}
      <Subtitulo>Hoy</Subtitulo>
      <Boton onPress={() => navegar({ tipo: "anotar", curso })}>
        Anotar conducta
      </Boton>
      <Boton secundario onPress={() => navegar({ tipo: "asistencia", curso })}>
        Pasar lista
      </Boton>
      <Boton secundario onPress={() => navegar({ tipo: "reporteDia", curso })}>
        Reporte del día
      </Boton>

      {/* QA del 27 de septiembre. Un conteo, sin nombres, y solo cuando hay
          algo que señalar -- el silencio (todos tienen al menos una
          anotación) no necesita un aviso. */}
      {panorama && panorama.hayPeriodo && panorama.sinAnotaciones > 0 && (
        <Aviso>
          {panorama.sinAnotaciones === 1
            ? "1 estudiante sin ninguna anotación este parcial."
            : `${panorama.sinAnotaciones} estudiantes sin ninguna anotación este parcial.`}
        </Aviso>
      )}

      {/* Las constancias de Cresco (quién vio, quién abrió) y los
          recordatorios dependen de que el aviso llegue: a quien no le llega,
          el docente tiene que decírselo en persona. */}
      {avisos && avisos.sinAvisos.length > 0 && (
        <Tarjeta>
          <Subtitulo>
            {avisos.sinAvisos.length === avisos.familias
              ? avisos.familias === 1
                ? "La familia del curso no recibe avisos en el teléfono"
                : "Ninguna familia del curso recibe avisos en el teléfono"
              : `${avisos.sinAvisos.length} de ${avisos.familias} familias no ${
                  avisos.sinAvisos.length === 1 ? "recibe" : "reciben"
                } avisos en el teléfono`}
          </Subtitulo>
          <Cuerpo>
            Cresco solo puede avisar en el teléfono a quien lo tiene registrado.
            Mientras tanto, lo ven todo al abrir la aplicación.
          </Cuerpo>
          {verSinAvisos ? (
            <>
              <Cuerpo>{`${avisos.sinAvisos.map((f) => f.nombre).join(", ")}.`}</Cuerpo>
              <Boton secundario onPress={() => setVerSinAvisos(false)}>
                Ocultar
              </Boton>
            </>
          ) : (
            <Boton secundario onPress={() => setVerSinAvisos(true)}>
              {`Ver quiénes (${avisos.sinAvisos.length})`}
            </Boton>
          )}
        </Tarjeta>
      )}

      {/* A diferencia del aviso de arriba, esto sí nombra a estudiantes
          concretos -- por eso va detrás de un desplegable que el docente
          elige abrir, no algo que se le presenta de entrada cada vez. */}
      {calendario && calendario.periodos.length > 0 && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quién tiene más anotaciones negativas este parcial"
            accessibilityState={{ expanded: verTop }}
            onPress={() => setVerTop(!verTop)}
            style={styles.masOpciones}
          >
            <Text style={styles.masOpcionesTexto}>Quién tiene más anotaciones negativas</Text>
            <Icono nombre={verTop ? "chevron-up" : "chevron-down"} decorativo />
          </Pressable>
          {verTop && (
            <Tarjeta>
              {!panorama ? (
                <Cargando />
              ) : !panorama.hayPeriodo ? (
                <Cuerpo>No hay un parcial en curso todavía.</Cuerpo>
              ) : panorama.totalEstudiantes === 0 ? (
                <Cuerpo>Aún no hay estudiantes matriculados.</Cuerpo>
              ) : panorama.topNegativos.length === 0 ? (
                <Cuerpo>Nadie tiene anotaciones negativas este parcial.</Cuerpo>
              ) : (
                panorama.topNegativos.map((fila) => (
                  <View key={fila.estudianteId} style={styles.filaTop}>
                    <Text style={styles.filaTopNombre}>{fila.nombre}</Text>
                    <Text style={styles.filaTopCantidad}>{fila.cantidad}</Text>
                  </View>
                ))
              )}
            </Tarjeta>
          )}
        </>
      )}

      {/* El contenido, no al final. Un docente entra a ver a sus estudiantes:
          tenerlos debajo de nueve botones obligaba a recorrer la navegacion
          entera para llegar a lo que vino a buscar. */}
      <Subtitulo>Estudiantes</Subtitulo>
      <Opciones
        valor={pestana}
        opciones={[
          { valor: "ESTUDIANTES", texto: "Estudiantes" },
          { valor: "PENDIENTES", texto: "Por aprobar" },
        ]}
        onChange={setPestana}
      />
      {pestana === "PENDIENTES" ? (
        <Pendientes
          curso={curso}
          aprobar={(alumno) => navegar({ tipo: "aprobar", curso, alumno })}
        />
      ) : (
        <Estudiantes
          curso={curso}
          onVerHistorial={(estudianteId, nombre) =>
            navegar({ tipo: "historialFamilia", curso, estudianteId, nombre })
          }
        />
      )}

      {/*
       * QA del 26 de septiembre: "invitar representante y alerta deberían
       * ocultarse en 'más opciones'". Solo invitar se pliega — la alerta de
       * emergencia se queda siempre visible (ver más abajo): ya vive también
       * en el menú lateral, así que plegarla aquí sería redundante, y en una
       * emergencia los segundos cuentan.
       */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Más opciones"
        accessibilityState={{ expanded: masOpciones }}
        onPress={() => setMasOpciones(!masOpciones)}
        style={styles.masOpciones}
      >
        <Text style={styles.masOpcionesTexto}>Más opciones</Text>
        <Icono nombre={masOpciones ? "chevron-up" : "chevron-down"} decorativo />
      </Pressable>
      {masOpciones && (
        <>
          <Boton pendiente={op.pendiente} onPress={() => void invitarFamilias()}>
            Invitar representantes
          </Boton>
          <Boton secundario onPress={() => navegar({ tipo: "anioLectivo", curso })}>
            Editar año lectivo
          </Boton>
          <Boton secundario tono="NEGATIVA" onPress={() => navegar({ tipo: "eliminarCurso", curso })}>
            Eliminar curso
          </Boton>
        </>
      )}
      <ErrorMensaje mensaje={op.error} />

      {/* Se queda en la pantalla, no solo en el menú: en una emergencia los
          segundos cuentan y abrir un cajón primero sería cobrarlos. */}
      <Boton secundario onPress={() => navegar({ tipo: "alerta", curso })}>
        Alerta de emergencia
      </Boton>

    </Pagina>
  );
}

function Pendientes({
  curso,
  aprobar,
}: {
  curso: Curso;
  aprobar: (alumno: Alumno) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.nucleo.listarPendientes,
    { cursoId: curso.id },
    { initialNumItems: 20 },
  );
  return (
    <>
      {status === "LoadingFirstPage" ? (
        <Cargando />
      ) : results.length === 0 ? (
        <Tarjeta>
          <Subtitulo>No hay solicitudes pendientes</Subtitulo>
          <Cuerpo>
            Cuando una familia registre a su hijo con tu código, aparecerá aquí.
          </Cuerpo>
        </Tarjeta>
      ) : (
        results.map((a) => (
          <Tarjeta key={a.estudianteId}>
            <Subtitulo>
              {a.nombres} {a.apellidos}
            </Subtitulo>
            <Cuerpo>
              {a.tipoDocumento === "SIN_DOCUMENTO"
                ? "Sin documento de identidad"
                : a.numeroDocumento}
            </Cuerpo>
            <Boton secundario onPress={() => aprobar(a)}>
              Revisar y aprobar
            </Boton>
          </Tarjeta>
        ))
      )}
      <Mas status={status} cargar={() => loadMore(20)} />
    </>
  );
}
function Estudiantes({
  curso,
  onVerHistorial,
}: {
  curso: Curso;
  onVerHistorial: (estudianteId: Id<"estudiante">, nombre: string) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.nucleo.listarEstudiantes,
    { cursoId: curso.id },
    { initialNumItems: 20 },
  );
  return (
    <>
      {status === "LoadingFirstPage" ? (
        <Cargando />
      ) : results.length === 0 ? (
        <Tarjeta>
          <Subtitulo>Aún no hay estudiantes matriculados</Subtitulo>
          <Cuerpo>
            Aprueba las solicitudes de las familias para completar la lista.
          </Cuerpo>
        </Tarjeta>
      ) : (
        results.map((a) => (
          <Tarjeta key={a.estudianteId}>
            <Subtitulo>
              {a.nombres} {a.apellidos}
            </Subtitulo>
            <Cuerpo>Matrícula activa</Cuerpo>
            <Boton
              secundario
              onPress={() => onVerHistorial(a.estudianteId, `${a.nombres} ${a.apellidos}`)}
            >
              Historial de la familia
            </Boton>
          </Tarjeta>
        ))
      )}
      <Mas status={status} cargar={() => loadMore(20)} />
    </>
  );
}
function Mas({ status, cargar }: { status: string; cargar: () => void }) {
  return status === "CanLoadMore" ? (
    <Boton secundario onPress={cargar}>
      Cargar más
    </Boton>
  ) : status === "LoadingMore" ? (
    <Cargando />
  ) : null;
}

/**
 * Corregir las fechas del año lectivo del curso. Las reglas las pone el
 * servidor (`corregirAnioLectivo`): puede haber empezado pero no terminado,
 * dura como máximo 400 días, y los parciales tienen que seguir cabiendo.
 */
function EditarAnioLectivo({ curso, onVolver }: { curso: Curso; onVolver: () => void }) {
  const calendario = useQuery(api.nucleo.obtenerCalendarioCurso, { cursoId: curso.id });
  const corregir = useMutation(api.nucleo.corregirAnioLectivo);
  const [fechas, setFechas] = useState<{ inicio: string; fin: string }>();
  const op = useOperacion();

  if (calendario === undefined) return <Cargando mensaje="Cargando el año lectivo..." />;
  const inicio = fechas?.inicio ?? calendario.fechaInicio;
  const fin = fechas?.fin ?? calendario.fechaFin;

  async function guardar() {
    const r = await op.ejecutar(() => corregir({ cursoId: curso.id, fechaInicio: inicio, fechaFin: fin }));
    if (r.ok) onVolver();
  }

  return (
    <Pagina
      titulo="Año lectivo"
      descripcion={curso.nombre}
      atras={{ onPress: onVolver }}
    >
      <Tarjeta>
        <CampoFecha
          etiqueta="Inicio"
          valor={inicio}
          onChange={(valor) => setFechas({ inicio: valor, fin })}
          editable={!op.pendiente}
        />
        <CampoFecha
          etiqueta="Fin"
          valor={fin}
          onChange={(valor) => setFechas({ inicio, fin: valor })}
          ayuda="De hoy en adelante: un año lectivo que ya terminó no se puede editar ni crear."
          editable={!op.pendiente}
        />
      </Tarjeta>
      <Aviso>
        Dura como máximo 400 días, y los parciales que ya definiste tienen que
        quedar dentro de estas fechas.
      </Aviso>
      <ErrorMensaje mensaje={op.error} />
      <Boton pendiente={op.pendiente} onPress={() => void guardar()}>
        Guardar año lectivo
      </Boton>
      <Boton secundario onPress={onVolver}>
        Volver
      </Boton>
    </Pagina>
  );
}

/**
 * Corregir las fechas de unos parciales ya definidos.
 *
 * Solo fechas: el número de parciales y su orden no se tocan, porque
 * `puntajePeriodo` tiene una fila por parcial y por matrícula y añadir o
 * quitar uno movería el puntaje de todo el curso.
 *
 * Un parcial cerrado se enseña pero no se edita: sus puntajes están
 * congelados y las familias ya los vieron.
 */
function CorregirPeriodos({
  curso,
  periodos,
  anio,
  onGuardar,
}: {
  curso: Curso;
  periodos: {
    id: Id<"periodoAcademico">;
    nombre: string;
    fechaInicio: string;
    fechaFin: string;
    estado: string;
  }[];
  anio: { fechaInicio: string; fechaFin: string };
  onGuardar: () => void;
}) {
  const corregir = useMutation(api.nucleo.corregirFechasPeriodos);
  const [fechas, setFechas] = useState(() =>
    periodos.map((p) => ({ fechaInicio: p.fechaInicio, fechaFin: p.fechaFin })),
  );
  const [listo, setListo] = useState(false);
  const op = useOperacion();

  const cambiado = fechas.some(
    (f, i) =>
      f.fechaInicio !== periodos[i].fechaInicio || f.fechaFin !== periodos[i].fechaFin,
  );

  async function guardar() {
    const r = await op.ejecutar(() =>
      corregir({
        cursoId: curso.id,
        fechas: periodos.map((p, i) => ({
          periodoAcademicoId: p.id,
          fechaInicio: fechas[i].fechaInicio,
          fechaFin: fechas[i].fechaFin,
        })),
      }),
    );
    if (r.ok) setListo(true);
  }

  if (listo)
    return (
      <Pagina titulo="Fechas corregidas">
        <Aviso>
          Los parciales quedaron con las fechas nuevas. El puntaje de cada
          estudiante se sigue calculando dentro del parcial que le toca.
        </Aviso>
        <Boton onPress={onGuardar}>Volver al curso</Boton>
      </Pagina>
    );

  return (
    <Pagina
      titulo="Fechas de los parciales"
      descripcion={`Puedes corregirlas mientras el parcial no esté cerrado. Año lectivo: ${anio.fechaInicio} a ${anio.fechaFin}.`}
    >
      {periodos.map((p, i) => {
        const cerrado = p.estado === "CERRADO";
        return (
          <Tarjeta key={p.id} orden={i}>
            <Subtitulo>{p.nombre}</Subtitulo>
            {cerrado ? (
              <>
                <Cuerpo>{`${p.fechaInicio} — ${p.fechaFin}`}</Cuerpo>
                <Aviso>
                  Este parcial ya cerró. Sus puntajes están congelados y las
                  familias ya los vieron, así que sus fechas no se mueven.
                </Aviso>
              </>
            ) : (
              <>
                <CampoFecha
                  etiqueta="Inicio"
                  valor={fechas[i].fechaInicio}
                  editable={!op.pendiente}
                  onChange={(v) =>
                    setFechas(
                      fechas.map((f, n) => (n === i ? { ...f, fechaInicio: v } : f)),
                    )
                  }
                />
                <CampoFecha
                  etiqueta="Fin"
                  valor={fechas[i].fechaFin}
                  editable={!op.pendiente}
                  onChange={(v) =>
                    setFechas(
                      fechas.map((f, n) => (n === i ? { ...f, fechaFin: v } : f)),
                    )
                  }
                />
              </>
            )}
          </Tarjeta>
        );
      })}
      <ErrorMensaje mensaje={op.error} />
      <Boton
        onPress={() => void guardar()}
        pendiente={op.pendiente}
        disabled={!cambiado}
      >
        Guardar las fechas
      </Boton>
      <Boton secundario disabled={op.pendiente} onPress={onGuardar}>
        Volver al curso
      </Boton>
    </Pagina>
  );
}

function PeriodosForm({
  curso,
  onGuardar,
}: {
  curso: Curso;
  onGuardar: () => void;
}) {
  const calendario = useQuery(api.nucleo.obtenerCalendarioCurso, {
    cursoId: curso.id,
  });
  const definir = useMutation(api.nucleo.definirPeriodos);
  const [periodos, setPeriodos] = useState([
    { nombre: "Primer parcial", fechaInicio: "", fechaFin: "" },
    { nombre: "Segundo parcial", fechaInicio: "", fechaFin: "" },
  ]);
  const op = useOperacion();
  function editar(
    i: number,
    campo: "nombre" | "fechaInicio" | "fechaFin",
    valor: string,
  ) {
    setPeriodos(
      periodos.map((p, n) => (n === i ? { ...p, [campo]: valor } : p)),
    );
  }
  async function guardar() {
    const r = await op.ejecutar(() =>
      definir({
        cursoId: curso.id,
        periodos: periodos.map((p, i) => ({ ...p, orden: i + 1 })),
      }),
    );
    if (r.ok) onGuardar();
  }
  // Ya definidos: la pantalla pasa a corregir, no a crear. Antes era un
  // callejon —"el calendario ya esta guardado" y a volver— y un docente que se
  // equivoco por tres dias al montar el año no tenia ninguna salida.
  if (calendario?.periodos.length)
    return (
      <CorregirPeriodos
        curso={curso}
        periodos={calendario.periodos}
        anio={{ fechaInicio: calendario.fechaInicio, fechaFin: calendario.fechaFin }}
        onGuardar={onGuardar}
      />
    );
  return (
    <Pagina
      titulo="Definir parciales"
      descripcion={
        calendario
          ? `Entre 2 y 3 parciales, dentro del año lectivo: ${calendario.fechaInicio} a ${calendario.fechaFin}.`
          : "Cargando año lectivo..."
      }
    >
      {periodos.map((p, i) => (
        <Tarjeta key={i}>
          <Campo
            etiqueta={`Nombre del parcial ${i + 1}`}
            value={p.nombre}
            onChangeText={(v) => editar(i, "nombre", v)}
            editable={!op.pendiente}
          />
          <CampoFecha
            etiqueta={`Inicio del parcial ${i + 1}`}
            valor={p.fechaInicio}
            onChange={(v) => editar(i, "fechaInicio", v)}
            editable={!op.pendiente}
          />
          <CampoFecha
            etiqueta={`Fin del parcial ${i + 1}`}
            valor={p.fechaFin}
            onChange={(v) => editar(i, "fechaFin", v)}
            editable={!op.pendiente}
          />
        </Tarjeta>
      ))}
      <Boton
        secundario
        disabled={op.pendiente}
        onPress={() =>
          setPeriodos(
            periodos.length === 2
              ? [
                  ...periodos,
                  { nombre: "Tercer parcial", fechaInicio: "", fechaFin: "" },
                ]
              : periodos.slice(0, 2),
          )
        }
      >
        {periodos.length === 2 ? "Añadir tercer parcial" : "Usar dos parciales"}
      </Boton>
      <ErrorMensaje mensaje={op.error} />
      <Boton
        pendiente={op.pendiente}
        disabled={
          !calendario ||
          periodos.some((p) => !p.nombre || !p.fechaInicio || !p.fechaFin)
        }
        onPress={() => void guardar()}
      >
        Guardar parciales
      </Boton>
    </Pagina>
  );
}

function InvitacionScreen({
  curso,
  invitacion,
}: {
  curso: Curso;
  invitacion: Invitacion;
}) {
  const op = useOperacion();
  const fecha = new Date(invitacion.expiraEn).toLocaleDateString("es-EC");
  return (
    <Pagina titulo="Invita a las familias" descripcion={curso.nombre}>
      <Tarjeta>
        <Cuerpo>Código del curso</Cuerpo>
        <Text selectable style={styles.codigo}>
          {invitacion.codigo}
        </Text>
        <Cuerpo>
          Válido hasta el {fecha}. Varias familias pueden usar este mismo
          código.
        </Cuerpo>
      </Tarjeta>
      <Boton
        onPress={() =>
          void op.ejecutar(() =>
            Share.share({
              message: `Te invito al curso ${curso.nombre} en Cresco. Entra como representante, toca “Registrar a mi hijo” y escribe el código ${invitacion.codigo}. Válido hasta el ${fecha}.`,
            }),
          )
        }
      >
        Compartir código
      </Boton>
      <ErrorMensaje mensaje={op.error} />
      <Aviso>
        Cada representante registra a su hijo. Después, tú revisas los datos y
        apruebas su matrícula.
      </Aviso>
    </Pagina>
  );
}

function AprobarForm({
  curso,
  alumno,
  onGuardar,
}: {
  curso: Curso;
  alumno: Alumno;
  onGuardar: () => void;
}) {
  const aprobar = useMutation(api.nucleo.aprobarEstudiante);
  // DP-006: abrir la ficha de un pendiente es leer datos de un menor -- nombre,
  // documento y fecha de nacimiento -- asi que queda en la bitacora. Es la
  // primera pantalla del proyecto que dispara `LEER_SENSIBLE` de verdad.
  useLecturaSensible(alumno.estudianteId, "FICHA_ESTUDIANTE");
  const [nombres, setNombres] = useState(alumno.nombres);
  const [apellidos, setApellidos] = useState(alumno.apellidos);
  const [tipo, setTipo] = useState(alumno.tipoDocumento);
  const [numero, setNumero] = useState(alumno.numeroDocumento);
  const [fecha, setFecha] = useState(alumno.fechaNacimiento ?? "");
  const op = useOperacion();
  async function guardar() {
    const r = await op.ejecutar(() =>
      aprobar({
        cursoId: curso.id,
        estudianteId: alumno.estudianteId,
        correcciones: {
          nombres,
          apellidos,
          tipoDocumento: tipo,
          numeroDocumento: tipo === "SIN_DOCUMENTO" ? "" : numero,
          fechaNacimiento: fecha || null,
        },
      }),
    );
    if (r.ok) onGuardar();
  }
  return (
    <Pagina
      titulo="Revisar estudiante"
      descripcion={`Confirma que pertenece a ${curso.nombre}. Puedes corregir los datos antes de aprobar.`}
    >
      <Tarjeta>
        <Campo
          etiqueta="Nombres"
          value={nombres}
          onChangeText={setNombres}
          editable={!op.pendiente}
          maxLength={160}
        />
        <Campo
          etiqueta="Apellidos"
          value={apellidos}
          onChangeText={setApellidos}
          editable={!op.pendiente}
          maxLength={160}
        />
        <Opciones
          valor={tipo}
          opciones={documentosHijo}
          onChange={setTipo}
          disabled={op.pendiente}
        />
        {tipo !== "SIN_DOCUMENTO" && (
          <Campo
            etiqueta="Documento del estudiante"
            value={numero}
            onChangeText={setNumero}
            editable={!op.pendiente}
            maxLength={tipo === "CEDULA" ? 10 : 30}
          />
        )}
        <Campo
          etiqueta="Fecha de nacimiento (opcional)"
          placeholder="AAAA-MM-DD"
          value={fecha}
          onChangeText={setFecha}
          editable={!op.pendiente}
          maxLength={10}
        />
      </Tarjeta>
      <Aviso>
        Al aprobar se crea la matrícula. Cada parcial aplicable comienza con 60
        puntos.
      </Aviso>
      <ErrorMensaje mensaje={op.error} />
      <Boton
        pendiente={op.pendiente}
        disabled={!nombres.trim() || !apellidos.trim()}
        onPress={() => void guardar()}
      >
        Aprobar estudiante
      </Boton>
    </Pagina>
  );
}

function MisHijos({
  nombre,
  registrar,
  navegar,
}: {
  nombre: string;
  registrar: () => void;
  navegar: (ruta: Ruta) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.nucleo.listarMisEstudiantes,
    {},
    { initialNumItems: 20 },
  );
  return (
    <Pagina
      titulo={nombre ? `Hola, ${nombre}` : "Tu familia en Cresco"}
      descripcion="Acompaña a tus hijos, un paso a la vez."
    >
      <Subtitulo>Mis hijos</Subtitulo>
      {status === "LoadingFirstPage" ? (
        <Cargando />
      ) : results.length === 0 ? (
        <Tarjeta>
          <Icono
            nombre="account-group"
            tamano={40}
            color={Marca.base}
            decorativo
          />
          <Subtitulo>Conecta con su curso</Subtitulo>
          <Cuerpo>
            Pide el código al docente y registra a tu hijo para comenzar.
          </Cuerpo>
        </Tarjeta>
      ) : (
        results.map((a) => (
          <Tarjeta key={a.estudianteId}>
            <Subtitulo>
              {a.nombres} {a.apellidos}
            </Subtitulo>
            <Text style={styles.etiqueta}>
              {a.estadoVerificacion === "APROBADO"
                ? "Matrícula aprobada"
                : a.estadoVerificacion === "PENDIENTE"
                  ? "Esperando aprobación del docente"
                  : "Registro no aprobado"}
            </Text>
            <Cuerpo>
              {a.estadoVerificacion === "PENDIENTE"
                ? "El docente revisará sus datos. El estado se actualizará aquí."
                : a.estadoVerificacion === "APROBADO"
                  ? "Tu hijo ya forma parte del curso."
                  : "Consulta con el docente para revisar el registro."}
            </Cuerpo>
            {a.estadoVerificacion === "APROBADO" && (
              <Boton
                onPress={() =>
                  navegar({
                    tipo: "reporteHoy",
                    estudianteId: a.estudianteId,
                    nombre: `${a.nombres} ${a.apellidos}`,
                  })
                }
              >
                Ver su reporte de hoy
              </Boton>
            )}
            {/* Solo con la matricula aprobada: antes de eso no hay curso y
                por tanto no hay titular del que hablar. */}
            {a.estadoVerificacion === "APROBADO" && (
              <Boton
                secundario
                onPress={() =>
                  navegar({
                    tipo: "docenteACargo",
                    estudianteId: a.estudianteId,
                    nombre: a.nombres,
                  })
                }
              >
                Ver al docente a cargo
              </Boton>
            )}
          </Tarjeta>
        ))
      )}
      <Mas status={status} cargar={() => loadMore(20)} />
      {/* Cita, alertas y plan viven en el menú lateral: no son cosas del
          hijo, son de la cuenta, y aquí competían con lo que sí lo es. */}
      <Boton onPress={registrar}>Registrar a mi hijo</Boton>
    </Pagina>
  );
}

function RegistroForm({
  perfil,
  onGuardar,
}: {
  perfil: Perfil;
  onGuardar: () => void;
}) {
  const consultar = useMutation(api.nucleo.consultarInvitacion);
  const canjear = useMutation(api.nucleo.canjearInvitacion);
  const [codigo, setCodigo] = useState("");
  const [invitacion, setInvitacion] = useState<FunctionReturnType<
    typeof api.nucleo.consultarInvitacion
  > | null>(null);
  const [tipo, setTipo] =
    useState<SolicitudRegistro["estudiante"]["tipoDocumento"]>("CEDULA");
  const [numero, setNumero] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [fecha, setFecha] = useState("");
  const [parentesco, setParentesco] =
    useState<SolicitudRegistro["parentesco"]>("MADRE");
  const [acepta, setAcepta] = useState(false);
  const [declara, setDeclara] = useState(false);
  const [privacidad, setPrivacidad] = useState(false);
  const [restaurando, setRestaurando] = useState(true);
  const [guardada, setGuardada] = useState<SolicitudRegistro | null>(null);
  const [guardadoError, setGuardadoError] = useState<string | null>(null);
  const op = useOperacion();
  useEffect(() => {
    let activa = true;
    recuperarRegistro(perfil.perfilUsuarioId)
      .then((solicitud) => {
        if (activa) setGuardada(solicitud);
      })
      .catch(() => {
        if (activa)
          setGuardadoError(
            "No pudimos recuperar el registro pendiente. Cierra y vuelve a abrir esta vista.",
          );
      })
      .finally(() => {
        if (activa) setRestaurando(false);
      });
    return () => {
      activa = false;
    };
  }, [perfil.perfilUsuarioId]);
  async function buscar() {
    const r = await op.ejecutar(() => consultar({ credencial: { codigo } }));
    if (r.ok) {
      if (r.valor.versionDocumento !== versionConsentimiento) {
        setInvitacion(null);
        setAcepta(false);
        setDeclara(false);
        op.setError("El consentimiento cambió. Actualiza Cresco para leer y aceptar la versión vigente.");
        return;
      }
      setInvitacion(r.valor);
    }
  }
  async function registrar() {
    if (!guardada && !invitacion) return;
    if (!guardada && invitacion?.versionDocumento !== versionConsentimiento) return;
    const solicitud: SolicitudRegistro = guardada ?? {
      credencial: { codigo },
      solicitudId: randomUUID(),
      estudiante: {
        tipoDocumento: tipo,
        numeroDocumento: tipo === "SIN_DOCUMENTO" ? "" : numero,
        nombres,
        apellidos,
        fechaNacimiento: fecha || undefined,
      },
      parentesco,
      aceptaTratamiento: acepta,
      declaraRepresentanteLegal: declara,
      versionDocumento: versionConsentimiento,
    };
    const r = await op.ejecutar(async () => {
      await guardarRegistro(perfil.perfilUsuarioId, solicitud);
      setGuardada(solicitud);
      const respuesta = await canjear(solicitud);
      await borrarRegistro(perfil.perfilUsuarioId);
      return respuesta;
    });
    if (r.ok) {
      setGuardada(null);
      onGuardar();
    } else if (r.causa instanceof ConvexError) {
      try {
        await borrarRegistro(perfil.perfilUsuarioId);
        setGuardada(null);
      } catch {
        setGuardadoError(
          "No pudimos actualizar el registro guardado. Vuelve a abrir esta vista.",
        );
      }
      if (
        typeof r.causa.data === "object" &&
        r.causa.data !== null &&
        "codigo" in r.causa.data &&
        r.causa.data.codigo === "CONSENTIMIENTO_DESACTUALIZADO"
      ) {
        setInvitacion(null);
        setAcepta(false);
        setDeclara(false);
      }
    }
  }
  const parentescos = PARENTESCO.map((p) => ({
    valor: p,
    texto: {
      MADRE: "Madre",
      PADRE: "Padre",
      ABUELO_A: "Abuelo/a",
      TIO_A: "Tío/a",
      HERMANO_A: "Hermano/a",
      TUTOR_LEGAL: "Tutor legal",
      OTRO: "Otro",
    }[p],
  }));
  if (restaurando) return <Cargando mensaje="Preparando el registro..." />;
  if (guardada)
    return (
      <Pagina titulo="Retomar registro">
        <Tarjeta>
          <Subtitulo>
            {guardada.estudiante.nombres} {guardada.estudiante.apellidos}
          </Subtitulo>
          <Cuerpo>
            Este registro quedó pendiente de confirmación. Puedes reintentarlo:
            tu hijo no se registrará dos veces.
          </Cuerpo>
        </Tarjeta>
        <ErrorMensaje mensaje={op.error ?? guardadoError} />
        <Boton pendiente={op.pendiente} onPress={() => void registrar()}>
          Reintentar registro
        </Boton>
      </Pagina>
    );
  return (
    <Pagina
      titulo={invitacion ? "Datos de tu hijo" : "Conecta con su curso"}
      descripcion={
        invitacion
          ? `${invitacion.nombreCurso} · ${invitacion.institucion}`
          : "Escribe el código que compartió el docente."
      }
    >
      {!invitacion ? (
        <Tarjeta>
          <Campo
            etiqueta="Código del curso"
            value={codigo}
            onChangeText={setCodigo}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
            placeholder="Código de invitación"
            editable={!op.pendiente}
          />
          <Boton
            pendiente={op.pendiente}
            disabled={!codigo.trim() || !!guardadoError}
            onPress={() => void buscar()}
          >
            Buscar curso
          </Boton>
        </Tarjeta>
      ) : (
        <>
          <Tarjeta>
            <Campo
              etiqueta="Nombres de tu hijo"
              value={nombres}
              onChangeText={setNombres}
              maxLength={160}
              editable={!op.pendiente}
            />
            <Campo
              etiqueta="Apellidos de tu hijo"
              value={apellidos}
              onChangeText={setApellidos}
              maxLength={160}
              editable={!op.pendiente}
            />
            <Opciones
              valor={tipo}
              opciones={documentosHijo}
              onChange={setTipo}
              disabled={op.pendiente}
            />
            {tipo !== "SIN_DOCUMENTO" && (
              <Campo
                etiqueta="Documento de tu hijo"
                value={numero}
                onChangeText={setNumero}
                keyboardType={tipo === "CEDULA" ? "number-pad" : "default"}
                maxLength={tipo === "CEDULA" ? 10 : 30}
                editable={!op.pendiente}
              />
            )}
            <Campo
              etiqueta="Fecha de nacimiento (opcional)"
              placeholder="AAAA-MM-DD"
              value={fecha}
              onChangeText={setFecha}
              maxLength={10}
              editable={!op.pendiente}
            />
            <Subtitulo>Tu parentesco</Subtitulo>
            <Opciones
              valor={parentesco}
              opciones={parentescos}
              onChange={setParentesco}
              disabled={op.pendiente}
            />
          </Tarjeta>
          <Tarjeta>
            <Subtitulo>Antes de continuar</Subtitulo>
            <Cuerpo>
              Versión {versionConsentimiento} · Borrador pendiente de
              revisión jurídica.
            </Cuerpo>
            <Aviso>
              El retiro del consentimiento desde Ajustes aún no está disponible
              en esta versión de desarrollo.
            </Aviso>
            <TextoDocumento
              texto={textoConsentimiento
                .replaceAll(
                  "{nombre del estudiante}",
                  `${nombres || "su hijo"} ${apellidos}`.trim(),
                )
                .replaceAll("{nombre del curso}", invitacion.nombreCurso)
                .replaceAll("{nombre del docente}", "su docente titular")}
            />
            <Boton secundario onPress={() => setPrivacidad(true)}>
              Leer aviso de privacidad completo
            </Boton>
            <Casilla
              texto="He leído lo anterior y autorizo el tratamiento de los datos de mi hijo o representado en los términos descritos."
              marcada={acepta}
              onChange={() => setAcepta(!acepta)}
              disabled={op.pendiente}
            />
            <Casilla
              texto="Confirmo que soy su representante legal y que estoy facultado para otorgar esta autorización."
              marcada={declara}
              onChange={() => setDeclara(!declara)}
              disabled={op.pendiente}
            />
          </Tarjeta>
          <Boton
            pendiente={op.pendiente}
            disabled={
              !acepta ||
              !declara ||
              !nombres.trim() ||
              !apellidos.trim() ||
              (tipo !== "SIN_DOCUMENTO" && !numero.trim()) ||
              !!guardadoError
            }
            onPress={() => void registrar()}
          >
            Acepto y registro a mi hijo
          </Boton>
          <Boton secundario disabled={op.pendiente} onPress={onGuardar}>
            Ahora no
          </Boton>
          <Cuerpo>
            Si no aceptas, puedes seguir recibiendo información por los canales
            de la institución.
          </Cuerpo>
        </>
      )}
      <ErrorMensaje mensaje={op.error ?? guardadoError} />
      <Modal
        visible={privacidad}
        animationType="slide"
        onRequestClose={() => setPrivacidad(false)}
      >
        <SafeAreaView style={styles.pantalla}>
          <Pagina titulo="Aviso de privacidad">
            <Boton secundario onPress={() => setPrivacidad(false)}>
              Volver al registro
            </Boton>
            <TextoDocumento texto={avisoPrivacidad} />
          </Pagina>
        </SafeAreaView>
      </Modal>
    </Pagina>
  );
}

function TextoDocumento({ texto }: { texto: string }) {
  return (
    <>
      {/*
        La limpieza vive en `lib/texto.ts`, con pruebas sobre el documento
        real. Lo que había aquí quitaba negritas y títulos pero dejaba las
        tuberías de las tablas: las secciones 5, 6 y 7 del aviso —quién ve los
        datos, qué proveedores participan, qué derechos hay— son justamente
        tablas, y son las que más se consultan.
      */}
      {parrafosLegibles(texto).map((p, i) => (
        <Cuerpo key={i}>{p}</Cuerpo>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: Superficie.fondo },
  masOpciones: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Espacio.xs,
    minHeight: 44,
  },
  masOpcionesTexto: {
    color: Marca.base,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.base,
  },
  filaTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Espacio.xs,
    borderTopWidth: 1,
    borderTopColor: Superficie.separador,
  },
  filaTopNombre: {
    color: Texto.primario,
    fontFamily: "Inter",
    fontSize: Tamano.base,
  },
  filaTopCantidad: {
    color: Texto.primario,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.base,
  },
  barra: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Espacio.base,
    paddingVertical: Espacio.md,
    gap: Espacio.sm,
    backgroundColor: Superficie.tarjeta,
    borderBottomWidth: 1,
    borderBottomColor: Superficie.borde,
  },
  marcaTexto: { flex: 1 },
  marca: {
    color: Marca.base,
    fontFamily: "Inter-Semibold",
    fontSize: Tamano.lg,
    letterSpacing: 2,
  },
  rol: {
    color: Texto.secundario,
    fontFamily: "Inter",
    fontSize: Tamano.sm,
    marginTop: Espacio.xs,
  },
  contador: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Semantico.error,
    alignItems: "center",
    justifyContent: "center",
  },
  contadorTexto: {
    color: Texto.sobreColor,
    fontFamily: "Inter-Semibold",
    fontSize: 11,
    lineHeight: 14,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  marcaIcono: {
    width: 44,
    height: 44,
    borderRadius: Radio.base,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Marca.claro,
  },
  selectorRol: { paddingHorizontal: Espacio.lg, paddingTop: Espacio.base },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Espacio.sm,
  },
  etiqueta: {
    fontFamily: "Inter-Semibold",
    color: Marca.base,
    fontSize: Tamano.base,
    lineHeight: 24,
  },
  codigo: {
    fontFamily: "Inter-Semibold",
    color: Marca.oscuro,
    fontSize: Tamano.xl,
    letterSpacing: 2,
    textAlign: "center",
    paddingVertical: Espacio.lg,
  },
});
