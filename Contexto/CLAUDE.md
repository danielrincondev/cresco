# CLAUDE.md — Instrucciones permanentes para Claude Code

> **Reescrito el 22 de agosto de 2026.** La versión anterior describía el stack
> retirado (PostgreSQL + Drizzle + Next.js + Better Auth) y sus diez reglas
> ordenaban usar `db/acceso/`, `drizzle-kit` y `api/openapi.yaml` como contrato
> — rutas que ya no existen. Se conserva en el historial de git
> (`git show ba3b4b8:Contexto/CLAUDE.md`).

## Qué es este proyecto

**Cresco** es una aplicación Android de comunicación entre **docentes** y
**representantes legales** de escuelas del Ecuador, centrada en el seguimiento de
responsabilidad y conducta del estudiante. La desarrolla el equipo **Neofix**.

El nombre es definitivo desde el 7 de agosto de 2026. Los nombres anteriores
—Vínculo, EduConecta, Conecta Educación— están descartados y no deben aparecer en
código, documentos ni materiales. Ojo: **`vinculoRepresentacion` y el código de
error `SIN_VINCULO` no son el nombre del producto**, son el término del dominio
(el vínculo representante–estudiante) y se quedan como están.

**El estudiante nunca es usuario de la aplicación.** Solo es sujeto de datos.

Dos aplicaciones dentro de una misma base de código, con enrutado por rol:
- **App del docente:** herramienta de trabajo diaria (crea curso, registra
  acciones, toma asistencia, redacta el reporte del día).
- **App del representante:** informativa y simple (ve el reporte de hoy de su
  hijo, reclama una acción injusta, agenda una cita).

Contexto: equipo **Neofix**, 3 estudiantes de ingeniería, hackathon RevenueCat
Shipaton 2026, categoría Next Gen. Dos de los tres nunca han construido una app,
y el usuario se considera principiante en git/GitHub.
**Explica los conceptos, no solo el código.**

Las reglas verificadas de la categoría están en
`Contexto/reglas-shipaton-next-gen.md`: **no hace falta cuenta de Google Play
Console**, y **el repositorio debe ser público, de código abierto y con
`LICENSE`** antes de enviar.

## Quién eres y con quién trabajas

Trabajas con **Persona C** (`@Kenny28-176`), responsable de: citas,
inconformidades, alertas de emergencia, RevenueCat, notificaciones push, CI y
despliegue. Es además Product Manager con potestad delegada por A y B.

| Persona | GitHub | Módulo | Su archivo |
|---|---|---|---|
| A — Daniel | `@danielrincondev` | Identidad, estructura académica, vinculación | `convex/nucleo.ts` |
| B | `@JerePoveda` | Acciones, puntaje, asistencia, reportes | `convex/conducta.ts` |
| **C (usuario)** | `@Kenny28-176` | Citas, alertas, RevenueCat, notificaciones, infra | `convex/interaccion.ts` |

**Persona C no edita el código de los otros dos módulos.** Si hace falta un
campo en una tabla ajena, se pide al dueño; no se agrega.

**Superficie compartida** (cambiarla exige acuerdo de los tres, y
`.github/CODEOWNERS` lo hace cumplir automáticamente): `convex/schema.ts`,
`convex/lib/enums.ts`, `convex/lib/guardas.ts`, `convex/lib/permisos.ts`,
`convex/lib/flags.ts`.

## Stack tecnológico (decidido, no se rediscute)

- **Convex** — base de datos reactiva + funciones de servidor
  (`query` / `mutation` / `action` / `httpAction`) + cron. Reemplazó a
  PostgreSQL, Drizzle, Next.js y las migraciones.
- **Clerk** — autenticación. Se usan los **hooks** (`useAuth`, `useUser`,
  `useSignIn`), no los componentes nativos de su SDK de Expo, que siguen en beta.
- **Expo / React Native** (`movil/`) — una sola app con enrutado por rol.
- **RevenueCat SDK** + **Test Store** — suscripciones; requisito del hackathon.
- **NativeWind** para estilos, con `movil/src/theme/Theme.ts` como única fuente
  de tokens visuales.

**No se debe reintroducir** `servidor/`, `db/`, Next.js, Better Auth, PostgreSQL,
Drizzle, RLS ni `openapi.yaml` como contrato ejecutable.

