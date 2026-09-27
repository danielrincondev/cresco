/**
 * Constantes de estado — fuente única de verdad.
 *
 * Restaurado desde `db/schema/enums.ts` del commit cf65f89, que se perdió en la
 * migración a Convex. Es TypeScript puro: no dependía de Drizzle ni de Postgres,
 * así que se copia tal cual. Los cambios respecto al original están marcados
 * con `NUEVO 2026-08-14` y vienen de la sesión de decisiones de producto.
 *
 * Cualquier cambio aquí requiere acuerdo de los tres: es superficie compartida.
 * Los validadores de `convex/schema.ts` deben reflejar exactamente estos valores.
 */

export const REGIMEN = ["SIERRA_AMAZONIA", "COSTA_INSULAR"] as const;
export const ESTADO_INSTITUCION = ["ACTIVA", "SUSPENDIDA", "INACTIVA"] as const;
export const TIPO_DOCUMENTO = ["CEDULA", "PASAPORTE", "SIN_DOCUMENTO"] as const;

export const ESTADO_ANIO_LECTIVO = ["PLANIFICADO", "EN_CURSO", "CERRADO"] as const;
export const ESTADO_PERIODO = ["PLANIFICADO", "EN_CURSO", "CERRADO"] as const;
export const JORNADA = ["MATUTINA", "VESPERTINA", "NOCTURNA"] as const;
export const ESTADO_CURSO = ["ACTIVO", "ARCHIVADO"] as const;
export const ROL_ASIGNACION = ["TITULAR", "COLABORADOR"] as const;

/** Origen del registro del estudiante (A1 + D1: ambos caminos) */
export const ORIGEN_ESTUDIANTE = ["REPRESENTANTE", "DOCENTE_CSV", "DOCENTE_MANUAL"] as const;
export const VERIFICACION_ESTUDIANTE = ["PENDIENTE", "APROBADO", "RECHAZADO"] as const;
export const ESTADO_ESTUDIANTE = ["ACTIVO", "RETIRADO", "FINALIZADO"] as const;
/** I1: estados del ciclo del estudiante dentro del curso */
export const ESTADO_MATRICULA = ["CURSANDO", "RETIRADA", "TRASLADADA", "FINALIZADA"] as const;

export const ESTADO_INVITACION = ["PENDIENTE", "AGOTADA", "EXPIRADA", "REVOCADA"] as const;
export const ESTADO_VINCULO = ["ACTIVO", "SUSPENDIDO", "REVOCADO"] as const;
export const PARENTESCO = [
  "MADRE", "PADRE", "ABUELO_A", "TIO_A", "HERMANO_A", "TUTOR_LEGAL", "OTRO",
] as const;

export const TIPO_CONSENTIMIENTO = [
  "TRATAMIENTO_DATOS_MENOR", "TERMINOS_USO", "POLITICA_PRIVACIDAD",
] as const;

/**
 * NUEVO 2026-08-14: eran tres (POSITIVA, NEGATIVA, NOTA). La "Nota" por
 * estudiante desapareció: su caso de uso lo absorbe `NOTA_PROFESOR` en
 * comunicados, que además puede dirigirse a un solo representante o al curso.
 */
export const SIGNO_ACCION = ["POSITIVA", "NEGATIVA"] as const;

/**
 * NUEVO 2026-08-14: `ANUNCIO` pasa a llamarse `NOTA_PROFESOR`. Son los dos
 * tipos bajo la sombrilla "Anuncios" que ve el representante.
 */
export const TIPO_COMUNICADO = ["NOTA_PROFESOR", "EVENTO"] as const;

/** NUEVO 2026-08-14: un comunicado puede ir al curso entero o a un representante */
export const ALCANCE_COMUNICADO = ["CURSO", "ESTUDIANTE"] as const;

/**
 * NUEVO 2026-08-14: se agrega DESHONESTIDAD (copiar, mentir para justificar
 * incumplimiento o mal comportamiento).
 *
 * Uso por signo, según la decisión del 14 de agosto:
 *   POSITIVA → DESEMPENIO · CONVIVENCIA · RESPONSABILIDAD · PUNTUALIDAD
 *   NEGATIVA → DISCIPLINA (indisciplina) · RESPONSABILIDAD (irresponsabilidad)
 *              · DESHONESTIDAD
 */
