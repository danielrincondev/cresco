# CONTEXT.md — Estado del proyecto Cresco

> **Reescrito el 22 de agosto de 2026.** La versión anterior describía el stack
> retirado en su sección de arquitectura, y su "Estado del repositorio" y su
> lista de "Pendiente de definir" habían quedado obsoletos (afirmaban que no
> había commits, ni proyecto Expo, ni CI, ni pruebas — todo eso ya existe).
> Se conserva en el historial: `git show ba3b4b8:Contexto/CONTEXT.md`.

---

## 1. Objetivo

**Cresco** es una aplicación Android de comunicación entre docentes y
representantes legales de escuelas del Ecuador, para seguimiento de
responsabilidad y conducta del estudiante. El estudiante nunca es usuario.
La desarrolla el equipo **Neofix**.

Metas declaradas por el equipo: reemplazar el canal informal (grupos de
mensajería), devolver respaldo institucional a la autoridad del docente, y dar al
representante información accionable el mismo día en formato legible sin
conocimientos estadísticos.

## 2. Plazos

| Hito | Fecha |
|---|---|
| Punto de control | miércoles 2 de septiembre |
| **Deadline interno** | domingo 20 de septiembre |
| **Envío del equipo** | **lunes 28 de septiembre** |
| Cierre oficial del Shipaton | 30 de septiembre, 23:45 PDT |

**El equipo está de vacaciones académicas hasta el 10 de octubre**, así que hay
disponibilidad completa durante todo el tramo que queda — a diferencia del plan
de agosto, que asumía trabajar alrededor de clases.

Los 8 días entre el deadline interno y el envío se reservan para el
diferenciador, pulido y prueba con usuarios reales. **No se usan para ampliar
alcance.**

## 3. Alcance de la v1

**Incluye:** autenticación y dos perfiles; creación de curso, año lectivo y
parciales; invitación al curso; registro de estudiantes por el representante con
aprobación del docente; acciones positivas y negativas; anuncios (notas del
profesor y eventos); asistencia; reporte general diario y reporte por estudiante;
reporte acumulado del parcial; inconformidades; citas; alerta de emergencia;
suscripciones vía RevenueCat.

**Excluido de la v1 (diferido a v2):** administrador de institución / rectoría;
preguntas del representante al docente sobre un reporte; licencia institucional;
segundo representante por estudiante; panel web; iOS; mensajería libre;
calificaciones académicas; rol `DOCENTE_COLABORADOR`.

## 4. Arquitectura vigente

Ver los ADR en `docs/01-arquitectura/adr/`. Resumen:

- **Convex** es la base de datos y el servidor a la vez: `query`, `mutation`,
  `action`, `httpAction` y cron. Reemplazó a PostgreSQL + Drizzle + Next.js
  (ADR-001 y ADR-002, ambos `Reemplazados`).
- **Clerk** autentica (ADR-003, `Reemplazado`). El identificador canónico del
  sistema es `perfilUsuario._id`, **no** el id de Clerk, que vive aparte en
  `authSubject` con su propio índice. Orden obligatorio al arrancar: Clerk
  autentica → se busca o crea el `perfilUsuario` → recién entonces
  `Purchases.logIn(perfilId)`.
- **`convex/lib/permisos.ts` es la única capa de autorización** (ADR-004,
  `Reemplazado`). Con Convex se perdió la RLS de PostgreSQL: ya no hay una
  segunda capa de defensa, y la bitácora de `auditoria` pasa a ser el control
  compensatorio (DP-006).
- **ADR-005 — el puntaje es derivado, nunca un contador:**
  `puntaje = clamp(60 + Σ puntos de acciones VIGENTES del período, 0, 100)`.
  `puntajePeriodo` es una caché reconstruible.
- **ADR-006 — RevenueCat es la fuente de verdad de pagos.** `suscripcion` es una
  proyección local. El webhook es idempotente por `eventoIdExterno`, comprobado
  con una lectura indexada dentro de la mutation. `CANCELLATION` **no** significa
  vencido: el acceso sigue hasta `expiraEn`.
- **ADR-007 / ADR-008 — entrega sin tienda**, con Test Store de RevenueCat para
  probar compras sin Google Play Console.

## 5. Reglas de negocio confirmadas

> Los valores exactos viven en `movil/convex/lib/enums.ts` (`REGLAS`). Esta
> sección explica el porqué; si un número difiere, **manda el código**.

### Puntaje
- Base **60** por parcial, piso **0**, techo **100**. Se reinicia cada parcial.
- Positivas: **+1** por defecto, el docente puede subirlas a **+2**.
- Irresponsabilidad: **siempre −1**, fijo, no ajustable.
- Indisciplina y deshonestidad: **−1 a −3**, a criterio del docente.
- Topes diarios: máximo **+4** y máximo **−5** por estudiante por día
  (`exigirTopeDiario`).
