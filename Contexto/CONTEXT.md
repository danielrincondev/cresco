# CONTEXT.md — Estado del proyecto Cresco

Última actualización: 8 de agosto de 2026. Equipo **Neofix**.

Este documento resume todo lo decidido hasta hoy y, al final, **lo que
explícitamente NO se ha decidido**. Si algo aparece en la sección "Pendiente de
definir", no lo asumas ni lo inventes: pregúntale al usuario.

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

> **Calendario reiniciado el 8 de agosto de 2026.** El plan original (semana 1
> desde el 4 de agosto) había quedado atrás: no se habían ejecutado sus tareas.
> Ver la decisión en `DECISIONS.md`, sección "Estructura de código y
> calendario".

| Hito | Fecha |
|---|---|
| Día 0 (instalar herramientas, leer manuales) | hoy, sábado 8 de agosto de 2026 |
| Semana 1 — Cimientos | 9 – 15 de agosto |
| Semana 2 — Flujo del docente | 16 – 22 de agosto |
| Semana 3 — Flujo del representante (hito crítico el 29) | 23 – 29 de agosto |
| Semana 4 — Punto de control (decisión el miércoles 2) | 30 de agosto – 5 de septiembre |
| Semana 5 — Funciones de apoyo | 6 – 12 de septiembre |
| Semana 6 — Cierre | 13 – 19 de septiembre |
| **Deadline interno** | 20 de septiembre |
| **Fecha de envío del equipo** | **28 de septiembre** (sin cambio — fecha externa) |
| Cierre oficial del Shipaton | 30 de septiembre, 23:45 PDT (1 de octubre, 01:45 en Ecuador) — sin cambio |

⚠️ **El colchón entre el deadline interno y el envío real se comprimió**: era
13 días (15→28 sep.), ahora son **8 días** (20→28 sep.). El envío y el cierre
oficial no se movieron porque los fija el patrocinador, no nosotros.

Lo que se reserva para diferenciador, pulido y prueba con usuarios reales sigue
siendo el tramo entre el deadline interno y el envío. **No se usa para ampliar
alcance**, y ahora hay menos margen de error en esos días que antes.

## 3. Alcance de la v1

**Incluye:** autenticación y dos perfiles; creación de curso, año lectivo y
parciales; invitación al curso; registro de estudiantes por el representante con
aprobación del docente; acciones positivas, negativas y notas; anuncios y
eventos; asistencia; reporte general diario y reporte por estudiante; reporte
acumulado del parcial; inconformidades; citas; alerta de emergencia;
suscripciones vía RevenueCat.

**Excluido de la v1 (diferido a v2):** administrador de institución / rectoría;
preguntas del representante al docente sobre un reporte; licencia institucional;
segundo representante por estudiante; panel web; iOS; mensajería libre;
calificaciones académicas.

## 4. Decisiones de arquitectura y su porqué

### ADR-001 — PostgreSQL + Drizzle ORM
El modelo es relacional y normalizado (41 tablas, integridad referencial, índices
únicos parciales, CHECKs que codifican reglas de negocio). Firestore exigiría
desnormalizar y mover toda la integridad a la aplicación. Drizzle da tipos de
TypeScript derivados del esquema, así que el contrato de datos no puede
desincronizarse del código.

### ADR-002 — Next.js (servidor) + Expo (apps)
**Tauri fue evaluado y descartado**: soporte móvil inmaduro y sin SDK de
RevenueCat, lo que incumpliría el requisito del hackathon. Next.js **no es un
frontend web**: es el servidor donde viven BetterAuth, las rutas de API, el
webhook de RevenueCat y la tarea nocturna. `shadcn/ui` no funciona en React
Native; para las apps se usa NativeWind con componentes propios.

### ADR-003 — BetterAuth con plugin de organización
La `organization` de BetterAuth representa la institución declarada por el
docente. `perfil_usuario` **extiende** el `user` de BetterAuth con cédula y
teléfono; no lo duplica. La invitación de organización de BetterAuth **no** se usa
para vincular representantes: `invitacion_curso` es del dominio y desemboca en el
registro de un menor con consentimiento.

