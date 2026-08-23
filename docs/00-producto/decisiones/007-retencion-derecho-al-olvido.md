# DP-007 — Retención y derecho al olvido: se declara en v1, se implementa en v2

**Fecha:** 2026-08-14 · **Estado:** Aceptada

## Contexto
Hay un choque real entre dos reglas: la regla 5 del proyecto ("nada se borra
físicamente") y el hecho de que un colegio va a preguntar por el derecho al
olvido de un estudiante o representante. La respuesta no puede ser "no
borramos nunca".

## Decisión
- **Objetivo de producto (v2):** anonimizar bajo solicitud — se sustituyen
  nombre y documento, la bitácora queda sin identificar. Cumple sin romper la
  regla 5.
- **Para la v1:** no se implementa la supresión. Se **declara** la política en
  el aviso de privacidad (dueño Persona C), sin mecanismo de anonimización
  todavía construido.
- **Duración de conservación:** durante el año lectivo. Sin pactar todavía con
  ninguna escuela real — se negocia en la carta de acuerdo del piloto, no se
  fija unilateralmente.

## Consecuencias
- El aviso de privacidad debe ser honesto sobre esto: dice que se puede
  solicitar anonimización, pero que el mecanismo llega en una versión
  posterior — no prometer algo que la v1 no hace.
- Si un colegio real exige la supresión ya en el piloto (no solo declarada),
  esta decisión debe reabrirse antes de firmar la carta de acuerdo —
  escribir una DP-007-v2 que la reemplace, no editar esta.
