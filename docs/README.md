# Documentación de Cresco

Índice de toda la documentación del proyecto. **Este archivo se actualiza cada vez
que se agrega un documento.** Un documento que no está en esta tabla, no existe
para el equipo.

Estado: `✅ listo` · `🚧 en progreso` · `⬜ pendiente` · `📦 archivado`

---

## Contexto/ — lo que se lee al empezar cualquier sesión

Vive fuera de `docs/` porque Claude Code lo carga en cada sesión.

| Documento | Estado | Dueño |
|---|---|---|
| `../Contexto/CLAUDE.md` | ✅ instrucciones permanentes | Todos |
| `../Contexto/CONTEXT.md` | ✅ estado completo del proyecto | Todos |
| `../Contexto/DECISIONS.md` | ✅ decisiones cerradas | Todos |
| `../Contexto/NEXT_STEPS.md` | ✅ por dónde continuar | Todos |
| `../Contexto/reglas-shipaton-next-gen.md` | ✅ reglas oficiales verificadas | Persona C |

## 00-producto — ¿Qué construimos y por qué?

| Documento | Estado | Dueño |
|---|---|---|
| `cuestionario-definiciones.md` | 📦 reemplazado por `DECISIONS.md` | Todos |
| `cuestionario-direccion-visual.md` | 🚧 guion de la sesión de dirección visual | Persona A |
| `glosario.md` | ⬜ | Todos |

## 01-arquitectura — ¿Cómo está construido?

| Documento | Estado | Dueño |
|---|---|---|
| `adr/` (7 decisiones, indexadas en `adr/README.md`) | ✅ | Quien propuso cada una |
| `matriz-permisos.md` | ✅ | Persona A |
| `modelo-datos.md` | ⬜ | Persona A |

> El esquema ejecutable vive en `db/schema/` y el contrato de API en
> `api/openapi.yaml`. No son documentos de lectura: son archivos que las
> herramientas consumen, por eso están junto al código.

## 02-equipo — ¿Cómo trabajamos?

| Documento | Estado | Dueño |
|---|---|---|
| `manual-equipo.md` | ✅ | Todos |
| `backlog-y-reparto.md` | ✅ se actualiza cada lunes | Todos |
| `registro-riesgos.md` | ⬜ | Persona C |

## 03-piloto — ¿Qué firmamos y aceptamos?

| Documento | Estado | Dueño |
|---|---|---|
| `aviso-privacidad.md` | ⬜ **necesario antes de P3** | Persona A |
| `texto-consentimiento.md` | ⬜ **necesario antes de P3** | Persona A |
| `carta-acuerdo-piloto.md` | ⬜ antes del piloto | Todos |
| `firmados/` | 🚫 ignorada por Git | — |

## 04-guias — ¿Cómo se usa y se opera?

| Documento | Estado | Dueño |
|---|---|---|
| `00-Manual-Principal-Cresco.pdf` | ✅ v1.1, 8 de agosto | Todos |
| `A-Nucleo.pdf` | ✅ v1.1, 8 de agosto | Persona A |
| `B-Conducta-y-Reportes.pdf` | ✅ v1.1, 8 de agosto | Persona B |
| `C-Interaccion-Monetizacion-Infra.pdf` | ✅ v1.1, 8 de agosto | Persona C |
| `fuente-manuales/*.html` | ✅ fuente de los 4 PDF de arriba — editar aquí, no el PDF | Persona C |
| `guia-docente.md` | ⬜ semana 5 | Persona B |
| `guia-representante.md` | ⬜ semana 5 | Persona B |
| `integracion-revenuecat.md` | ⬜ semana 2 | Persona C |

> **Excepción a la regla del PDF.** Estos cuatro manuales se distribuyen como PDF
> porque es lo que el equipo lee día a día, pero desde el 8 de agosto **sí tienen
> fuente**: `fuente-manuales/*.html`. Para corregirlos, editen el `.html` y
> regeneren el PDF (comando en `docs/99-archivo/ERRATA-2026-08.md`, sección 7).
> Los `.pdf` siguen exceptuados en `.gitignore` para que no desaparezcan del
> repositorio.

## 05-validacion — ¿Qué nos dijeron los usuarios?

| Documento | Estado | Dueño |
|---|---|---|
| `faq-sesion.md` | ✅ | Todos |
| `guion-entrevistas.md` | ⬜ | Todos |
| `hallazgos.md` | ⬜ tras las sesiones | Todos |

## 99-archivo — Documentos reemplazados

| Documento | Estado | Dueño |
|---|---|---|
| `ERRATA-2026-08.md` | 📦 reemplazado — su contenido ya está en los manuales v1.1 de `04-guias/`; se conserva como historial | Persona C |

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
