# NEXT_STEPS.md — Por dónde continuar

Estado al **viernes 21 de agosto de 2026**. Proyecto **Cresco**, equipo
**Neofix**. El usuario es **Persona C** (interacción, RevenueCat,
notificaciones, infraestructura, y Product Manager con potestad delegada por A
y B).

> **Reemplaza al plan anterior**, que Daniel archivó el 16 de agosto porque
> describía el stack retirado (Next.js + PostgreSQL + Drizzle + Better Auth).
> La versión archivada sigue en el historial de git si hace falta consultarla.

---

## El calendario, y por qué no hay que entrar en pánico

| Hito | Fecha | Faltan |
|---|---|---|
| Hoy | viernes 21 de agosto | — |
| Punto de control | miércoles 2 de septiembre | 12 días |
| Deadline interno | domingo 20 de septiembre | 4 semanas y 2 días |
| **Envío del equipo** | **lunes 28 de septiembre** | **5 semanas y 1 día** |
| Cierre oficial del Shipaton | 30 de septiembre | — |

**El equipo está de vacaciones hasta el 10 de octubre.** Eso cambia el cálculo
respecto al plan de agosto, que asumía tres estudiantes trabajando alrededor de
clases: ahora hay disponibilidad completa durante todo el tramo que queda.

---

## Qué hay construido hoy

Verificado, no estimado — `npm run typecheck` y `npm test` pasan en limpio
desde la raíz.

| Pieza | Estado |
|---|---|
| Migración a Expo + Clerk + Convex | ✅ fusionada a `main` |
| Autenticación Clerk → Convex | ✅ el spike está cerrado: `convex/viewer.ts` prueba que la identidad llega al backend |
| Esquema (41 tablas) | ✅ `convex/schema.ts` |
| Constantes de dominio y reglas | ✅ `convex/lib/enums.ts` |
| Guardas de integridad | ✅ `convex/lib/guardas.ts` |
| Capa de permisos | ✅ `convex/lib/permisos.ts` |
| Datos semilla | ✅ `convex/semillas.ts` — falta **ejecutarlas** |
| Webhook de RevenueCat | ✅ `convex/http.ts` + `convex/suscripciones.ts`, 18 pruebas |
| Tokens visuales | ✅ `movil/src/theme/Theme.ts` |
| Integración continua | ✅ `.github/workflows/ci.yml` |
| **Las 31 pantallas** | ⬜ **es todo lo que falta** |

---

## Lo que hay que hacer ahora, en orden

### 1. Configurar Convex y Clerk 🔴 — bloquea a todo el equipo

Sin esto nadie puede correr nada. Lo hace **Persona C** (infraestructura):

```bash
cd movil
npx convex dev          # crea el proyecto y regenera _generated/
```

Ese comando también arregla el único parche pendiente: `_generated/api.d.ts`
está editado a mano para que el repo compile sin cuenta de Convex, y `convex
dev` lo regenera correctamente.

Después, en el panel de Convex, definir las variables de entorno:
`CLERK_JWT_ISSUER_DOMAIN` y `REVENUECAT_WEBHOOK_SECRET`.

### 2. Cargar las semillas 🔴 — llevan bloqueando desde el 8 de agosto

```bash
npx convex run semillas:cargar
```

Es idempotente: se puede correr las veces que haga falta. Deja las 6 franjas
con su color y su frase, las 6 categorías, los 7 tipos de acción, los 5 planes
con sus límites y la plantilla del reporte con sus 4 campos.

### 3. Los seis componentes base 🔴 — Persona A

`Theme.ts` ya tiene todos los tokens. Faltan los componentes que los usan:
tarjeta, botón, campo, chip de estado, encabezado y estado vacío — cada uno con
sus cuatro estados (normal, presionado, deshabilitado, cargando).

Hay una verificación técnica que hacer **antes** de construir la navegación:
Material Symbols necesita cargarse como fuente variable con `expo-font`
(`@expo/vector-icons` no sirve, trae la versión clásica sin el eje de relleno).
Probar `fontVariationSettings` en un Android real antes de apoyar las 31
pantallas sobre ese patrón.

### 4. Las funciones de Convex, por módulo

El reparto no cambia. Lo que cambia es que ahora se escriben como funciones de
Convex en vez de rutas de API:

| Persona | Archivo | Qué escribe |
|---|---|---|
| A | `convex/nucleo.ts` | Curso, año lectivo, períodos, invitación, vinculación, aprobación de estudiantes |
| B | `convex/conducta.ts` | Acciones, puntaje, asistencia, reportes, cron nocturno |
| C | `convex/interaccion.ts` | Citas, inconformidades, alertas, notificaciones |

**La especificación ya existe.** Cada operación está descrita en
`docs/99-archivo/openapi-v1.1.0-archivado.yaml` (32 rutas), y la lógica del
módulo A que Daniel llegó a escribir sobre Drizzle sigue en el historial:

```bash
git show cf65f89:db/acceso/cursos.ts       # y periodos, aprobacion, vinculacion
```

**Regla que no cambió y ahora importa más:** ninguna función toca `ctx.db`
sobre estudiante, matrícula, acción, reporte o puntaje sin pasar por
`convex/lib/permisos.ts`. Con Convex se perdió la capa RLS de PostgreSQL, así
que esa es la única defensa que queda.

### 5. Las pantallas

31 en total. El corte MoSCoW se decidió **no hacer** el 14 de agosto,
compensando con más carga diaria. El punto de control del 2 de septiembre es
donde eso se revisa con datos reales de cuánto tardan las primeras pantallas —
no antes, no después.

---

## Lo que solo puede hacer Persona C, y sigue pendiente

1. **Hablar con un profesor real.** Estaba agendado para el 16 de agosto y no
   ocurrió. Es el mayor riesgo abierto del proyecto: si un docente dice "esto
   no es lo que necesito", ningún stack los protege de eso. La presentación y
   el FAQ están escritos desde el 7 de agosto, sin usar.
2. **Cuentas:** RevenueCat (Test Store), Expo/EAS, Devpost con correo académico
   los tres.
3. **Development build de Expo** — `react-native-purchases` es módulo nativo y
   no funciona en Expo Go.
4. **Panel de RevenueCat:** los 3 productos comprables
   (`REP_PREMIUM_MENSUAL`, `REP_PREMIUM_BIMESTRAL`, `DOC_PRO`), adjuntarlos a
   un *offering* — sin ese paso `getOfferings()` devuelve vacío y el error no
   es claro — y los entitlements `premium` y `docente_pro`.
5. **Aviso de privacidad y carta del piloto**, comprometidos para el 21 de
   agosto.
6. **Proteger `main` en GitHub** y marcar el check del CI como obligatorio.
   Sin ese segundo paso el CI se pone rojo pero el botón de fusionar sigue
   verde: son dos cosas distintas.

---

## Después del 20 de septiembre

Los 8 días entre el deadline interno y el envío se usan para:

- **El diferenciador de IA**, si los 18 *Must* están cerrados. Se construye
  detrás de una bandera de activación, para poder no activarlo sin revertir ni
  fusionar nada. Modelo por decidir entre Claude Haiku 4.5 y GPT-5 Nano, tras
  probar con notas reales de un docente.
- Pulido visual, prueba con un profesor real, y ensayo del video.

**No se usan para ampliar alcance.**
