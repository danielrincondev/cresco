# CLAUDE.md — Instrucciones permanentes para Claude Code

> **Instrucción vigente desde el 16 de agosto de 2026:** el runtime es una sola
> aplicación Expo con Clerk y Convex. No se debe reintroducir `servidor/`, `db/`,
> Next.js, Better Auth, PostgreSQL ni Drizzle. Las secciones posteriores que
> describen ese stack se conservan únicamente como contexto histórico.

## Qué es este proyecto

**Cresco** es una aplicación Android de comunicación entre **docentes** y
**representantes legales** de escuelas del Ecuador, centrada en el seguimiento de
responsabilidad y conducta del estudiante. La desarrolla el equipo **Neofix**.

El nombre es definitivo desde el 7 de agosto de 2026. Los nombres anteriores
—Vínculo, EduConecta, Conecta Educación— están descartados y no deben aparecer en
código, documentos ni materiales. Ojo: **`vinculo_representacion`, `ux_vinculo` y
el código de error `SIN_VINCULO` no son el nombre del producto**, son el término
del dominio (el vínculo representante–estudiante) y se quedan como están.

**El estudiante nunca es usuario de la aplicación.** Solo es sujeto de datos.

Dos aplicaciones dentro de una misma base de código:
- **App del docente:** herramienta de trabajo diaria (crea curso, registra
  acciones, toma asistencia, redacta el reporte del día).
- **App del representante:** informativa y simple (ve el reporte de hoy de su
  hijo, reclama una acción injusta, agenda una cita).

Contexto: equipo **Neofix**, 3 estudiantes de ingeniería, hackathon RevenueCat
Shipaton 2026, categoría Next Gen. Dos de los tres nunca han construido una app.
**Explica los conceptos, no solo el código.**

Las reglas verificadas de la categoría están en
`Contexto/reglas-shipaton-next-gen.md`. Dos consecuencias que cambian el plan
original: **no hace falta cuenta de Google Play Console**, y **el repositorio
debe ser público, de código abierto y con `LICENSE`** antes de enviar.

## Quién eres y con quién trabajas

Trabajas con **Persona C**, responsable de: citas, inconformidades, alertas de
emergencia, RevenueCat, notificaciones push, CI y despliegue.

El equipo se divide en tres módulos con dueños. **Persona C no edita el código de
los otros dos módulos.** Si hace falta un campo en una tabla ajena, se pide al
dueño; no se agrega.

| Persona | Módulo | Archivo de esquema |
|---|---|---|
| A | Identidad, estructura académica, vinculación, permisos | `db/schema/nucleo.ts` |
| B | Acciones, puntaje, asistencia, reportes | `db/schema/conducta.ts` |
| **C (usuario)** | Citas, alertas, RevenueCat, notificaciones, infra | `db/schema/interaccion.ts` |

Superficie compartida (cambiarla exige acuerdo de los tres):
`db/schema/enums.ts` y `api/openapi.yaml`.

## Stack tecnológico (decidido, no se rediscute)

- **PostgreSQL + Drizzle ORM** — migraciones generadas por `drizzle-kit`, nunca
  escritas a mano
- **Next.js como SERVIDOR** (no como frontend web): BetterAuth, rutas de API,
  webhook de RevenueCat, tarea nocturna de reportes
- **Expo / React Native** para las dos apps
- **BetterAuth con plugin de organización** (`organization` = institución)
- **RevenueCat SDK** para suscripciones — requisito obligatorio del hackathon
- **NativeWind** para estilos

**shadcn/ui NO se usa en las apps: es solo para web y no corre en React Native.**
Queda reservado para el panel web de la dirección en la v2. Si el usuario lo
menciona para una pantalla móvil, corrígelo.

**Tauri fue evaluado y descartado**: no tiene SDK de RevenueCat.

**Una sola app Expo**, no dos: enrutado por rol (docente/representante). Vive en
`movil/`. El servidor Next vive en `servidor/`. Son carpetas hermanas en la
raíz, cada una con su propio `package.json`, **sin `npm workspaces`** — no es
un monorepo (decisiones S1-S4, `DECISIONS.md`). No crees estas carpetas por
adelantado: las scaffoldea Persona C con `create-next-app` / `create-expo-app`
el primer día de la semana 1; crearlas antes puede romper ese paso.

## Estructura del repositorio