### ADR-004 — Permisos en dos capas
Al elegir BetterAuth + Drizzle, la autenticación vive en el servidor y no en
Postgres, así que la garantía de aislamiento no viene gratis. Se aplican dos
capas: (1) capa obligatoria `db/acceso/` en el servidor, (2) políticas RLS de
PostgreSQL sobre `estudiante`, `matricula`, `accion_registrada`,
`reporte_estudiante` y `puntaje_periodo`. Cada petición abre transacción con
`SET LOCAL app.user_id`. Si se olvida, devuelve 0 filas (falla visible y segura).

### ADR-005 — El puntaje es derivado, nunca un contador
`puntaje = clamp(60 + Σ puntos de acciones VIGENTES del período, 0, 100)`.
`puntaje_periodo` es una caché reconstruible. Si fuera un contador, cualquier
fallo lo desincronizaría de la bitácora de forma permanente y sin detectarlo.

### ADR-006 — RevenueCat es la fuente de verdad de pagos
Requisito obligatorio del Shipaton. La tabla `suscripcion` es una proyección
local. El webhook es idempotente por `evento_revenuecat.evento_id_externo`
(índice único). Los límites viven en `plan.limites` como JSON y se verifican en
el servidor, nunca solo en la app.

## 5. Reglas de negocio confirmadas

### Puntaje
- Base **60** por parcial, piso **0**, techo **100**. Se reinicia cada parcial.
- Positivas: **+1** por defecto, el docente puede subirlas a **+2**.
- Negativas de responsabilidad: **siempre −1**, fijo.
- Negativas de disciplina: **−1** por defecto, hasta **−3**.
- Topes diarios: máximo **+4** y máximo **−5** por estudiante por día. Se validan
  en el servidor, no en la base de datos. Al exceder: `422 TOPE_DIARIO_ALCANZADO`.
- Al cerrar el parcial el puntaje se **congela**.
- El puntaje **nunca** modifica calificaciones académicas.

### Franjas de conducta
0–15 crítica · 16–30 muy por debajo · 31–50 por debajo · 51–60 punto de partida ·
61–80 buen desempeño · 81–100 excelente.

### Cinco tipos de acción
- Por estudiante (tabla `accion_registrada`): **Positiva**, **Negativa**, **Nota**
- Por curso (tabla `comunicado_curso`): **Anuncio**, **Evento**
- Las **Notas** no entran en la bitácora del acumulado.
- Los **Eventos** aparecen en el reporte diario desde hasta 7 días antes de su
  fecha y hasta el día siguiente, como bloque expandible.
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
- **Un solo representante legal por estudiante** en la v1. Un segundo intento
  devuelve `409`.
- Un representante puede tener hijos en colegios distintos; cambia con una barra
  superior.
- El consentimiento de tratamiento de datos se guarda con la **versión del
  documento** aceptado, no como booleano.

### Reportes
- El reporte general del curso es **opcional**; ningún campo es obligatorio.
- Los campos vienen de la tabla `plantilla_campo`, no del código.
- Si no hay reporte general pero hubo acciones, **igual se genera** el reporte del
  estudiante.
- Si no hay reporte de hoy, el endpoint devuelve `204` y la app muestra
  "Aún no tienes reporte nuevo, pero puedes ver el anterior".
- Solo el más reciente es visible en la pantalla principal.
- Historial: plan gratuito **2** reportes anteriores, premium **7**.
- El representante **sí ve** los puntos de cada acción.
- `reporte_estudiante` es una fotografía inmutable del día.

### Interacción
- **Inconformidades:** solo sobre acciones negativas vigentes. El docente tiene
  **30 días**; vencido pasa a `VENCIDA`. Resolver como `RESUELTA_MODIFICADA` lleva
  la acción a `MODIFICADA` (0 puntos) y devuelve los puntos.
- **Citas:** el docente publica su horario, se parte en bloques de **15 minutos**.
  El representante reserva y nace `SOLICITADA`; **requiere confirmación** del
  docente.
- **Alertas de emergencia:** el docente debe **reingresar su contraseña** antes de
  activar (se guarda `reautenticado_en`). Alcance `CURSO` o `ESTUDIANTE`. Queda
  auditada. La app debe declarar visiblemente que **no sustituye al ECU 911**. El
  representante confirma lectura.

### Monetización
- Cinco planes: `REP_FREE`, `REP_PREMIUM_MENSUAL`, `REP_PREMIUM_BIMESTRAL`,
  `DOC_FREE`, `DOC_PRO`.
