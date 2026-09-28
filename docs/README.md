# Documentación de Cresco

Índice de toda la documentación del proyecto. **Este archivo se actualiza cada vez
que se agrega o se retira un documento.** Un documento que no está en esta tabla,
no existe para el equipo.

> **Arquitectura vigente desde el 16 de agosto de 2026:** Expo + Clerk + Convex.
> Para el runtime actual mandan el `README.md` de la raíz y el código de `movil/`.
> Los documentos que describían el stack anterior (Next.js, Better Auth,
> PostgreSQL, Drizzle) y los que ya estaban reemplazados se retiraron del árbol
> el 28 de septiembre de 2026. Siguen completos en el historial de git:
> `git show c5ce997:docs/99-archivo/`.

Estado: `✅ vigente` · `🚧 borrador o abierto` · `📦 histórico`

---

## Contexto/ — lo que se lee al empezar una sesión con Claude Code

Vive fuera de `docs/` porque es el contexto de trabajo del asistente, no
documentación del producto.

| Documento | Estado | Dueño |
|---|---|---|
| `../Contexto/CLAUDE.md` | ✅ instrucciones permanentes para el asistente | Todos |
| `../Contexto/CONTEXT.md` | ✅ objetivo, alcance, arquitectura y reglas de negocio, con su porqué | Todos |
| `../Contexto/DECISIONS.md` | 📦 registro histórico; sus IDs (C2, D2, F3…) los cita el código | Todos |
| `../Contexto/reglas-shipaton-next-gen.md` | ✅ reglas oficiales verificadas | Persona C |

## 00-producto — ¿Qué construimos y por qué?

| Documento | Estado | Dueño |
|---|---|---|
| `decisiones/` (15 decisiones de producto, DP-001 a DP-015) | ✅ una decisión por archivo, misma disciplina que los ADR | Persona C |

## 01-arquitectura — ¿Cómo está construido?

| Documento | Estado | Dueño |
|---|---|---|
| `adr/` (8 decisiones; ADR-001 a ADR-004 reemplazados) | ✅ | Todos |
| `matriz-permisos.md` | ✅ quién ve qué; lo aplica `movil/convex/lib/permisos.ts` | Persona A |

> El modelo de datos es `movil/convex/schema.ts`, comentado tabla por tabla. No
> existe un contrato OpenAPI ni una base PostgreSQL separados.

## 02-equipo — ¿Cómo trabajamos?

| Documento | Estado | Dueño |
|---|---|---|
| `manual-equipo.md` | ✅ propiedad, ramas, ritmo y lo que nunca se sube | Todos |
| `flujo-de-trabajo.md` | ✅ ramas, PR, CODEOWNERS, banderas — qué hace cada uno paso a paso | Todos |
| `backlog-y-reparto.md` | ✅ inventario de las 31 pantallas, historias MoSCoW y reparto | Todos |
| `pendientes-proxima-build.md` | 🚧 lo que espera una build nueva de EAS | Persona C |

## 03-piloto — ¿Qué firmamos y aceptamos?

| Documento | Estado | Dueño |
|---|---|---|
| `aviso-privacidad.md` | 🚧 borrador completo, versión `2026-09-v2` — **pendiente de revisión jurídica** | Persona C |
| `texto-consentimiento.md` | 🚧 borrador, versión `2026-09-v2` — se guarda la versión, no un booleano | Persona C |
| `carta-acuerdo-piloto.md` | 🚧 borrador `2026-09-v1` — los puntos 🔲 se acuerdan con la institución | Persona C |
| `firmados/` | 🚫 ignorada por Git | — |

## 04-guias — ¿Cómo se usa y se opera?

| Documento | Estado | Dueño |
|---|---|---|
| `integracion-revenuecat.md` | ✅ development build + RevenueCat, con las trampas conocidas | Persona C |
| `contrato-nucleo.md` | ✅ funciones del núcleo para la interfaz, y su prueba de humo local | Persona A |
| `contrato-auditoria.md` | ✅ qué registra la bitácora y quién produce cada evento | Persona C |
| `contrato-push.md` | ✅ avisos al teléfono: servidor, app, Firebase y privacidad del texto | Persona C |
| `vencimiento-reclamos.md` | ✅ el plazo de 30 días de cada reclamo, programado en Convex | Persona C |

## 05-validacion — ¿Qué nos dijeron los usuarios?

| Documento | Estado | Dueño |
|---|---|---|
| `faq-sesion.md` | ✅ | Todos |
| `guion-entrevistas.md` | ✅ diseño antes/después, individual por persona | Todos |
| `hallazgos.md` | ✅ 4 docentes entrevistados el 1-sep; 8 hallazgos, 3 candidatos a DP | Persona C |

## 06-entrega — La sumisión al Shipaton

| Documento | Estado | Dueño |
|---|---|---|
| `borrador-devpost.md` | 🚧 material para el texto de Devpost (#55) | Persona D |

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

**Documentos que dejan de valer:** se retiran del árbol en un commit que diga
por qué, y se quitan de este índice. Git conserva el texto completo: nada se
pierde, y el árbol solo muestra lo vigente. Las DP y los ADR son la excepción:
nunca se editan ni se borran; si la decisión cambia, se escribe una nueva y la
anterior queda `Reemplazada`.

---

## Regla de mantenimiento

Un documento que no se actualiza es peor que uno que no existe, porque miente con
autoridad. Si algo ya no refleja la realidad, o se actualiza o se retira. No se
deja mintiendo.