export const CODIGO_CATEGORIA = [
  "RESPONSABILIDAD", "DISCIPLINA", "CONVIVENCIA", "PUNTUALIDAD", "DESEMPENIO",
  "DESHONESTIDAD", "OTRO",
] as const;

/**
 * F4: MODIFICADA y ANULADA valen 0 puntos, pero se muestran distinto al
 * representante. Solo VIGENTE cuenta en el recálculo del puntaje.
 */
export const ESTADO_ACCION = ["VIGENTE", "ANULADA", "MODIFICADA"] as const;

export const ESTADO_ASISTENCIA = [
  "PRESENTE", "AUSENTE", "ATRASO", "JUSTIFICADA", "PERMISO",
] as const;

export const ESTADO_REPORTE_GENERAL = ["BORRADOR", "PUBLICADO", "ANULADO"] as const;
export const TIPO_CAMPO_REPORTE = ["TEXTO_CORTO", "TEXTO_LARGO", "LISTA"] as const;
export const TIPO_ITEM_REPORTE = [
  "ACCION", "NOTA", "ASISTENCIA", "COMUNICADO", "CITACION",
] as const;
export const ESTADO_PREGUNTA = ["PENDIENTE", "RESPONDIDA", "CERRADA"] as const; // v2

export const MOTIVO_INCONFORMIDAD = [
  "NO_OCURRIO", "CONTEXTO_INCOMPLETO", "SANCION_DESPROPORCIONADA", "SOLICITA_REUNION", "OTRO",
] as const;
export const ESTADO_INCONFORMIDAD = [
  "ABIERTA", "EN_REVISION", "RESUELTA_MANTENIDA", "RESUELTA_MODIFICADA",
  "RESUELTA_ANULADA", "VENCIDA",
] as const;

export const ESTADO_DISPONIBILIDAD = ["DISPONIBLE", "RESERVADO", "BLOQUEADO", "CANCELADO"] as const;
export const ESTADO_CITA = [
  "SOLICITADA", "CONFIRMADA", "RECHAZADA", "REPROGRAMADA", "CANCELADA", "ATENDIDA", "NO_ASISTIO",
] as const;
export const ORIGEN_CITA = ["SOLICITADA_POR_REPRESENTANTE", "CITACION_DOCENTE"] as const;
export const MODALIDAD = ["PRESENCIAL", "VIRTUAL", "TELEFONICA"] as const;

/** G2: la alerta puede ir a todo el curso o a un solo estudiante */
export const ALCANCE_ALERTA = ["CURSO", "ESTUDIANTE"] as const;
export const TIPO_ALERTA = [
  "EVACUACION", "SUSPENSION_CLASES", "ACCIDENTE", "RETIRO_ANTICIPADO", "SALUD", "SIMULACRO", "OTRO",
] as const;

export const AUDIENCIA_PLAN = ["REPRESENTANTE", "DOCENTE"] as const;
export const PERIODICIDAD = ["MENSUAL", "BIMESTRAL", "ANUAL", "PERPETUO"] as const;
export const ESTADO_SUSCRIPCION = [
  "ACTIVA", "EN_PERIODO_GRACIA", "VENCIDA", "CANCELADA", "REEMBOLSADA",
] as const;
export const ORIGEN_SUSCRIPCION = ["GOOGLE_PLAY", "PROMOCIONAL"] as const;

/** E6 / I2: desbloqueo temporal por ver un anuncio recompensado */
export const RECURSO_DESBLOQUEABLE = ["EXPORTAR_PDF_ACUMULADO"] as const;

/** NUEVO 2026-08-14: cerraba el pendiente 9 de CONTEXT.md, que nunca tuvo dominio */
export const PLATAFORMA = ["ANDROID", "IOS", "WEB"] as const;

export const TIPO_NOTIFICACION = [
  "REPORTE_DIARIO", "ACCION_NEGATIVA", "ACCION_POSITIVA", "NOTA_DOCENTE",
  "COMUNICADO", "CITACION", "RESPUESTA_INCONFORMIDAD", "ALERTA_EMERGENCIA",
  "RECORDATORIO_CITA", "ESTUDIANTE_APROBADO", "RESUMEN_SEMANAL", "SISTEMA",
] as const;

