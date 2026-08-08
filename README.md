# Cresco

Comunicación entre docentes y representantes legales de escuelas del Ecuador,
centrada en el seguimiento de responsabilidad y conducta.
El estudiante nunca es usuario de la aplicación.

Desarrollado por el equipo **Neofix** para el RevenueCat Shipaton 2026,
categoría Next Gen.

## Estado del proyecto

**Todavía no hay código de aplicación.** Lo que existe y está verificado es la
base sobre la que se construye:

| Pieza | Estado |
|---|---|
| Esquema de datos (`db/schema/`) | ✅ 41 tablas, 57 CHECK, migración inicial generada |
| Contrato de API (`api/openapi.yaml`) | ✅ 32 rutas, OpenAPI 3.1 |
| Documentación y ADR (`docs/`) | ✅ |
| Servidor Next.js | ⬜ semana 1 |
| Apps Expo (docente y representante) | ⬜ semana 2 |
| Datos semilla (`db/seeds/`) | ⬜ bloquea a todo el equipo |
| Capa de acceso y RLS (`db/acceso/`) | ⬜ Persona A, semana 1 |

## Documentación

Índice completo en **[`docs/README.md`](docs/README.md)**.

| Carpeta | Responde a |
|---|---|
| `Contexto/` | Estado, decisiones cerradas y próximos pasos |
| `docs/00-producto/` | ¿Qué construimos y por qué? |
| `docs/01-arquitectura/` | ¿Cómo está construido? (ADR, permisos) |
| `docs/02-equipo/` | ¿Cómo trabajamos? (backlog, manual) |
| `docs/03-piloto/` | ¿Qué firmamos y aceptamos? |
| `docs/04-guias/` | ¿Cómo se usa y se opera? |
| `docs/05-validacion/` | ¿Qué nos dijeron los usuarios? |
| `api/openapi.yaml` | Contrato de API (junto al código, no en docs) |
| `db/schema/` | Esquema de datos en Drizzle |

## Arranque en una máquina limpia

Requiere Node.js 20 o superior (verificado con **24.19.0 LTS**) y una base
PostgreSQL accesible.

```bash
git clone <repo> && cd cresco
npm ci                        # instala las versiones exactas del lockfile
cp .env.example .env          # completar DATABASE_URL y claves
npm run db:migrate            # aplica la migración inicial
```

Comandos disponibles hoy:

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | Compila el esquema con TypeScript sin emitir |
| `npm run db:generate` | Regenera migraciones desde `db/schema/` |
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:check` | Detecta colisiones entre migraciones |
| `npm test` | Aún sin pruebas; el runner se conecta al montar CI |

`npm ci` y `npm run typecheck` se ejecutaron el 8 de agosto de 2026 y pasan en
limpio. `npm run db:generate` sobre el esquema actual responde *"No schema
changes"*: el esquema y `db/migrations/0000_cresco_inicial.sql` están
sincronizados, y esa es la comprobación de que nadie los desincronizó.

`npm run dev` (servidor Next) y `npx expo start` (apps) aparecerán cuando esos
proyectos existan. Ver [`Contexto/NEXT_STEPS.md`](Contexto/NEXT_STEPS.md).

## Servidor simulado

Para trabajar la app contra el contrato sin esperar al backend:

```bash
npx @stoplight/prism-cli mock api/openapi.yaml
```

## Comprobaciones antes de un PR

```bash
npm run typecheck
npm test          # incluirá las pruebas S-1 a S-7 de la matriz de permisos
```

## Licencia

Copyright © 2026 Equipo Neofix.

Cresco se distribuye bajo la **GNU Affero General Public License v3.0**
(AGPL-3.0). El texto completo está en [`LICENSE`](LICENSE).

En resumen: puedes usar, estudiar, modificar y redistribuir este código
libremente. Si lo despliegas como un servicio accesible por red, la AGPL te
obliga a ofrecer el código fuente de tu versión a quienes lo usen.

**Licenciamiento comercial.** Neofix conserva la titularidad del copyright, así
que puede ofrecer el mismo software bajo términos comerciales distintos a
instituciones que no puedan o no quieran cumplir la AGPL. Si es tu caso,
escríbenos antes de integrarlo.
