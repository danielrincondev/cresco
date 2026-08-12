-- Defensa en profundidad para las cinco tablas que contienen datos sensibles
-- de estudiantes (ADR-004). Sin app.user_id, todas las expresiones son falsas.

ALTER TABLE "estudiante" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "matricula" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accion_registrada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reporte_estudiante" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "puntaje_periodo" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "p_estudiante_lectura" ON "estudiante"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."estudiante_id" = "estudiante"."id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
  OR EXISTS (
    SELECT 1
    FROM "vinculo_representacion" AS v
    JOIN "representante" AS r ON r."id" = v."representante_id"
    JOIN "matricula" AS m ON m."estudiante_id" = v."estudiante_id"
    WHERE v."estudiante_id" = "estudiante"."id"
      AND v."estado" = 'ACTIVO'
      AND m."estado" = 'CURSANDO'
      AND r."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);

CREATE POLICY "p_estudiante_creacion" ON "estudiante"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "representante" AS r
    WHERE r."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
  OR EXISTS (
    SELECT 1
    FROM "curso" AS c
    JOIN "anio_lectivo" AS a ON a."id" = c."anio_lectivo_id"
    JOIN "asignacion_docente" AS ad ON ad."curso_id" = c."id"
    JOIN "docente" AS d ON d."id" = ad."docente_id"
    WHERE a."institucion_id" = "estudiante"."institucion_id"
      AND ad."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);

CREATE POLICY "p_estudiante_modificacion_docente" ON "estudiante"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."estudiante_id" = "estudiante"."id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."estudiante_id" = "estudiante"."id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);

CREATE POLICY "p_matricula_lectura" ON "matricula"
FOR SELECT
USING (
  (
    "matricula"."estado" = 'CURSANDO'
    AND EXISTS (
      SELECT 1
      FROM "asignacion_docente" AS a
      JOIN "docente" AS d ON d."id" = a."docente_id"
      WHERE a."curso_id" = "matricula"."curso_id"
        AND a."vigente_hasta" IS NULL
        AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
    )
  )
  OR (
    "matricula"."estado" = 'CURSANDO'
    AND EXISTS (
      SELECT 1
      FROM "vinculo_representacion" AS v
      JOIN "representante" AS r ON r."id" = v."representante_id"
      WHERE v."estudiante_id" = "matricula"."estudiante_id"
        AND v."estado" = 'ACTIVO'
        AND r."user_id" = NULLIF(current_setting('app.user_id', true), '')
    )
  )
);

CREATE POLICY "p_matricula_creacion" ON "matricula"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "asignacion_docente" AS a
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE a."curso_id" = "matricula"."curso_id"
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
  OR EXISTS (
    SELECT 1
    FROM "vinculo_representacion" AS v
    JOIN "representante" AS r ON r."id" = v."representante_id"
    WHERE v."estudiante_id" = "matricula"."estudiante_id"
      AND v."estado" = 'ACTIVO'
      AND r."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);

CREATE POLICY "p_matricula_modificacion_docente" ON "matricula"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "asignacion_docente" AS a
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE a."curso_id" = "matricula"."curso_id"
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "asignacion_docente" AS a
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE a."curso_id" = "matricula"."curso_id"
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);

CREATE POLICY "p_accion_lectura" ON "accion_registrada"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    WHERE m."id" = "accion_registrada"."matricula_id"
  )
);

CREATE POLICY "p_accion_creacion_docente" ON "accion_registrada"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."id" = "accion_registrada"."matricula_id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);

CREATE POLICY "p_accion_modificacion_docente" ON "accion_registrada"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."id" = "accion_registrada"."matricula_id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."id" = "accion_registrada"."matricula_id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);

CREATE POLICY "p_reporte_estudiante_lectura" ON "reporte_estudiante"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    WHERE m."id" = "reporte_estudiante"."matricula_id"
  )
);

CREATE POLICY "p_reporte_estudiante_creacion_docente" ON "reporte_estudiante"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."id" = "reporte_estudiante"."matricula_id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);

CREATE POLICY "p_reporte_estudiante_modificacion_docente" ON "reporte_estudiante"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."id" = "reporte_estudiante"."matricula_id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."id" = "reporte_estudiante"."matricula_id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);

CREATE POLICY "p_puntaje_periodo_lectura" ON "puntaje_periodo"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    WHERE m."id" = "puntaje_periodo"."matricula_id"
  )
);

CREATE POLICY "p_puntaje_periodo_creacion_docente" ON "puntaje_periodo"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."id" = "puntaje_periodo"."matricula_id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);

CREATE POLICY "p_puntaje_periodo_modificacion_docente" ON "puntaje_periodo"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."id" = "puntaje_periodo"."matricula_id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "matricula" AS m
    JOIN "asignacion_docente" AS a ON a."curso_id" = m."curso_id"
    JOIN "docente" AS d ON d."id" = a."docente_id"
    WHERE m."id" = "puntaje_periodo"."matricula_id"
      AND m."estado" = 'CURSANDO'
      AND a."vigente_hasta" IS NULL
      AND d."user_id" = NULLIF(current_setting('app.user_id', true), '')
  )
);