export const ACCION_AUDITORIA = [
  "CREAR", "ACTUALIZAR", "ANULAR", "APROBAR", "LEER_SENSIBLE", "EXPORTAR", "LOGIN", "ALERTA",
] as const;

// ---------------------------------------------------------------------------
// Tipos derivados
// ---------------------------------------------------------------------------
export type Regimen = (typeof REGIMEN)[number];
export type EstadoMatricula = (typeof ESTADO_MATRICULA)[number];
export type SignoAccion = (typeof SIGNO_ACCION)[number];
export type EstadoAccion = (typeof ESTADO_ACCION)[number];
export type TipoComunicado = (typeof TIPO_COMUNICADO)[number];
export type CodigoCategoria = (typeof CODIGO_CATEGORIA)[number];
export type EstadoInconformidad = (typeof ESTADO_INCONFORMIDAD)[number];
export type EstadoCita = (typeof ESTADO_CITA)[number];
export type EstadoSuscripcion = (typeof ESTADO_SUSCRIPCION)[number];
export type TipoNotificacion = (typeof TIPO_NOTIFICACION)[number];
export type AccionAuditoria = (typeof ACCION_AUDITORIA)[number];

// ---------------------------------------------------------------------------
// Reglas de negocio expresadas como constantes (C1, C2, C4, D4, F3)
// ---------------------------------------------------------------------------
export const REGLAS = {
  PUNTAJE_BASE: 60,
  PUNTAJE_MINIMO: 0,
  PUNTAJE_MAXIMO: 100,
  /** C4: tope de puntos que un estudiante puede ganar en un día */
  TOPE_DIARIO_POSITIVO: 4,
  /** C4: tope de puntos que un estudiante puede perder en un día */
  TOPE_DIARIO_NEGATIVO: 5,
  /** C2: rango de una acción positiva */
  POSITIVA_MIN: 1,
  POSITIVA_MAX: 2,
  /** C2: responsabilidad (irresponsabilidad) es fija en -1 */
  RESPONSABILIDAD_PUNTOS: -1,
  /** C2: disciplina y deshonestidad van de -1 a -3, a criterio del docente */
  DISCIPLINA_MIN: -3,
  DISCIPLINA_MAX: -1,
  /** D4: vigencia de la invitación al curso */
  INVITACION_DIAS_VIGENCIA: 30,
  /** F3: plazo del docente para responder una inconformidad */
  INCONFORMIDAD_DIAS_PLAZO: 30,
  /** F1: duración del bloque de cita */
  CITA_MINUTOS: 15,
  /** C2: el evento aparece en el reporte desde N días antes y hasta el día siguiente */
  EVENTO_DIAS_ANTICIPACION_MAX: 7,
  /** NUEVO 2026-08-14: duración configurable de una nota del profesor */
  NOTA_PROFESOR_DIAS_MIN: 1,
  NOTA_PROFESOR_DIAS_MAX: 7,
  /** E4: reportes anteriores visibles en plan gratuito */
  REPORTES_PREVIOS_FREE: 2,
  /** E4: reportes anteriores visibles en plan premium (una semana) */
  REPORTES_PREVIOS_PREMIUM: 7,
  /** H1: cursos activos por docente según plan */
  CURSOS_DOCENTE_FREE: 1,
  CURSOS_DOCENTE_PRO: 5,
  ESTUDIANTES_POR_CURSO_FREE: 40,
  ESTUDIANTES_POR_CURSO_PRO: 60,
  ZONA_HORARIA: "America/Guayaquil",
} as const;

/** Entitlements de RevenueCat. El de docente se decidió el 14 de agosto. */
export const ENTITLEMENTS = {
  REPRESENTANTE: "premium",
  DOCENTE: "docente_pro",
} as const;

/** Productos comprables. REP_FREE y DOC_FREE no son productos: son la ausencia. */
export const PRODUCTOS = {
  REP_PREMIUM_MENSUAL: "REP_PREMIUM_MENSUAL",
  REP_PREMIUM_BIMESTRAL: "REP_PREMIUM_BIMESTRAL",
  DOC_PRO: "DOC_PRO",
} as const;