- Al cerrar el parcial el puntaje se **congela**.
- El puntaje **nunca** modifica calificaciones académicas.

### Franjas de conducta
0–15 crítica · 16–30 muy por debajo · 31–50 por debajo · 51–60 punto de partida ·
61–80 buen desempeño · 81–100 excelente. Cada una con su color y su frase
orientadora, sembradas en `convex/semillas.ts`. Siempre acompañadas del puntaje
numérico, para no depender solo del color.

### Acciones y anuncios (DP-002 y DP-003)
- **Por estudiante** (`accionRegistrada`): **Positiva** o **Negativa**. No hay
  catálogo de nombres — el docente elige una categoría y escribe el mensaje
  libre. Categorías negativas: `INDISCIPLINA`, `IRRESPONSABILIDAD`,
  `DESHONESTIDAD`.
- **Por curso** (`comunicadoCurso`): **Nota del profesor** (a un representante o
  a todo el curso, visible de 1 a 7 días) o **Evento** (texto largo expandible,
  visible hasta la fecha de expiración que fija el docente).
- Los anuncios no entran en el cálculo del puntaje ni en la bitácora del
  acumulado.
- Estados de una acción: `VIGENTE` (cuenta), `ANULADA` (0 puntos, "anulada por el
  docente"), `MODIFICADA` (0 puntos, "resuelta con el representante").
- **Solo las negativas** se pueden anular y reclamar.

### Vinculación
- El docente escribe el nombre de su escuela como **texto libre**; la institución
  queda con `verificada = false`. No hay administrador en la v1.
- La invitación es al **CURSO**, no a un estudiante. Dura **30 días**, admite
  varios usos.
- El **representante** registra los datos de su hijo al canjear el código; el
  estudiante queda `PENDIENTE` hasta que el docente lo apruebe. Al aprobar nace la
  matrícula con puntaje 60.
- Camino secundario: el docente puede importar la lista por CSV. El archivo se
  parsea y **se descarta**; nunca se almacena.
- **Un solo representante legal por estudiante** en la v1
  (`exigirVinculo`; segundo intento = conflicto).
- Un representante puede tener hijos en colegios distintos; cambia con una barra
  superior.
- El consentimiento se guarda con la **versión del documento** aceptado, no como
  booleano.

### Reportes
- El reporte general del curso es **opcional**; ningún campo es obligatorio.
- Los campos vienen de `plantillaCampo`, no del código: Anuncios, Novedades del
  día, Tareas enviadas (texto largo) y Consejo del día (texto corto) — DP-004.
- Si no hay reporte general pero hubo acciones, **igual se genera** el reporte del
  estudiante.
- Si no hay reporte de hoy, la app muestra "Aún no tienes reporte nuevo, pero
  puedes ver el anterior".
- Historial: plan gratuito **2** reportes anteriores, premium **7**.
- El representante **sí ve** los puntos de cada acción.
- `reporteEstudiante` es una fotografía inmutable del día.

### Interacción
- **Inconformidades:** solo sobre acciones negativas vigentes. El docente tiene
  **30 días**; vencido pasa a `VENCIDA`. Resolver como `RESUELTA_MODIFICADA` lleva
  la acción a `MODIFICADA` (0 puntos) y devuelve los puntos.
- **Citas:** el docente publica su horario, se parte en bloques de **15 minutos**.
  El representante reserva y nace `SOLICITADA`; **requiere confirmación** del
  docente.
- **Alertas de emergencia:** el docente debe **reautenticarse** antes de activar
  (se guarda `reautenticadoEn`). Alcance `CURSO` o `ESTUDIANTE`. Queda auditada.
  La app debe declarar visiblemente que **no sustituye al ECU 911**. El
  representante confirma lectura.

### Monetización (DP-005)
- Cinco planes: `REP_FREE`, `REP_PREMIUM_MENSUAL` ($1.99),
  `REP_PREMIUM_BIMESTRAL` ($2.99), `DOC_FREE`, `DOC_PRO` ($4.99/mes).
- Dos entitlements separados: `premium` (representante) y `docente_pro`.
- Premium del representante es **por cuenta** (cubre a todos sus hijos).
- El docente **sí tiene límites de pago**: `DOC_FREE` = 1 curso activo y 40
  estudiantes; `DOC_PRO` = 5 cursos y 60 estudiantes.
- "Por parcial" se mapea a suscripción **bimestral**.
- Publicidad: AdMob, siempre en contenedor visual propio, separado del contenido
  real. El plan gratuito puede exportar el PDF del acumulado viendo un **anuncio
  recompensado**.
- Al alcanzar un límite, la app muestra el paywall en ese momento exacto.

### Datos y cumplimiento
- Al retirarse un estudiante los datos se **archivan**: el representante pierde
  acceso, la institución conserva.
- El representante puede descargar la información de su hijo en PDF (derecho de
  acceso), generado en memoria y devuelto en la respuesta, sin almacenamiento.
- **No se guardan archivos ni fotos** en ninguna parte.
- Auditoría en v1: `LOGIN`, `LEER_SENSIBLE`, `CREAR`/`ANULAR` acción, `APROBAR`
  estudiante (DP-006). `EXPORTAR` y `ALERTA` van a v2.
- Retención y derecho al olvido: se declara en el aviso de privacidad para v1;
  la anonimización real es v2 (DP-007).
- Fechas del dominio en `America/Guayaquil`; marcas de tiempo en epoch ms UTC.

## 6. Estado del repositorio

Verificado el 22 de agosto de 2026 — `npm run typecheck` y `npm test` pasan
limpios desde la raíz.

| Pieza | Estado |
|---|---|
| App Expo (`movil/`) | ✅ arranque, sesión y cierre de sesión |
| Clerk → Convex | ✅ `auth.config.ts` + `viewer.ts` prueban que la identidad llega al backend |
| Esquema (41 tablas) | ✅ `convex/schema.ts` |
| Constantes de dominio | ✅ `convex/lib/enums.ts` |
| Guardas de integridad | ✅ `convex/lib/guardas.ts` |
| Capa de permisos | ✅ `convex/lib/permisos.ts` |
| Datos semilla | ✅ `convex/semillas.ts`, cargadas en al menos un despliegue |
| Webhook de RevenueCat | ✅ `convex/http.ts` + `suscripciones.ts`, con pruebas |
| Tokens visuales | ✅ `movil/src/theme/Theme.ts` |
| Integración continua | ✅ `.github/workflows/ci.yml` |
| Propiedad por módulo | ✅ `.github/CODEOWNERS` |
| `convex/nucleo.ts` (A) | ⬜ por escribir |
| `convex/conducta.ts` (B) | ⬜ por escribir |
| `convex/interaccion.ts` (C) | ⬜ por escribir |
| **Las 31 pantallas** | ⬜ **es el grueso de lo que falta** |
| Los 6 componentes base | ⬜ Persona A, sobre `Theme.ts` |

La especificación de las operaciones del backend está archivada en
`docs/99-archivo/openapi-v1.1.0-archivado.yaml` (32 rutas) — ya no es un contrato
ejecutable, pero sigue siendo la descripción más completa de qué debe hacer cada
función.

## 7. Pendiente de definir — no asumir ni inventar

### Bloqueantes
1. **Validación con un profesor real.** Sigue sin ocurrir. Es el mayor riesgo
   abierto del proyecto: ningún stack protege de que un docente diga "esto no es
   lo que necesito". La presentación y el FAQ están escritos desde el 7 de agosto,
   sin usar. Dueño: Persona C.
2. **Configuración de GitHub pendiente de permisos de Admin** (Daniel): branch
   protection sobre `main`, CI como check obligatorio, "Require review from Code
   Owners", y borrado automático de ramas fusionadas. Ver
   `docs/02-equipo/flujo-de-trabajo.md`.

### Técnicas
3. **Despliegue de Convex: ¿uno compartido o uno por desarrollador?** Hoy cada
   quien corre su propio `npx convex dev`. Afecta a si `EXPO_PUBLIC_CONVEX_URL`
   puede ser un único secreto compartido.
4. **Vault de Bitwarden sin configurar.** `movil/.env.schema` apunta a UUID de
   relleno; `npm run dev` falla sin `BITWARDEN_ACCESS_TOKEN`. Alternativa
   funcionando: pasar las variables a mano.
5. **Material Symbols como fuente variable.** Hay que probar
   `fontVariationSettings` en un Android real **antes** de apoyar las 31 pantallas
   sobre ese patrón — `@expo/vector-icons` no sirve (trae la versión clásica sin
   eje de relleno).
6. **Estrategia offline.** Identificada como necesaria, nunca decidida. Caso
   relevante: un docente tomando asistencia sin señal.
7. **Manejo de estado en la app Expo.** Convex trae reactividad propia, pero no se
   ha decidido qué se maneja localmente.
8. **Librería de gráficos** para el reporte acumulado (P6). Diferida
   explícitamente.
9. **Modelo del diferenciador de IA:** Claude Haiku 4.5 o GPT-5 Nano, tras probar
   con notas reales de un docente (DP-008).

### Legales y del piloto
10. **Aviso de privacidad y texto de consentimiento**, con versión. Se necesita
    **antes** de construir P3. Dueño: Persona C, comprometido para el 21 de
    agosto.
11. **Carta de acuerdo del piloto** con el profesor o el colegio. Es donde se
    negocia la retención de datos (DP-007), no se decide unilateralmente.

### Cuentas por crear
12. RevenueCat (con Test Store y los 3 productos en un *offering* — sin ese paso
    `getOfferings()` devuelve vacío), Expo/EAS, Devpost. Development build de
    Expo: `react-native-purchases` es módulo nativo y no corre en Expo Go.
