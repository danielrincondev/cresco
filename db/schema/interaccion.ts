/**
 * MÓDULO INTERACCIÓN, MONETIZACIÓN E INFRAESTRUCTURA — Persona C
 * Citas, inconformidades, alertas, suscripciones y tablas transversales.
 */

import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, smallint, boolean, timestamp, date, time, jsonb,
  index, uniqueIndex, check, bigserial, inet,
} from "drizzle-orm/pg-core";
import { institucion, curso, docente, representante, estudiante } from "./nucleo";
import { accionRegistrada } from "./conducta";
import {
  ESTADO_DISPONIBILIDAD, ESTADO_CITA, ORIGEN_CITA, MODALIDAD,
  MOTIVO_INCONFORMIDAD, ESTADO_INCONFORMIDAD, ALCANCE_ALERTA, TIPO_ALERTA,
  AUDIENCIA_PLAN, PERIODICIDAD, ESTADO_SUSCRIPCION, ORIGEN_SUSCRIPCION,
  RECURSO_DESBLOQUEABLE, TIPO_NOTIFICACION, ACCION_AUDITORIA,
} from "./enums";

const enTuple = (col: string, valores: readonly string[]) =>
  sql.raw(`${col} IN (${valores.map((v) => `'${v}'`).join(", ")})`);

