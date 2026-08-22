# DP-008 — Diferenciador de IA: entra a la v1, condicionado

**Fecha:** 2026-08-14 · **Estado:** Aceptada

## Contexto
Se había hablado de una capa de IA que redacte el reporte general (DP-004) a
partir de notas rápidas y desordenadas del docente, pero nunca se había
decidido formalmente si entraba a la v1 o no.

## Decisión
**Sí entra**, condicionado a que los 18 *Must* estén cerrados y probados antes
de empezar a construirlo — independientemente de que también se construyan
las pantallas *Should*/*Could* de las 31 (DP-001 mantiene las 31, sin corte).

- El docente escribe notas rápidas; una `action` de Convex llama a un modelo
  de lenguaje y devuelve un borrador del reporte en los cuatro campos de
  DP-004. El docente **siempre revisa antes de publicar** — nunca se envía
  sin pasar por una persona.
- Modelo por decidir entre Claude Haiku 4.5 y GPT-5 Nano, tras una prueba con
  notas reales de un docente. A esta escala de uso, el costo mensual del
  piloto es menos de un dólar con cualquiera de los dos.
- La clave del proveedor vive solo en el servidor (Convex `action`, nunca en
  el cliente), y el feature se construye detrás de una bandera de activación
  para poder desactivarlo sin revertir ni fusionar nada.

## Consecuencias
- No se empieza a construir hasta que el punto de control confirme que los 18
  *Must* están cerrados — construirlo antes es la forma más fácil de no
  terminar ninguna de las dos cosas.
- La bandera de activación es la salida de emergencia si el tiempo no alcanza:
  se entrega sin activarla, sin que eso implique deshacer trabajo.
