# ADR-003 — Autenticación e identidad

**Fecha:** 2026-08-02 · **Estado:** Aceptado

## Contexto
Hay dos perfiles (docente y representante) y una misma persona puede ser ambos.
En la v1 no existe superusuario: el docente declara el nombre de la escuela como
texto libre (A2), pero la v2 incorporará a la dirección.

## Decisión
**BetterAuth con el plugin de organización.** La `organization` de BetterAuth
representa la institución declarada por el docente; `member` es su membresía.

## Consecuencias
- BetterAuth crea sus tablas `user`, `session`, `account`, `organization`,
  `member`. La tabla `perfil_usuario` del dominio las **extiende**, no compite:
  cédula y teléfono van ahí, nunca duplicando `user`.
- **La invitación de organización de BetterAuth no se usa para vincular padres.**
  Aquella invita adultos a una organización; `invitacion_curso` es del dominio y
  desemboca en el registro de un menor con consentimiento (I4). Son distintas.
- `institucion.verificada` queda en `false` durante toda la v1. Cuando en la v2
  la dirección reclame la institución, no hay migración: solo cambia el flag y
  aparecen los roles de administrador.