**shadcn/ui NO se usa:** es solo para web y no corre en React Native.
**Tauri fue evaluado y descartado**: no tiene SDK de RevenueCat.

## Estructura del repositorio

```
cresco/
├── Contexto/                     ← lo que Claude Code lee cada sesión
├── README.md · LICENSE           ← LICENSE es AGPL-3.0, NUNCA se edita
├── package.json                  ← raíz, con npm workspaces → ["movil"]
├── .github/
│   ├── CODEOWNERS                ← propiedad por módulo, aplicada por GitHub
│   ├── pull_request_template.md
│   └── workflows/ci.yml          ← typecheck + pruebas en cada PR
├── movil/                        ← la aplicación Expo (único paquete)
│   ├── src/
│   │   ├── App.tsx
│   │   └── theme/Theme.ts        ← tokens visuales, única fuente de #hex
│   └── convex/
│       ├── schema.ts             ← COMPARTIDO — 41 tablas
│       ├── auth.config.ts        ← valida los JWT de Clerk
│       ├── http.ts               ← webhook de RevenueCat
│       ├── semillas.ts           ← datos semilla, idempotentes
│       ├── suscripciones.ts
│       ├── nucleo.ts             ← Persona A  (por escribir)
│       ├── conducta.ts           ← Persona B  (por escribir)
│       ├── interaccion.ts        ← Persona C  (por escribir)
│       └── lib/
│           ├── enums.ts          ← COMPARTIDO — estados y REGLAS
│           ├── guardas.ts        ← COMPARTIDO — validaciones de dominio
│           ├── permisos.ts       ← COMPARTIDO — autorización y auditoría
│           ├── flags.ts          ← COMPARTIDO — banderas de activación
│           └── revenuecat.ts
└── docs/                         ← índice en docs/README.md
    ├── 00-producto/decisiones/   ← DP-001..008, una por archivo
    ├── 01-arquitectura/adr/      ← ADR-001..008, una por archivo
    ├── 02-equipo/                ← flujo-de-trabajo.md, manual, backlog
    └── 99-archivo/               ← reemplazados, nunca borrados
```

## Convenciones de código

| Elemento | Convención | Ejemplo |
|---|---|---|
| Tabla de Convex | `camelCase`, singular, español | `accionRegistrada` |
| Campo | `camelCase`, español | `fechaOcurrencia` |
| Identificador | `_id` nativo de Convex (`Id<"tabla">`) | `Id<"estudiante">` |
| Referencia a otra tabla | `<tabla>Id` | `matriculaId` |
| Booleano | prefijo `es`, `tiene`, `requiere` | `tieneNovedades` |
| Marca de tiempo | sufijo `En`, número (epoch ms) | `publicadoEn` |
| Fecha sin hora | sufijo `Fecha` o similar, `"YYYY-MM-DD"` | `fechaOcurrencia` |
| Valores de estado | `MAYUSCULA_SNAKE`, desde `enums.ts` | `RESUELTA_MODIFICADA` |
| Commits | convencional | `feat(alertas): exige reautenticacion` |
| Ramas | `feat/`, `fix/`, `chore/` **desde `main`** | `feat/webhook-idempotente` |

## Reglas que debes seguir siempre

1. **Los estados NO se escriben a mano.** Se importan de `convex/lib/enums.ts`.
   Si necesitas un estado que no existe ahí, dilo: es superficie compartida y
   requiere acuerdo de los tres.
2. **No hay migraciones.** El esquema es `convex/schema.ts`; `npx convex dev` lo
   aplica. Los validadores (`v.union(v.literal(...))`) reemplazan a los `CHECK`
   de dominio y los verifica el compilador de TypeScript.
3. **Las validaciones de rango y condición viven en `convex/lib/guardas.ts`.**
   Convex no tiene `CHECK` para eso. Antes de escribir una validación nueva,
   revisa si ya existe una guarda (`exigirTopeDiario`, `exigirRangoFechas`,
   `exigirVentanaComunicado`, …).
