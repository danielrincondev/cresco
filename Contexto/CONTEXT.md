# CONTEXT.md — Contexto del proyecto Cresco

> **Reescrito el 22 de agosto de 2026 y recortado el 28 de septiembre.** Este
> documento explica el objetivo, el alcance, la arquitectura y el porqué de las
> reglas de negocio. **No lleva el estado del proyecto:** el estado vive en el
> `README.md` de la raíz y lo pendiente, en los Issues de GitHub. Las secciones
> "Estado del repositorio" y "Pendiente de definir" de agosto se quitaron
> porque ya no eran ciertas (decían que no existían las funciones ni las
> pantallas); siguen en el historial:
> `git show c5ce997:Contexto/CONTEXT.md`.

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
- Camino secundario, importar la lista por CSV: **diferido a la v2** por
  DP-013. Si se construye, el archivo se parsea y **se descarta**; nunca se
  almacena.
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
  docente. El docente también puede **citar** a una familia: ella responde si
  asistirá, y si no puede, tiene que decir por qué. Después de la reunión el
  docente registra si la familia asistió y deja por escrito los acuerdos.
- **Alertas de emergencia:** el docente debe **reautenticarse** antes de activar
  (se guarda `reautenticadoEn`). Alcance `CURSO` o `ESTUDIANTE`. Queda auditada.
  La app debe declarar visiblemente que **no sustituye al ECU 911**. El
  representante confirma lectura.

### Monetización (DP-005)
- Cinco planes: `REP_FREE`, `REP_PREMIUM_MENSUAL` ($1.99),
  `REP_PREMIUM_BIMESTRAL` ($2.99), `DOC_FREE`, `DOC_PRO` ($3.99/mes en el
  Test Store; DP-005 decía $4.99, ver su actualización del 30-sep).
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
- El representante puede guardar en PDF el acumulado del parcial de su hijo:
  el servidor devuelve los datos (`prepararInforme`) y el PDF se genera en el
  teléfono, sin almacenarse en ninguna parte.
- **No se guardan archivos ni fotos** en ninguna parte.
- Auditoría en v1: `LOGIN`, `LEER_SENSIBLE`, `CREAR`/`ANULAR` acción, `APROBAR`
  estudiante (DP-006). Además ya se registran `ALERTA`, `EXPORTAR` y
  `ACTUALIZAR`; el detalle está en `docs/04-guias/contrato-auditoria.md`.
- Retención y derecho al olvido: se declara en el aviso de privacidad para v1;
  la anonimización real es v2 (DP-007).
- Fechas del dominio en `America/Guayaquil`; marcas de tiempo en epoch ms UTC.

## 6. Estado y pendientes

No viven aquí, para que este documento no vuelva a quedar mintiendo:

- **Qué hace hoy la aplicación y en qué estado está cada pieza:** el
  `README.md` de la raíz.
- **Qué falta:** los Issues de GitHub, y
  `docs/02-equipo/pendientes-proxima-build.md` para lo que espera una build
  nueva de EAS.
