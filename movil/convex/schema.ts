/**
 * Esquema de datos de Cresco.
 *
 * Portado desde `db/schema/{nucleo,conducta,interaccion}.ts` (commit cf65f89),
 * que se perdió en la migración a Convex. El modelo de dominio es el mismo: las
 * mismas entidades, las mismas relaciones y las mismas reglas. Lo que cambia es
 * quién las hace cumplir.
 *
 * ── Qué se traduce y cómo ───────────────────────────────────────────────────
 *
 *  Postgres/Drizzle              →  Convex
 *  ─────────────────────────────────────────────────────────────────────────
 *  uuid PRIMARY KEY              →  `_id` automático
 *  creado_en DEFAULT now()       →  `_creationTime` automático
 *  FK → tabla.id                 →  v.id("tabla")  (tipado: el compilador
 *                                   impide pasar un id de curso donde va uno
 *                                   de estudiante — Postgres no podía)
 *  CHECK (col IN (...))          →  v.union(v.literal(...)) desde enums.ts
 *  date                          →  v.string() ISO "YYYY-MM-DD", calculada
 *                                   SIEMPRE por el servidor con
 *                                   REGLAS.ZONA_HORARIA (decisión E1)
 *  timestamptz                   →  v.number() (epoch ms, UTC)
 *  jsonb                         →  v.any()
 *
 * ── Lo que Convex NO hace y pasa a ser trabajo nuestro ──────────────────────
 *
 *  UNIQUE INDEX  →  no existe. Cada `ux_*` del esquema original quedó anotado
 *                   sobre su índice equivalente. La unicidad se comprueba
 *                   leyendo por el índice ANTES de insertar, dentro de la
 *                   misma mutation. Es seguro frente a carreras porque las
 *                   mutations de Convex son transaccionales y serializables.
 *
 *  CHECK de rango / condición  →  no existe (los de dominio SÍ, arriba).
 *                   Los de rango y condición (`ck_institucion_rango`,
 *                   `ck_accion_resolucion`, `ck_alerta_estudiante`...) pasan a
 *                   funciones de guardia en `convex/lib/guardas.ts`.
 *
 *  ON DELETE CASCADE  →  no existe. Da igual: la regla 5 del proyecto dice que
 *                   nada se borra físicamente.
 *
 * Cambios de dominio respecto al original, todos de la sesión del 14 de agosto,
 * marcados con `NUEVO 2026-08-14`.
 */

import { defineSchema, defineTable } from "convex/server";
import { v, type Validator } from "convex/values";

import {
  ACCION_AUDITORIA, ALCANCE_ALERTA, ALCANCE_COMUNICADO, AUDIENCIA_PLAN,
  CODIGO_CATEGORIA, ESTADO_ACCION, ESTADO_ANIO_LECTIVO, ESTADO_ASISTENCIA,
  ESTADO_CITA, ESTADO_CURSO, ESTADO_DISPONIBILIDAD, ESTADO_ESTUDIANTE,
  ESTADO_INCONFORMIDAD, ESTADO_INSTITUCION, ESTADO_INVITACION,
  ESTADO_MATRICULA, ESTADO_PERIODO, ESTADO_PREGUNTA, ESTADO_REPORTE_GENERAL,
  ESTADO_SUSCRIPCION, ESTADO_VINCULO, JORNADA, MODALIDAD,
  MOTIVO_INCONFORMIDAD, ORIGEN_CITA, ORIGEN_ESTUDIANTE, ORIGEN_SUSCRIPCION,
  PARENTESCO, PERIODICIDAD, PLATAFORMA, RECURSO_DESBLOQUEABLE, REGIMEN,
  ROL_ASIGNACION, SIGNO_ACCION, TIPO_ALERTA, TIPO_CAMPO_REPORTE,
  TIPO_COMUNICADO, TIPO_CONSENTIMIENTO, TIPO_DOCUMENTO, TIPO_ITEM_REPORTE,
  TIPO_NOTIFICACION, VERIFICACION_ESTUDIANTE,
} from "./lib/enums";

/**
 * Convierte una constante de `enums.ts` en un validador de Convex.
 *
 * Esto es lo que sustituye a los 42 `CHECK (col IN (...))` del esquema
 * original — y es estrictamente mejor: además de rechazarse en tiempo de
 * ejecución, el compilador de TypeScript conoce los valores válidos, así que
 * un estado inventado ni siquiera compila.
 */
function enumDe<T extends string>(valores: readonly T[]): Validator<T> {
  const [primero, segundo, ...resto] = valores.map((x) => v.literal(x));
  if (segundo === undefined) return primero as Validator<T>;
  return v.union(primero, segundo, ...resto) as Validator<T>;
}

/**
 * `creado_en` desaparece: lo cubre `_creationTime`, que Convex pone solo.
 * `actualizado_en` sí se conserva — hay que escribirlo a mano en cada update.
 */
const actualizadoEn = { actualizadoEn: v.number() };