- Premium del representante es **por cuenta** (cubre a todos sus hijos): sin
  publicidad, 7 reportes anteriores, acumulado enriquecido, PDF libre.
- El docente **sí tiene límites de pago**: `DOC_FREE` = 1 curso activo y 40
  estudiantes; `DOC_PRO` = 5 cursos y 60 estudiantes. Esto reemplaza una regla
  anterior que declaraba al docente siempre gratuito.
- "Por parcial" se mapea a suscripción **bimestral** (Google Play no tiene ciclo
  de 6 semanas).
- Publicidad: red publicitaria (AdMob). El plan gratuito puede exportar el PDF del
  acumulado viendo un **anuncio recompensado**.
- Al alcanzar un límite el endpoint devuelve `402 LIMITE_PLAN` y la app muestra el
  paywall en ese momento exacto.

### Datos y cumplimiento
- Al retirarse un estudiante: los datos se **archivan**. El representante pierde
  acceso; la institución conserva. Estados de matrícula: `CURSANDO`, `RETIRADA`,
  `TRASLADADA`, `FINALIZADA`.
- El representante puede descargar la información de su hijo en PDF (derecho de
  acceso).
- **No se guardan archivos ni fotos** en ninguna parte.
- Timestamps en UTC; zona `America/Guayaquil`. Solo Guayaquil en la v1.

## 6. Estado del repositorio

**Ya existe y está verificado** — ejecutado con Node 24.19.0 el 8 de agosto,
no estimado:
- `db/schema/` — 4 archivos; `npm run typecheck` pasa limpio y la migración
  `0000_cresco_inicial.sql` produce 41 tablas con 57 restricciones CHECK y 41
  índices. Incluye ya las correcciones **E1** (sin `defaultNow()` en columnas
  `date`) y **E2** (índice parcial de documento). Correr `db:generate` dos veces
  seguidas no produce migración adicional.
- `package.json` + `package-lock.json` — `npm install` instala 36 paquetes sin
  errores. Las versiones están fijadas; se clona con `npm ci`.
- `api/openapi.yaml` — v1.1.0, 32 rutas / 36 operaciones, YAML válido y sin
  referencias `$ref` rotas
- `docs/01-arquitectura/adr/` — 7 ADR
- `LICENSE` — AGPL-3.0, texto canónico de la FSF (661 líneas), sin modificar
- `docs/01-arquitectura/matriz-permisos.md` — incluye las 7 pruebas de seguridad
  obligatorias (S-1 a S-7)
- `docs/02-equipo/backlog-y-reparto.md` — 31 pantallas, historias, plan semanal
- `Contexto/reglas-shipaton-next-gen.md` — reglas oficiales ya verificadas
- `README.md`, `.gitignore`, `.env.example`, `package.json`, `drizzle.config.ts`,
  `tsconfig.json`

**No existe todavía:** el código de la aplicación. No hay proyecto Next, no hay
proyecto Expo, no hay semillas (`db/seeds/` está vacía), no hay capa
`db/acceso/`, no hay CI y no hay pruebas — `npm test` es todavía un aviso, no un
runner; Persona C lo conecta al montar CI.

**El repositorio no tiene ningún commit todavía.** El primero debe ser el
`.gitignore` solo, antes que cualquier otro archivo (ver NEXT_STEPS, Paso 0).

---

## 7. PENDIENTE DE DEFINIR — no asumir ni inventar

Estas cosas **no están decididas**. Si el trabajo las toca, pregunta al usuario.

### Bloqueantes o de alto impacto
1. **Diferenciador del producto.** Se discutió una posible capa de IA que redacte
   el reporte general a partir de notas rápidas del docente, pero **no se ha
   decidido**. Si se adopta, la pantalla D13 debe construirse con espacio para
   ello. No implementar sin confirmación.
2. **Dirección visual.** El guion de preguntas ya está escrito en
   `docs/00-producto/cuestionario-direccion-visual.md`. Persona C entrega las
   respuestas la noche del 8 de agosto (~22:00); con eso se escribe
   `movil/theme/Theme.ts` y los seis componentes base (tarjeta, botón, campo,
   chip de estado, encabezado, estado vacío). Dueño del archivo: Persona A.
   **Bloquea la semana 2**, que es cuando empiezan las pantallas: hasta que
   exista, nadie debe inventar colores ni componentes. Ver también el bloque C
   del cuestionario — las seis franjas de conducta necesitan color y no dependen
   solo del color (daltonismo, sol en pantalla).

