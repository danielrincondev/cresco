# DP-006 — Auditoría: alcance de la v1, resto diferido a v2

**Fecha:** 2026-08-14 · **Estado:** Aceptada

## Contexto
La tabla `auditoria` existe en el esquema con las acciones `CREAR`,
`ACTUALIZAR`, `ANULAR`, `APROBAR`, `LEER_SENSIBLE`, `EXPORTAR`, `LOGIN`,
`ALERTA`, pero al pasar a Convex se perdió la capa RLS de PostgreSQL — la
bitácora deja de ser un complemento y pasa a ser el **control compensatorio**
que demuestra ante un colegio que nadie ve lo que no le toca
(`convex/lib/permisos.ts`, función `auditar()`).

## Decisión
Se acepta auditar en v1 lo que sea útil y esté ya al alcance con
`permisos.ts`; lo que no, se difiere a v2 sin bloquear el lanzamiento:

- **v1:** `LOGIN`, `LEER_SENSIBLE` (un representante abre el reporte de un
  estudiante), `CREAR`/`ANULAR` de una acción, `APROBAR` estudiante.
- **v2:** `EXPORTAR` (PDF) y `ALERTA`.

## Consecuencias
- `permisos.ts` ya expone `auditar()` como la única función que debe escribir
  en la tabla — ninguna mutation debe escribir ahí directamente.
- Falta que las mutations de núcleo, conducta e interacción llamen a
  `auditar()` en los eventos de v1 listados arriba; a la fecha de esta
  decisión, la función existe pero nada la invoca todavía (ver Issues).
- Esta bitácora es la pieza que se le muestra a un colegio si pregunta "¿quién
  vio los datos de mi hijo?" — no auditarla en v1 debilita el argumento del
  piloto en ese punto específico.
