# Documentación de Cresco

Índice de toda la documentación del proyecto. **Este archivo se actualiza cada vez
que se agrega un documento.** Un documento que no está en esta tabla, no existe
para el equipo.

> **Arquitectura vigente desde el 16 de agosto de 2026:** Expo + Clerk + Convex.
> Los manuales y documentos de planificación anteriores se conservan como
> contexto histórico cuando describen Next.js, Better Auth, PostgreSQL o Drizzle.
> Para el runtime actual mandan el `README.md` de la raíz y `movil/`.

Estado: `✅ listo` · `🚧 en progreso` · `⬜ pendiente` · `📦 archivado`

---

## Contexto/ — lo que se lee al empezar cualquier sesión

Vive fuera de `docs/` porque Claude Code lo carga en cada sesión.

| Documento | Estado | Dueño |
|---|---|---|
| `../Contexto/CLAUDE.md` | ✅ reescrito el 22-ago para el stack vigente | Todos |
| `../Contexto/CONTEXT.md` | ✅ reescrito el 22-ago: estado real y pendientes | Todos |
| `../Contexto/DECISIONS.md` | 📦 registro histórico; sus IDs (C2, D2, F3…) los cita el código | Todos |
| `../Contexto/NEXT_STEPS.md` | 🚧 plan de retoma; se sustituye por Issues | Persona C |
| `../Contexto/reglas-shipaton-next-gen.md` | ✅ reglas oficiales verificadas | Persona C |

## 00-producto — ¿Qué construimos y por qué?

| Documento | Estado | Dueño |
|---|---|---|
| `decisiones/` (8 decisiones de producto, DP-001 a DP-008) | ✅ vigente — una decisión por archivo, misma disciplina que los ADR | Persona C |
| `glosario.md` | ⬜ | Todos |

> Cuatro documentos de esta carpeta se archivaron el 22 de agosto:
> `registro-decisiones.md` y `decisiones-pendientes.md` (sus decisiones vigentes
> están en `decisiones/`), `cuestionario-direccion-visual.md` (el tema ya está
> escrito en `movil/src/theme/Theme.ts`) y `cuestionario-definiciones.md` (ya
> estaba marcado `Reemplazado`, pero seguía fuera del archivo).

## 01-arquitectura — ¿Cómo está construido?

| Documento | Estado | Dueño |
|---|---|---|
| `adr/` (8 decisiones; ADR-001 a ADR-004 reemplazados) | ✅ actualizado | Todos |
| `matriz-permisos.md` | ✅ actualizado el 22-ago: `permisos.ts` en vez de RLS | Persona A |
| `modelo-datos.md` | ⬜ — lo cubre `movil/convex/schema.ts`, que está comentado tabla por tabla | Persona A |

> El esquema y las funciones ejecutables viven en `movil/convex/`. No existe un
> contrato OpenAPI ni una base PostgreSQL separados en la arquitectura vigente.

## 02-equipo — ¿Cómo trabajamos?

| Documento | Estado | Dueño |
|---|---|---|
| `manual-equipo.md` | ✅ | Todos |
| `flujo-de-trabajo.md` | ✅ ramas, PR, CODEOWNERS, banderas — qué hace cada uno paso a paso | Todos |
| `backlog-y-reparto.md` | ✅ se actualiza cada lunes | Todos |
| `registro-riesgos.md` | ⬜ | Persona C |

## 03-piloto — ¿Qué firmamos y aceptamos?

| Documento | Estado | Dueño |
|---|---|---|
| `aviso-privacidad.md` | ⬜ **necesario antes de P3**; declara la política de DP-007 | Persona C |
| `texto-consentimiento.md` | ⬜ **necesario antes de P3**; se guarda su versión, no un booleano | Persona C |
| `carta-acuerdo-piloto.md` | ⬜ antes del piloto; ahí se negocia la retención (DP-007) | Persona C |
| `firmados/` | 🚫 ignorada por Git | — |

## 04-guias — ¿Cómo se usa y se opera?