### Técnicas
3. **Proveedor de hosting de PostgreSQL** (Neon, Railway, Supabase como base de
   datos). Solo se decidió el motor, no el proveedor.
4. **Dónde se despliega Next.js.**
5. **Estrategia offline.** Se identificó como decisión necesaria pero no se tomó.
   Caso relevante: un docente tomando asistencia sin señal.
6. **Manejo de estado en la app Expo.** Nunca se discutió.
7. **Librería de gráficos** para el reporte acumulado (P6).
8. **Cómo demostrar RevenueCat sin Play Console.** Ahora que la cuenta de
   desarrollador dejó de ser necesaria, hay que confirmar en la documentación
   oficial qué modo de prueba aplica y si `getOfferings()` devuelve datos.
   Tarea de Persona C, esta semana.
9. **`dispositivo.plataforma` no tiene dominio definido.** Es `text` con default
   `'ANDROID'`, sin `CHECK` y sin constante en `enums.ts`; el contrato declara
   `enum: [ANDROID]`. Es la única columna de estado del esquema que no sale de
   `enums.ts`, así que incumple la regla 1 del proyecto. Corregirlo es añadir
   `PLATAFORMA` a `enums.ts` (superficie compartida) y un `CHECK` en
   `interaccion.ts`. **Conviene hacerlo en el mismo lote que E1/E2**, para no
   regenerar la migración dos veces.

### De producto
10. **Campos exactos de la plantilla del reporte general.** Propuesta no
    confirmada: `ANUNCIOS`, `NOVEDADES`, `TAREAS`, `CONSEJO`. El usuario dijo
    "anuncios, novedades, nota, etc." — ese "etc." sigue abierto.
11. **Catálogo exacto de tipos de acción con sus puntos.** Hay una propuesta
    (excelente taller, no trajo la tarea, interrumpió la clase, etc.) pero no está
    confirmada. Son datos semilla, no código.
12. **Precios de los planes.** Nunca se definieron montos.

### Legales y del piloto
13. **Texto del aviso de privacidad y del consentimiento**, con versión. Se
    necesita **antes** de construir la pantalla P3.
14. **Carta de acuerdo del piloto** con el profesor o el colegio.

### Resueltas desde la última revisión
- ~~Criterios de la categoría Next Gen~~ → verificados, en
  `reglas-shipaton-next-gen.md`.
- ~~Cuota de Google Play Console~~ → **Next Gen no exige cuenta de desarrollador
  ni publicación en tienda.** Deja de ser un costo y un riesgo.
- ~~Nombre definitivo del producto~~ → **Cresco**, decidido el 7 de agosto.
- ~~Licencia de código abierto~~ → **AGPL-3.0** con licenciamiento comercial en
  paralelo. `LICENSE` ya está en la raíz (decisión L1/L2, 8 de agosto).
- ~~Cómo se entrega el PDF del acumulado~~ → **en memoria, en la respuesta**, sin
  storage (decisión V3, 8 de agosto). El contrato ya lo refleja.
- ~~Alcance del rol `DOCENTE_COLABORADOR`~~ → **diferido a la v2** (decisión V1).
- ~~`CITACION` en el reporte sin `cita_id`~~ → se resuelve con `texto_libre`;
  se reevalúa en semana 3 (decisión V4).
- ~~Dónde vive el código de aplicación (`theme/`, `components/base/`,
  `lib/puntaje.ts`, el proyecto Next, las apps Expo)~~ → **una sola app Expo**
  (`movil/`) + **un servidor Next** (`servidor/`), hermanas en la raíz, sin
  monorepo. Ver decisiones S1-S6 en `DECISIONS.md`.
- ~~Quién corre `npx create-next-app` / `npx create-expo-app` y cuándo~~ →
  **Persona C, el día 1 de la semana 1**, junto con el repositorio y el CI
  (decisión S6).

### Diferidas explícitamente a la v2
Administrador de institución · licencia institucional y cómo se activa · segundo
representante por estudiante · preguntas del representante sobre un reporte
(tabla `pregunta_reporte` existe pero sin endpoints ni pantallas).
