# Registro de decisiones de arquitectura (ADR)

Una decisión por archivo. Formato fijo: contexto, opciones, decisión, consecuencias.
Un ADR nunca se borra ni se edita una vez aceptado: si la decisión cambia, se
escribe uno nuevo que reemplaza al anterior y el viejo pasa a estado `Reemplazado`.

| # | Decisión | Estado |
|---|---|---|
| 001 | Motor de base de datos y ORM | Reemplazado el 2026-08-16 |
| 002 | Framework móvil y servidor | Reemplazado el 2026-08-16 |
| 003 | Autenticación e identidad | Reemplazado el 2026-08-16 |
| 004 | Aplicación de permisos por rol | Reemplazado el 2026-08-16 |
| 005 | Puntaje como valor derivado | Aceptado |
| 006 | Integración de RevenueCat | Aceptado |
| 007 | Entrega sin publicación en tienda, con repositorio abierto | Aceptado |
| 008 | Pruebas de compra sin tienda (Test Store de RevenueCat) | Aceptado |

La arquitectura vigente desde el 16 de agosto de 2026 es Expo + Clerk + Convex,
sin servidor Next.js, Better Auth, PostgreSQL ni Drizzle. Los ADR-001 a ADR-004
se conservan como registro histórico; el `README.md` de la raíz y el código son
la fuente de verdad para el runtime vigente.

**Las decisiones de producto** (qué construye la app y con qué reglas) siguen la
misma disciplina en `docs/00-producto/decisiones/`, numeradas DP-001 en adelante.
Un ADR responde *cómo está construido*; un DP responde *qué y por qué*.
