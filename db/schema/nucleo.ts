/**
 * MÓDULO NÚCLEO — Persona A
 * Identidad, estructura académica y vinculación representante–estudiante.
 *
 * Las tablas `user`, `session`, `account`, `organization` y `member` las genera
 * BetterAuth con su propio CLI. Aquí solo se referencia `user.id` y
 * `organization.id`; no las redeclaramos para no duplicar la identidad.
 */

import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, smallint, boolean, timestamp, date,
  index, uniqueIndex, check,
} from "drizzle-orm/pg-core";
import {
  REGIMEN, ESTADO_INSTITUCION, TIPO_DOCUMENTO, ESTADO_ANIO_LECTIVO,
  ESTADO_PERIODO, JORNADA, ESTADO_CURSO, ROL_ASIGNACION,
  ORIGEN_ESTUDIANTE, VERIFICACION_ESTUDIANTE, ESTADO_ESTUDIANTE,
  ESTADO_MATRICULA, ESTADO_INVITACION, ESTADO_VINCULO, PARENTESCO,
  TIPO_CONSENTIMIENTO, REGLAS,
} from "./enums";

/** Helper: CHECK de pertenencia a una lista de constantes */
const enTuple = (col: string, valores: readonly string[]) =>
  sql.raw(`${col} IN (${valores.map((v) => `'${v}'`).join(", ")})`);

const auditoriaCols = {
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// INSTITUCIÓN
// A2: en la v1 no hay superusuario. El docente declara el nombre de la escuela
// como texto libre. `verificada` queda en false hasta que en la v2 la dirección
// reclame la institución. Se mapea 1:1 con la organization de BetterAuth.
// ---------------------------------------------------------------------------
export const institucion = pgTable("institucion", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id").notNull().unique(), // BetterAuth organization.id
  nombreDeclarado: text("nombre_declarado").notNull(),
  verificada: boolean("verificada").notNull().default(false),
  codigoAmie: text("codigo_amie"),
  regimen: text("regimen").notNull().default("COSTA_INSULAR"),
  ciudad: text("ciudad").notNull().default("Guayaquil"),
  zonaHoraria: text("zona_horaria").notNull().default(REGLAS.ZONA_HORARIA),
  // C1 / C3 / C4: parámetros del puntaje, configurables por institución
  puntajeBase: smallint("puntaje_base").notNull().default(REGLAS.PUNTAJE_BASE),
  puntajeMinimo: smallint("puntaje_minimo").notNull().default(REGLAS.PUNTAJE_MINIMO),
  puntajeMaximo: smallint("puntaje_maximo").notNull().default(REGLAS.PUNTAJE_MAXIMO),
  topeDiarioPositivo: smallint("tope_diario_positivo").notNull().default(REGLAS.TOPE_DIARIO_POSITIVO),
  topeDiarioNegativo: smallint("tope_diario_negativo").notNull().default(REGLAS.TOPE_DIARIO_NEGATIVO),
  estado: text("estado").notNull().default("ACTIVA"),
  ...auditoriaCols,
}, (t) => [
  check("ck_institucion_regimen", enTuple("regimen", REGIMEN)),
  check("ck_institucion_estado", enTuple("estado", ESTADO_INSTITUCION)),
  check("ck_institucion_rango",
    sql`${t.puntajeMinimo} < ${t.puntajeBase} AND ${t.puntajeBase} < ${t.puntajeMaximo}`),
]);

// ---------------------------------------------------------------------------
// PERFIL DE USUARIO — extiende el `user` de BetterAuth con datos del dominio
// ---------------------------------------------------------------------------
export const perfilUsuario = pgTable("perfil_usuario", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(), // BetterAuth user.id
  tipoDocumento: text("tipo_documento").notNull().default("CEDULA"),
  numeroDocumento: text("numero_documento").notNull(),
  telefono: text("telefono"),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_perfil_documento").on(t.tipoDocumento, t.numeroDocumento),
  check("ck_perfil_tipo_doc", enTuple("tipo_documento", TIPO_DOCUMENTO)),
]);

