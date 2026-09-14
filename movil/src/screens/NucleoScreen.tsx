import { useEffect, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useClerk, useUser } from "@clerk/expo";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { randomUUID } from "expo-crypto";
import { api } from "../../convex/_generated/api";
import { PARENTESCO } from "../../convex/lib/enums";
import { Icono } from "../theme/Icono";
import {
  Espacio,
  Marca,
  Radio,
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
import { AnotarConducta } from "./ConductaScreen";
import {
  AgendaDocente,
  Ajustes,
  AlertaDocente,
  AlertasFamilia,
  CitasFamilia,
  Notificaciones,
  ReclamosDocente,
} from "./InteraccionScreen";
import { parrafosLegibles } from "../lib/texto";
import {
  avisoPrivacidad,
  textoConsentimiento,
  versionConsentimiento,
} from "../content/consentimiento";
import { useAuditoriaSesion } from "../lib/useAuditoriaSesion";
import {
  borrarRegistro,
  guardarRegistro,
  recuperarRegistro,
  type SolicitudRegistro,
} from "../lib/registroPendiente";

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
  | { tipo: "notificaciones" | "citas" | "alertas" | "ajustes" | "plan" }
  | { tipo: "curso" | "periodos" | "reclamos" | "agenda" | "alerta" | "anotar"; curso: Curso }
  | { tipo: "invitacion"; invitacion: Invitacion; curso: Curso }
  | { tipo: "aprobar"; curso: Curso; alumno: Alumno };

const documentosAdulto = [
  { valor: "CEDULA", texto: "Cédula" },
  { valor: "PASAPORTE", texto: "Pasaporte" },
] as const;
const documentosHijo = [
  ...documentosAdulto,
  { valor: "SIN_DOCUMENTO", texto: "Sin documento" },
] as const;

export function NucleoScreen() {
  const perfil = useQuery(api.nucleo.obtenerPerfil);
  useAuditoriaSesion(perfil === null ? null : perfil?.perfilUsuarioId);
  const { user } = useUser();
  const { signOut } = useClerk();
  const [ruta, setRuta] = useState<Ruta>({ tipo: "inicio" });
  const [rolElegido, setRol] = useState<Rol>();
  const salida = useOperacion();
  const rol = rolElegido ?? (perfil?.docenteId ? "DOCENTE" : "REPRESENTANTE");
  const volver = () => setRuta({ tipo: "inicio" });
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (ruta.tipo === "inicio") return false;
      if ("curso" in ruta && ruta.tipo !== "curso")
        setRuta({ tipo: "curso", curso: ruta.curso });
      else volver();
      return true;
    });
    return () => listener.remove();
  }, [ruta]);
  const retroceder = () => {
    if ("curso" in ruta && ruta.tipo !== "curso")
      setRuta({ tipo: "curso", curso: ruta.curso });
    else volver();
  };
  return (
    <SafeAreaView style={styles.pantalla}>
      <View style={styles.barra}>
        {ruta.tipo !== "inicio" ? (
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
          <Text style={styles.marca}>CRESCO</Text>
          <Text style={styles.rol}>
            {perfil
              ? rol === "DOCENTE"
                ? "Espacio docente"
                : "Espacio familiar"
              : "Tu comunidad educativa"}
          </Text>
        </View>
        {perfil && ruta.tipo === "inicio" && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Novedades"
              onPress={() => setRuta({ tipo: "notificaciones" })}
              style={styles.iconButton}
            >
              <Icono nombre="bell" decorativo />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mi perfil y roles"
              onPress={() => setRuta({ tipo: "perfil" })}
              style={styles.iconButton}
            >
              <Icono nombre="account" decorativo />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ajustes"
              onPress={() => setRuta({ tipo: "ajustes" })}
              style={styles.iconButton}
            >
              <Icono nombre="cog" decorativo />
            </Pressable>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          disabled={salida.pendiente}
          onPress={() => void salida.ejecutar(() => signOut())}
          style={styles.iconButton}
        >
          <Icono nombre="logout" decorativo />
        </Pressable>
      </View>
      <ErrorMensaje mensaje={salida.error} />
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
          <Notificaciones />
        ) : ruta.tipo === "ajustes" ? (
          <Ajustes />
        ) : ruta.tipo === "reclamos" ? (
          <ReclamosDocente />
        ) : ruta.tipo === "agenda" ? (
          <AgendaDocente curso={ruta.curso} />
        ) : ruta.tipo === "alerta" ? (
          <AlertaDocente curso={ruta.curso} />
        ) : ruta.tipo === "anotar" ? (
          <AnotarConducta
            cursoId={ruta.curso.id}
            onVolver={() => setRuta({ tipo: "curso", curso: ruta.curso })}
          />
        ) : ruta.tipo === "citas" ? (
          <CitasFamilia />
        ) : ruta.tipo === "alertas" ? (
          <AlertasFamilia />
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
  const [documento, setDocumento] = useState<"CEDULA" | "PASAPORTE">("CEDULA");
  const [numero, setNumero] = useState("");
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
        <Opciones
          valor={documento}
          opciones={documentosAdulto}
          onChange={setDocumento}
          disabled={op.pendiente}
        />
        <Campo
          etiqueta="Número de documento"
          value={numero}
          onChangeText={setNumero}
          autoCapitalize="characters"
          keyboardType={documento === "CEDULA" ? "number-pad" : "default"}
          maxLength={documento === "CEDULA" ? 10 : 30}
          editable={!op.pendiente}
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
      {datos &&
        (datos.cursos.length < datos.limitePlan ? (
          <Boton onPress={() => navegar({ tipo: "crearCurso" })}>
            Crear curso
          </Boton>
        ) : (
          <Aviso>
            {/*
              El plan gratuito permite 1 curso, y "los 1 cursos de tu plan" es
              justo lo que se lee en un telefono real. El singular se trata
              aparte en vez de dejar una plantilla que solo funciona en plural.
            */}
            {datos.limitePlan === 1
              ? "Tu plan incluye un curso y ya lo estás usando."
              : `Has alcanzado los ${datos.limitePlan} cursos de tu plan.`}{" "}
            La opción para ampliar el plan estará disponible próximamente.
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
  const [pestana, setPestana] = useState<"PENDIENTES" | "ESTUDIANTES">(
    "PENDIENTES",
  );
  const invitar = useMutation(api.nucleo.crearInvitacion);
  const op = useOperacion();
  async function invitarFamilias() {
    const r = await op.ejecutar(() => invitar({ cursoId: curso.id }));
    if (r.ok) navegar({ tipo: "invitacion", curso, invitacion: r.valor });
  }
  return (
    <Pagina titulo={curso.nombre} descripcion={curso.institucion}>
      <Tarjeta>
        <Subtitulo>Calendario del curso</Subtitulo>
        {!calendario ? (
          <Cargando />
        ) : calendario.periodos.length === 0 ? (
          <>
            <Cuerpo>Define los parciales antes de aprobar estudiantes.</Cuerpo>
            <Boton
              secundario
              onPress={() => navegar({ tipo: "periodos", curso })}
            >
              Definir parciales
            </Boton>
          </>
        ) : (
          calendario.periodos.map((p) => (
            <View key={p.id}>
              <Text style={styles.etiqueta}>{p.nombre}</Text>
              <Cuerpo>
                {p.fechaInicio} — {p.fechaFin}
              </Cuerpo>
            </View>
          ))
        )}
      </Tarjeta>
      <Boton pendiente={op.pendiente} onPress={() => void invitarFamilias()}>
        Invitar representantes
      </Boton>
      <ErrorMensaje mensaje={op.error} />
      <Boton onPress={() => navegar({ tipo: "anotar", curso })}>
        Anotar conducta
      </Boton>
      <Boton secundario onPress={() => navegar({ tipo: "reclamos", curso })}>
        Reclamos de las familias
      </Boton>
      <Boton secundario onPress={() => navegar({ tipo: "agenda", curso })}>
        Atención a familias
      </Boton>
      <Boton secundario onPress={() => navegar({ tipo: "alerta", curso })}>
        Alerta de emergencia
      </Boton>
      <Boton secundario onPress={() => navegar({ tipo: "plan" })}>
        Tu plan
      </Boton>
      <Opciones
        valor={pestana}
        opciones={[
          { valor: "PENDIENTES", texto: "Por aprobar" },
          { valor: "ESTUDIANTES", texto: "Estudiantes" },
        ]}
        onChange={setPestana}
      />
      {pestana === "PENDIENTES" ? (
        <Pendientes
          curso={curso}
          aprobar={(alumno) => navegar({ tipo: "aprobar", curso, alumno })}
        />
      ) : (
        <Estudiantes curso={curso} />
      )}
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
function Estudiantes({ curso }: { curso: Curso }) {
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
  if (calendario?.periodos.length)
    return (
      <Pagina titulo="Parciales definidos">
        <Aviso>El calendario ya está guardado.</Aviso>
        <Boton onPress={onGuardar}>Volver al curso</Boton>
      </Pagina>
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
          <Campo
            etiqueta={`Inicio del parcial ${i + 1}`}
            placeholder="AAAA-MM-DD"
            maxLength={10}
            value={p.fechaInicio}
            onChangeText={(v) => editar(i, "fechaInicio", v)}
            editable={!op.pendiente}
          />
          <Campo
            etiqueta={`Fin del parcial ${i + 1}`}
            placeholder="AAAA-MM-DD"
            maxLength={10}
            value={p.fechaFin}
            onChangeText={(v) => editar(i, "fechaFin", v)}
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
          </Tarjeta>
        ))
      )}
      <Mas status={status} cargar={() => loadMore(20)} />
      <Boton onPress={registrar}>Registrar a mi hijo</Boton>
      <Boton secundario onPress={() => navegar({ tipo: "citas" })}>
        Pedir una cita
      </Boton>
      <Boton secundario onPress={() => navegar({ tipo: "alertas" })}>
        Alertas del curso
      </Boton>
      <Boton secundario onPress={() => navegar({ tipo: "plan" })}>
        Tu plan
      </Boton>
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