const auditoriaCols = {
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// CITAS
// F1: el docente publica su horario y el sistema lo parte en bloques de 15 min.
// F2: la reserva nace SOLICITADA y requiere confirmación del docente.
// ---------------------------------------------------------------------------
export const disponibilidadDocente = pgTable("disponibilidad_docente", {
  id: uuid("id").primaryKey().defaultRandom(),
  docenteId: uuid("docente_id").notNull().references(() => docente.id),
  cursoId: uuid("curso_id").references(() => curso.id),
  fecha: date("fecha").notNull(),
  horaInicio: time("hora_inicio").notNull(),
  horaFin: time("hora_fin").notNull(),
  modalidad: text("modalidad").notNull().default("PRESENCIAL"),
  lugarOEnlace: text("lugar_o_enlace"),
  estado: text("estado").notNull().default("DISPONIBLE"),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_disponibilidad").on(t.docenteId, t.fecha, t.horaInicio),
  index("ix_disponibilidad_libre").on(t.docenteId, t.fecha).where(sql`estado = 'DISPONIBLE'`),
  check("ck_disponibilidad_estado", enTuple("estado", ESTADO_DISPONIBILIDAD)),
  check("ck_disponibilidad_modalidad", enTuple("modalidad", MODALIDAD)),
  check("ck_disponibilidad_horas", sql`${t.horaFin} > ${t.horaInicio}`),
]);

export const cita = pgTable("cita", {
  id: uuid("id").primaryKey().defaultRandom(),
  disponibilidadDocenteId: uuid("disponibilidad_docente_id").references(() => disponibilidadDocente.id),
  docenteId: uuid("docente_id").notNull().references(() => docente.id),
  representanteId: uuid("representante_id").notNull().references(() => representante.id),
  estudianteId: uuid("estudiante_id").notNull().references(() => estudiante.id),
  origen: text("origen").notNull(),
  motivo: text("motivo"),
  fechaHoraInicio: timestamp("fecha_hora_inicio", { withTimezone: true }).notNull(),
  fechaHoraFin: timestamp("fecha_hora_fin", { withTimezone: true }).notNull(),
  modalidad: text("modalidad").notNull().default("PRESENCIAL"),
  estado: text("estado").notNull().default("SOLICITADA"),
  notasDocente: text("notas_docente"),
  ...auditoriaCols,
}, (t) => [
  index("ix_cita_representante").on(t.representanteId, t.fechaHoraInicio),
  index("ix_cita_docente").on(t.docenteId, t.fechaHoraInicio),
  // Un bloque publicado no admite dos reservas vivas
  uniqueIndex("ux_cita_bloque_vivo").on(t.disponibilidadDocenteId)
    .where(sql`estado IN ('SOLICITADA', 'CONFIRMADA')`),
  check("ck_cita_origen", enTuple("origen", ORIGEN_CITA)),
  check("ck_cita_estado", enTuple("estado", ESTADO_CITA)),
  check("ck_cita_modalidad", enTuple("modalidad", MODALIDAD)),
  check("ck_cita_horas", sql`${t.fechaHoraFin} > ${t.fechaHoraInicio}`),
]);

// ---------------------------------------------------------------------------
// INCONFORMIDADES
// F3: el docente tiene 30 días. Vencido el plazo, la inconformidad pasa a
// VENCIDA por tarea programada y sube de prioridad en la bandeja.
// F4: RESUELTA_MODIFICADA lleva la acción a 0 puntos y recupera el puntaje.
// ---------------------------------------------------------------------------
export const inconformidad = pgTable("inconformidad", {
  id: uuid("id").primaryKey().defaultRandom(),
  accionRegistradaId: uuid("accion_registrada_id").notNull().references(() => accionRegistrada.id),
  representanteId: uuid("representante_id").notNull().references(() => representante.id),
  motivo: text("motivo").notNull(),
  mensaje: text("mensaje").notNull(),
  estado: text("estado").notNull().default("ABIERTA"),
  respuestaDocente: text("respuesta_docente"),
  resueltaPorDocenteId: uuid("resuelta_por_docente_id").references(() => docente.id),
  resueltaEn: timestamp("resuelta_en", { withTimezone: true }),
  venceEn: timestamp("vence_en", { withTimezone: true }).notNull(),
  citaId: uuid("cita_id").references(() => cita.id),
  ...auditoriaCols,
}, (t) => [
  uniqueIndex("ux_inconformidad").on(t.accionRegistradaId, t.representanteId),
  index("ix_inconformidad_abierta").on(t.venceEn).where(sql`estado IN ('ABIERTA', 'EN_REVISION')`),
  check("ck_inconformidad_motivo", enTuple("motivo", MOTIVO_INCONFORMIDAD)),
  check("ck_inconformidad_estado", enTuple("estado", ESTADO_INCONFORMIDAD)),
  check("ck_inconformidad_resolucion", sql`
    estado NOT IN ('RESUELTA_MANTENIDA', 'RESUELTA_MODIFICADA', 'RESUELTA_ANULADA')
    OR (${t.respuestaDocente} IS NOT NULL AND ${t.resueltaEn} IS NOT NULL)`),
]);

// ---------------------------------------------------------------------------
// ALERTAS DE EMERGENCIA
// G1: el docente debe reautenticarse (volver a escribir su contraseña) antes de
//     activar. `reautenticadoEn` deja constancia de que ese paso ocurrió.
// G2: alcance CURSO (todos los representantes) o ESTUDIANTE (uno solo).
// G3: se pide confirmación de lectura al representante.
// ---------------------------------------------------------------------------
export const alertaEmergencia = pgTable("alerta_emergencia", {
  id: uuid("id").primaryKey().defaultRandom(),
  institucionId: uuid("institucion_id").notNull().references(() => institucion.id),
  cursoId: uuid("curso_id").notNull().references(() => curso.id),
  alcance: text("alcance").notNull(),
  estudianteId: uuid("estudiante_id").references(() => estudiante.id),
  activadaPorDocenteId: uuid("activada_por_docente_id").notNull().references(() => docente.id),
  tipo: text("tipo").notNull(),
  titulo: text("titulo").notNull(),
  mensaje: text("mensaje").notNull(),
  esSimulacro: boolean("es_simulacro").notNull().default(false),
  reautenticadoEn: timestamp("reautenticado_en", { withTimezone: true }).notNull(),
  activadaEn: timestamp("activada_en", { withTimezone: true }).notNull().defaultNow(),
  finalizadaEn: timestamp("finalizada_en", { withTimezone: true }),
}, (t) => [
  index("ix_alerta_curso").on(t.cursoId, t.activadaEn),
  check("ck_alerta_alcance", enTuple("alcance", ALCANCE_ALERTA)),
  check("ck_alerta_tipo", enTuple("tipo", TIPO_ALERTA)),
  check("ck_alerta_estudiante", sql`
    (alcance = 'CURSO' AND ${t.estudianteId} IS NULL)
    OR (alcance = 'ESTUDIANTE' AND ${t.estudianteId} IS NOT NULL)`),
]);

export const entregaAlerta = pgTable("entrega_alerta", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertaEmergenciaId: uuid("alerta_emergencia_id").notNull()
    .references(() => alertaEmergencia.id, { onDelete: "cascade" }),
  representanteId: uuid("representante_id").notNull().references(() => representante.id),
  estudianteId: uuid("estudiante_id").notNull().references(() => estudiante.id),
  enviadoEn: timestamp("enviado_en", { withTimezone: true }),
  leidoEn: timestamp("leido_en", { withTimezone: true }),
  confirmadoEn: timestamp("confirmado_en", { withTimezone: true }),
}, (t) => [
  uniqueIndex("ux_entrega_alerta").on(t.alertaEmergenciaId, t.representanteId, t.estudianteId),
]);