/**
 * Una misma persona puede ser docente y representante a la vez (un profesor con
 * hijos en el mismo colegio). Por eso son dos tablas de perfil, no un campo `rol`.
 */
export const docente = pgTable("docente", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  tituloProfesional: text("titulo_profesional"),
  correoContacto: text("correo_contacto"),
  telefonoContacto: text("telefono_contacto"),
  horarioAtencion: text("horario_atencion"),
  ...auditoriaCols,
});

export const representante = pgTable("representante", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  ocupacion: text("ocupacion"),
  direccion: text("direccion"),
  telefonoAlterno: text("telefono_alterno"),
  ...auditoriaCols,
});

// ---------------------------------------------------------------------------
// CALENDARIO
// B1: el docente define el año lectivo al crear el curso y luego sus parciales.
// ---------------------------------------------------------------------------
export const anioLectivo = pgTable("anio_lectivo", {
  id: uuid("id").primaryKey().defaultRandom(),
  institucionId: uuid("institucion_id").notNull().references(() => institucion.id),
  nombre: text("nombre").notNull(),
  fechaInicio: date("fecha_inicio").notNull(),
  fechaFin: date("fecha_fin").notNull(),
  estado: text("estado").notNull().default("PLANIFICADO"),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_anio_lectivo").on(t.institucionId, t.nombre),
  check("ck_anio_estado", enTuple("estado", ESTADO_ANIO_LECTIVO)),
  check("ck_anio_fechas", sql`${t.fechaFin} > ${t.fechaInicio}`),
]);

/** B2: de 2 a 3 parciales por año lectivo, con fechas definidas por el docente. */
export const periodoAcademico = pgTable("periodo_academico", {
  id: uuid("id").primaryKey().defaultRandom(),
  anioLectivoId: uuid("anio_lectivo_id").notNull().references(() => anioLectivo.id),
  nombre: text("nombre").notNull(),
  orden: smallint("orden").notNull(),
  fechaInicio: date("fecha_inicio").notNull(),
  fechaFin: date("fecha_fin").notNull(),
  estado: text("estado").notNull().default("PLANIFICADO"),
  cerradoEn: timestamp("cerrado_en", { withTimezone: true }),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_periodo_orden").on(t.anioLectivoId, t.orden),
  check("ck_periodo_estado", enTuple("estado", ESTADO_PERIODO)),
  check("ck_periodo_fechas", sql`${t.fechaFin} > ${t.fechaInicio}`),
]);

/**
 * B4: solo los días con clase generan reporte. Los feriados y suspensiones se
 * registran aquí para que la tarea nocturna sepa qué días saltarse.
 */
export const diaNoLectivo = pgTable("dia_no_lectivo", {
  id: uuid("id").primaryKey().defaultRandom(),
  anioLectivoId: uuid("anio_lectivo_id").notNull().references(() => anioLectivo.id),
  fecha: date("fecha").notNull(),
  motivo: text("motivo"),
  ...auditoriaCols,
}, (t) => [uniqueIndex("ux_dia_no_lectivo").on(t.anioLectivoId, t.fecha)]);

// ---------------------------------------------------------------------------
// CURSO
// ---------------------------------------------------------------------------
export const curso = pgTable("curso", {
  id: uuid("id").primaryKey().defaultRandom(),
  anioLectivoId: uuid("anio_lectivo_id").notNull().references(() => anioLectivo.id),
  nombre: text("nombre").notNull(),
  nivel: text("nivel").notNull(),
  paralelo: text("paralelo").notNull(),
  jornada: text("jornada").notNull().default("MATUTINA"),
  aula: text("aula"),
  estado: text("estado").notNull().default("ACTIVO"),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_curso").on(t.anioLectivoId, t.nivel, t.paralelo, t.jornada),
  check("ck_curso_jornada", enTuple("jornada", JORNADA)),
  check("ck_curso_estado", enTuple("estado", ESTADO_CURSO)),
]);