export default defineSchema({
  // =========================================================================
  // MÓDULO NÚCLEO — Persona A
  // =========================================================================

  /**
   * A2: en la v1 no hay superusuario. El docente declara el nombre de la
   * escuela como texto libre y queda `verificada: false` hasta que en la v2 la
   * dirección la reclame.
   *
   * Ya no se mapea a la `organization` de BetterAuth: con Clerk + Convex la
   * institución es una tabla normal, que es más simple y hacía casi nada
   * (decisión A3 — no hay administrador de institución en la v1).
   */
  institucion: defineTable({
    nombreDeclarado: v.string(),
    verificada: v.boolean(),
    codigoAmie: v.optional(v.string()),
    regimen: enumDe(REGIMEN),
    ciudad: v.string(),
    zonaHoraria: v.string(),
    // C1 / C3 / C4: parámetros del puntaje, configurables por institución.
    // ck_institucion_rango (minimo < base < maximo) → guardas.ts
    puntajeBase: v.number(),
    puntajeMinimo: v.number(),
    puntajeMaximo: v.number(),
    topeDiarioPositivo: v.number(),
    topeDiarioNegativo: v.number(),
    estado: enumDe(ESTADO_INSTITUCION),
    ...actualizadoEn,
  }).index("por_nombre", ["nombreDeclarado"]),

  /**
   * Extiende la identidad de Clerk con los datos del dominio.
   *
   * **`_id` es el identificador canónico de todo el sistema** — suscripciones,
   * dispositivos, auditoría y RevenueCat apuntan aquí, nunca al id de Clerk.
   * `authSubject` es el único punto de contacto con el proveedor de
   * autenticación: si algún día se cambia Clerk por otro, se actualiza este
   * campo y nada más se mueve.
   *
   * ux_perfil_documento → índice `por_documento`, unicidad en la mutation
   */
  perfilUsuario: defineTable({
    /** tokenIdentifier (emisor + subject); admite subject legado del emisor configurado. */
    authSubject: v.string(),
    /**
     * Como se llama la persona (#52).
     *
     * Vivian solo en Clerk, del lado del cliente y solo para uno mismo, asi
     * que el docente y el representante conversaban -- citas, reclamos,
     * alertas sobre un menor -- sin saber el nombre del otro. El aviso de
     * privacidad ya declara que recogemos nombres y apellidos de ambos: el
     * documento asumia un campo que no existia.
     *
     * Opcionales por los perfiles creados antes. `completarPerfil` los exige
     * de aqui en adelante.
     */
    nombres: v.optional(v.string()),
    apellidos: v.optional(v.string()),
    tipoDocumento: enumDe(TIPO_DOCUMENTO),
    numeroDocumento: v.string(),
    telefono: v.optional(v.string()),
    ...actualizadoEn,
  })
    .index("por_auth_subject", ["authSubject"])
    .index("por_documento", ["tipoDocumento", "numeroDocumento"]),

  /**
   * Una misma persona puede ser docente y representante a la vez (un profesor
   * con hijos en el mismo colegio). Por eso son dos tablas de perfil y no un
   * campo `rol`.
   */
  docente: defineTable({
    perfilUsuarioId: v.id("perfilUsuario"),
    tituloProfesional: v.optional(v.string()),
    correoContacto: v.optional(v.string()),
    telefonoContacto: v.optional(v.string()),
    horarioAtencion: v.optional(v.string()),
    ...actualizadoEn,
  }).index("por_perfil", ["perfilUsuarioId"]),

  representante: defineTable({
    perfilUsuarioId: v.id("perfilUsuario"),
    ocupacion: v.optional(v.string()),
    direccion: v.optional(v.string()),
    telefonoAlterno: v.optional(v.string()),
    ...actualizadoEn,
  }).index("por_perfil", ["perfilUsuarioId"]),

  // --- Calendario ----------------------------------------------------------

  /** B1: el docente define el año lectivo al crear el curso. */
  anioLectivo: defineTable({
    institucionId: v.id("institucion"),
    nombre: v.string(),
    fechaInicio: v.string(),
    fechaFin: v.string(), // ck_anio_fechas (fin > inicio) → guardas.ts
    estado: enumDe(ESTADO_ANIO_LECTIVO),
    ...actualizadoEn,
  }).index("por_institucion", ["institucionId", "nombre"]), // ux_anio_lectivo

  /** B2: de 2 a 3 parciales por año lectivo. */
  periodoAcademico: defineTable({
    anioLectivoId: v.id("anioLectivo"),
    nombre: v.string(),
    orden: v.number(),
    fechaInicio: v.string(),
    fechaFin: v.string(), // ck_periodo_fechas → guardas.ts
    estado: enumDe(ESTADO_PERIODO),
    cerradoEn: v.optional(v.number()),
    ...actualizadoEn,
  }).index("por_anio_orden", ["anioLectivoId", "orden"]), // ux_periodo_orden

  /**
   * B4: solo los días con clase generan reporte. Feriados y suspensiones se
   * registran aquí para que el cron nocturno sepa qué días saltarse.
   */
  diaNoLectivo: defineTable({
    anioLectivoId: v.id("anioLectivo"),
    fecha: v.string(),
    motivo: v.optional(v.string()),
    ...actualizadoEn,
  }).index("por_anio_fecha", ["anioLectivoId", "fecha"]), // ux_dia_no_lectivo

  // --- Curso ---------------------------------------------------------------

  curso: defineTable({
    anioLectivoId: v.id("anioLectivo"),
    nombre: v.string(),
    nivel: v.string(),
    paralelo: v.string(),
    jornada: enumDe(JORNADA),
    aula: v.optional(v.string()),
    estado: enumDe(ESTADO_CURSO),
    ...actualizadoEn,
  })
    // ux_curso
    .index("por_anio_nivel_paralelo", ["anioLectivoId", "nivel", "paralelo", "jornada"])
    .index("por_anio", ["anioLectivoId"]),

  asignacionDocente: defineTable({
    cursoId: v.id("curso"),
    docenteId: v.id("docente"),
    rol: enumDe(ROL_ASIGNACION),
    area: v.optional(v.string()),
    /**
     * E1: la fecha la calcula el servidor con REGLAS.ZONA_HORARIA, nunca el
     * motor. En Postgres `now()::date` se resolvía con el timezone de la
     * sesión (UTC en la nube) y una asignación creada a las 20:00 en Guayaquil
     * quedaba fechada al día siguiente. En Convex ese `now()` no existe, así
     * que el bug es imposible — pero la regla se mantiene explícita.
     */
    vigenteDesde: v.string(),
    vigenteHasta: v.optional(v.string()),
    ...actualizadoEn,
  })
    // ux_curso_titular_vigente: un solo TITULAR con vigenteHasta ausente
    .index("por_curso_rol", ["cursoId", "rol"])
    .index("por_docente", ["docenteId"]),

  // --- Estudiante ----------------------------------------------------------

  /**
   * A1 + D1: el representante crea al estudiante al canjear la invitación y el
   * docente lo aprueba. El camino por CSV queda abierto vía `origenRegistro`.
   */
  estudiante: defineTable({
    institucionId: v.id("institucion"),
    tipoDocumento: enumDe(TIPO_DOCUMENTO),
    numeroDocumento: v.string(),
    nombres: v.string(),
    apellidos: v.string(),
    fechaNacimiento: v.optional(v.string()),
    origenRegistro: enumDe(ORIGEN_ESTUDIANTE),
    estadoVerificacion: enumDe(VERIFICACION_ESTUDIANTE),
    aprobadoPorDocenteId: v.optional(v.id("docente")),
    aprobadoEn: v.optional(v.number()),
    motivoRechazo: v.optional(v.string()),
    estado: enumDe(ESTADO_ESTUDIANTE),
    ...actualizadoEn,
  })
    /**
     * E2: la unicidad de documento **excluye SIN_DOCUMENTO**. Dos estudiantes
     * sin cédula del mismo colegio no son duplicados, y el índice único
     * completo hacía que el segundo recibiera un 409. La guardia debe saltarse
     * la comprobación cuando `tipoDocumento === "SIN_DOCUMENTO"`.
     */
    .index("por_documento", ["institucionId", "tipoDocumento", "numeroDocumento"])
    .index("por_verificacion", ["institucionId", "estadoVerificacion"]),

  /**
   * El histórico de conducta cuelga de la matrícula, no del estudiante: un
   * traslado no arrastra puntaje ni bitácora al curso nuevo.
   */
  matricula: defineTable({
    estudianteId: v.id("estudiante"),
    cursoId: v.id("curso"),
    numeroLista: v.optional(v.number()),
    /** E1: misma regla que `asignacionDocente.vigenteDesde`. */
    fechaIngreso: v.string(),
    fechaSalida: v.optional(v.string()),
    estado: enumDe(ESTADO_MATRICULA),
    ...actualizadoEn,
  })
    .index("por_estudiante_curso", ["estudianteId", "cursoId"]) // ux_matricula
    // ux_matricula_cursando: una sola con estado CURSANDO por estudiante
    .index("por_estudiante_estado", ["estudianteId", "estado"])
    .index("por_curso_estado", ["cursoId", "estado"]),

  // --- Vinculación ---------------------------------------------------------

  /** A1: la invitación es al CURSO, no a un estudiante. D4: dura 30 días. */
  invitacionCurso: defineTable({
    cursoId: v.id("curso"),
    emitidaPorDocenteId: v.id("docente"),
    token: v.string(),
    codigoCorto: v.string(),
    usosMaximos: v.optional(v.number()),
    usosRealizados: v.number(),
    estado: enumDe(ESTADO_INVITACION),
    expiraEn: v.number(),
    ...actualizadoEn,
  })
    .index("por_token", ["token"])
    .index("por_codigo", ["codigoCorto", "estado"])
    .index("por_curso", ["cursoId"]),

  /**
   * D2: un solo representante legal por estudiante en la v1. Para admitir dos
   * en la v2 basta con relajar la guardia de unicidad; el esquema no cambia.
   */
  vinculoRepresentacion: defineTable({
    representanteId: v.id("representante"),
    estudianteId: v.id("estudiante"),
    parentesco: enumDe(PARENTESCO),
    invitacionCursoId: v.optional(v.id("invitacionCurso")),
    /** Clave del formulario y huella normalizada para reintentos de registro. */
    solicitudId: v.optional(v.string()),
    huellaSolicitud: v.optional(v.string()),
    estado: enumDe(ESTADO_VINCULO),
    vigenteDesde: v.string(),
    vigenteHasta: v.optional(v.string()),
    motivoRevocacion: v.optional(v.string()),
    ...actualizadoEn,
  })
    .index("por_representante_estudiante", ["representanteId", "estudianteId"]) // ux_vinculo
    .index("por_representante_solicitud", ["representanteId", "solicitudId"])
    // ux_vinculo_estudiante_unico: uno solo ACTIVO por estudiante
    .index("por_estudiante_estado", ["estudianteId", "estado"])
    .index("por_representante_estado", ["representanteId", "estado"]),

  /**
   * I4: el representante aporta los datos del menor y otorga el
   * consentimiento. Se guarda la **versión del documento**, no un booleano.
   */
  consentimiento: defineTable({
    perfilUsuarioId: v.id("perfilUsuario"),
    estudianteId: v.optional(v.id("estudiante")),
    tipo: enumDe(TIPO_CONSENTIMIENTO),
    versionDocumento: v.string(),
    otorgado: v.boolean(),
    otorgadoEn: v.number(),
    revocadoEn: v.optional(v.number()),
  }).index("por_usuario_tipo", ["perfilUsuarioId", "tipo"]),

  // =========================================================================
  // MÓDULO CONDUCTA Y REPORTES — Persona B
  // =========================================================================

  /**
   * C2: `institucionId` ausente = catálogo del sistema, común a todos.
   * ux_categoria → índice `por_institucion_codigo`
   */
  categoriaAccion: defineTable({
    institucionId: v.optional(v.id("institucion")),
    codigo: enumDe(CODIGO_CATEGORIA),
    /** El nombre que lee el docente. Lleva tildes y ñ: "Desempeño". */
    nombre: v.string(),
    descripcion: v.optional(v.string()),
    /** V2 (8 de agosto): reservado sin dominio hasta que exista el rol colaborador. */
    aplicaA: v.string(),
    orden: v.number(),
    activa: v.boolean(),
    ...actualizadoEn,
  }).index("por_institucion_codigo", ["institucionId", "codigo"]),

  /**
   * NUEVO 2026-08-14 — cambia el modelo de uso, no la forma de la tabla.
   *
   * Antes: catálogo cerrado de nombres ("No trajo la tarea") que el docente
   * elegía. Ahora el docente elige **categoría** y escribe el mensaje libre en
   * `accionRegistrada.descripcion`. Así que aquí queda una fila por
   * categoría-y-signo, no una por frase.
   *
   * Los rangos (C2):
   *   POSITIVA        → +1 por defecto, ajustable a +2
   *   IRRESPONSABILIDAD (categoría RESPONSABILIDAD) → fijo -1
   *   INDISCIPLINA (categoría DISCIPLINA)           → -1 a -3
   *   DESHONESTIDAD                                 → -1 a -3
   *
   * ck_tipo_rango y ck_tipo_signo_coherente → guardas.ts
   */
  tipoAccion: defineTable({
    institucionId: v.optional(v.id("institucion")),
    categoriaAccionId: v.id("categoriaAccion"),
    codigo: v.string(),
    nombre: v.string(),
    descripcion: v.optional(v.string()),
    signo: enumDe(SIGNO_ACCION),
    puntosDefecto: v.number(),
    puntosMin: v.number(),
    puntosMax: v.number(),
    /** NUEVO 2026-08-14: ahora es `true` en todos — el docente siempre escribe. */
    requiereDescripcion: v.boolean(),
    /** C8: solo las negativas admiten inconformidad. */
    admiteInconformidad: v.boolean(),
    cuentaEnBitacora: v.boolean(),
    activa: v.boolean(),
    ...actualizadoEn,
  }).index("por_institucion_codigo", ["institucionId", "codigo"]),

  /**
   * B3: solo en días de clase y dentro de un período abierto.
   * C4: topes diarios +4 / −5, validados en la mutation.
   * F4: ANULADA y MODIFICADA valen 0 pero se muestran distinto. Solo VIGENTE suma.
   *
   * ck_accion_resolucion → guardas.ts
   * (ck_accion_nota_cero desapareció: ya no existe el signo NOTA)
   */
  accionRegistrada: defineTable({
    matriculaId: v.id("matricula"),
    periodoAcademicoId: v.id("periodoAcademico"),
    tipoAccionId: v.id("tipoAccion"),
    /** Fotografías inmutables: cambiar el catálogo no altera lo ya registrado. */
    categoriaAccionId: v.id("categoriaAccion"),
    signo: enumDe(SIGNO_ACCION),
    puntosAplicados: v.number(),
    cuentaEnBitacora: v.boolean(),
    /** NUEVO 2026-08-14: el mensaje que escribe el docente. Ya no es opcional. */
    descripcion: v.string(),
    fechaOcurrencia: v.string(),
    registradaPorDocenteId: v.id("docente"),
    estado: enumDe(ESTADO_ACCION),
    resueltaPorDocenteId: v.optional(v.id("docente")),
    resueltaEn: v.optional(v.number()),
    motivoResolucion: v.optional(v.string()),
    ...actualizadoEn,
  })
    .index("por_matricula_periodo", ["matriculaId", "periodoAcademicoId", "estado"])
    .index("por_matricula_fecha", ["matriculaId", "fechaOcurrencia"]),

  /**
   * NUEVO 2026-08-14 — "Anuncios", con dos tipos:
   *
   *  NOTA_PROFESOR — mensaje libre del docente. Puede ir a **todo el curso o a
   *    un solo estudiante** (`alcance`), y dura de 1 a 7 días, que el docente
   *    elige. Absorbe el caso de uso de la antigua acción de signo NOTA, que
   *    solo alcanzaba a un estudiante y no expiraba.
   *
   *  EVENTO — texto largo, puede llevar listas. Se muestra retráctil
   *    ("Evento: [nombre]" + flecha) y desaparece al terminar `fechaEvento`.
   *
   * ck_comunicado_evento_fecha, ck_comunicado_ventana → guardas.ts
   */
  comunicadoCurso: defineTable({
    cursoId: v.id("curso"),
    periodoAcademicoId: v.optional(v.id("periodoAcademico")),
    tipo: enumDe(TIPO_COMUNICADO),
    /** NUEVO 2026-08-14 */
    alcance: enumDe(ALCANCE_COMUNICADO),
    /** Solo cuando `alcance === "ESTUDIANTE"`. → guardas.ts */
    estudianteId: v.optional(v.id("estudiante")),
    titulo: v.string(),
    contenido: v.string(),
    /** Solo para EVENTO. */
    fechaEvento: v.optional(v.string()),
    horaEvento: v.optional(v.string()),
    visibleDesde: v.string(),
    visibleHasta: v.string(),
    creadoPorDocenteId: v.id("docente"),
    activo: v.boolean(),
    ...actualizadoEn,
  })
    .index("por_curso_ventana", ["cursoId", "activo", "visibleHasta"])
    .index("por_estudiante", ["estudianteId", "activo"]),

  // --- Franjas y puntaje ---------------------------------------------------

  /** C7: seis franjas. 51–60 es la zona de arranque y se ve neutra a propósito. */
  franjaConducta: defineTable({
    institucionId: v.optional(v.id("institucion")),
    codigo: v.string(),
    nombre: v.string(),
    puntajeDesde: v.number(),
    puntajeHasta: v.number(), // ck_franja_rango → guardas.ts
    fraseRepresentante: v.string(),
    colorHex: v.optional(v.string()),
    orden: v.number(),
    ...actualizadoEn,
  }).index("por_institucion_codigo", ["institucionId", "codigo"]),

  /**
   * ADR-005: caché reconstruible. La verdad son las acciones VIGENTES.
   * Si alguien escribe `puntajeActual = puntajeActual - 1`, está mal: se
   * recalcula desde cero sumando las acciones del período.
   */
  puntajePeriodo: defineTable({
    matriculaId: v.id("matricula"),
    periodoAcademicoId: v.id("periodoAcademico"),
    puntajeBase: v.number(),
    puntosPositivos: v.number(),
    puntosNegativos: v.number(),
    puntajeActual: v.number(),
    franjaConductaId: v.optional(v.id("franjaConducta")),
    /** C5: al cerrar el parcial el puntaje se congela definitivamente. */
    congelado: v.boolean(),
    recalculadoEn: v.number(),
  }).index("por_matricula_periodo", ["matriculaId", "periodoAcademicoId"]),

  // --- Asistencia ----------------------------------------------------------

  registroAsistencia: defineTable({
    matriculaId: v.id("matricula"),
    periodoAcademicoId: v.id("periodoAcademico"),
    fecha: v.string(),
    estado: enumDe(ESTADO_ASISTENCIA),
    observacion: v.optional(v.string()),
    registradoPorDocenteId: v.id("docente"),
    justificadaEn: v.optional(v.number()),
    ...actualizadoEn,
  }).index("por_matricula_fecha", ["matriculaId", "fecha"]), // ux_asistencia

  // --- Reportes ------------------------------------------------------------

  /**
   * E1/E3: la plantilla define los campos. Agregar "material para mañana" es
   * insertar una fila, no cambiar el esquema.
   */
  plantillaReporte: defineTable({
    institucionId: v.optional(v.id("institucion")),
    nombre: v.string(),
    version: v.number(),
    activa: v.boolean(),
    ...actualizadoEn,
  }).index("por_institucion", ["institucionId", "activa"]),

  plantillaCampo: defineTable({
    plantillaReporteId: v.id("plantillaReporte"),
    codigo: v.string(),
    etiqueta: v.string(),
    tipoDato: enumDe(TIPO_CAMPO_REPORTE),
    textoAyuda: v.optional(v.string()),
    longitudMaxima: v.optional(v.number()),
    /** E1: ningún campo es obligatorio de llenar. */
    orden: v.number(),
    activo: v.boolean(),
  }).index("por_plantilla_codigo", ["plantillaReporteId", "codigo"]),

  /** E2: es opcional. Si no existe pero hubo acciones, el del estudiante se genera igual. */
  reporteGeneral: defineTable({
    cursoId: v.id("curso"),
    periodoAcademicoId: v.id("periodoAcademico"),
    plantillaReporteId: v.id("plantillaReporte"),
    fecha: v.string(),
    estado: enumDe(ESTADO_REPORTE_GENERAL),
    publicadoEn: v.optional(v.number()), // ck_reporte_general_publicado → guardas.ts
    publicadoPorDocenteId: v.optional(v.id("docente")),
    ...actualizadoEn,
  }).index("por_curso_fecha", ["cursoId", "fecha"]), // ux_reporte_general

  reporteGeneralValor: defineTable({
    reporteGeneralId: v.id("reporteGeneral"),
    plantillaCampoId: v.id("plantillaCampo"),
    valorTexto: v.optional(v.string()),
  }).index("por_reporte_campo", ["reporteGeneralId", "plantillaCampoId"]),

  /**
   * Fotografía inmutable del día para un estudiante.
   * E4: solo el más reciente se ve en la pantalla principal; los anteriores
   * van al historial, limitado por plan (2 free / 7 premium).
   */
  reporteEstudiante: defineTable({
    matriculaId: v.id("matricula"),
    periodoAcademicoId: v.id("periodoAcademico"),
    reporteGeneralId: v.optional(v.id("reporteGeneral")),
    fecha: v.string(),
    tieneNovedades: v.boolean(),
    puntajeAlCierre: v.number(),
    franjaConductaId: v.optional(v.id("franjaConducta")),
    estadoAsistencia: v.optional(enumDe(ESTADO_ASISTENCIA)),
    generadoEn: v.number(),
  }).index("por_matricula_fecha", ["matriculaId", "fecha"]), // ux_reporte_estudiante

  reporteEstudianteItem: defineTable({
    reporteEstudianteId: v.id("reporteEstudiante"),
    tipoItem: enumDe(TIPO_ITEM_REPORTE),
    accionRegistradaId: v.optional(v.id("accionRegistrada")),
    registroAsistenciaId: v.optional(v.id("registroAsistencia")),
    comunicadoCursoId: v.optional(v.id("comunicadoCurso")),
    /** V4 (8 de agosto): CITACION se resuelve aquí, sin FK a `cita`. */
    textoLibre: v.optional(v.string()),
    orden: v.number(),
  }).index("por_reporte", ["reporteEstudianteId", "orden"]),

  entregaReporte: defineTable({
    reporteEstudianteId: v.id("reporteEstudiante"),
    representanteId: v.id("representante"),
    entregadoEn: v.optional(v.number()),
    leidoEn: v.optional(v.number()),
  }).index("por_reporte_representante", ["reporteEstudianteId", "representanteId"]),

  /** E5: DIFERIDA A LA v2. Existe para no migrar después; sin funciones ni pantallas. */
  preguntaReporte: defineTable({
    reporteEstudianteId: v.id("reporteEstudiante"),
    representanteId: v.id("representante"),
    mensaje: v.string(),
    estado: enumDe(ESTADO_PREGUNTA),
    respuesta: v.optional(v.string()),
    respondidaPorDocenteId: v.optional(v.id("docente")),
    respondidaEn: v.optional(v.number()),
    ...actualizadoEn,
  }).index("por_reporte_representante", ["reporteEstudianteId", "representanteId"]),

  // =========================================================================
  // MÓDULO INTERACCIÓN, MONETIZACIÓN E INFRAESTRUCTURA — Persona C
  // =========================================================================

  /** F1: el docente publica su horario y se parte en bloques de 15 minutos. */
  disponibilidadDocente: defineTable({
    docenteId: v.id("docente"),
    cursoId: v.optional(v.id("curso")),
    fecha: v.string(),
    horaInicio: v.string(), // "HH:MM"
    horaFin: v.string(), // ck_disponibilidad_horas → guardas.ts
    modalidad: enumDe(MODALIDAD),
    lugarOEnlace: v.optional(v.string()),
    estado: enumDe(ESTADO_DISPONIBILIDAD),
    ...actualizadoEn,
  })
    .index("por_docente_fecha", ["docenteId", "fecha", "horaInicio"]) // ux_disponibilidad
    .index("por_docente_estado", ["docenteId", "fecha", "estado"]),

  /** F2: nace SOLICITADA y requiere confirmación del docente. */
  cita: defineTable({
    disponibilidadDocenteId: v.optional(v.id("disponibilidadDocente")),
    docenteId: v.id("docente"),
    representanteId: v.id("representante"),
    estudianteId: v.id("estudiante"),
    origen: enumDe(ORIGEN_CITA),
    motivo: v.optional(v.string()),
    fechaHoraInicio: v.number(),
    fechaHoraFin: v.number(), // ck_cita_horas → guardas.ts
    modalidad: enumDe(MODALIDAD),
    estado: enumDe(ESTADO_CITA),
    /**
     * **Lo ve el representante.** El nombre engaña: no es una nota privada del
     * docente, es el mensaje que escribe al confirmar o rechazar, y
     * `responderCita` ya lo manda dentro de la notificacion. No guardar aqui
     * nada que no se le pueda decir a la familia a la cara.
     */
    notasDocente: v.optional(v.string()),
    ...actualizadoEn,
  })
    .index("por_representante", ["representanteId", "fechaHoraInicio"])
    .index("por_docente", ["docenteId", "fechaHoraInicio"])
    // ux_cita_bloque_vivo: un bloque no admite dos reservas en SOLICITADA/CONFIRMADA
    .index("por_bloque_estado", ["disponibilidadDocenteId", "estado"]),

  /**
   * F3: el docente tiene 30 días; una tarea programada lo pasa a VENCIDA y sube de
   * prioridad. F4: RESUELTA_MODIFICADA lleva la acción a 0 y devuelve puntos.
   * ck_inconformidad_resolucion → guardas.ts
   */
  inconformidad: defineTable({
    accionRegistradaId: v.id("accionRegistrada"),
    representanteId: v.id("representante"),
    /**
     * A quien le toca responder. Se puede deducir siguiendo
     * `accionRegistradaId` hasta `accion.registradaPorDocenteId`, pero
     * entonces la bandeja del docente no se puede indexar: habria que leer
     * **todos** los reclamos abiertos del sistema y filtrarlos en memoria
     * (issue #48). Se denormaliza para que `por_docente_estado` exista.
     *
     * Opcional solo por los reclamos creados antes de este campo; los nuevos
     * siempre lo llevan. `migraciones.rellenarDocenteEnInconformidades` lo
     * completa, y despues de correrla no deberia quedar ninguno sin el.
     */
    motivo: enumDe(MOTIVO_INCONFORMIDAD),
    mensaje: v.string(),
    estado: enumDe(ESTADO_INCONFORMIDAD),
    /**
     * El docente titular de la accion reclamada, copiado al abrir el reclamo.
     *
     * Es denormalizacion a proposito. Sin este campo, la bandeja del docente
     * (D15) tiene que leer **todos** los reclamos abiertos del sistema y
     * filtrar en memoria: el vinculo con el docente va por
     * `accionRegistrada.registradaPorDocenteId`, a un salto de distancia, y
     * ningun indice de esta tabla llega hasta alli. Ver issue #48.
     *
     * Opcional solo por los reclamos que ya existan en un despliegue de
     * desarrollo; todo reclamo nuevo lo trae.
     */
    docenteId: v.optional(v.id("docente")),
    respuestaDocente: v.optional(v.string()),
    resueltaPorDocenteId: v.optional(v.id("docente")),
    resueltaEn: v.optional(v.number()),
    venceEn: v.number(),
    /** Ausente en reclamos previos: la migración inicial programa su vencimiento. */
    vencimientoProgramadoId: v.optional(v.id("_scheduled_functions")),
    citaId: v.optional(v.id("cita")),
    ...actualizadoEn,
  })
    .index("por_accion_representante", ["accionRegistradaId", "representanteId"])
    .index("por_estado_vence", ["estado", "venceEn"])
    // La bandeja del docente: acota por docente antes que por estado, que es
    // lo unico que la hace no crecer con los reclamos de todo el sistema
    // (#48). `venceEn` va al final para que el orden por plazo salga del
    // indice y no de ordenar en memoria.
    .index("por_docente_estado", ["docenteId", "estado", "venceEn"]),

  /**
   * G1: exige reautenticación; `reautenticadoEn` deja constancia.
   * G2: alcance CURSO o ESTUDIANTE. ck_alerta_estudiante → guardas.ts
   * La app declara visiblemente que **no sustituye al ECU 911**.
   */
  alertaEmergencia: defineTable({
    institucionId: v.id("institucion"),
    cursoId: v.id("curso"),
    alcance: enumDe(ALCANCE_ALERTA),
    estudianteId: v.optional(v.id("estudiante")),
    activadaPorDocenteId: v.id("docente"),
    tipo: enumDe(TIPO_ALERTA),
    titulo: v.string(),
    mensaje: v.string(),
    esSimulacro: v.boolean(),
    reautenticadoEn: v.number(),
    activadaEn: v.number(),
    finalizadaEn: v.optional(v.number()),
  }).index("por_curso", ["cursoId", "activadaEn"]),

  /** G3: el representante confirma que la leyó. */
  entregaAlerta: defineTable({
    alertaEmergenciaId: v.id("alertaEmergencia"),
    representanteId: v.id("representante"),
    estudianteId: v.id("estudiante"),
    enviadoEn: v.optional(v.number()),
    leidoEn: v.optional(v.number()),
    confirmadoEn: v.optional(v.number()),
  }).index("por_alerta", ["alertaEmergenciaId", "representanteId", "estudianteId"]),

  // --- Monetización --------------------------------------------------------

  /**
   * H1: premium del representante por cuenta (cubre a todos sus hijos); el
   * docente tiene límites que empujan a la compra.
   * H3: "por parcial" se mapea a bimestral.
   */
  plan: defineTable({
    codigo: v.string(),
    nombre: v.string(),
    audiencia: enumDe(AUDIENCIA_PLAN),
    /** `premium` para el representante, `docente_pro` para el docente (14 ago). */
    entitlementRevenuecat: v.optional(v.string()),
    productoGooglePlay: v.optional(v.string()),
    periodicidad: enumDe(PERIODICIDAD),
    sinPublicidad: v.boolean(),
    /** Cambiar un límite es actualizar una fila, no desplegar. */
    limites: v.any(),
    activo: v.boolean(),
    ...actualizadoEn,
  })
    .index("por_codigo", ["codigo"])
    .index("por_producto", ["productoGooglePlay"]),

  /** ADR-006: proyección local. RevenueCat es la fuente de verdad. */
  suscripcion: defineTable({
    perfilUsuarioId: v.id("perfilUsuario"),
    planId: v.id("plan"),
    revenuecatAppUserId: v.optional(v.string()),
    origen: enumDe(ORIGEN_SUSCRIPCION),
    estado: enumDe(ESTADO_SUSCRIPCION),
    iniciaEn: v.number(),
    /**
     * CANCELADA **no** significa vencida: el acceso sigue hasta `expiraEn`.
     * Ver `lib/revenuecat.ts` → `tieneAccesoVigente()`.
     */
    expiraEn: v.optional(v.number()),
    renovacionAutomatica: v.boolean(),
    /**
     * Nacida de una compra de prueba (ADR-008). Una suscripcion del Test Store
     * concede acceso igual que una real -- y debe hacerlo, porque asi se
     * prueba y se graba el video -- pero tiene que poder distinguirse: si no,
     * los datos de la demostracion y los de un piloto real quedan mezclados
     * sin forma de separarlos.
     */
    esSandbox: v.optional(v.boolean()),
    ...actualizadoEn,
  })
    .index("por_usuario", ["perfilUsuarioId", "estado"])
    .index("por_revenuecat_app_user", ["revenuecatAppUserId"]),

  /**
   * ADR-006: idempotencia del webhook. `eventoIdExterno` era UNIQUE en
   * Postgres y hacía todo el trabajo; en Convex la unicidad se comprueba
   * leyendo por `por_evento_externo` dentro de la mutation, que es
   * transaccional — un reenvío simultáneo no puede duplicar.
   *
   * `payload` guarda el evento **completo**, no los campos que usamos hoy.
   * Así queda registrado `environment: "SANDBOX"` (ADR-008) sin añadir una
   * columna ni tocar enums.ts, que es superficie compartida.
   */
  eventoRevenuecat: defineTable({
    eventoIdExterno: v.string(),
    tipoEvento: v.string(),
    revenuecatAppUserId: v.optional(v.string()),
    suscripcionId: v.optional(v.id("suscripcion")),
    payload: v.any(),
    recibidoEn: v.number(),
    procesadoEn: v.optional(v.number()),
    errorProcesamiento: v.optional(v.string()),
    /**
     * `true` cuando el evento vino del Test Store de RevenueCat (ADR-008).
     *
     * El payload entero ya se guarda, asi que el dato existia dentro del JSON
     * -- pero no se podia consultar. Con la columna se pueden separar las
     * compras de prueba de las reales sin borrar nada, que es la regla del
     * proyecto. Opcional por los eventos anteriores a la columna.
     */
    esSandbox: v.optional(v.boolean()),
  }).index("por_evento_externo", ["eventoIdExterno"]),

  /** E6 / I2: exportar el PDF acumulado viendo un anuncio recompensado. */
  desbloqueoRecompensado: defineTable({
    perfilUsuarioId: v.id("perfilUsuario"),
    recurso: enumDe(RECURSO_DESBLOQUEABLE),
    otorgadoEn: v.number(),
    expiraEn: v.number(),
    consumidoEn: v.optional(v.number()),
  }).index("por_usuario_recurso", ["perfilUsuarioId", "recurso"]),

  // --- Transversales -------------------------------------------------------

  dispositivo: defineTable({
    perfilUsuarioId: v.id("perfilUsuario"),
    tokenPush: v.string(),
    /** NUEVO 2026-08-14: cierra el pendiente 9 — antes era `text` sin dominio. */
    plataforma: enumDe(PLATAFORMA),
    versionApp: v.optional(v.string()),
    activo: v.boolean(),
    ...actualizadoEn,
  })
    .index("por_token", ["tokenPush"])
    .index("por_usuario", ["perfilUsuarioId", "activo"]),

  notificacion: defineTable({
    perfilUsuarioId: v.id("perfilUsuario"),
    tipo: enumDe(TIPO_NOTIFICACION),
    titulo: v.string(),
    cuerpo: v.string(),
    entidadTipo: v.optional(v.string()),
    entidadId: v.optional(v.string()),
    /** Primera confirmación de FCM/APNs mediante un receipt de Expo; no acredita lectura. */
    enviadaEn: v.optional(v.number()),
    leidaEn: v.optional(v.number()),
  }).index("por_usuario", ["perfilUsuarioId"]),

  /** Estado del push por notificación y dispositivo; la bandeja es independiente. */
  entregaPush: defineTable({
    notificacionId: v.id("notificacion"),
    dispositivoId: v.id("dispositivo"),
    tokenPush: v.string(),
    dispositivoActualizadoEn: v.number(),
    estado: v.union(
      v.literal("PENDIENTE"), v.literal("ENVIANDO"), v.literal("ACEPTADA"),
      v.literal("CONFIRMADA"), v.literal("FALLIDA"),
    ),
    intentos: v.number(),
    consultasRecibo: v.number(),
    proximoIntentoEn: v.optional(v.number()),
    reservaHasta: v.optional(v.number()),
    ticketId: v.optional(v.string()),
    consultarReciboEn: v.optional(v.number()),
    error: v.optional(v.string()),
    ...actualizadoEn,
  }).index("por_notificacion_dispositivo", ["notificacionId", "dispositivoId"]),

  /**
   * Registro de operaciones sobre datos de menores.
   *
   * Con Convex se pierde la capa RLS de Postgres, así que esta tabla deja de
   * ser un complemento y pasa a ser el **control compensatorio**: es lo que
   * demuestra ante un colegio que nadie vio lo que no le tocaba. Antes existía
   * y nadie escribía en ella; ahora la escriben los envoltorios de
   * `lib/permisos.ts`, que es el único camino a los datos de estudiantes.
   */
  auditoria: defineTable({
    perfilUsuarioId: v.optional(v.id("perfilUsuario")),
    institucionId: v.optional(v.id("institucion")),
    accion: enumDe(ACCION_AUDITORIA),
    entidadTipo: v.string(),
    entidadId: v.optional(v.string()),
    datosAntes: v.optional(v.any()),
    datosDespues: v.optional(v.any()),
    ocurridoEn: v.number(),
  })
    .index("por_entidad", ["entidadTipo", "entidadId"])
    .index("por_usuario", ["perfilUsuarioId", "ocurridoEn"]),
});
