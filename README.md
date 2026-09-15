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
| Integración continua (`.github/workflows/ci.yml`) | Implementado: tipos y 252 pruebas en cada PR |
| Propiedad por módulo (`.github/CODEOWNERS`) | Implementado: protección de `main` activa; exige CI y revisión |
| Banderas de activación (`convex/lib/flags.ts`) | Implementado |
| Bitwarden Secrets Manager | Estructura lista en `.env.schema`, **sin vault compartido configurado todavía** — ver más abajo |
| `convex/nucleo.ts` | Implementado: perfiles, cursos, períodos, invitaciones, vinculación y aprobación |
| `convex/interaccion.ts` | Implementado: citas, reclamos, alertas, dispositivos y bandeja. Push y recálculo tras resolver reclamos pendientes de integración |
| `convex/conducta.ts` | Parcial: registrar acción con recálculo derivado. Asistencia, reportes y cierre nocturno en curso |
| `convex/auditoria.ts` | Productores implementados: `LOGIN` conectado; conexión de `LEER_SENSIBLE` a las pantallas en PR #62 |
| Reautenticación antes de una alerta (`convex/lib/reautenticacion.ts`) | Implementado: verifica la firma de Clerk contra el JWKS y exige verificación reciente |
| **Las 31 pantallas del producto** | **En construcción.** Hechas: alta de perfil, cursos y parciales, invitación y vinculación, consentimiento, aprobación de estudiantes, reclamos, agenda de citas, alerta de emergencia, notificaciones y ajustes |

No existe un servidor HTTP ni una base de datos SQL separados. `servidor/`,
`db/`, Better Auth, Next.js, PostgreSQL y Drizzle fueron retirados al adoptar
Clerk + Convex.

## Arquitectura activa

- `movil/src/App.tsx`: arranque de Expo, fuentes y estado de autenticación.
- `movil/src/screens/`: las pantallas, agrupadas por módulo de backend.
- `movil/src/components/`, `movil/src/theme/`: los componentes base y el sistema
  de diseño. Los colores deben salir de `Theme.ts`.
- `movil/convex/auth.config.ts`: valida en Convex los JWT emitidos por Clerk.
- `movil/convex/lib/`: reglas de dominio, guardas de integridad y permisos. Todo
  acceso a datos de un estudiante pasa por aquí, nunca por la pantalla.
- `movil/.env.schema`: contrato de configuración de Clerk y Convex.

### Dos cosas que conviene saber antes de leer el código

**El puntaje de conducta se deriva de las acciones vigentes** (ADR-005). Al
registrar una acción se recalcula y se guarda el resultado en `puntajePeriodo`.
La resolución de un reclamo ya cambia el estado y los puntos de la acción,
pero **todavía falta conectar el recálculo del período en ese flujo** (#9): el
total guardado puede quedar desactualizado hasta que se recalcule.

**El estudiante nunca es usuario.** No tiene cuenta ni puede iniciar sesión. Sus
datos los aporta su representante legal o su docente, y quién puede leerlos se
decide en el servidor en cada consulta.

## Cómo trabaja el equipo

Ramas cortas desde `main` → PR → revisión automática por `CODEOWNERS` → CI en
verde → fusión. El ciclo completo, paso a paso, está en
[`docs/02-equipo/flujo-de-trabajo.md`](docs/02-equipo/flujo-de-trabajo.md).

Las decisiones se registran **una por archivo y nunca se editan**: arquitectura
en [`docs/01-arquitectura/adr/`](docs/01-arquitectura/adr/), producto en
[`docs/00-producto/decisiones/`](docs/00-producto/decisiones/). Si una decisión
cambia, se escribe otra que la reemplaza y la anterior queda marcada
`Reemplazada`, no borrada.

Las reglas de negocio con valor concreto (puntajes, topes, plazos, colores) no
viven en ningún documento: viven en `movil/convex/lib/enums.ts`,
`movil/convex/schema.ts` y `movil/src/theme/Theme.ts`, donde no pueden
desincronizarse de lo que la aplicación realmente hace.

Los documentos de producto siguen en `docs/`. Las decisiones de arquitectura
anteriores a este cambio se conservan como contexto histórico en
`docs/99-archivo/`, pero el código y este README describen el runtime vigente.

## Arranque en una máquina limpia

Requiere Node.js 24 (npm viene incluido), una aplicación de Clerk y un
despliegue de Convex. No hace falta instalar `mise`, Docker ni un devcontainer;
las herramientas del proyecto se instalan con `npm ci`.

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

En Clerk activa la Native API, Google como conexión social y la integración de
Convex. La integración debe añadir `aud: "convex"` a los claims de sesión.
Mientras la app no implemente un selector de organizaciones, `Force organization
selection` debe permanecer desactivado; si se activa, Clerk deja la sesión en la
tarea `choose-organization` y Convex no puede autenticarla.

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
| `npm run build` | Comprueba tipos (no empaqueta; el bundle lo verifica el CI) |

## Comprobaciones antes de un PR

```bash
npm run env:check
npm run typecheck
npm test
```

## Desarrollo diario

Desde la raíz del repositorio, abre dos terminales:

```bash
# Terminal 1: sincroniza Convex y observa cambios del backend
npm run convex:dev
```

```bash
# Terminal 2: inicia Expo; pulsa w para web o escanea el QR desde Android
npm run dev
```

Si la red local no permite que el teléfono alcance tu computadora, usa el
túnel incluido en las dependencias del proyecto:

```bash
npm run dev --workspace @cresco/movil -- --tunnel
```

No hace falta instalar `@expo/ngrok` globalmente.

Para iniciar solo la vista web sin abrir el navegador automáticamente:

```bash
BROWSER=none npm run dev --workspace @cresco/movil -- --web --localhost
```

Para comprobar el backend con una sola sincronización:

```bash
npm run convex:dev --workspace @cresco/movil -- --once
```

Los argumentos adicionales se pasan directamente al workspace, como en los
ejemplos anteriores.

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