4. **Ninguna función toca `ctx.db` sobre `estudiante`, `matricula`,
   `accionRegistrada`, `reporteEstudiante` o `puntajePeriodo` sin pasar por
   `convex/lib/permisos.ts`.** Con Convex se perdió la capa RLS de PostgreSQL:
   `permisos.ts` es la **única** defensa que queda, no una de dos.
5. **El puntaje nunca se incrementa.** Se recalcula desde las acciones VIGENTES
   con `calcularPuntaje()`. Si te encuentras escribiendo `puntaje = puntaje - 1`,
   para y avisa.
6. **Nada se borra físicamente.** Se anula o se cambia de estado.
7. **La unicidad no la garantiza la base de datos.** Convex no tiene
   `UNIQUE INDEX`: se comprueba con una lectura indexada **dentro** de la misma
   mutation (que es serializable). Si escribes un insert sin esa comprobación
   previa donde el modelo original tenía un índice único, es un bug.
8. **Fechas del dominio en `"YYYY-MM-DD"` de `America/Guayaquil`**
   (`hoyEnGuayaquil()`); marcas de tiempo técnicas en epoch ms UTC.
9. **Secretos nunca en el código ni en el repositorio.** Van a variables de
   entorno del despliegue de Convex o a `movil/.env.local` (ignorado por git).
10. **Nunca uses datos reales de estudiantes o representantes** en semillas,
    pruebas o ejemplos. Datos ficticios siempre.
11. **Si algo no está decidido, no lo decidas tú.** Revisa
    `docs/00-producto/decisiones/` y `docs/01-arquitectura/adr/`, y pregunta.

## Dónde vive la verdad

Antes de responder "¿qué se decidió sobre X?", busca en este orden:

| Pregunta | Fuente de verdad |
|---|---|
| ¿Cuál es el valor exacto de una regla? | El código: `convex/lib/enums.ts` (`REGLAS`), `schema.ts`, `Theme.ts` |
| ¿Por qué se decidió así (producto)? | `docs/00-producto/decisiones/` (DP-001..008) |
| ¿Por qué se decidió así (arquitectura)? | `docs/01-arquitectura/adr/` (ADR-001..008) |
| ¿Cómo trabaja el equipo? | `docs/02-equipo/flujo-de-trabajo.md` |
| ¿Qué falta hacer? | GitHub Issues y el Project board |

**Un DP o un ADR nunca se edita.** Si una decisión cambia, se escribe uno nuevo
que reemplaza al anterior, y el viejo pasa a `Reemplazada`. Lo mismo con los
documentos: se marcan `Reemplazado` y se mueven a `docs/99-archivo/`, no se
borran.

`Contexto/CONTEXT.md` y `Contexto/DECISIONS.md` contienen decisiones de producto
todavía válidas, pero **sus secciones de arquitectura son históricas** — ambos
lo advierten en su cabecera.

## Definición de "terminado"

1. La función de Convex valida sus argumentos y aplica las guardas y permisos que
   le corresponden.
2. La pantalla maneja los tres estados: cargando, vacío y error.
3. Si toca datos de estudiantes, hay una prueba de que un usuario sin vínculo
   recibe `ErrorPermiso`.
4. `npm run typecheck` y `npm test` pasan.
5. Fue revisada y aprobada por otra persona (nadie fusiona su propio PR — GitHub
   lo hace cumplir vía CODEOWNERS y branch protection).
6. Funciona en un dispositivo Android real, no solo en el emulador.

## Comandos

```bash
npm run typecheck      # tsc de la app y de convex/
npm test               # pruebas (vitest)
npm run convex:dev     # sincroniza el esquema y las funciones
npm run dev            # arranca Expo mediante Varlock
```

## Estilo de trabajo esperado

- Prefiere soluciones simples y probadas sobre elegantes. Quedan pocas semanas y
  dos personas sin experiencia previa.
- Explica el porqué, no solo el cómo. Con el usuario, usa ejemplos concretos del
  propio repo en vez de descripciones abstractas.
- Antes de escribir código que toque otro módulo o la superficie compartida,
  avisa.
- Verifica en documentación oficial cualquier detalle de Convex, Clerk, RevenueCat
  o Expo: son proyectos que cambian rápido.
- **Nunca hagas `git push` ni operaciones destructivas sin confirmación explícita
  del usuario, cada vez.**
