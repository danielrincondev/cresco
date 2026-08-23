# DP-003 — Anuncios: Notas del profesor y Eventos

**Fecha:** 2026-08-14 · **Estado:** Aceptada

## Contexto
El borrador original tenía un concepto genérico de "Nota" (valor 0, no entra
en la bitácora del acumulado). Persona C lo reemplazó por algo más específico
tras notar que un docente necesita dos cosas distintas: un mensaje corto
dirigido (a un padre o al curso) y un anuncio largo tipo cartelera.

## Decisión
Dos tipos, bajo el paraguas "Anuncios" (`TIPO_COMUNICADO` en
`convex/lib/enums.ts`):

- **Notas del profesor**: destinatario un representante específico o todo el
  curso. Mensaje libre, sin nombre predefinido. Visible de **1 a 7 días**,
  configurable por el docente al crearla. Aparece en el tablero del
  representante como "Anuncio del profesor".
- **Eventos**: texto largo, puede incluir listas (ej. lista de alumnos para
  una actividad). Formato expandible/retráctil: `"Evento: [nombre] (flecha
  para expandir)"`. Visible desde su creación hasta la fecha de expiración que
  define el docente; desaparece automáticamente ese día.

## Consecuencias
- Reemplaza por completo el concepto de "Nota" — no convive con él. Cualquier
  referencia a "Nota" en documentos viejos (`Contexto/CONTEXT.md`,
  `Contexto/DECISIONS.md`) describe el modelo anterior.
- Ninguno de los dos tipos entra en el cálculo de puntaje ni en la bitácora de
  acciones — son puramente informativos.
- La expiración automática de un Evento es lógica de negocio, no solo de UI:
  la pantalla del representante debe dejar de mostrarlo el día que vence,
  independientemente de si el registro se anula en la base de datos.
