# Registro de decisiones de producto (DP)

Una decisión por archivo. Mismo formato y misma disciplina que los ADR de
`docs/01-arquitectura/adr/`: contexto, decisión, consecuencias. **Una DP nunca
se borra ni se edita una vez aceptada**: si la decisión cambia, se escribe una
nueva que reemplaza a la anterior y la vieja pasa a estado `Reemplazada`.

Esto reemplaza el modelo anterior (`registro-decisiones.md` y
`decisiones-pendientes.md` como documentos únicos que se editaban encima cada
vez que algo cambiaba). Esos dos archivos quedaron `Reemplazado` y se movieron
a `docs/99-archivo/`.

| # | Decisión | Estado |
|---|---|---|
| 001 | Corte MoSCoW: no se recorta el alcance de 31 pantallas | Aceptada |
| 002 | Catálogo de acciones: categorías libres, sin nombres predefinidos | Aceptada |
| 003 | Anuncios: Notas del profesor y Eventos, reemplazan el concepto de "Nota" | Aceptada |
| 004 | Plantilla del reporte general: cuatro campos opcionales | Aceptada |
| 005 | Monetización: cinco planes, precios iniciales y `docente_pro` | Aceptada |
| 006 | Auditoría: alcance de la v1, resto diferido a v2 | Aceptada |
| 007 | Retención y derecho al olvido: se declara en v1, se implementa en v2 | Aceptada |
| 008 | Diferenciador de IA: entra a la v1, condicionado a cerrar los 18 Must | Aceptada |
| 011 | Iconografía: MaterialCommunityIcons con pares de contorno | Aceptada |

Cuándo escribir una DP nueva en vez de editar el código o un ADR: cuando la
decisión es de **producto o negocio** (qué construye la app, para quién, con
qué reglas) y no de **arquitectura** (cómo está construido — eso sigue siendo
un ADR) ni de un **valor concreto de dominio** (esos van directo al código:
`convex/lib/enums.ts`, `convex/schema.ts`, `movil/src/theme/Theme.ts` — el
código es la fuente de verdad, una DP no repite un hex o un rango que ya está
ahí, solo explica por qué se eligió).