export const asignacionDocente = pgTable("asignacion_docente", {
  id: uuid("id").primaryKey().defaultRandom(),
  cursoId: uuid("curso_id").notNull().references(() => curso.id),
  docenteId: uuid("docente_id").notNull().references(() => docente.id),
  rol: text("rol").notNull().default("TITULAR"),
  area: text("area"),
  /**
   * E1: sin `defaultNow()` a propósito. `now()::date` se resuelve con el
   * timezone de la sesión de Postgres (UTC en la nube), así que de 19:00 a
   * 23:59 en Guayaquil caería en el día siguiente. La fecha la calcula el
   * servidor con REGLAS.ZONA_HORARIA.
   */
  vigenteDesde: date("vigente_desde").notNull(),
  vigenteHasta: date("vigente_hasta"),
  ...auditoriaCols,
}, (t) => [
  // Un solo titular vigente por curso
  uniqueIndex("ux_curso_titular_vigente").on(t.cursoId)
    .where(sql`rol = 'TITULAR' AND vigente_hasta IS NULL`),
  check("ck_asignacion_rol", enTuple("rol", ROL_ASIGNACION)),
]);

// ---------------------------------------------------------------------------
// ESTUDIANTE
// A1: en la v1 el representante crea al estudiante al aceptar la invitación y
// el docente lo aprueba. `origenRegistro` y `estadoVerificacion` sostienen ese
// flujo sin cerrar la puerta al camino por CSV (D1: ambas).
// ---------------------------------------------------------------------------
export const estudiante = pgTable("estudiante", {
  id: uuid("id").primaryKey().defaultRandom(),
  institucionId: uuid("institucion_id").notNull().references(() => institucion.id),
  tipoDocumento: text("tipo_documento").notNull().default("CEDULA"),
  numeroDocumento: text("numero_documento").notNull(),
  nombres: text("nombres").notNull(),
  apellidos: text("apellidos").notNull(),
  fechaNacimiento: date("fecha_nacimiento"),
  origenRegistro: text("origen_registro").notNull(),
  estadoVerificacion: text("estado_verificacion").notNull().default("PENDIENTE"),
  aprobadoPorDocenteId: uuid("aprobado_por_docente_id").references(() => docente.id),
  aprobadoEn: timestamp("aprobado_en", { withTimezone: true }),
  motivoRechazo: text("motivo_rechazo"),
  estado: text("estado").notNull().default("ACTIVO"),
  ...auditoriaCols,
}, (t) => [
  /**
   * E2: parcial a propósito. `numero_documento` es NOT NULL, así que dos
   * estudiantes SIN_DOCUMENTO del mismo colegio colisionarían y el segundo
   * recibiría un 409 como si fuera duplicado. Excluyéndolos, la unicidad
   * sigue garantizada para quienes sí tienen cédula o pasaporte.
   */
  uniqueIndex("ux_estudiante_documento")
    .on(t.institucionId, t.tipoDocumento, t.numeroDocumento)
    .where(sql`tipo_documento <> 'SIN_DOCUMENTO'`),
  index("ix_estudiante_pendiente").on(t.institucionId)
    .where(sql`estado_verificacion = 'PENDIENTE'`),
  check("ck_estudiante_origen", enTuple("origen_registro", ORIGEN_ESTUDIANTE)),
  check("ck_estudiante_verificacion", enTuple("estado_verificacion", VERIFICACION_ESTUDIANTE)),
  check("ck_estudiante_estado", enTuple("estado", ESTADO_ESTUDIANTE)),
]);

/**
 * El histórico de conducta cuelga de la matrícula, no del estudiante: un
 * traslado no arrastra puntaje ni bitácora al curso nuevo.
 * I1: al terminar el año lectivo la matrícula pasa a FINALIZADA y los datos
 * quedan archivados; el representante pierde acceso, la institución conserva.
 */
