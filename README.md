# Cresco

Comunicación entre docentes y representantes legales de escuelas del Ecuador,
centrada en el seguimiento de responsabilidad y conducta.
El estudiante nunca es usuario de la aplicación.

Desarrollado por el equipo **Neofix** para el RevenueCat Shipaton 2026,
categoría Next Gen.

## Estado del proyecto

La implementación activa es una sola aplicación Expo con autenticación de Clerk
y backend de Convex:

| Pieza | Estado |
|---|---|
| Aplicación Expo (`movil/`) | Implementado: arranque, sesión y cierre de sesión |
| Clerk para Expo | Implementado: proveedor, caché segura de token y flujo alojado |
| Convex (`movil/convex/`) | Implementado: configuración de Clerk y consulta autenticada |
| Esquema de datos (`convex/schema.ts`) | Implementado: 41 tablas, portadas del modelo relacional original |
| Reglas de negocio y guardas (`convex/lib/`) | Implementado: constantes de dominio, guardas de integridad, capa de permisos |
| Datos semilla (`convex/semillas.ts`) | Implementado y cargado en al menos un despliegue de desarrollo |
| Webhook de RevenueCat (`convex/http.ts`) | Implementado, con pruebas (`npm test`) |
| Sistema de diseño (`movil/src/theme/Theme.ts`) | Implementado: color, tipografía, espaciado, iconografía |
| Integración continua (`.github/workflows/ci.yml`) | Implementado: tipos y pruebas en cada PR |
| Bitwarden Secrets Manager | Estructura lista en `.env.schema`, **sin vault compartido configurado todavía** — ver más abajo |
| **Las 31 pantallas del producto** | **Sin construir — es el trabajo que queda** |

No existe un servidor HTTP ni una base de datos SQL separados. `servidor/`,
`db/`, Better Auth, Next.js, PostgreSQL y Drizzle fueron retirados al adoptar
Clerk + Convex.

## Arquitectura activa

- `movil/src/App.tsx`: interfaz Expo y estado de autenticación.
- `movil/convex/auth.config.ts`: valida en Convex los JWT emitidos por Clerk.
- `movil/convex/viewer.ts`: ejemplo de función Convex autenticada.
- `movil/.env.schema`: contrato de configuración de Clerk y Convex.
- `.devcontainer/devcontainer.json`: entorno Node 24 con estado persistente de
  Varlock y Convex.

Los documentos de producto siguen en `docs/`. Las decisiones de arquitectura
anteriores a este cambio se conservan como contexto histórico, pero el código y
este README describen el runtime vigente.

## Arranque en una máquina limpia

Requiere Node.js 24, una aplicación de Clerk, un despliegue de Convex y una
cuenta de Bitwarden Secrets Manager.

```bash
git clone <repo> && cd cresco
npm ci
npm run convex:dev
```

El primer `convex:dev` autentica la CLI y crea `movil/.env.local`. Ese archivo
**no se comparte por git**: cada persona del equipo tiene su propio despliegue
de desarrollo de Convex, igual que antes cada quien tenía su propia base de
datos local.

> **Sobre Bitwarden:** `movil/.env.schema` ya tiene la estructura para traer las
> variables sensibles (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`,
> `EXPO_PUBLIC_CONVEX_URL`) desde un vault de Bitwarden Secrets Manager
> automáticamente al correr `npm run dev`. **Ese vault todavía no está
> configurado** — los `bitwarden(...)` de `.env.schema` apuntan a un UUID de
> relleno. Mientras el equipo decide si vale la pena terminarlo de conectar,
> `CLERK_JWT_ISSUER_DOMAIN` no es secreto (es la URL pública de la instancia de
> Clerk) y puede pegarse directo en `movil/.env.local` con
> `npx convex env set CLERK_JWT_ISSUER_DOMAIN <valor>`.

En Clerk activa la Native API y la integración de Convex. La integración debe
añadir `aud: "convex"` a los claims de sesión. Mientras la app no implemente un
selector de organizaciones, `Force organization selection` debe permanecer
desactivado; si se activa, Clerk deja la sesión en la tarea
`choose-organization` y Convex no puede autenticarla.

```bash
npm run env:check
npm run convex:sync-auth-env
npm run convex:dev
npm run dev
```

`convex:sync-auth-env` copia el Frontend API URL de Clerk al despliegue Convex.
No se usa un archivo `.env` local para secretos.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Inicia Expo mediante Varlock |
| `npm run convex:dev` | Configura o sincroniza el backend Convex |
| `npm run convex:sync-auth-env` | Configura el emisor JWT de Clerk en Convex |
| `npm run env:check` | Valida y resuelve la configuración |
| `npm run typecheck` | Comprueba TypeScript |
| `npm test` | Ejecuta las pruebas de funciones Convex |
| `npm run build` | Ejecuta la comprobación de compilación de la app |

## Comprobaciones antes de un PR

```bash
npm run env:check
npm run typecheck
npm test
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