| Documento | Estado | Dueño |
|---|---|---|
| `guia-docente.md` | ⬜ semana 5 | Persona B |
| `guia-representante.md` | ⬜ semana 5 | Persona B |
| `integracion-revenuecat.md` | ⬜ semana 2 | Persona C |

> **Los cuatro manuales de rol (v1.1, 8 de agosto) se archivaron el 22 de agosto**
> en `99-archivo/manuales-v1.1-stack-retirado/`. Instruían instalar Better Auth,
> correr `drizzle-kit` y construir `db/acceso/` — seguirlos hoy reintroduce el
> stack abandonado. Lo que los reemplaza está en el `README.md` de esa carpeta.
> Esta sección queda para las guías de **uso del producto**, que son otra cosa:
> se escriben en Markdown y el PDF es una salida, nunca una fuente.

## 05-validacion — ¿Qué nos dijeron los usuarios?

| Documento | Estado | Dueño |
|---|---|---|
| `faq-sesion.md` | ✅ | Todos |
| `guion-entrevistas.md` | ✅ diseño antes/después, individual por persona | Todos |
| `hallazgos.md` | ⬜ tras las sesiones | Todos |

## 99-archivo — Documentos reemplazados

| Documento | Estado | Dueño |
|---|---|---|
| `ERRATA-2026-08.md` | 📦 reemplazado — su contenido ya está en los manuales v1.1, hoy archivados | Persona C |
| `manuales-v1.1-stack-retirado/` | 📦 los 4 manuales de rol y sus fuentes HTML: describen el stack retirado | Persona C |
| `openapi-v1.1.0-archivado.yaml` | 📦 contrato de 32 rutas; ya no es ejecutable, pero sigue siendo la mejor especificación de qué hace cada función | Persona C |
| `registro-decisiones.md` | 📦 reemplazado — sus decisiones vigentes están en `00-producto/decisiones/` | Persona C |
| `decisiones-pendientes.md` | 📦 reemplazado — todos sus bloques quedaron resueltos, ver `00-producto/decisiones/` | Persona C |
| `cuestionario-direccion-visual.md` | 📦 reemplazado — el tema ya está escrito en `movil/src/theme/Theme.ts` | Persona A |
| `cuestionario-definiciones.md` | 📦 reemplazado — registro de qué se preguntó; las respuestas vigentes están en los DP | Todos |

---

## Convenciones

**Nombres de archivo:** minúsculas, palabras separadas por guion, sin tildes ni
espacios (`aviso-privacidad.md`, no `Aviso Privacidad.md`). Evitar tildes previene
problemas entre sistemas operativos.

**Formato:** todo en Markdown. Los diagramas van como bloques Mermaid dentro del
`.md`, no como imágenes exportadas — así el diagrama también tiene historial y se
corrige en una línea.

**Versionado:** lo hace Git. **Nunca** existe `documento-v2.md` junto a
`documento.md`. Si necesitan comparar versiones, `git log` y `git diff`.

**Cabecera obligatoria.** Todo documento empieza con:

```markdown
> **Estado:** Vigente | Borrador | Reemplazado
> **Dueño:** Persona A
> **Última revisión:** 2026-08-03
```

Un documento sin dueño no lo mantiene nadie.

**PDF:** es una salida, nunca una fuente. Se escribe en Markdown y se genera con
`pandoc docs/03-piloto/carta-acuerdo-piloto.md -o carta.pdf` cuando hay que
entregarle algo a un colegio. Los PDF generados están en `.gitignore`.

**`03-piloto/firmados/` no se sube.** Los acuerdos ya firmados llevan nombres,
firmas y cédulas. Van a un Drive con acceso restringido, nunca al repositorio.

**Documentos archivados:** no se borran. Se les cambia el estado a `Reemplazado`
en la cabecera y se mueve el archivo a `docs/99-archivo/`. Los ADR nunca se editan
una vez aceptados: si la decisión cambia, se escribe uno nuevo.

---

## Regla de mantenimiento

Un documento que no se actualiza es peor que uno que no existe, porque miente con
autoridad. Si en semana 3 algo ya no refleja la realidad, o se actualiza o se
marca como `Reemplazado`. No se deja mintiendo.
