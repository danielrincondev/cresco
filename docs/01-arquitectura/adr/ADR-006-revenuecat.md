# ADR-006 — Integración de RevenueCat

**Fecha:** 2026-08-02 · **Estado:** Aceptado

## Contexto
RevenueCat es requisito obligatorio del Shipaton. Hay dos audiencias que pagan:
el representante (quitar publicidad, historial semanal, acumulado enriquecido,
PDF libre) y el docente (más de un curso activo y límites ampliados, H1).

Esto **reemplaza la regla original RN-44**, que declaraba al docente siempre
gratuito.

## Decisión
- RevenueCat es la **fuente de verdad** del estado de suscripción. La tabla
  `suscripcion` es una proyección local para consultas rápidas.
- El webhook es **idempotente** por el identificador externo del evento
  (`evento_revenuecat.evento_id_externo`, con índice único). Un reenvío no
  duplica nada.
- Los límites de cada plan viven en `plan.limites` como JSON. Cambiar un límite
  es un `UPDATE`, no un despliegue.
- "Por parcial" se mapea a una **suscripción bimestral** de Google Play (H3),
  porque no existe un ciclo de 6 semanas.

## Planes iniciales

| Código | Audiencia | Límites |
|---|---|---|
| `REP_FREE` | Representante | 2 reportes anteriores, con publicidad, PDF tras anuncio |
| `REP_PREMIUM_MENSUAL` | Representante | Sin publicidad, 7 reportes, acumulado enriquecido, PDF libre |
| `REP_PREMIUM_BIMESTRAL` | Representante | Igual, ciclo de dos meses |
| `DOC_FREE` | Docente | 1 curso activo, 40 estudiantes |
| `DOC_PRO` | Docente | 5 cursos activos, 60 estudiantes, plantillas propias |

## Consecuencias
- Los límites se verifican **en el servidor**, nunca solo en la app: un cliente
  modificado no debe poder crear un segundo curso.
- El endpoint devuelve `402` con código `LIMITE_PLAN` para que la app muestre el
  paywall en el momento exacto en que el límite se alcanza.