```
cresco/
├── Contexto/                     ← lo que Claude Code lee cada sesión
│   ├── CLAUDE.md
│   ├── CONTEXT.md
│   ├── DECISIONS.md
│   ├── NEXT_STEPS.md
│   └── reglas-shipaton-next-gen.md
├── README.md
├── LICENSE                       ← AGPL-3.0, NUNCA se edita
├── .env.example
├── .gitignore
├── package.json · package-lock.json
├── drizzle.config.ts
├── tsconfig.json
├── api/
│   └── openapi.yaml              ← contrato de API (32 rutas)
├── db/
│   ├── schema/
│   │   ├── enums.ts              ← COMPARTIDO
│   │   ├── nucleo.ts             ← Persona A
│   │   ├── conducta.ts           ← Persona B
│   │   ├── interaccion.ts        ← Persona C
│   │   └── index.ts
│   ├── migrations/               ← 0000_cresco_inicial.sql; generadas,
│   │                                NUNCA se editan a mano
│   ├── seeds/                    ← vacía, PENDIENTE de llenar
│   └── acceso/                   ← vacía, PENDIENTE (lo construye A)
├── servidor/                     ← Next.js. Nace con `create-next-app`,
│   │                                la scaffoldea Persona C (día 1, semana 1)
│   └── lib/puntaje.ts            ← de Persona B
├── movil/                        ← Expo, una sola app con enrutado por rol.
│   │                                Nace con `create-expo-app`, la
│   │                                scaffoldea Persona C (mismo día)
│   ├── theme/Theme.ts            ← de Persona A
│   └── components/base/          ← de Persona A
└── docs/
    ├── README.md                 ← índice; toda doc nueva se registra aquí
    ├── 00-producto/
    ├── 01-arquitectura/
    │   ├── adr/                  ← ADR-001 a ADR-006
    │   └── matriz-permisos.md
    ├── 02-equipo/
    ├── 03-piloto/
    │   └── firmados/             ← ignorada por Git
    ├── 04-guias/
    └── 05-validacion/
```

## Convenciones de código

| Elemento | Convención | Ejemplo |
|---|---|---|
| Tabla | `snake_case`, singular, español | `accion_registrada` |
| Columna en BD | `snake_case`, español | `fecha_ocurrencia` |
| Propiedad en Drizzle/TS | `camelCase` | `fechaOcurrencia` |
| Clave primaria | siempre `id`, tipo `uuid` | `id` |
| Clave foránea | `<tabla>_id` | `matricula_id` |
| Booleano | prefijo `es_`, `tiene_`, `requiere_` | `tiene_novedades` |
| Marca de tiempo | sufijo `_en`, tipo `timestamptz` | `publicado_en` |
| Índice único | `ux_<tabla>_<columnas>` | `ux_matricula_cursando` |
| Restricción check | `ck_<tabla>_<regla>` | `ck_accion_nota_cero` |
| Valores de estado | `MAYUSCULA_SNAKE` | `RESUELTA_MODIFICADA` |
| JSON de API | `snake_case`, igual que la BD | `puntaje_actual` |
| Commits | convencional | `feat(alertas): exige reautenticacion` |
| Ramas | `feat/`, `fix/`, `chore/` desde `develop` | `feat/webhook-idempotente` |

## Reglas que debes seguir siempre

1. **Los estados NO se escriben a mano.** Se importan de `db/schema/enums.ts`. Si
   necesitas un estado que no existe ahí, dilo: es un cambio de superficie
   compartida que requiere acuerdo del equipo.
2. **Las migraciones no se editan.** Se modifica el archivo de esquema y se
   ejecuta `npx drizzle-kit generate`.
3. **Prohibido `db.select()` suelto** sobre `estudiante`, `matricula`,
   `accion_registrada`, `reporte_estudiante` o `puntaje_periodo`. Toda consulta
   pasa por `db/acceso/`, que construye Persona A. Si la función que necesitas no
   existe, dilo; no la escribas en el módulo de C.
4. **El puntaje nunca se incrementa.** Se recalcula desde las acciones VIGENTES.
   Si te encuentras escribiendo `puntaje = puntaje - 1`, para y avisa.
5. **Nada se borra físicamente.** Se anula o se cambia de estado.
6. **Timestamps en UTC.** La conversión a `America/Guayaquil` ocurre en la
   pantalla, nunca en la base de datos.
7. **Secretos siempre en `.env`.** Nunca en el código, nunca en el repositorio.
8. **Nunca uses datos reales de estudiantes o representantes** en semillas,
   pruebas o ejemplos. Datos ficticios siempre.
9. **El contrato manda.** Si tu implementación difiere de `api/openapi.yaml`, el
   que está mal es el código, no el contrato.
10. **Si algo no está decidido, no lo decidas tú.** Consulta la sección
    "Pendiente de definir" de `CONTEXT.md` y pregunta al usuario.

## Definición de "terminado"

1. El endpoint responde según `openapi.yaml`, incluidos sus códigos de error.
2. La pantalla maneja los tres estados: cargando, vacío y error.
3. Si toca datos de estudiantes, hay una prueba de que un usuario sin vínculo
   recibe `403`.
4. Fue revisada y aprobada por otra persona del equipo (nadie fusiona su propio PR).
5. Funciona en un dispositivo Android real, no solo en el emulador.

## Estilo de trabajo esperado

- Prefiere soluciones simples y probadas sobre elegantes. El equipo tiene 6
  semanas de plazo interno y dos personas sin experiencia previa.
- Explica el porqué, no solo el cómo.
- Antes de escribir código que toque otro módulo, avisa.
- Verifica en documentación oficial cualquier detalle de RevenueCat, Expo o
  BetterAuth: son proyectos que cambian rápido.
