CREATE TABLE "anio_lectivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institucion_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"estado" text DEFAULT 'PLANIFICADO' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_anio_estado" CHECK (estado IN ('PLANIFICADO', 'EN_CURSO', 'CERRADO')),
	CONSTRAINT "ck_anio_fechas" CHECK ("anio_lectivo"."fecha_fin" > "anio_lectivo"."fecha_inicio")
);
--> statement-breakpoint
CREATE TABLE "asignacion_docente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_id" uuid NOT NULL,
	"docente_id" uuid NOT NULL,
	"rol" text DEFAULT 'TITULAR' NOT NULL,
	"area" text,
	"vigente_desde" date NOT NULL,
	"vigente_hasta" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_asignacion_rol" CHECK (rol IN ('TITULAR', 'COLABORADOR'))
);
--> statement-breakpoint
CREATE TABLE "consentimiento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"estudiante_id" uuid,
	"tipo" text NOT NULL,
	"version_documento" text NOT NULL,
	"otorgado" boolean NOT NULL,
	"otorgado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"revocado_en" timestamp with time zone,
	CONSTRAINT "ck_consentimiento_tipo" CHECK (tipo IN ('TRATAMIENTO_DATOS_MENOR', 'TERMINOS_USO', 'POLITICA_PRIVACIDAD'))
);
--> statement-breakpoint
CREATE TABLE "curso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anio_lectivo_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"nivel" text NOT NULL,
	"paralelo" text NOT NULL,
	"jornada" text DEFAULT 'MATUTINA' NOT NULL,
	"aula" text,
	"estado" text DEFAULT 'ACTIVO' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_curso_jornada" CHECK (jornada IN ('MATUTINA', 'VESPERTINA', 'NOCTURNA')),
	CONSTRAINT "ck_curso_estado" CHECK (estado IN ('ACTIVO', 'ARCHIVADO'))
);
--> statement-breakpoint
CREATE TABLE "dia_no_lectivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anio_lectivo_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"motivo" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "docente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"titulo_profesional" text,
	"correo_contacto" text,
	"telefono_contacto" text,
	"horario_atencion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "docente_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "estudiante" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institucion_id" uuid NOT NULL,
	"tipo_documento" text DEFAULT 'CEDULA' NOT NULL,
	"numero_documento" text NOT NULL,
	"nombres" text NOT NULL,
	"apellidos" text NOT NULL,
	"fecha_nacimiento" date,
	"origen_registro" text NOT NULL,
	"estado_verificacion" text DEFAULT 'PENDIENTE' NOT NULL,
	"aprobado_por_docente_id" uuid,
	"aprobado_en" timestamp with time zone,
	"motivo_rechazo" text,
	"estado" text DEFAULT 'ACTIVO' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_estudiante_origen" CHECK (origen_registro IN ('REPRESENTANTE', 'DOCENTE_CSV', 'DOCENTE_MANUAL')),
	CONSTRAINT "ck_estudiante_verificacion" CHECK (estado_verificacion IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
	CONSTRAINT "ck_estudiante_estado" CHECK (estado IN ('ACTIVO', 'RETIRADO', 'FINALIZADO'))
);
--> statement-breakpoint
CREATE TABLE "institucion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"nombre_declarado" text NOT NULL,
	"verificada" boolean DEFAULT false NOT NULL,
	"codigo_amie" text,
	"regimen" text DEFAULT 'COSTA_INSULAR' NOT NULL,
	"ciudad" text DEFAULT 'Guayaquil' NOT NULL,
	"zona_horaria" text DEFAULT 'America/Guayaquil' NOT NULL,
	"puntaje_base" smallint DEFAULT 60 NOT NULL,
	"puntaje_minimo" smallint DEFAULT 0 NOT NULL,
	"puntaje_maximo" smallint DEFAULT 100 NOT NULL,
	"tope_diario_positivo" smallint DEFAULT 4 NOT NULL,
	"tope_diario_negativo" smallint DEFAULT 5 NOT NULL,
	"estado" text DEFAULT 'ACTIVA' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institucion_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "ck_institucion_regimen" CHECK (regimen IN ('SIERRA_AMAZONIA', 'COSTA_INSULAR')),
	CONSTRAINT "ck_institucion_estado" CHECK (estado IN ('ACTIVA', 'SUSPENDIDA', 'INACTIVA')),
	CONSTRAINT "ck_institucion_rango" CHECK ("institucion"."puntaje_minimo" < "institucion"."puntaje_base" AND "institucion"."puntaje_base" < "institucion"."puntaje_maximo")
);
--> statement-breakpoint
CREATE TABLE "invitacion_curso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_id" uuid NOT NULL,
	"emitida_por_docente_id" uuid NOT NULL,
	"token" text NOT NULL,
	"codigo_corto" text NOT NULL,
	"usos_maximos" smallint,
	"usos_realizados" smallint DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'PENDIENTE' NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitacion_curso_token_unique" UNIQUE("token"),
	CONSTRAINT "ck_invitacion_estado" CHECK (estado IN ('PENDIENTE', 'AGOTADA', 'EXPIRADA', 'REVOCADA'))
);
--> statement-breakpoint
CREATE TABLE "matricula" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estudiante_id" uuid NOT NULL,
	"curso_id" uuid NOT NULL,
	"numero_lista" smallint,
	"fecha_ingreso" date NOT NULL,
	"fecha_salida" date,
	"estado" text DEFAULT 'CURSANDO' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_matricula_estado" CHECK (estado IN ('CURSANDO', 'RETIRADA', 'TRASLADADA', 'FINALIZADA'))
);
--> statement-breakpoint
CREATE TABLE "perfil_usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tipo_documento" text DEFAULT 'CEDULA' NOT NULL,
	"numero_documento" text NOT NULL,
	"telefono" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfil_usuario_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "ck_perfil_tipo_doc" CHECK (tipo_documento IN ('CEDULA', 'PASAPORTE', 'SIN_DOCUMENTO'))
);
--> statement-breakpoint
CREATE TABLE "periodo_academico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anio_lectivo_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"orden" smallint NOT NULL,
	"fecha_inicio" date NOT NULL,
	"fecha_fin" date NOT NULL,
	"estado" text DEFAULT 'PLANIFICADO' NOT NULL,
	"cerrado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_periodo_estado" CHECK (estado IN ('PLANIFICADO', 'EN_CURSO', 'CERRADO')),
	CONSTRAINT "ck_periodo_fechas" CHECK ("periodo_academico"."fecha_fin" > "periodo_academico"."fecha_inicio")
);
--> statement-breakpoint
CREATE TABLE "representante" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ocupacion" text,
	"direccion" text,
	"telefono_alterno" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "representante_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "vinculo_representacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"representante_id" uuid NOT NULL,
	"estudiante_id" uuid NOT NULL,
	"parentesco" text NOT NULL,
	"invitacion_curso_id" uuid,
	"estado" text DEFAULT 'ACTIVO' NOT NULL,
	"vigente_desde" date NOT NULL,
	"vigente_hasta" date,
	"motivo_revocacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_vinculo_parentesco" CHECK (parentesco IN ('MADRE', 'PADRE', 'ABUELO_A', 'TIO_A', 'HERMANO_A', 'TUTOR_LEGAL', 'OTRO')),
	CONSTRAINT "ck_vinculo_estado" CHECK (estado IN ('ACTIVO', 'SUSPENDIDO', 'REVOCADO'))
);
--> statement-breakpoint
CREATE TABLE "accion_registrada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricula_id" uuid NOT NULL,
	"periodo_academico_id" uuid NOT NULL,
	"tipo_accion_id" uuid NOT NULL,
	"categoria_accion_id" uuid NOT NULL,
	"signo" text NOT NULL,
	"puntos_aplicados" smallint NOT NULL,
	"cuenta_en_bitacora" boolean DEFAULT true NOT NULL,
	"descripcion" text,
	"fecha_ocurrencia" date NOT NULL,
	"registrada_por_docente_id" uuid NOT NULL,
	"estado" text DEFAULT 'VIGENTE' NOT NULL,
	"resuelta_por_docente_id" uuid,
	"resuelta_en" timestamp with time zone,
	"motivo_resolucion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_accion_signo" CHECK (signo IN ('POSITIVA', 'NEGATIVA', 'NOTA')),
	CONSTRAINT "ck_accion_estado" CHECK (estado IN ('VIGENTE', 'ANULADA', 'MODIFICADA')),
	CONSTRAINT "ck_accion_nota_cero" CHECK (signo <> 'NOTA' OR "accion_registrada"."puntos_aplicados" = 0),
	CONSTRAINT "ck_accion_resolucion" CHECK (
    estado = 'VIGENTE'
    OR ("accion_registrada"."resuelta_en" IS NOT NULL AND "accion_registrada"."motivo_resolucion" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "categoria_accion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institucion_id" uuid,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"aplica_a" text DEFAULT 'AMBAS' NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ux_categoria" UNIQUE NULLS NOT DISTINCT("institucion_id","codigo"),
	CONSTRAINT "ck_categoria_codigo" CHECK (codigo IN ('RESPONSABILIDAD', 'DISCIPLINA', 'CONVIVENCIA', 'PUNTUALIDAD', 'DESEMPENIO', 'OTRO'))
);
--> statement-breakpoint
CREATE TABLE "comunicado_curso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_id" uuid NOT NULL,
	"periodo_academico_id" uuid,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"contenido" text NOT NULL,
	"fecha_evento" date,
	"hora_evento" text,
	"visible_desde" date NOT NULL,
	"visible_hasta" date NOT NULL,
	"creado_por_docente_id" uuid NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_comunicado_tipo" CHECK (tipo IN ('ANUNCIO', 'EVENTO')),
	CONSTRAINT "ck_comunicado_evento_fecha" CHECK (tipo <> 'EVENTO' OR "comunicado_curso"."fecha_evento" IS NOT NULL),
	CONSTRAINT "ck_comunicado_ventana" CHECK ("comunicado_curso"."visible_hasta" >= "comunicado_curso"."visible_desde")
);
--> statement-breakpoint
CREATE TABLE "entrega_reporte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporte_estudiante_id" uuid NOT NULL,
	"representante_id" uuid NOT NULL,
	"entregado_en" timestamp with time zone,
	"leido_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "franja_conducta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institucion_id" uuid,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"puntaje_desde" smallint NOT NULL,
	"puntaje_hasta" smallint NOT NULL,
	"frase_representante" text NOT NULL,
	"color_hex" text,
	"orden" smallint DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ux_franja" UNIQUE NULLS NOT DISTINCT("institucion_id","codigo"),
	CONSTRAINT "ck_franja_rango" CHECK ("franja_conducta"."puntaje_desde" <= "franja_conducta"."puntaje_hasta")
);
--> statement-breakpoint
CREATE TABLE "plantilla_campo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plantilla_reporte_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"etiqueta" text NOT NULL,
	"tipo_dato" text DEFAULT 'TEXTO_LARGO' NOT NULL,
	"texto_ayuda" text,
	"longitud_maxima" smallint,
	"orden" smallint DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ck_campo_tipo" CHECK (tipo_dato IN ('TEXTO_CORTO', 'TEXTO_LARGO', 'LISTA'))
);
--> statement-breakpoint
CREATE TABLE "plantilla_reporte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institucion_id" uuid,
	"nombre" text NOT NULL,
	"version" smallint DEFAULT 1 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pregunta_reporte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporte_estudiante_id" uuid NOT NULL,
	"representante_id" uuid NOT NULL,
	"mensaje" text NOT NULL,
	"estado" text DEFAULT 'PENDIENTE' NOT NULL,
	"respuesta" text,
	"respondida_por_docente_id" uuid,
	"respondida_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_pregunta_estado" CHECK (estado IN ('PENDIENTE', 'RESPONDIDA', 'CERRADA'))
);
--> statement-breakpoint
CREATE TABLE "puntaje_periodo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricula_id" uuid NOT NULL,
	"periodo_academico_id" uuid NOT NULL,
	"puntaje_base" smallint NOT NULL,
	"puntos_positivos" smallint DEFAULT 0 NOT NULL,
	"puntos_negativos" smallint DEFAULT 0 NOT NULL,
	"puntaje_actual" smallint NOT NULL,
	"franja_conducta_id" uuid,
	"congelado" boolean DEFAULT false NOT NULL,
	"recalculado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registro_asistencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricula_id" uuid NOT NULL,
	"periodo_academico_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"estado" text NOT NULL,
	"observacion" text,
	"registrado_por_docente_id" uuid NOT NULL,
	"justificada_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_asistencia_estado" CHECK (estado IN ('PRESENTE', 'AUSENTE', 'ATRASO', 'JUSTIFICADA', 'PERMISO'))
);
--> statement-breakpoint
CREATE TABLE "reporte_estudiante" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matricula_id" uuid NOT NULL,
	"periodo_academico_id" uuid NOT NULL,
	"reporte_general_id" uuid,
	"fecha" date NOT NULL,
	"tiene_novedades" boolean DEFAULT false NOT NULL,
	"puntaje_al_cierre" smallint NOT NULL,
	"franja_conducta_id" uuid,
	"estado_asistencia" text,
	"generado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporte_estudiante_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporte_estudiante_id" uuid NOT NULL,
	"tipo_item" text NOT NULL,
	"accion_registrada_id" uuid,
	"registro_asistencia_id" uuid,
	"comunicado_curso_id" uuid,
	"texto_libre" text,
	"orden" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "ck_item_tipo" CHECK (tipo_item IN ('ACCION', 'NOTA', 'ASISTENCIA', 'COMUNICADO', 'CITACION'))
);
--> statement-breakpoint
CREATE TABLE "reporte_general" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curso_id" uuid NOT NULL,
	"periodo_academico_id" uuid NOT NULL,
	"plantilla_reporte_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"estado" text DEFAULT 'BORRADOR' NOT NULL,
	"publicado_en" timestamp with time zone,
	"publicado_por_docente_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_reporte_general_estado" CHECK (estado IN ('BORRADOR', 'PUBLICADO', 'ANULADO')),
	CONSTRAINT "ck_reporte_general_publicado" CHECK (estado <> 'PUBLICADO' OR "reporte_general"."publicado_en" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "reporte_general_valor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporte_general_id" uuid NOT NULL,
	"plantilla_campo_id" uuid NOT NULL,
	"valor_texto" text
);
--> statement-breakpoint
CREATE TABLE "tipo_accion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institucion_id" uuid,
	"categoria_accion_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"signo" text NOT NULL,
	"puntos_defecto" smallint NOT NULL,
	"puntos_min" smallint NOT NULL,
	"puntos_max" smallint NOT NULL,
	"requiere_descripcion" boolean DEFAULT false NOT NULL,
	"admite_inconformidad" boolean DEFAULT false NOT NULL,
	"cuenta_en_bitacora" boolean DEFAULT true NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ux_tipo_accion" UNIQUE NULLS NOT DISTINCT("institucion_id","codigo"),
	CONSTRAINT "ck_tipo_signo" CHECK (signo IN ('POSITIVA', 'NEGATIVA', 'NOTA')),
	CONSTRAINT "ck_tipo_rango" CHECK ("tipo_accion"."puntos_min" <= "tipo_accion"."puntos_defecto" AND "tipo_accion"."puntos_defecto" <= "tipo_accion"."puntos_max"),
	CONSTRAINT "ck_tipo_signo_coherente" CHECK (
    (signo = 'POSITIVA' AND "tipo_accion"."puntos_min" >= 1)
    OR (signo = 'NEGATIVA' AND "tipo_accion"."puntos_max" <= -1)
    OR (signo = 'NOTA' AND "tipo_accion"."puntos_min" = 0 AND "tipo_accion"."puntos_max" = 0))
);
--> statement-breakpoint
CREATE TABLE "alerta_emergencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institucion_id" uuid NOT NULL,
	"curso_id" uuid NOT NULL,
	"alcance" text NOT NULL,
	"estudiante_id" uuid,
	"activada_por_docente_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"mensaje" text NOT NULL,
	"es_simulacro" boolean DEFAULT false NOT NULL,
	"reautenticado_en" timestamp with time zone NOT NULL,
	"activada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizada_en" timestamp with time zone,
	CONSTRAINT "ck_alerta_alcance" CHECK (alcance IN ('CURSO', 'ESTUDIANTE')),
	CONSTRAINT "ck_alerta_tipo" CHECK (tipo IN ('EVACUACION', 'SUSPENSION_CLASES', 'ACCIDENTE', 'RETIRO_ANTICIPADO', 'SALUD', 'SIMULACRO', 'OTRO')),
	CONSTRAINT "ck_alerta_estudiante" CHECK (
    (alcance = 'CURSO' AND "alerta_emergencia"."estudiante_id" IS NULL)
    OR (alcance = 'ESTUDIANTE' AND "alerta_emergencia"."estudiante_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text,
	"institucion_id" uuid,
	"accion" text NOT NULL,
	"entidad_tipo" text NOT NULL,
	"entidad_id" uuid,
	"datos_antes" jsonb,
	"datos_despues" jsonb,
	"ip_origen" "inet",
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_auditoria_accion" CHECK (accion IN ('CREAR', 'ACTUALIZAR', 'ANULAR', 'APROBAR', 'LEER_SENSIBLE', 'EXPORTAR', 'LOGIN', 'ALERTA'))
);
--> statement-breakpoint
CREATE TABLE "cita" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disponibilidad_docente_id" uuid,
	"docente_id" uuid NOT NULL,
	"representante_id" uuid NOT NULL,
	"estudiante_id" uuid NOT NULL,
	"origen" text NOT NULL,
	"motivo" text,
	"fecha_hora_inicio" timestamp with time zone NOT NULL,
	"fecha_hora_fin" timestamp with time zone NOT NULL,
	"modalidad" text DEFAULT 'PRESENCIAL' NOT NULL,
	"estado" text DEFAULT 'SOLICITADA' NOT NULL,
	"notas_docente" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_cita_origen" CHECK (origen IN ('SOLICITADA_POR_REPRESENTANTE', 'CITACION_DOCENTE')),
	CONSTRAINT "ck_cita_estado" CHECK (estado IN ('SOLICITADA', 'CONFIRMADA', 'RECHAZADA', 'REPROGRAMADA', 'CANCELADA', 'ATENDIDA', 'NO_ASISTIO')),
	CONSTRAINT "ck_cita_modalidad" CHECK (modalidad IN ('PRESENCIAL', 'VIRTUAL', 'TELEFONICA')),
	CONSTRAINT "ck_cita_horas" CHECK ("cita"."fecha_hora_fin" > "cita"."fecha_hora_inicio")
);
--> statement-breakpoint
CREATE TABLE "desbloqueo_recompensado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recurso" text NOT NULL,
	"otorgado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"consumido_en" timestamp with time zone,
	CONSTRAINT "ck_desbloqueo_recurso" CHECK (recurso IN ('EXPORTAR_PDF_ACUMULADO'))
);
--> statement-breakpoint
CREATE TABLE "disponibilidad_docente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"docente_id" uuid NOT NULL,
	"curso_id" uuid,
	"fecha" date NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fin" time NOT NULL,
	"modalidad" text DEFAULT 'PRESENCIAL' NOT NULL,
	"lugar_o_enlace" text,
	"estado" text DEFAULT 'DISPONIBLE' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_disponibilidad_estado" CHECK (estado IN ('DISPONIBLE', 'RESERVADO', 'BLOQUEADO', 'CANCELADO')),
	CONSTRAINT "ck_disponibilidad_modalidad" CHECK (modalidad IN ('PRESENCIAL', 'VIRTUAL', 'TELEFONICA')),
	CONSTRAINT "ck_disponibilidad_horas" CHECK ("disponibilidad_docente"."hora_fin" > "disponibilidad_docente"."hora_inicio")
);
--> statement-breakpoint
CREATE TABLE "dispositivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token_push" text NOT NULL,
	"plataforma" text DEFAULT 'ANDROID' NOT NULL,
	"version_app" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispositivo_token_push_unique" UNIQUE("token_push")
);
--> statement-breakpoint
CREATE TABLE "entrega_alerta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alerta_emergencia_id" uuid NOT NULL,
	"representante_id" uuid NOT NULL,
	"estudiante_id" uuid NOT NULL,
	"enviado_en" timestamp with time zone,
	"leido_en" timestamp with time zone,
	"confirmado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evento_revenuecat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evento_id_externo" text NOT NULL,
	"tipo_evento" text NOT NULL,
	"revenuecat_app_user_id" text,
	"suscripcion_id" uuid,
	"payload" jsonb NOT NULL,
	"recibido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"procesado_en" timestamp with time zone,
	"error_procesamiento" text,
	CONSTRAINT "evento_revenuecat_evento_id_externo_unique" UNIQUE("evento_id_externo")
);
--> statement-breakpoint
CREATE TABLE "inconformidad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accion_registrada_id" uuid NOT NULL,
	"representante_id" uuid NOT NULL,
	"motivo" text NOT NULL,
	"mensaje" text NOT NULL,
	"estado" text DEFAULT 'ABIERTA' NOT NULL,
	"respuesta_docente" text,
	"resuelta_por_docente_id" uuid,
	"resuelta_en" timestamp with time zone,
	"vence_en" timestamp with time zone NOT NULL,
	"cita_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_inconformidad_motivo" CHECK (motivo IN ('NO_OCURRIO', 'CONTEXTO_INCOMPLETO', 'SANCION_DESPROPORCIONADA', 'SOLICITA_REUNION', 'OTRO')),
	CONSTRAINT "ck_inconformidad_estado" CHECK (estado IN ('ABIERTA', 'EN_REVISION', 'RESUELTA_MANTENIDA', 'RESUELTA_MODIFICADA', 'RESUELTA_ANULADA', 'VENCIDA')),
	CONSTRAINT "ck_inconformidad_resolucion" CHECK (
    estado NOT IN ('RESUELTA_MANTENIDA', 'RESUELTA_MODIFICADA', 'RESUELTA_ANULADA')
    OR ("inconformidad"."respuesta_docente" IS NOT NULL AND "inconformidad"."resuelta_en" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "notificacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"cuerpo" text NOT NULL,
	"entidad_tipo" text,
	"entidad_id" uuid,
	"enviada_en" timestamp with time zone,
	"leida_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_notificacion_tipo" CHECK (tipo IN ('REPORTE_DIARIO', 'ACCION_NEGATIVA', 'ACCION_POSITIVA', 'NOTA_DOCENTE', 'COMUNICADO', 'CITACION', 'RESPUESTA_INCONFORMIDAD', 'ALERTA_EMERGENCIA', 'RECORDATORIO_CITA', 'ESTUDIANTE_APROBADO', 'SISTEMA'))
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"audiencia" text NOT NULL,
	"entitlement_revenuecat" text,
	"producto_google_play" text,
	"periodicidad" text DEFAULT 'PERPETUO' NOT NULL,
	"sin_publicidad" boolean DEFAULT false NOT NULL,
	"limites" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "ck_plan_audiencia" CHECK (audiencia IN ('REPRESENTANTE', 'DOCENTE')),
	CONSTRAINT "ck_plan_periodicidad" CHECK (periodicidad IN ('MENSUAL', 'BIMESTRAL', 'ANUAL', 'PERPETUO'))
);
--> statement-breakpoint
CREATE TABLE "suscripcion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"revenuecat_app_user_id" text,
	"origen" text DEFAULT 'GOOGLE_PLAY' NOT NULL,
	"estado" text NOT NULL,
	"inicia_en" timestamp with time zone NOT NULL,
	"expira_en" timestamp with time zone,
	"renovacion_automatica" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_suscripcion_estado" CHECK (estado IN ('ACTIVA', 'EN_PERIODO_GRACIA', 'VENCIDA', 'CANCELADA', 'REEMBOLSADA')),
	CONSTRAINT "ck_suscripcion_origen" CHECK (origen IN ('GOOGLE_PLAY', 'PROMOCIONAL'))
);
--> statement-breakpoint
ALTER TABLE "anio_lectivo" ADD CONSTRAINT "anio_lectivo_institucion_id_institucion_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."institucion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignacion_docente" ADD CONSTRAINT "asignacion_docente_curso_id_curso_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignacion_docente" ADD CONSTRAINT "asignacion_docente_docente_id_docente_id_fk" FOREIGN KEY ("docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimiento" ADD CONSTRAINT "consentimiento_estudiante_id_estudiante_id_fk" FOREIGN KEY ("estudiante_id") REFERENCES "public"."estudiante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curso" ADD CONSTRAINT "curso_anio_lectivo_id_anio_lectivo_id_fk" FOREIGN KEY ("anio_lectivo_id") REFERENCES "public"."anio_lectivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dia_no_lectivo" ADD CONSTRAINT "dia_no_lectivo_anio_lectivo_id_anio_lectivo_id_fk" FOREIGN KEY ("anio_lectivo_id") REFERENCES "public"."anio_lectivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estudiante" ADD CONSTRAINT "estudiante_institucion_id_institucion_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."institucion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estudiante" ADD CONSTRAINT "estudiante_aprobado_por_docente_id_docente_id_fk" FOREIGN KEY ("aprobado_por_docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitacion_curso" ADD CONSTRAINT "invitacion_curso_curso_id_curso_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitacion_curso" ADD CONSTRAINT "invitacion_curso_emitida_por_docente_id_docente_id_fk" FOREIGN KEY ("emitida_por_docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matricula" ADD CONSTRAINT "matricula_estudiante_id_estudiante_id_fk" FOREIGN KEY ("estudiante_id") REFERENCES "public"."estudiante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matricula" ADD CONSTRAINT "matricula_curso_id_curso_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodo_academico" ADD CONSTRAINT "periodo_academico_anio_lectivo_id_anio_lectivo_id_fk" FOREIGN KEY ("anio_lectivo_id") REFERENCES "public"."anio_lectivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_representacion" ADD CONSTRAINT "vinculo_representacion_representante_id_representante_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."representante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_representacion" ADD CONSTRAINT "vinculo_representacion_estudiante_id_estudiante_id_fk" FOREIGN KEY ("estudiante_id") REFERENCES "public"."estudiante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculo_representacion" ADD CONSTRAINT "vinculo_representacion_invitacion_curso_id_invitacion_curso_id_fk" FOREIGN KEY ("invitacion_curso_id") REFERENCES "public"."invitacion_curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accion_registrada" ADD CONSTRAINT "accion_registrada_matricula_id_matricula_id_fk" FOREIGN KEY ("matricula_id") REFERENCES "public"."matricula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accion_registrada" ADD CONSTRAINT "accion_registrada_periodo_academico_id_periodo_academico_id_fk" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodo_academico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accion_registrada" ADD CONSTRAINT "accion_registrada_tipo_accion_id_tipo_accion_id_fk" FOREIGN KEY ("tipo_accion_id") REFERENCES "public"."tipo_accion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accion_registrada" ADD CONSTRAINT "accion_registrada_categoria_accion_id_categoria_accion_id_fk" FOREIGN KEY ("categoria_accion_id") REFERENCES "public"."categoria_accion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accion_registrada" ADD CONSTRAINT "accion_registrada_registrada_por_docente_id_docente_id_fk" FOREIGN KEY ("registrada_por_docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accion_registrada" ADD CONSTRAINT "accion_registrada_resuelta_por_docente_id_docente_id_fk" FOREIGN KEY ("resuelta_por_docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categoria_accion" ADD CONSTRAINT "categoria_accion_institucion_id_institucion_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."institucion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicado_curso" ADD CONSTRAINT "comunicado_curso_curso_id_curso_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicado_curso" ADD CONSTRAINT "comunicado_curso_periodo_academico_id_periodo_academico_id_fk" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodo_academico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicado_curso" ADD CONSTRAINT "comunicado_curso_creado_por_docente_id_docente_id_fk" FOREIGN KEY ("creado_por_docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_reporte" ADD CONSTRAINT "entrega_reporte_reporte_estudiante_id_reporte_estudiante_id_fk" FOREIGN KEY ("reporte_estudiante_id") REFERENCES "public"."reporte_estudiante"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_reporte" ADD CONSTRAINT "entrega_reporte_representante_id_representante_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."representante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franja_conducta" ADD CONSTRAINT "franja_conducta_institucion_id_institucion_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."institucion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantilla_campo" ADD CONSTRAINT "plantilla_campo_plantilla_reporte_id_plantilla_reporte_id_fk" FOREIGN KEY ("plantilla_reporte_id") REFERENCES "public"."plantilla_reporte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantilla_reporte" ADD CONSTRAINT "plantilla_reporte_institucion_id_institucion_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."institucion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregunta_reporte" ADD CONSTRAINT "pregunta_reporte_reporte_estudiante_id_reporte_estudiante_id_fk" FOREIGN KEY ("reporte_estudiante_id") REFERENCES "public"."reporte_estudiante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregunta_reporte" ADD CONSTRAINT "pregunta_reporte_representante_id_representante_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."representante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregunta_reporte" ADD CONSTRAINT "pregunta_reporte_respondida_por_docente_id_docente_id_fk" FOREIGN KEY ("respondida_por_docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puntaje_periodo" ADD CONSTRAINT "puntaje_periodo_matricula_id_matricula_id_fk" FOREIGN KEY ("matricula_id") REFERENCES "public"."matricula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puntaje_periodo" ADD CONSTRAINT "puntaje_periodo_periodo_academico_id_periodo_academico_id_fk" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodo_academico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puntaje_periodo" ADD CONSTRAINT "puntaje_periodo_franja_conducta_id_franja_conducta_id_fk" FOREIGN KEY ("franja_conducta_id") REFERENCES "public"."franja_conducta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registro_asistencia" ADD CONSTRAINT "registro_asistencia_matricula_id_matricula_id_fk" FOREIGN KEY ("matricula_id") REFERENCES "public"."matricula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registro_asistencia" ADD CONSTRAINT "registro_asistencia_periodo_academico_id_periodo_academico_id_fk" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodo_academico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registro_asistencia" ADD CONSTRAINT "registro_asistencia_registrado_por_docente_id_docente_id_fk" FOREIGN KEY ("registrado_por_docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_estudiante" ADD CONSTRAINT "reporte_estudiante_matricula_id_matricula_id_fk" FOREIGN KEY ("matricula_id") REFERENCES "public"."matricula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_estudiante" ADD CONSTRAINT "reporte_estudiante_periodo_academico_id_periodo_academico_id_fk" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodo_academico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_estudiante" ADD CONSTRAINT "reporte_estudiante_reporte_general_id_reporte_general_id_fk" FOREIGN KEY ("reporte_general_id") REFERENCES "public"."reporte_general"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_estudiante" ADD CONSTRAINT "reporte_estudiante_franja_conducta_id_franja_conducta_id_fk" FOREIGN KEY ("franja_conducta_id") REFERENCES "public"."franja_conducta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_estudiante_item" ADD CONSTRAINT "reporte_estudiante_item_reporte_estudiante_id_reporte_estudiante_id_fk" FOREIGN KEY ("reporte_estudiante_id") REFERENCES "public"."reporte_estudiante"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_estudiante_item" ADD CONSTRAINT "reporte_estudiante_item_accion_registrada_id_accion_registrada_id_fk" FOREIGN KEY ("accion_registrada_id") REFERENCES "public"."accion_registrada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_estudiante_item" ADD CONSTRAINT "reporte_estudiante_item_registro_asistencia_id_registro_asistencia_id_fk" FOREIGN KEY ("registro_asistencia_id") REFERENCES "public"."registro_asistencia"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_estudiante_item" ADD CONSTRAINT "reporte_estudiante_item_comunicado_curso_id_comunicado_curso_id_fk" FOREIGN KEY ("comunicado_curso_id") REFERENCES "public"."comunicado_curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_general" ADD CONSTRAINT "reporte_general_curso_id_curso_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_general" ADD CONSTRAINT "reporte_general_periodo_academico_id_periodo_academico_id_fk" FOREIGN KEY ("periodo_academico_id") REFERENCES "public"."periodo_academico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_general" ADD CONSTRAINT "reporte_general_plantilla_reporte_id_plantilla_reporte_id_fk" FOREIGN KEY ("plantilla_reporte_id") REFERENCES "public"."plantilla_reporte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_general" ADD CONSTRAINT "reporte_general_publicado_por_docente_id_docente_id_fk" FOREIGN KEY ("publicado_por_docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_general_valor" ADD CONSTRAINT "reporte_general_valor_reporte_general_id_reporte_general_id_fk" FOREIGN KEY ("reporte_general_id") REFERENCES "public"."reporte_general"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_general_valor" ADD CONSTRAINT "reporte_general_valor_plantilla_campo_id_plantilla_campo_id_fk" FOREIGN KEY ("plantilla_campo_id") REFERENCES "public"."plantilla_campo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_accion" ADD CONSTRAINT "tipo_accion_institucion_id_institucion_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."institucion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_accion" ADD CONSTRAINT "tipo_accion_categoria_accion_id_categoria_accion_id_fk" FOREIGN KEY ("categoria_accion_id") REFERENCES "public"."categoria_accion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_emergencia" ADD CONSTRAINT "alerta_emergencia_institucion_id_institucion_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."institucion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_emergencia" ADD CONSTRAINT "alerta_emergencia_curso_id_curso_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_emergencia" ADD CONSTRAINT "alerta_emergencia_estudiante_id_estudiante_id_fk" FOREIGN KEY ("estudiante_id") REFERENCES "public"."estudiante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerta_emergencia" ADD CONSTRAINT "alerta_emergencia_activada_por_docente_id_docente_id_fk" FOREIGN KEY ("activada_por_docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_institucion_id_institucion_id_fk" FOREIGN KEY ("institucion_id") REFERENCES "public"."institucion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_disponibilidad_docente_id_disponibilidad_docente_id_fk" FOREIGN KEY ("disponibilidad_docente_id") REFERENCES "public"."disponibilidad_docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_docente_id_docente_id_fk" FOREIGN KEY ("docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_representante_id_representante_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."representante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cita" ADD CONSTRAINT "cita_estudiante_id_estudiante_id_fk" FOREIGN KEY ("estudiante_id") REFERENCES "public"."estudiante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilidad_docente" ADD CONSTRAINT "disponibilidad_docente_docente_id_docente_id_fk" FOREIGN KEY ("docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilidad_docente" ADD CONSTRAINT "disponibilidad_docente_curso_id_curso_id_fk" FOREIGN KEY ("curso_id") REFERENCES "public"."curso"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_alerta" ADD CONSTRAINT "entrega_alerta_alerta_emergencia_id_alerta_emergencia_id_fk" FOREIGN KEY ("alerta_emergencia_id") REFERENCES "public"."alerta_emergencia"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_alerta" ADD CONSTRAINT "entrega_alerta_representante_id_representante_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."representante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrega_alerta" ADD CONSTRAINT "entrega_alerta_estudiante_id_estudiante_id_fk" FOREIGN KEY ("estudiante_id") REFERENCES "public"."estudiante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_revenuecat" ADD CONSTRAINT "evento_revenuecat_suscripcion_id_suscripcion_id_fk" FOREIGN KEY ("suscripcion_id") REFERENCES "public"."suscripcion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inconformidad" ADD CONSTRAINT "inconformidad_accion_registrada_id_accion_registrada_id_fk" FOREIGN KEY ("accion_registrada_id") REFERENCES "public"."accion_registrada"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inconformidad" ADD CONSTRAINT "inconformidad_representante_id_representante_id_fk" FOREIGN KEY ("representante_id") REFERENCES "public"."representante"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inconformidad" ADD CONSTRAINT "inconformidad_resuelta_por_docente_id_docente_id_fk" FOREIGN KEY ("resuelta_por_docente_id") REFERENCES "public"."docente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inconformidad" ADD CONSTRAINT "inconformidad_cita_id_cita_id_fk" FOREIGN KEY ("cita_id") REFERENCES "public"."cita"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_anio_lectivo" ON "anio_lectivo" USING btree ("institucion_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_curso_titular_vigente" ON "asignacion_docente" USING btree ("curso_id") WHERE rol = 'TITULAR' AND vigente_hasta IS NULL;--> statement-breakpoint
CREATE INDEX "ix_consentimiento_usuario" ON "consentimiento" USING btree ("user_id","tipo");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_curso" ON "curso" USING btree ("anio_lectivo_id","nivel","paralelo","jornada");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_dia_no_lectivo" ON "dia_no_lectivo" USING btree ("anio_lectivo_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_estudiante_documento" ON "estudiante" USING btree ("institucion_id","tipo_documento","numero_documento") WHERE tipo_documento <> 'SIN_DOCUMENTO';--> statement-breakpoint
CREATE INDEX "ix_estudiante_pendiente" ON "estudiante" USING btree ("institucion_id") WHERE estado_verificacion = 'PENDIENTE';--> statement-breakpoint
CREATE INDEX "ix_invitacion_codigo" ON "invitacion_curso" USING btree ("codigo_corto") WHERE estado = 'PENDIENTE';--> statement-breakpoint
CREATE UNIQUE INDEX "ux_matricula" ON "matricula" USING btree ("estudiante_id","curso_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_matricula_cursando" ON "matricula" USING btree ("estudiante_id") WHERE estado = 'CURSANDO';--> statement-breakpoint
CREATE INDEX "ix_matricula_curso" ON "matricula" USING btree ("curso_id") WHERE estado = 'CURSANDO';--> statement-breakpoint
CREATE UNIQUE INDEX "ux_perfil_documento" ON "perfil_usuario" USING btree ("tipo_documento","numero_documento");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_periodo_orden" ON "periodo_academico" USING btree ("anio_lectivo_id","orden");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_vinculo" ON "vinculo_representacion" USING btree ("representante_id","estudiante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_vinculo_estudiante_unico" ON "vinculo_representacion" USING btree ("estudiante_id") WHERE estado = 'ACTIVO';--> statement-breakpoint
CREATE INDEX "ix_vinculo_representante" ON "vinculo_representacion" USING btree ("representante_id") WHERE estado = 'ACTIVO';--> statement-breakpoint
CREATE INDEX "ix_accion_matricula_periodo" ON "accion_registrada" USING btree ("matricula_id","periodo_academico_id") WHERE estado = 'VIGENTE';--> statement-breakpoint
CREATE INDEX "ix_accion_fecha" ON "accion_registrada" USING btree ("matricula_id","fecha_ocurrencia");--> statement-breakpoint
CREATE INDEX "ix_comunicado_vigente" ON "comunicado_curso" USING btree ("curso_id","visible_desde","visible_hasta") WHERE activo = true;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_entrega_reporte" ON "entrega_reporte" USING btree ("reporte_estudiante_id","representante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_plantilla_campo" ON "plantilla_campo" USING btree ("plantilla_reporte_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_pregunta_reporte" ON "pregunta_reporte" USING btree ("reporte_estudiante_id","representante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_puntaje_periodo" ON "puntaje_periodo" USING btree ("matricula_id","periodo_academico_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_asistencia" ON "registro_asistencia" USING btree ("matricula_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_reporte_estudiante" ON "reporte_estudiante" USING btree ("matricula_id","fecha");--> statement-breakpoint
CREATE INDEX "ix_reporte_estudiante_fecha" ON "reporte_estudiante" USING btree ("matricula_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_reporte_general" ON "reporte_general" USING btree ("curso_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_reporte_valor" ON "reporte_general_valor" USING btree ("reporte_general_id","plantilla_campo_id");--> statement-breakpoint
CREATE INDEX "ix_alerta_curso" ON "alerta_emergencia" USING btree ("curso_id","activada_en");--> statement-breakpoint
CREATE INDEX "ix_auditoria_entidad" ON "auditoria" USING btree ("entidad_tipo","entidad_id","ocurrido_en");--> statement-breakpoint
CREATE INDEX "ix_cita_representante" ON "cita" USING btree ("representante_id","fecha_hora_inicio");--> statement-breakpoint
CREATE INDEX "ix_cita_docente" ON "cita" USING btree ("docente_id","fecha_hora_inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_cita_bloque_vivo" ON "cita" USING btree ("disponibilidad_docente_id") WHERE estado IN ('SOLICITADA', 'CONFIRMADA');--> statement-breakpoint
CREATE INDEX "ix_desbloqueo_vigente" ON "desbloqueo_recompensado" USING btree ("user_id","recurso");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_disponibilidad" ON "disponibilidad_docente" USING btree ("docente_id","fecha","hora_inicio");--> statement-breakpoint
CREATE INDEX "ix_disponibilidad_libre" ON "disponibilidad_docente" USING btree ("docente_id","fecha") WHERE estado = 'DISPONIBLE';--> statement-breakpoint
CREATE UNIQUE INDEX "ux_entrega_alerta" ON "entrega_alerta" USING btree ("alerta_emergencia_id","representante_id","estudiante_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_inconformidad" ON "inconformidad" USING btree ("accion_registrada_id","representante_id");--> statement-breakpoint
CREATE INDEX "ix_inconformidad_abierta" ON "inconformidad" USING btree ("vence_en") WHERE estado IN ('ABIERTA', 'EN_REVISION');--> statement-breakpoint
CREATE INDEX "ix_notificacion_usuario" ON "notificacion" USING btree ("user_id","creado_en");--> statement-breakpoint
CREATE INDEX "ix_suscripcion_activa" ON "suscripcion" USING btree ("user_id") WHERE estado = 'ACTIVA';