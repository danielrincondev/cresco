# Matriz de permisos — Cresco v1.0

> **Estado:** Vigente · **Dueño:** Persona A · **Última revisión:** 2026-08-07

Este documento es la fuente de la que se derivan las políticas RLS y las pruebas
de seguridad. Cualquier endpoint nuevo debe poder ubicarse en esta tabla antes de
escribirse.

**Roles activos en la v1:** `DOCENTE_TITULAR`, `REPRESENTANTE`, `ANONIMO`.

**`DOCENTE_COLABORADOR` está diferido a la v2** (decidido el 8 de agosto de
2026). El valor `COLABORADOR` existe en `ROL_ASIGNACION` y la columna de esta
matriz se conserva como diseño previsto, pero en la v1 **ninguna pantalla,
endpoint ni política RLS lo implementa**: no hay forma de asignar un colaborador
a un curso. Persona A **no construye RLS para ese rol** en la v1. La columna se
lee como "así funcionará en v2", no como requisito actual.

**No existe `ADMIN_INSTITUCION`,** ni en el esquema ni en el código: en la v1 no
hay administrador de institución (A3). Aparecerá en la v2, cuando la dirección
reclame la institución (ADR-003).

**Convenciones:** `L` lectura · `E` escritura · `—` sin acceso · `P` parcial (con
la condición indicada).

---

## Reglas transversales

1. Un `REPRESENTANTE` accede a un estudiante **si y solo si** existe una fila en
   `vinculo_representacion` con ese `estudiante_id`, su `representante_id` y
   `estado = 'ACTIVO'`. Sin excepciones, en ningún endpoint.
2. Un `DOCENTE` accede a un estudiante **si y solo si** existe una
   `asignacion_docente` vigente sobre el curso de su matrícula activa.
3. Nadie accede a datos de una institución que no sea la suya.
4. Al pasar una matrícula a `FINALIZADA` o `RETIRADA` (I1), el representante
   **pierde el acceso de lectura** y la institución conserva los datos.
5. Ningún rol borra físicamente. Solo se anula o se cambia de estado.
6. El representante ve **todas** las acciones de sus representados, incluidas las
   `ANULADA` y `MODIFICADA` (F4): no se ocultan, se muestran etiquetadas y con 0
   puntos. No existe ninguna columna `visible` en el esquema; si un día hiciera
   falta ocultar una acción, es una migración acordada, no un filtro improvisado.

---

## Matriz por tabla

> En la columna **Docente colaborador**, todo es diseño de v2. No se implementa
> ni se prueba en la v1.

