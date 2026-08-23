# Matriz de permisos — Cresco v1.0

> **Estado:** Reglas de producto vigentes; mecanismo técnico reemplazado el
> 2026-08-16 · **Dueño:** Persona A

Esta matriz sigue definiendo quién puede acceder a cada dato. Las referencias a
endpoints HTTP, `db/acceso/` y RLS son históricas: cada función pública de Convex
debe validar la identidad de Clerk y aplicar aquí la relación autorizada antes
de leer o modificar documentos.

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

## Tablas de acceso restringido — la defensa es una sola capa

Estas cinco son las que exponen datos de un menor si fallan:

`estudiante` · `matricula` · `accionRegistrada` · `reporteEstudiante` · `puntajePeriodo`

> ⚠️ **Cambio de fondo respecto al diseño original.** Con PostgreSQL había dos
> capas (la capa obligatoria `db/acceso/` **y** políticas RLS del motor), de modo
> que un bug en la aplicación no bastaba para filtrar datos. **Convex no tiene
> RLS.** Queda una sola capa: `movil/convex/lib/permisos.ts`. No hay red debajo,
> y por eso la bitácora de `auditoria` pasa de complemento a control
> compensatorio (DP-006).

Ninguna función toca `ctx.db` sobre esas cinco tablas sin pasar antes por una
función de `permisos.ts`:

```ts
// Patrón para el representante — equivale a la antigua política RLS.
import { exigirRepresentante, exigirVinculo } from "./lib/permisos";

export const reporteDeMiHijo = query({
  args: { estudianteId: v.id("estudiante") },
  handler: async (ctx, args) => {
    const representante = await exigirRepresentante(ctx);
    // Lanza ErrorPermiso si no hay vínculo ACTIVO (regla D2).
    await exigirVinculo(ctx, representante._id, args.estudianteId);
    // Recién aquí se puede leer.
  },
});
```

Para el docente, el equivalente es `exigirTitularDelCurso` /
`exigirAccesoDocenteAEstudiante`.

**Si olvidas la comprobación, Convex no falla:** devuelve los datos. Es
exactamente lo contrario del comportamiento de RLS (que devolvía cero filas al
olvidar `SET LOCAL`). Por eso la revisión de PR de abajo dejó de ser una
formalidad.

---

## Casos que deben tener prueba automatizada

Estas siete pruebas son obligatorias antes de la entrega. Si alguna falla, no se
despliega.

| # | Caso | Resultado esperado |
|---|---|---|
| S-1 | Representante A pide el reporte de un hijo de B | `ErrorPermiso` (`SIN_VINCULO`) |
| S-2 | Representante consulta un estudiante con vínculo `REVOCADO` | `ErrorPermiso` |
| S-3 | Docente registra una acción en un curso ajeno | `ErrorPermiso` |
| S-4 | Representante consulta un reporte de una matrícula `FINALIZADA` | `ErrorPermiso` |
| S-5 | Función llamada sin sesión de Clerk | `ErrorPermiso` (`exigirPerfil` lanza) |
| S-6 | Segundo representante intenta vincularse al mismo estudiante (D2) | `ErrorDominio` (conflicto) |
| S-7 | Alerta de emergencia sin reautenticación reciente (G1) | `ErrorPermiso` |

> S-5 cambió de significado con Convex. Antes comprobaba que una consulta sin
> `app.user_id` devolvía cero filas (el motor protegía). Ahora comprueba que
> `exigirPerfil` lanza: **la protección es la función, no el motor.**

---

## Cómo se revisa

En cada pull request que toque datos de estudiantes, el revisor verifica tres cosas
(están también en `.github/pull_request_template.md`):

1. ¿La consulta pasa por `convex/lib/permisos.ts`, sin `ctx.db` suelto?
2. ¿Los eventos que corresponden quedan auditados con `auditar()` (DP-006)?
3. ¿Existe una prueba que confirme que un usuario sin vínculo recibe
   `ErrorPermiso`?

Si alguna respuesta es no, el PR no se aprueba.