export const matricula = pgTable("matricula", {
  id: uuid("id").primaryKey().defaultRandom(),
  estudianteId: uuid("estudiante_id").notNull().references(() => estudiante.id),
  cursoId: uuid("curso_id").notNull().references(() => curso.id),
  numeroLista: smallint("numero_lista"),
  /** E1: sin `defaultNow()` — misma razón que `asignacion_docente.vigente_desde`. */
  fechaIngreso: date("fecha_ingreso").notNull(),
  fechaSalida: date("fecha_salida"),
  estado: text("estado").notNull().default("CURSANDO"),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_matricula").on(t.estudianteId, t.cursoId),
  // Una sola matrícula vigente por estudiante
  uniqueIndex("ux_matricula_cursando").on(t.estudianteId).where(sql`estado = 'CURSANDO'`),
  index("ix_matricula_curso").on(t.cursoId).where(sql`estado = 'CURSANDO'`),
  check("ck_matricula_estado", enTuple("estado", ESTADO_MATRICULA)),
]);

// ---------------------------------------------------------------------------
// VINCULACIÓN
// A1: la invitación es al CURSO, no a un estudiante concreto. El representante
// la reclama, registra a su hijo y queda pendiente de aprobación del docente.
// ---------------------------------------------------------------------------
export const invitacionCurso = pgTable("invitacion_curso", {
  id: uuid("id").primaryKey().defaultRandom(),
  cursoId: uuid("curso_id").notNull().references(() => curso.id),
  emitidaPorDocenteId: uuid("emitida_por_docente_id").notNull().references(() => docente.id),
  token: text("token").notNull().unique(),
  codigoCorto: text("codigo_corto").notNull(),
  usosMaximos: smallint("usos_maximos"),
  usosRealizados: smallint("usos_realizados").notNull().default(0),
  estado: text("estado").notNull().default("PENDIENTE"),
  expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(), // D4: 30 días
  ...auditoriaCols,
}, (t) => [
  index("ix_invitacion_codigo").on(t.codigoCorto).where(sql`estado = 'PENDIENTE'`),
  check("ck_invitacion_estado", enTuple("estado", ESTADO_INVITACION)),
]);

/**
 * D2: un solo representante legal por estudiante en la v1.
 * El índice único parcial lo garantiza. Para admitir dos representantes en la
 * v2 basta con eliminar `ux_vinculo_estudiante_unico`; nada más cambia.
 */
export const vinculoRepresentacion = pgTable("vinculo_representacion", {
  id: uuid("id").primaryKey().defaultRandom(),
  representanteId: uuid("representante_id").notNull().references(() => representante.id),
  estudianteId: uuid("estudiante_id").notNull().references(() => estudiante.id),
  parentesco: text("parentesco").notNull(),
  invitacionCursoId: uuid("invitacion_curso_id").references(() => invitacionCurso.id),
  estado: text("estado").notNull().default("ACTIVO"),
  vigenteDesde: date("vigente_desde").notNull(),
  vigenteHasta: date("vigente_hasta"),
  motivoRevocacion: text("motivo_revocacion"),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_vinculo").on(t.representanteId, t.estudianteId),
  uniqueIndex("ux_vinculo_estudiante_unico").on(t.estudianteId).where(sql`estado = 'ACTIVO'`),
  index("ix_vinculo_representante").on(t.representanteId).where(sql`estado = 'ACTIVO'`),
  check("ck_vinculo_parentesco", enTuple("parentesco", PARENTESCO)),
  check("ck_vinculo_estado", enTuple("estado", ESTADO_VINCULO)),
]);

/**
 * I4: el representante es quien aporta los datos del menor y otorga el
 * consentimiento. Se guarda la versión del documento aceptado, no un booleano.
 */
export const consentimiento = pgTable("consentimiento", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  estudianteId: uuid("estudiante_id").references(() => estudiante.id),
  tipo: text("tipo").notNull(),
  versionDocumento: text("version_documento").notNull(),
  otorgado: boolean("otorgado").notNull(),
  otorgadoEn: timestamp("otorgado_en", { withTimezone: true }).notNull().defaultNow(),
  revocadoEn: timestamp("revocado_en", { withTimezone: true }),
}, (t) => [
  index("ix_consentimiento_usuario").on(t.userId, t.tipo),
  check("ck_consentimiento_tipo", enTuple("tipo", TIPO_CONSENTIMIENTO)),
]);