| Tabla | Docente titular | Docente colaborador *(v2)* | Representante | Anónimo |
|---|---|---|---|---|
| `institucion` | L+E (la suya) | L | — | — |
| `perfil_usuario` | L+E (el propio) | L+E (propio) | L+E (propio) | — |
| `docente` | L+E (propio) · L (del curso) | L+E (propio) | L (del curso de su hijo) | — |
| `representante` | L (de sus estudiantes) | — | L+E (propio) | — |
| `anio_lectivo` | L+E | L | L (solo fechas) | — |
| `periodo_academico` | L+E | L | L | — |
| `dia_no_lectivo` | L+E | L | — | — |
| `curso` | L+E (los suyos) | L (asignados) | L (el de su hijo) | — |
| `asignacion_docente` | L+E (su curso) | L (propia) | — | — |
| `estudiante` | L+E (su curso) | L (su curso) | **P**: L+E solo al crear; luego L de los representados | — |
| `matricula` | L+E (su curso) | L | L (de sus representados) | — |
| `invitacion_curso` | L+E (su curso) | — | **P**: solo canjear por código | **P**: validar código |
| `vinculo_representacion` | L (su curso) | — | L (propios) | — |
| `consentimiento` | — | — | L+E (propios) | — |
| `categoria_accion` | L | L | L | — |
| `tipo_accion` | L | L | L | — |
| `accion_registrada` | L+E (su curso) | **P**: E solo tipos de su área; L propias | L (de sus representados, en cualquier estado) | — |
| `comunicado_curso` | L+E (su curso) | L | L (de su curso) | — |
| `franja_conducta` | L | L | L | — |
| `puntaje_periodo` | L (su curso) | L | L (de sus representados) | — |
| `registro_asistencia` | L+E (su curso) | **P**: E su jornada | L (de sus representados) | — |
| `plantilla_reporte` / `plantilla_campo` | L (E si plan PRO) | L | — | — |
| `reporte_general` | L+E (su curso) | — | L (solo `PUBLICADO`) | — |
| `reporte_estudiante` | L (su curso) | L | **P**: L de representados, limitado por plan (E4) | — |
| `entrega_reporte` | L (su curso) | — | L+E (marcar leído, propias) | — |
| `pregunta_reporte` | — *(v2)* | — | — *(v2)* | — |
| `disponibilidad_docente` | L+E (propia) | L+E (propia) | L (bloques libres) | — |
| `cita` | L+E (las suyas) | — | **P**: E crear/cancelar; L propias | — |
| `inconformidad` | L+E (de su curso) | — | **P**: E crear; L propias | — |
| `alerta_emergencia` | **P**: E con reautenticación (G1) | **P**: igual | L (las dirigidas a él) | — |
| `entrega_alerta` | L (su curso) | — | L+E (confirmar, propias) | — |
| `plan` | L | L | L | L |
| `suscripcion` | L (propia) | L (propia) | L (propia) | — |
| `evento_revenuecat` | — | — | — | — *(solo servidor)* |
| `desbloqueo_recompensado` | — | — | L+E (propios) | — |
| `dispositivo` | L+E (propios) | L+E | L+E | — |
| `notificacion` | L+E (propias) | L+E | L+E | — |
| `auditoria` | — | — | — | — *(solo servidor)* |

---

## Tablas con RLS obligatoria

Estas cinco llevan políticas en Postgres además del filtro de aplicación
(ADR-004), porque un fallo en ellas expone datos de un menor:

`estudiante` · `matricula` · `accion_registrada` · `reporte_estudiante` · `puntaje_periodo`

Patrón de la política para el representante:

```sql
CREATE POLICY p_representante_lee_estudiante ON estudiante
FOR SELECT USING (
  EXISTS (
    SELECT 1
      FROM vinculo_representacion v
      JOIN representante r ON r.id = v.representante_id
     WHERE v.estudiante_id = estudiante.id
       AND v.estado = 'ACTIVO'
       AND r.user_id = current_setting('app.user_id', true)
  )
);
```

Cada petición debe abrir su transacción con:

```sql
SET LOCAL app.user_id = '<user id de BetterAuth>';
```

Si se olvida, la consulta devuelve cero filas. Eso es intencional: falla de forma
visible en vez de silenciosa.

---

## Casos que deben tener prueba automatizada

Estas siete pruebas son obligatorias antes de la entrega. Si alguna falla, no se
despliega.

| # | Caso | Resultado esperado |
|---|---|---|
| S-1 | Representante A pide el reporte de un hijo de B | `403 SIN_VINCULO` |
| S-2 | Representante consulta un estudiante con vínculo `REVOCADO` | `403` |
| S-3 | Docente registra una acción en un curso ajeno | `403` |
| S-4 | Representante consulta un reporte de una matrícula `FINALIZADA` | `403` |
| S-5 | Consulta directa sin `app.user_id` fijado | 0 filas |
| S-6 | Segundo representante intenta vincularse al mismo estudiante (D2) | `409` |
| S-7 | Alerta de emergencia sin token de reautenticación (G1) | `401` |

---

## Cómo se revisa

En cada pull request que toque datos de estudiantes, el revisor verifica tres cosas:

1. ¿La consulta pasa por `db/acceso/`?
2. ¿Está cubierta por una política RLS o se justifica por qué no?
3. ¿Existe una prueba que confirme que un usuario sin vínculo recibe `403`?

Si alguna respuesta es no, el PR no se aprueba.
