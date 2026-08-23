# DP-002 — Catálogo de acciones: categorías libres, sin nombres predefinidos

**Fecha:** 2026-08-14 · **Estado:** Aceptada

## Contexto
La propuesta original sembraba nombres de acción fijos ("Excelente trabajo en
clase", "No trajo la tarea", etc.), con el docente solo eligiendo de una
lista. Persona C corrigió esto: ganar puntos debe ser más difícil que
perderlos, y encasillar al docente en nombres predefinidos no refleja cómo
evalúa realmente a un estudiante.

## Decisión
- **Positivas:** sin catálogo de nombres. Cuatro categorías fijas
  (`DESEMPENIO`, `CONVIVENCIA`, `RESPONSABILIDAD`, `PUNTUALIDAD`); el docente
  escribe el mensaje libre y elige **+1 o +2** según su propio criterio.
- **Negativas:** tres grupos, cada uno con mensaje libre del docente:
  - `INDISCIPLINA` — rango −1 a −3, ajustable por el docente.
  - `IRRESPONSABILIDAD` — **fijo en −1**, no ajustable (conserva la regla C2
    original).
  - `DESHONESTIDAD` — rango −1 a −3. Categoría nueva: copiar, deshonestidad
    académica en cualquier actividad calificada, o mentir para justificar mal
    comportamiento o incumplimiento.
- Los valores concretos (categorías, rangos, signo) viven en
  `convex/lib/enums.ts` (`CODIGO_CATEGORIA`, `REGLAS`) y `convex/semillas.ts` —
  esta DP no los repite, explica por qué se eligió texto libre sobre catálogo
  fijo.

## Consecuencias
- Se pierde la posibilidad de reportes agregados por "nombre de acción exacto"
  (ej. "cuántas veces se registró 'No trajo la tarea'"); solo se puede agregar
  por categoría. Se acepta: el mensaje libre importa más que la
  estandarización estadística en la v1.
- `DESHONESTIDAD` se agregó a `CODIGO_CATEGORIA`, que es superficie
  compartida — cualquier cambio ahí requiere acuerdo de los tres, según
  `docs/02-equipo/manual-equipo.md`.
