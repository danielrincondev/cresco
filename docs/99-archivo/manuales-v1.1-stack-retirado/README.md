# Manuales v1.1 — archivados el 22 de agosto de 2026

> **Estado:** Reemplazado · **Dueño:** Persona C · **Archivado:** 2026-08-22

Los cuatro manuales (principal + uno por rol, del 8 de agosto de 2026) y sus
fuentes HTML. **Describen el stack retirado**: instruyen instalar Better Auth,
correr `drizzle-kit generate`, construir la capa `db/acceso/` y políticas RLS, y
tratar `api/openapi.yaml` como contrato ejecutable. Nada de eso existe desde el
pivote a Convex + Clerk del 16 de agosto.

Se conservan porque contienen el razonamiento de producto de esa etapa, pero
**no deben usarse como guía de trabajo**: seguirlos hoy lleva a reintroducir un
stack que el proyecto abandonó.

## Qué los reemplaza

| Para saber… | Ahora está en |
|---|---|
| Cómo trabaja el equipo, paso a paso | `docs/02-equipo/flujo-de-trabajo.md` |
| Qué le toca a cada uno | `docs/02-equipo/backlog-y-reparto.md` + GitHub Issues |
| Las reglas del proyecto | `Contexto/CLAUDE.md` |
| Arquitectura vigente | `docs/01-arquitectura/adr/` |
| Decisiones de producto | `docs/00-producto/decisiones/` |
| El valor exacto de una regla | El código: `convex/lib/enums.ts`, `schema.ts` |

Esta sustitución **es** el cambio de método: se pasó de manuales en prosa que
había que reescribir enteros cada vez que algo cambiaba, a decisiones de una en
una que nunca se editan y a reglas que viven en el código, donde no pueden
desincronizarse de lo que la aplicación realmente hace.
