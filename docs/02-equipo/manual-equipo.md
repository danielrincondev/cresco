# Manual del equipo — Cresco (equipo Neofix)

> **Estado:** Vigente · **Dueño:** Todos · **Última revisión:** 2026-08-07

Media página que evita la mayor causa de fracaso de un equipo de tres, que no es técnica.

## Propiedad
Cada persona es dueña de su módulo (ver `backlog-y-reparto.md`):
`convex/nucleo.ts` (A) · `convex/conducta.ts` (B) · `convex/interaccion.ts` (C).
**Nadie edita el módulo de otro.** Si necesitas un campo ajeno, lo pides en el
grupo y su dueño lo agrega. Excepción: `convex/schema.ts`, `convex/lib/enums.ts`,
`convex/lib/guardas.ts` y `convex/lib/permisos.ts` son compartidos y cambian solo
con acuerdo de los tres. Esto ya no depende de que todos se acuerden de leer
esta regla: `.github/CODEOWNERS` hace que GitHub pida automáticamente la
aprobación correcta según qué archivo toque el PR.

## Ramas y commits
- Ramas cortas **desde `main`**: `feat/`, `fix/`, `chore/` + descripción corta.
  Ejemplo: `feat/asignar-accion-tope-diario`. "Corta" = se fusiona en días, no
  en semanas. No hay rama `develop`.
- Commits en formato convencional: `feat(acciones): valida tope diario de -5`
- `main` está protegida: nadie empuja directo.
- **Nadie fusiona su propio PR.** Se necesita una aprobación.
- Un PR que toque datos de estudiantes exige las tres verificaciones de
  `matriz-permisos.md`, que están en la plantilla de PR.
- Lo que no llega a tiempo no se queda en una rama vieja: se fusiona apagado
  detrás de una bandera de `convex/lib/flags.ts`.

El ciclo completo, paso a paso, está en `flujo-de-trabajo.md`.

## Ritmo
- Lunes, 20 min: qué hizo cada uno, qué sigue, qué le bloquea.
- Viernes, 10 min: revisión de riesgos y del punto de control.
- Si algo te bloquea más de **medio día**, lo dices ese mismo día. No al lunes.

## Definición de terminado
Las seis condiciones de `backlog-y-reparto.md`, sección 6.

## Decisiones
Las de arquitectura se registran como **ADR** (`docs/01-arquitectura/adr/`); las
de producto como **DP** (`docs/00-producto/decisiones/`). En ambos casos, una
decisión **nunca se edita**: si cambia, se escribe una nueva que reemplaza a la
anterior y la vieja pasa a `Reemplazada`. Así nadie queda trabajando con una
versión vieja sin enterarse.

Si hay desacuerdo, decide el dueño del módulo afectado; si toca a los tres, se
vota y el resultado queda escrito.

## Si alguien se atrasa
No es un juicio, es logística: se dice en el punto de control, se reparte lo
pendiente y se recorta alcance del bloque *Should*. La regla es avisar temprano;
lo que rompe un proyecto de seis semanas no es el atraso, es enterarse tarde.

## Nunca se sube al repositorio
Claves de RevenueCat · credenciales de base de datos · keystore de firma ·
archivos `.env` · `google-services.json` y la clave de cuenta de servicio de
Firebase (van como secretos de EAS y en expo.dev) · **datos reales de
estudiantes o representantes**. El Excel que
les pase un profesor para probar la carga no entra al repositorio: se usan datos
ficticios generados.
