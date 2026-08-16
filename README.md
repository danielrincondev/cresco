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
| Bitwarden Secrets Manager | Implementado: resolución por token de máquina y UUID |

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

El primer `convex:dev` autentica la CLI y crea `movil/.env.local`. Guarda en
Bitwarden el URL generado y los valores de Clerk; después entrega al proceso las
cuatro variables bootstrap documentadas en `.env.example`.

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
