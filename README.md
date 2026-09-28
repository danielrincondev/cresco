# Cresco

Comunicación entre docentes y representantes legales de escuelas del Ecuador,
centrada en el seguimiento de responsabilidad y conducta.
El estudiante nunca es usuario de la aplicación.

Desarrollado por el equipo **Neofix** para el RevenueCat Shipaton 2026,
categoría Next Gen.

> **For Shipaton judges — English summary.** Cresco connects teachers and
> parents in Ecuadorian public schools around a child's school day: a daily
> report, a behaviour record whose score the family can dispute, meetings
> the teacher can call and document, and an emergency alert. In our field
> interviews teachers told us that a WhatsApp message is not evidence ("what
> counts is the written report"), so Cresco keeps a record of which families
> saw each notice, who opened each daily report, and what was agreed at each
> meeting. Monetisation runs on **RevenueCat**: a Premium entitlement for
> families (seven past reports instead of two, a printable PDF report, no ads)
> and a PRO entitlement for teachers (up to five courses), confirmed
> server-side by a RevenueCat webhook in Convex, with Test Store purchases
> flagged as sandbox. Families on the free plan see an AdMob banner and can
> unlock the PDF report by watching a rewarded ad; the revenue of both ads is
> reported to RevenueCat through `Purchases.adTracker`. Teachers never see
> ads. Built with Expo (React Native), Clerk and Convex. The app is in
> Spanish; the demo video has English subtitles.

### Run it yourself (English)

You need Node.js 24, a free [Clerk](https://clerk.com) application and a free
[Convex](https://convex.dev) account. No Docker, no database to install.

1. `npm ci` at the repository root.
2. From `movil/`, run `npx convex dev`. The first run logs you into Convex,
   creates your own development deployment and writes `movil/.env.local`,
   including `EXPO_PUBLIC_CONVEX_URL`. It will stop and ask for
   `CLERK_JWT_ISSUER_DOMAIN`: that is the next step.
3. In Clerk, enable the Native API, email and Google sign-in, and the Convex
   integration (it adds `aud: "convex"` to session tokens). Keep *Force
   organization selection* off. Then, from `movil/`:
   `npx convex env set CLERK_JWT_ISSUER_DOMAIN <your Clerk Frontend API URL>`,
   and run `npx convex dev` again; leave it running.
4. Load the catalogues once (conduct bands, categories, plans, report
   template); it is idempotent: `npx convex run semillas:cargar`.
5. Add `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…` to `movil/.env.local`.
6. From `movil/`, run `npx expo start`: scan the QR code with Expo Go on
   Android, or press `w` for the web preview.

Real purchases and ads need an EAS development build instead of Expo Go,
because RevenueCat and AdMob are native SDKs. Without
`EXPO_PUBLIC_REVENUECAT_API_KEY` the app still works and the paywalls are
informative only. To check the code: `npm run typecheck` and `npm test` from
the root (700+ tests); CI runs both, plus an Android bundle, on every pull
request.

## Qué hace Cresco hoy

**El docente**

- Crea sus cursos y parciales, invita a las familias con un código y aprueba
  a cada estudiante que registran. Corrige las fechas del año lectivo y puede
  eliminar un curso confirmando su contraseña; nada se borra, el curso deja
  de mostrarse.
- Anota conducta positiva o negativa. El puntaje del parcial se **deriva** de
  las anotaciones vigentes; una anotación se puede deshacer.
- Pasa lista, publica el reporte del día y ve **quién lo abrió**. Publica
  avisos y eventos al curso y ve **qué familias los vieron**.
- Ve el panorama del curso: quién no tiene ninguna anotación y las negativas
  que más se repiten.
- Atiende a las familias: publica su horario de atención, confirma las citas
  que le piden, **cita él mismo a una familia**, cancela con motivo, registra
  si la familia asistió y deja por escrito **los acuerdos de la reunión**.
- Ve el **historial de cada familia**: sus citas con los acuerdos, los avisos
  que vio y los que no, los reportes que abrió y sus reclamos.
- Responde los reclamos de las familias, con un plazo de 30 días que vence
  solo y sube de prioridad.
- Envía una alerta de emergencia al curso, después de volver a confirmar su
  contraseña. La aplicación declara que no sustituye al ECU 911.

**La familia**

- Registra a su hijo con el código del curso y acepta el consentimiento.
- Lee el reporte del día (en vivo, antes de que se publique), un resumen de
  la semana los fines de semana, los reportes anteriores y el acumulado del
  parcial, con frases de acompañamiento.
- Guarda o comparte el acumulado como informe en PDF: directo con Premium, o
  viendo un anuncio con premio en el plan gratuito.
- Reclama una anotación con la que no está de acuerdo.
- Pide citas, responde las citaciones del docente y recibe los acuerdos.
- Recibe avisos en el teléfono: el reporte publicado, anotaciones, avisos del
  curso, citas y alertas.

**Lo que corre solo**

- Cierre nocturno a las 22:00: publica los borradores y genera los reportes.
- Resumen de la semana por aviso, los sábados a las 09:00.
- Recordatorios de cada cita, la noche anterior y una hora antes, y de las
  citaciones que la familia no ha respondido.
- Vencimiento de cada reclamo a los 30 días.
- Cada madrugada, los cursos cuyo año lectivo terminó quedan finalizados y
  cierran sus matrículas. Desde el día siguiente al fin del año ya aparecen en
  «Cursos anteriores» y no ocupan cupo del plan.

## Monetización con RevenueCat

| | Gratuito | De pago |
|---|---|---|
| **Familia** (`premium`) | 2 reportes anteriores, con anuncio; informe en PDF viendo un anuncio con premio | Premium mensual o bimestral: 7 reportes anteriores e informe en PDF, sin anuncios |
| **Docente** (`docente_pro`) | 1 curso, hasta 40 estudiantes | PRO: hasta 5 cursos, 60 estudiantes por curso |

- Los precios los pone RevenueCat en la moneda de cada persona (ADR-006); la
  aplicación no guarda ninguno.
- La compra la confirma el servidor: el webhook de RevenueCat
  (`/webhooks/revenuecat`, en `movil/convex/http.ts`) actualiza la suscripción
  en Convex, y el acceso se decide ahí. Una suscripción cancelada conserva el
  acceso hasta que expira.
- Las compras del Test Store quedan marcadas como de prueba (ADR-008), para
  que la demostración no se mezcle con un piloto real.
- Los anuncios (AdMob: el banner y el anuncio con premio) solo existen en
  pantallas de la familia y desaparecen con Premium. Sus ingresos se reportan
  a RevenueCat con `Purchases.adTracker`. Hasta publicar en una tienda usan los
  identificadores de prueba de Google.

El detalle, incluida la build de desarrollo que hace falta para comprar de
verdad, está en
[`docs/04-guias/integracion-revenuecat.md`](docs/04-guias/integracion-revenuecat.md).

## Estado del proyecto

La implementación activa es una sola aplicación Expo con autenticación de Clerk
y backend de Convex:

| Pieza | Estado |
|---|---|
| Aplicación Expo (`movil/`) | 30 de las 31 pantallas del inventario, para docente y familia. La que falta, importar estudiantes por CSV (D9), se difirió a la v2 ([DP-013](docs/00-producto/decisiones/013-importar-csv-se-difiere.md)) |
| Clerk para Expo | Implementado: proveedor, caché segura de token, correo y Google |
| Esquema de datos (`convex/schema.ts`) | 43 tablas, portadas del modelo relacional original |
| Reglas de negocio y guardas (`convex/lib/`) | Implementado: constantes de dominio, guardas de integridad, capa de permisos |
| `convex/nucleo.ts` | Perfiles, cursos, parciales, invitaciones, vinculación y aprobación |
| `convex/conducta.ts` | Anotaciones y puntaje, asistencia, reportes, cierre nocturno, avisos del curso y constancia de lectura |
| `convex/interaccion.ts` | Citas y citaciones, reclamos, alertas, dispositivos y bandeja |
| `convex/push.ts` | Avisos en el teléfono con la API de Expo y Firebase Cloud Messaging, por dispositivo, con reintentos y recibos. El texto que llega al teléfono nunca nombra al estudiante |
| `convex/suscripciones.ts` y webhook de RevenueCat | Implementado, con pruebas |
| `convex/auditoria.ts` | Los cuatro eventos de DP-006 (`LOGIN`, `LEER_SENSIBLE`, `CREAR`/`ANULAR` acción, `APROBAR`), además de `ACTUALIZAR`, `ALERTA` y `EXPORTAR` (el informe en PDF) |
| Reautenticación antes de una alerta o de eliminar un curso (`convex/lib/reautenticacion.ts`) | Implementado: verifica la firma de Clerk contra el JWKS y exige verificación reciente |
| Datos semilla (`convex/semillas.ts`) | Catálogos: franjas, categorías de conducta, planes y plantilla del reporte |
| Sistema de diseño (`movil/src/theme/Theme.ts`) | Implementado: color, tipografía, espaciado, iconografía |
| Integración continua (`.github/workflows/ci.yml`) | Tipos, más de 700 pruebas y empaquetado de Android en cada PR |
| Propiedad por módulo (`.github/CODEOWNERS`) | Implementado: protección de `main` activa; exige CI y revisión |
| Banderas de activación (`convex/lib/flags.ts`) | Implementado |
| Bitwarden Secrets Manager | Configurado: el equipo trae las variables de un vault compartido (`movil/.env.schema`). Fuera del equipo se usan valores propios — ver más abajo |

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
- `movil/convex/crons.ts`: las tareas programadas.
- `movil/.env.schema`: contrato de configuración de Clerk y Convex.

### Dos cosas que conviene saber antes de leer el código

**El puntaje de conducta se deriva de las acciones vigentes** (ADR-005).
Registrar o anular una acción, y resolver un reclamo que la modifica o la
anula, recalculan el período y guardan el resultado en `puntajePeriodo`.

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

Los documentos de producto, del equipo y del piloto están en `docs/`, con su
índice en [`docs/README.md`](docs/README.md). Los que describían el stack
anterior se retiraron del árbol el 28 de septiembre de 2026 y siguen en el
historial de git (`git show c5ce997:docs/99-archivo/`).

## Arranque en una máquina limpia

Requiere Node.js 24 (npm viene incluido), una aplicación de Clerk y un
despliegue de Convex. No hace falta instalar `mise`, Docker ni un devcontainer;
las herramientas del proyecto se instalan con `npm ci`.

```bash
git clone https://github.com/danielrincondev/cresco && cd cresco
npm ci
npm run convex:dev
```

El primer `convex:dev` autentica la CLI y crea `movil/.env.local`. Ese archivo
**no se comparte por git**: cada persona del equipo tiene su propio despliegue
de desarrollo de Convex, igual que antes cada quien tenía su propia base de
datos local.

Un despliegue nuevo necesita los catálogos una vez (franjas, categorías de
conducta, planes y plantilla del reporte): sin ellos no se puede anotar
conducta ni ver un plan. Desde `movil/`, `npx convex run semillas:cargar`; es
idempotente, así que repetirlo no duplica nada.

> **Sobre las variables de entorno.** El equipo las trae de un vault de
> Bitwarden Secrets Manager: `movil/.env.schema` las declara y `npm run dev`
> las resuelve con Varlock, con solo el token de acceso en `movil/.env.local`
> (plantilla en [`.env.example`](.env.example)). **Fuera del equipo no hace
> falta Bitwarden:** pon en `movil/.env.local` los valores de tu propia
> aplicación de Clerk y tu despliegue de Convex
> (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CONVEX_URL`), sin
> `BITWARDEN_ACCESS_TOKEN`, y arranca con `npx expo start` desde `movil/`.
> `CLERK_JWT_ISSUER_DOMAIN` no es secreto (es la URL pública de la instancia de
> Clerk) y se configura en Convex con
> `npx convex env set CLERK_JWT_ISSUER_DOMAIN <valor>`.

En Clerk activa la Native API, Google como conexión social y la integración de
Convex. La integración debe añadir `aud: "convex"` a los claims de sesión.
Mientras la app no implemente un selector de organizaciones, `Force organization
selection` debe permanecer desactivado; si se activa, Clerk deja la sesión en la
tarea `choose-organization` y Convex no puede autenticarla.

Con el token del vault en `movil/.env.local`, el ciclo del equipo es:

```bash
npm run env:check
npm run convex:sync-auth-env
npm run convex:dev
npm run dev
```

`convex:sync-auth-env` copia el Frontend API URL de Clerk al despliegue Convex.
No se usa un archivo `.env` local para secretos.

Comprar de verdad y ver el anuncio exige una build de desarrollo de EAS, no
Expo Go: los dos SDKs son nativos. Los pasos están en la guía de RevenueCat.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Inicia Expo mediante Varlock |
| `npm run convex:dev` | Configura o sincroniza el backend Convex |
| `npm run convex:sync-auth-env` | Configura el emisor JWT de Clerk en Convex |
| `npm run env:check` | Valida y resuelve la configuración |
| `npm run typecheck` | Comprueba TypeScript de la app y de Convex |
| `npm test` | Ejecuta las pruebas: funciones de Convex y pantallas |
| `npm run build` | Comprueba tipos (no empaqueta; el bundle lo verifica el CI) |

## Comprobaciones antes de un PR

```bash
npm run env:check
npm run typecheck
npm test
```

El CI además empaqueta la app de Android. Si cambias dependencias o imports,
córrelo también antes de abrir el PR:

```bash
cd movil && npx expo export --platform android --output-dir /tmp/export
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
