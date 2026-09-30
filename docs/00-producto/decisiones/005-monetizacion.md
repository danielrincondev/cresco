# DP-005 — Monetización: precios iniciales y segundo entitlement

**Fecha:** 2026-08-14 · **Estado:** Aceptada

## Contexto
ADR-006 ya fija los cinco planes y sus límites. Faltaban dos decisiones de
producto que ADR-006 no cubre: los precios concretos y si el docente necesita
un entitlement propio o comparte el del representante.

## Decisión
- **Precios iniciales** (para el Test Store da igual el valor — no cobra
  nada — pero hacen falta para el video de entrega):

  | Producto | Precio |
  |---|---|
  | `REP_PREMIUM_MENSUAL` | $1.99 |
  | `REP_PREMIUM_BIMESTRAL` | $2.99 |
  | `DOC_PRO` | $4.99/mes |

  > **Actualización del 2026-09-30:** en el Test Store de RevenueCat `DOC_PRO`
  > quedó creado a **$3.99/mes**, y esa tienda no permite editar el precio de
  > una moneda que ya existe (solo añadir monedas nuevas). Para no cambiar el
  > identificador del producto a horas de la entrega, el video y el texto de
  > Devpost usan $3.99. En Google Play el precio se vuelve a fijar al crear el
  > producto real.

- **Segundo entitlement `docente_pro`**, separado de `premium` (que es del
  representante) — resuelve el bloqueo de D19. Ya sembrado en
  `convex/lib/enums.ts` (`ENTITLEMENTS`) y en el plan `DOC_PRO`.
- Premium del representante es **por cuenta** (cubre a todos sus hijos); el
  docente **sí tiene** límites de pago por curso.

## Consecuencias
- Falta crear los tres productos y el entitlement `docente_pro` en el panel de
  RevenueCat — sigue pendiente, dueño Persona C (ver Issues, no este
  documento, para el estado de esa tarea).
- Los precios son de referencia para Ecuador (dólar, mercado local) y pueden
  ajustarse sin tocar código — viven en el panel de RevenueCat, no en
  `enums.ts`.