// ---------------------------------------------------------------------------
// MONETIZACIÓN
// H1: premium del representante por cuenta (cubre a todos sus hijos).
//     El docente tiene límites que empujan a la compra.
// H3: "por parcial" se mapea a una suscripción bimestral de Google Play.
// ---------------------------------------------------------------------------
export const plan = pgTable("plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  audiencia: text("audiencia").notNull(),
  entitlementRevenuecat: text("entitlement_revenuecat"),
  productoGooglePlay: text("producto_google_play"),
  periodicidad: text("periodicidad").notNull().default("PERPETUO"),
  sinPublicidad: boolean("sin_publicidad").notNull().default(false),
  /** Límites del plan. Cambiar un límite es un UPDATE, no un despliegue. */
  limites: jsonb("limites").notNull().default(sql`'{}'::jsonb`),
  activo: boolean("activo").notNull().default(true),
  ...auditoriaCols,
}, (t) => [
  check("ck_plan_audiencia", enTuple("audiencia", AUDIENCIA_PLAN)),
  check("ck_plan_periodicidad", enTuple("periodicidad", PERIODICIDAD)),
]);

/** Proyección local del estado de RevenueCat, que es la fuente de verdad. */
export const suscripcion = pgTable("suscripcion", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  planId: uuid("plan_id").notNull().references(() => plan.id),
  revenuecatAppUserId: text("revenuecat_app_user_id"),
  origen: text("origen").notNull().default("GOOGLE_PLAY"),
  estado: text("estado").notNull(),
  iniciaEn: timestamp("inicia_en", { withTimezone: true }).notNull(),
  expiraEn: timestamp("expira_en", { withTimezone: true }),
  renovacionAutomatica: boolean("renovacion_automatica").notNull().default(true),
  ...auditoriaCols,
}, (t) => [
  index("ix_suscripcion_activa").on(t.userId).where(sql`estado = 'ACTIVA'`),
  check("ck_suscripcion_estado", enTuple("estado", ESTADO_SUSCRIPCION)),
  check("ck_suscripcion_origen", enTuple("origen", ORIGEN_SUSCRIPCION)),
]);

/** Idempotencia del webhook: un reenvío no puede duplicar la suscripción. */
export const eventoRevenuecat = pgTable("evento_revenuecat", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventoIdExterno: text("evento_id_externo").notNull().unique(),
  tipoEvento: text("tipo_evento").notNull(),
  revenuecatAppUserId: text("revenuecat_app_user_id"),
  suscripcionId: uuid("suscripcion_id").references(() => suscripcion.id),
  payload: jsonb("payload").notNull(),
  recibidoEn: timestamp("recibido_en", { withTimezone: true }).notNull().defaultNow(),
  procesadoEn: timestamp("procesado_en", { withTimezone: true }),
  errorProcesamiento: text("error_procesamiento"),
});

/**
 * E6 / I2: el plan gratuito puede exportar el reporte acumulado a PDF viendo un
 * anuncio recompensado. Esto registra el desbloqueo temporal.
 */
export const desbloqueoRecompensado = pgTable("desbloqueo_recompensado", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  recurso: text("recurso").notNull(),
  otorgadoEn: timestamp("otorgado_en", { withTimezone: true }).notNull().defaultNow(),
  expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
  consumidoEn: timestamp("consumido_en", { withTimezone: true }),
}, (t) => [
  index("ix_desbloqueo_vigente").on(t.userId, t.recurso),
  check("ck_desbloqueo_recurso", enTuple("recurso", RECURSO_DESBLOQUEABLE)),
]);

// ---------------------------------------------------------------------------
// TRANSVERSALES
// ---------------------------------------------------------------------------
export const dispositivo = pgTable("dispositivo", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  tokenPush: text("token_push").notNull().unique(),
  plataforma: text("plataforma").notNull().default("ANDROID"),
  versionApp: text("version_app"),
  activo: boolean("activo").notNull().default(true),
  ...auditoriaCols,
});

export const notificacion = pgTable("notificacion", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  tipo: text("tipo").notNull(),
  titulo: text("titulo").notNull(),
  cuerpo: text("cuerpo").notNull(),
  entidadTipo: text("entidad_tipo"),
  entidadId: uuid("entidad_id"),
  enviadaEn: timestamp("enviada_en", { withTimezone: true }),
  leidaEn: timestamp("leida_en", { withTimezone: true }),
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ix_notificacion_usuario").on(t.userId, t.creadoEn),
  check("ck_notificacion_tipo", enTuple("tipo", TIPO_NOTIFICACION)),
]);

/** Registro de operaciones sobre datos de menores. No se sincroniza al cliente. */
export const auditoria = pgTable("auditoria", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id"),
  institucionId: uuid("institucion_id").references(() => institucion.id),
  accion: text("accion").notNull(),
  entidadTipo: text("entidad_tipo").notNull(),
  entidadId: uuid("entidad_id"),
  datosAntes: jsonb("datos_antes"),
  datosDespues: jsonb("datos_despues"),
  ipOrigen: inet("ip_origen"),
  ocurridoEn: timestamp("ocurrido_en", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ix_auditoria_entidad").on(t.entidadTipo, t.entidadId, t.ocurridoEn),
  check("ck_auditoria_accion", enTuple("accion", ACCION_AUDITORIA)),
]);
