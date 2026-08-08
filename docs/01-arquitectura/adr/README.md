# Registro de decisiones de arquitectura (ADR)

Una decisión por archivo. Formato fijo: contexto, opciones, decisión, consecuencias.
Un ADR nunca se borra ni se edita una vez aceptado: si la decisión cambia, se
escribe uno nuevo que reemplaza al anterior y el viejo pasa a estado `Reemplazado`.

| # | Decisión | Estado |
|---|---|---|
| 001 | Motor de base de datos y ORM | Aceptado |
| 002 | Framework móvil y servidor | Aceptado |
| 003 | Autenticación e identidad | Aceptado |
| 004 | Aplicación de permisos por rol | Aceptado |
| 005 | Puntaje como valor derivado | Aceptado |
| 006 | Integración de RevenueCat | Aceptado |
| 007 | Entrega sin publicación en tienda, con repositorio abierto | Aceptado |

> **ADR-007 reemplaza una consecuencia de ADR-002** (la que anticipaba tramitar
> Google Play Console e iniciarlo en la semana 2). La decisión de fondo de
> ADR-002 — Next.js como servidor + Expo para las apps — sigue vigente sin
> cambios. Al leer ADR-002, esa viñeta sobre Play Console ya no aplica.
