# DP-004 — Plantilla del reporte general: cuatro campos opcionales

**Fecha:** 2026-08-14 · **Estado:** Aceptada

## Contexto
`Contexto/CONTEXT.md` dejaba abierto el "etc." de qué campos lleva el reporte
diario que redacta el docente. Hacía falta cerrarlo para poder sembrar
`plantillaCampo` y escribir la pantalla D13/P4.

## Decisión
Cuatro campos, en este orden, **ninguno obligatorio**:

1. Anuncios — texto largo
2. Novedades del día — texto largo
3. Tareas enviadas — texto largo
4. Consejo del día — texto corto

Los valores concretos viven sembrados en `convex/semillas.ts`
(`plantillaCampo`) — esta DP registra la decisión, no los repite.

## Consecuencias
- Que ningún campo sea obligatorio significa que la pantalla D13 debe permitir
  publicar un reporte vacío en los cuatro; la validación de "reporte completo"
  (si existe) es una regla de negocio distinta, no un requisito de estos
  campos.
- Es la base de datos sobre la que trabaja el diferenciador de IA (DP-008):
  el borrador que genera el modelo debe llenar estos cuatro campos, en este
  orden.
