/**
 * MÓDULO CONDUCTA Y REPORTES — Persona B
 * Acciones, comunicados de curso, puntaje, asistencia y reportes.
 */

import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, smallint, boolean, timestamp, date,
  index, uniqueIndex, unique, check,
} from "drizzle-orm/pg-core";
import { institucion, curso, matricula, periodoAcademico, docente, representante } from "./nucleo";
import {
  SIGNO_ACCION, ESTADO_ACCION, CODIGO_CATEGORIA, TIPO_COMUNICADO,
  ESTADO_ASISTENCIA, ESTADO_REPORTE_GENERAL, TIPO_CAMPO_REPORTE,
  TIPO_ITEM_REPORTE, ESTADO_PREGUNTA,
} from "./enums";

const enTuple = (col: string, valores: readonly string[]) =>
  sql.raw(`${col} IN (${valores.map((v) => `'${v}'`).join(", ")})`);

const auditoriaCols = {
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// CATÁLOGO DE ACCIONES
// C2: institucionId NULL = catálogo del sistema, común a todos.
// Los rangos de puntos viven aquí, no en el código de la app.
// ---------------------------------------------------------------------------
export const categoriaAccion = pgTable("categoria_accion", {
  id: uuid("id").primaryKey().defaultRandom(),
  institucionId: uuid("institucion_id").references(() => institucion.id),
  codigo: text("codigo").notNull(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  aplicaA: text("aplica_a").notNull().default("AMBAS"),
  orden: smallint("orden").notNull().default(0),
  activa: boolean("activa").notNull().default(true),
  ...auditoriaCols,
}, (t) => [
  unique("ux_categoria").on(t.institucionId, t.codigo).nullsNotDistinct(),
  check("ck_categoria_codigo", enTuple("codigo", CODIGO_CATEGORIA)),
]);

/**
 * C2, en detalle:
 *  - POSITIVA:        +1 por defecto, el docente puede subirla a +2
 *  - RESPONSABILIDAD: fija en -1 (puntosMin = puntosMax = -1)
 *  - DISCIPLINA:      -1 por defecto, el docente puede bajarla hasta -3
 *  - NOTA:            0 puntos, no entra en la bitácora
 */
export const tipoAccion = pgTable("tipo_accion", {
  id: uuid("id").primaryKey().defaultRandom(),
  institucionId: uuid("institucion_id").references(() => institucion.id),
  categoriaAccionId: uuid("categoria_accion_id").notNull().references(() => categoriaAccion.id),
  codigo: text("codigo").notNull(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  signo: text("signo").notNull(),
  puntosDefecto: smallint("puntos_defecto").notNull(),
  puntosMin: smallint("puntos_min").notNull(),
  puntosMax: smallint("puntos_max").notNull(),
  requiereDescripcion: boolean("requiere_descripcion").notNull().default(false),
  /** C8: solo las negativas admiten inconformidad */
  admiteInconformidad: boolean("admite_inconformidad").notNull().default(false),
  /** C2: las notas no entran en la bitácora del parcial */
  cuentaEnBitacora: boolean("cuenta_en_bitacora").notNull().default(true),
  activa: boolean("activa").notNull().default(true),
  ...auditoriaCols,
}, (t) => [
  unique("ux_tipo_accion").on(t.institucionId, t.codigo).nullsNotDistinct(),
  check("ck_tipo_signo", enTuple("signo", SIGNO_ACCION)),
  check("ck_tipo_rango", sql`${t.puntosMin} <= ${t.puntosDefecto} AND ${t.puntosDefecto} <= ${t.puntosMax}`),
  check("ck_tipo_signo_coherente", sql`
    (signo = 'POSITIVA' AND ${t.puntosMin} >= 1)
    OR (signo = 'NEGATIVA' AND ${t.puntosMax} <= -1)
    OR (signo = 'NOTA' AND ${t.puntosMin} = 0 AND ${t.puntosMax} = 0)`),
]);

// ---------------------------------------------------------------------------
// ACCIÓN REGISTRADA — por estudiante (POSITIVA, NEGATIVA, NOTA)
// B3: solo se registra en días de clase y dentro de un período abierto.
// C4: topes diarios de +4 / -5, validados en la capa de servidor.
// ---------------------------------------------------------------------------
export const accionRegistrada = pgTable("accion_registrada", {
  id: uuid("id").primaryKey().defaultRandom(),
  matriculaId: uuid("matricula_id").notNull().references(() => matricula.id),
  periodoAcademicoId: uuid("periodo_academico_id").notNull().references(() => periodoAcademico.id),
  tipoAccionId: uuid("tipo_accion_id").notNull().references(() => tipoAccion.id),
  // Fotografías inmutables: cambiar el catálogo no altera acciones ya registradas
  categoriaAccionId: uuid("categoria_accion_id").notNull().references(() => categoriaAccion.id),
  signo: text("signo").notNull(),
  puntosAplicados: smallint("puntos_aplicados").notNull(),
  cuentaEnBitacora: boolean("cuenta_en_bitacora").notNull().default(true),
  descripcion: text("descripcion"),
  fechaOcurrencia: date("fecha_ocurrencia").notNull(),
  registradaPorDocenteId: uuid("registrada_por_docente_id").notNull().references(() => docente.id),
  /**
   * F4: ANULADA (error del docente) y MODIFICADA (acordada con el representante)
   * valen ambas 0 puntos, pero se muestran distinto. Solo VIGENTE suma.
   */
  estado: text("estado").notNull().default("VIGENTE"),
  resueltaPorDocenteId: uuid("resuelta_por_docente_id").references(() => docente.id),
  resueltaEn: timestamp("resuelta_en", { withTimezone: true }),
  motivoResolucion: text("motivo_resolucion"),
  ...auditoriaCols,
}, (t) => [
  index("ix_accion_matricula_periodo").on(t.matriculaId, t.periodoAcademicoId)
    .where(sql`estado = 'VIGENTE'`),
  index("ix_accion_fecha").on(t.matriculaId, t.fechaOcurrencia),
  check("ck_accion_signo", enTuple("signo", SIGNO_ACCION)),
  check("ck_accion_estado", enTuple("estado", ESTADO_ACCION)),
  check("ck_accion_nota_cero", sql`signo <> 'NOTA' OR ${t.puntosAplicados} = 0`),
  check("ck_accion_resolucion", sql`
    estado = 'VIGENTE'
    OR (${t.resueltaEn} IS NOT NULL AND ${t.motivoResolucion} IS NOT NULL)`),
]);

// ---------------------------------------------------------------------------
// COMUNICADO DE CURSO — ANUNCIO y EVENTO (C2)
// Van en tabla propia porque alcanzan a todo el curso, no a un estudiante.
// El EVENTO se muestra en el reporte desde `visibleDesde` (máx. 7 días antes)
// hasta `visibleHasta` (el día siguiente al evento).
// ---------------------------------------------------------------------------
export const comunicadoCurso = pgTable("comunicado_curso", {
  id: uuid("id").primaryKey().defaultRandom(),
  cursoId: uuid("curso_id").notNull().references(() => curso.id),
  periodoAcademicoId: uuid("periodo_academico_id").references(() => periodoAcademico.id),
  tipo: text("tipo").notNull(),
  titulo: text("titulo").notNull(),
  contenido: text("contenido").notNull(),
  /** Solo para EVENTO */
  fechaEvento: date("fecha_evento"),
  horaEvento: text("hora_evento"),
  visibleDesde: date("visible_desde").notNull(),
  visibleHasta: date("visible_hasta").notNull(),
  creadoPorDocenteId: uuid("creado_por_docente_id").notNull().references(() => docente.id),
  activo: boolean("activo").notNull().default(true),
  ...auditoriaCols,
}, (t) => [
  index("ix_comunicado_vigente").on(t.cursoId, t.visibleDesde, t.visibleHasta)
    .where(sql`activo = true`),
  check("ck_comunicado_tipo", enTuple("tipo", TIPO_COMUNICADO)),
  check("ck_comunicado_evento_fecha", sql`tipo <> 'EVENTO' OR ${t.fechaEvento} IS NOT NULL`),
  check("ck_comunicado_ventana", sql`${t.visibleHasta} >= ${t.visibleDesde}`),
]);

// ---------------------------------------------------------------------------
// FRANJAS Y PUNTAJE
// C7: seis franjas. 51–60 es la zona de la base de arranque.
// ---------------------------------------------------------------------------
export const franjaConducta = pgTable("franja_conducta", {
  id: uuid("id").primaryKey().defaultRandom(),
  institucionId: uuid("institucion_id").references(() => institucion.id),
  codigo: text("codigo").notNull(),
  nombre: text("nombre").notNull(),
  puntajeDesde: smallint("puntaje_desde").notNull(),
  puntajeHasta: smallint("puntaje_hasta").notNull(),
  fraseRepresentante: text("frase_representante").notNull(),
  colorHex: text("color_hex"),
  orden: smallint("orden").notNull().default(0),
  ...auditoriaCols,
}, (t) => [
  unique("ux_franja").on(t.institucionId, t.codigo).nullsNotDistinct(),
  check("ck_franja_rango", sql`${t.puntajeDesde} <= ${t.puntajeHasta}`),
]);

/** Caché recalculable. La verdad son las acciones VIGENTES; esto es derivado. */
export const puntajePeriodo = pgTable("puntaje_periodo", {
  id: uuid("id").primaryKey().defaultRandom(),
  matriculaId: uuid("matricula_id").notNull().references(() => matricula.id),
  periodoAcademicoId: uuid("periodo_academico_id").notNull().references(() => periodoAcademico.id),
  puntajeBase: smallint("puntaje_base").notNull(),
  puntosPositivos: smallint("puntos_positivos").notNull().default(0),
  puntosNegativos: smallint("puntos_negativos").notNull().default(0),
  puntajeActual: smallint("puntaje_actual").notNull(),
  franjaConductaId: uuid("franja_conducta_id").references(() => franjaConducta.id),
  /** C5: al cerrar el parcial el puntaje se congela definitivamente */
  congelado: boolean("congelado").notNull().default(false),
  recalculadoEn: timestamp("recalculado_en", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ux_puntaje_periodo").on(t.matriculaId, t.periodoAcademicoId),
]);

// ---------------------------------------------------------------------------
// ASISTENCIA
// ---------------------------------------------------------------------------
export const registroAsistencia = pgTable("registro_asistencia", {
  id: uuid("id").primaryKey().defaultRandom(),
  matriculaId: uuid("matricula_id").notNull().references(() => matricula.id),
  periodoAcademicoId: uuid("periodo_academico_id").notNull().references(() => periodoAcademico.id),
  fecha: date("fecha").notNull(),
  estado: text("estado").notNull(),
  observacion: text("observacion"),
  registradoPorDocenteId: uuid("registrado_por_docente_id").notNull().references(() => docente.id),
  justificadaEn: timestamp("justificada_en", { withTimezone: true }),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_asistencia").on(t.matriculaId, t.fecha),
  check("ck_asistencia_estado", enTuple("estado", ESTADO_ASISTENCIA)),
]);

// ---------------------------------------------------------------------------
// REPORTES
// E1/E3: la plantilla define los campos. Agregar "material para mañana" es un
// INSERT en plantilla_campo, no una migración.
// ---------------------------------------------------------------------------
export const plantillaReporte = pgTable("plantilla_reporte", {
  id: uuid("id").primaryKey().defaultRandom(),
  institucionId: uuid("institucion_id").references(() => institucion.id),
  nombre: text("nombre").notNull(),
  version: smallint("version").notNull().default(1),
  activa: boolean("activa").notNull().default(true),
  ...auditoriaCols,
});

export const plantillaCampo = pgTable("plantilla_campo", {
  id: uuid("id").primaryKey().defaultRandom(),
  plantillaReporteId: uuid("plantilla_reporte_id").notNull()
    .references(() => plantillaReporte.id, { onDelete: "cascade" }),
  codigo: text("codigo").notNull(),
  etiqueta: text("etiqueta").notNull(),
  tipoDato: text("tipo_dato").notNull().default("TEXTO_LARGO"),
  textoAyuda: text("texto_ayuda"),
  longitudMaxima: smallint("longitud_maxima"),
  /** E1: ningún campo es obligatorio */
  orden: smallint("orden").notNull().default(0),
  activo: boolean("activo").notNull().default(true),
}, (t) => [
  uniqueIndex("ux_plantilla_campo").on(t.plantillaReporteId, t.codigo),
  check("ck_campo_tipo", enTuple("tipo_dato", TIPO_CAMPO_REPORTE)),
]);

/** E2: el reporte general es opcional. Si no existe, el del estudiante igual se genera. */
export const reporteGeneral = pgTable("reporte_general", {
  id: uuid("id").primaryKey().defaultRandom(),
  cursoId: uuid("curso_id").notNull().references(() => curso.id),
  periodoAcademicoId: uuid("periodo_academico_id").notNull().references(() => periodoAcademico.id),
  plantillaReporteId: uuid("plantilla_reporte_id").notNull().references(() => plantillaReporte.id),
  fecha: date("fecha").notNull(),
  estado: text("estado").notNull().default("BORRADOR"),
  publicadoEn: timestamp("publicado_en", { withTimezone: true }),
  publicadoPorDocenteId: uuid("publicado_por_docente_id").references(() => docente.id),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_reporte_general").on(t.cursoId, t.fecha),
  check("ck_reporte_general_estado", enTuple("estado", ESTADO_REPORTE_GENERAL)),
  check("ck_reporte_general_publicado", sql`estado <> 'PUBLICADO' OR ${t.publicadoEn} IS NOT NULL`),
]);

export const reporteGeneralValor = pgTable("reporte_general_valor", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporteGeneralId: uuid("reporte_general_id").notNull()
    .references(() => reporteGeneral.id, { onDelete: "cascade" }),
  plantillaCampoId: uuid("plantilla_campo_id").notNull().references(() => plantillaCampo.id),
  valorTexto: text("valor_texto"),
}, (t) => [
  uniqueIndex("ux_reporte_valor").on(t.reporteGeneralId, t.plantillaCampoId),
]);

/**
 * Fotografía inmutable del día para un estudiante.
 * E4: el más reciente es el único visible en la pantalla principal; los
 * anteriores se consultan en el módulo de historial, con límite según plan.
 */
export const reporteEstudiante = pgTable("reporte_estudiante", {
  id: uuid("id").primaryKey().defaultRandom(),
  matriculaId: uuid("matricula_id").notNull().references(() => matricula.id),
  periodoAcademicoId: uuid("periodo_academico_id").notNull().references(() => periodoAcademico.id),
  reporteGeneralId: uuid("reporte_general_id").references(() => reporteGeneral.id),
  fecha: date("fecha").notNull(),
  tieneNovedades: boolean("tiene_novedades").notNull().default(false),
  puntajeAlCierre: smallint("puntaje_al_cierre").notNull(),
  franjaConductaId: uuid("franja_conducta_id").references(() => franjaConducta.id),
  estadoAsistencia: text("estado_asistencia"),
  generadoEn: timestamp("generado_en", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ux_reporte_estudiante").on(t.matriculaId, t.fecha),
  index("ix_reporte_estudiante_fecha").on(t.matriculaId, t.fecha),
]);

export const reporteEstudianteItem = pgTable("reporte_estudiante_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporteEstudianteId: uuid("reporte_estudiante_id").notNull()
    .references(() => reporteEstudiante.id, { onDelete: "cascade" }),
  tipoItem: text("tipo_item").notNull(),
  accionRegistradaId: uuid("accion_registrada_id").references(() => accionRegistrada.id),
  registroAsistenciaId: uuid("registro_asistencia_id").references(() => registroAsistencia.id),
  comunicadoCursoId: uuid("comunicado_curso_id").references(() => comunicadoCurso.id),
  textoLibre: text("texto_libre"),
  orden: smallint("orden").notNull().default(0),
}, (t) => [
  check("ck_item_tipo", enTuple("tipo_item", TIPO_ITEM_REPORTE)),
]);

export const entregaReporte = pgTable("entrega_reporte", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporteEstudianteId: uuid("reporte_estudiante_id").notNull()
    .references(() => reporteEstudiante.id, { onDelete: "cascade" }),
  representanteId: uuid("representante_id").notNull().references(() => representante.id),
  entregadoEn: timestamp("entregado_en", { withTimezone: true }),
  leidoEn: timestamp("leido_en", { withTimezone: true }),
}, (t) => [
  uniqueIndex("ux_entrega_reporte").on(t.reporteEstudianteId, t.representanteId),
]);

/**
 * E5: DIFERIDA A LA v2. La tabla existe para no migrar después, pero en el MVP
 * no hay endpoints ni pantallas que la usen.
 */
export const preguntaReporte = pgTable("pregunta_reporte", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporteEstudianteId: uuid("reporte_estudiante_id").notNull().references(() => reporteEstudiante.id),
  representanteId: uuid("representante_id").notNull().references(() => representante.id),
  mensaje: text("mensaje").notNull(),
  estado: text("estado").notNull().default("PENDIENTE"),
  respuesta: text("respuesta"),
  respondidaPorDocenteId: uuid("respondida_por_docente_id").references(() => docente.id),
  respondidaEn: timestamp("respondida_en", { withTimezone: true }),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_pregunta_reporte").on(t.reporteEstudianteId, t.representanteId),
  check("ck_pregunta_estado", enTuple("estado", ESTADO_PREGUNTA)),
]);
