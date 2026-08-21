# Registro de decisiones — sesión del 14 de agosto de 2026

> **Estado:** Vigente · **Dueño:** Persona C (Product Manager) · **Última revisión:** 2026-08-14

Consolida en un solo documento todo lo decidido hasta hoy: el proyecto, el
pivote de stack, las decisiones de producto de esta semana y la dirección
visual. No reemplaza a `Contexto/DECISIONS.md` ni a `Contexto/CONTEXT.md` —
cuando el equipo confirme el repositorio (bloque 1, pendiente), este contenido
se traslada allí y este archivo pasa a `Reemplazado`. Hasta entonces, es la
foto más completa de dónde está el proyecto.

---

## 1. El proyecto

**Cresco** es una aplicación Android de comunicación entre docentes y
representantes legales de escuelas del Ecuador, centrada en el seguimiento de
responsabilidad y conducta del estudiante. **El estudiante nunca es usuario de
la aplicación**, solo sujeto de datos. La desarrolla el equipo **Neofix** (tres
estudiantes de ingeniería) para el **RevenueCat Shipaton 2026**, categoría
**Next Gen**.

Dos aplicaciones en una misma base de código, con enrutado por rol:

- **App del docente** — herramienta de trabajo diaria: crea el curso, registra
  acciones, toma asistencia, redacta el reporte del día.
- **App del representante** — informativa y simple: ve el reporte de hoy de su
  hijo, reclama una acción injusta, agenda una cita.

**Plazos:** deadline interno 20 de septiembre de 2026 · envío del equipo 28 de
septiembre · cierre oficial del Shipaton 30 de septiembre. Punto de control de
avance: 2 de septiembre.

**Entrega:** sin publicación en tienda — video de menos de 2 minutos +
repositorio público de código abierto. Licencia **AGPL-3.0**, con
licenciamiento comercial en paralelo (Neofix conserva el copyright).

---

## 2. El pivote de stack

### 2.1 Qué se abandonó

PostgreSQL + Drizzle ORM + Next.js como servidor + BetterAuth + RLS en dos
capas. Se abandonó en el día 2 del proyecto real (no había código de producto
construido todavía), así que no fue una decisión de costo hundido.

### 2.2 Qué se adopta

| Pieza | Reemplaza a | Rol |
|---|---|---|
| **Convex** | PostgreSQL + Drizzle + Next.js (servidor) | Base de datos reactiva + funciones de servidor (`query`/`mutation`/`action`/`httpAction`) + cron. Colapsa cinco fronteras (contrato, tipos, sesión, migraciones, dos despliegues) en una: la firma de una función |
| **Clerk** | BetterAuth | Autenticación de docentes y representantes. Usar los **hooks** (`useAuth`, `useUser`, `useSignIn`), no los componentes nativos de su SDK de Expo, que siguen en beta |
| Expo + expo-router + EAS | — | Sin cambios |
| NativeWind | — | Sin cambios |
| RevenueCat + **Test Store** | — | Sin cambios en el SDK; ADR-008 confirma que el Test Store permite probar compras sin Google Play Console |

**Estructura de repositorio:** un solo `package.json`, Expo como raíz,
`convex/` como carpeta dentro. Con esto el debate de Turborepo / npm
workspaces (decisión S4 original) se disuelve solo — no hay nada que
orquestar entre dos proyectos.

**Lo que muere de verdad:** PostgreSQL, Drizzle, drizzle-kit, `pg`, Next.js,
`servidor/`, RLS, las migraciones, `openapi.yaml` como contrato ejecutable,
Turborepo.

**Lo que sobrevive intacto:** el modelo de dominio completo (41 entidades y
sus reglas), `db/schema/enums.ts` y `REGLAS` (TypeScript puro), la matriz de
permisos y las pruebas S-1 a S-7, el backlog de 31 pantallas, el reparto en
tres módulos, `movil/` (Expo), RevenueCat, AdMob, GitHub Actions.

### 2.3 Identificador canónico

`perfil_usuario._id` (el id nativo de Convex) es la clave canónica en todo el
sistema — suscripciones, dispositivos, auditoría, notificaciones. El id de
Clerk vive en **un solo campo aparte**, `authSubject`, con su propio índice.

Orden de arranque obligatorio: **Clerk autentica → se busca o crea el
`perfil_usuario` → recién entonces `Purchases.logIn(perfilId)`.** Invertir
este orden hace que RevenueCat registre la compra contra un id anónimo.

Esto es una capa anticorrupción (no arquitectura hexagonal completa — esa no
se justifica aquí): protege el dato, no pretende independizar todo el código
de Convex. Con esta regla, cambiar de proveedor de autenticación más adelante
cuesta reescribir tres pantallas (D1, D2, P1), no una migración de datos.

### 2.4 Webhook de RevenueCat — lógica ya escrita, pendiente de portar

La lógica de negocio del webhook (verificación HMAC + cabecera compartida,
idempotencia por `eventoIdExterno`, y la regla de que `CANCELLATION` **no**
significa vencimiento — la suscripción sigue vigente hasta `expiration_at_ms`)
se escribió y probó (20 pruebas) contra el stack anterior
(`servidor/lib/revenuecat.ts`). La lógica sigue siendo válida tal cual; lo que
hay que rehacer es la capa de persistencia como `httpAction` de Convex en vez
de una ruta de Next.js.

✅ **Riesgo 9 resuelto en diseño.** Se propuso una primera plantilla que
tenía tres bugs, corregidos aquí:

1. **Orden de operaciones.** La firma se calcula sobre el cuerpo crudo; si se
   hace `request.json()` primero y se reserializa para verificar, los bytes
   cambian y una firma legítima falla. Hay que leer `request.text()` antes de
   parsear nada.
2. **Nombre de cabecera y runtime.** La cabecera real es
   `X-RevenueCat-Webhook-Signature` (formato `t=...,v1=...`), con
   `Authorization` como alternativa de cabecera compartida (la que documenta
   `openapi.yaml`). Y `node:crypto` no está garantizado en el runtime por
   defecto de las `httpAction` de Convex — se usa la Web Crypto API
   (`crypto.subtle`), portable en cualquier caso.
3. **Código de respuesta en fallos de proceso.** RevenueCat reintenta 5 veces
   ante cualquier respuesta que no sea 2xx y luego pierde el evento. Solo la
   firma inválida debe dar `401`; un evento que falla al procesarse (ej. no
   se encuentra el plan del producto) se guarda con su error y responde `200`
   igual — reintentarlo no lo arregla.

```typescript
// convex/revenuecat.ts — borrador, listo para pegar cuando exista convex/
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

async function verificarFirma(
  cuerpoCrudo: string,
  cabeceraFirma: string,
  secreto: string,
): Promise<boolean> {
  const partes = new Map(
    cabeceraFirma.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
    }),
  );
  const t = partes.get("t");
  const v1 = partes.get("v1");
  if (!t || !v1) return false;

  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign(
    "HMAC",
    clave,
    new TextEncoder().encode(`${t}.${cuerpoCrudo}`),
  );
  const esperado = [...new Uint8Array(firma)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Web Crypto no trae timingSafeEqual — comparación manual en tiempo constante.
  if (esperado.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) {
    diff |= esperado.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}

export const webhook = httpAction(async (ctx, request) => {
  // Cuerpo crudo, antes de parsear nada — ver punto 1 arriba.
  const cuerpoCrudo = await request.text();

  const cabeceraFirma = request.headers.get("x-revenuecat-webhook-signature");
  const cabeceraAuth = request.headers.get("authorization");
  const secreto = process.env.REVENUECAT_WEBHOOK_SECRET ?? "";

  const autenticado = cabeceraFirma
    ? await verificarFirma(cuerpoCrudo, cabeceraFirma, secreto)
    : secreto.length > 0 && cabeceraAuth === secreto;

  if (!autenticado) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cuerpo = JSON.parse(cuerpoCrudo);
  const evento = cuerpo.event;

  // Idempotencia (por eventoIdExterno) e interpretación (CANCELLATION ≠
  // vencido, etc.) viven en la mutation interna. Se guarda el payload
  // completo, no solo los cuatro campos usados hoy, para no perder
  // `environment` ni nada que se necesite después sin tocar el esquema.
  await ctx.runMutation(internal.suscripciones.procesarEvento, {
    eventoIdExterno: evento.id,
    tipoEvento: evento.type,
    appUserId: evento.app_user_id,
    payload: cuerpo,
  });

  return new Response("OK", { status: 200 });
});
```

---

## 3. Reglas de negocio ya decididas (resumen)

No se rediscuten. El detalle completo vive en `Contexto/DECISIONS.md`.

- **Puntaje:** base 60, piso 0, techo 100. Se reinicia cada parcial. Positivas
  +1 (ajustable a +2), responsabilidad −1 fijo, disciplina −1 a −3. Topes
  diarios +4 / −5.
- **Franjas:** 0–15 · 16–30 · 31–50 · 51–60 · 61–80 · 81–100.
- **Vinculación:** el docente escribe la institución como texto libre; un solo
  representante legal por estudiante en la v1; invitación al curso vigente 30
  días.
- **Monetización:** cinco planes. Premium del representante es **por cuenta**
  (cubre a todos sus hijos); el docente **sí tiene** límites de pago.
- **Nada se borra físicamente** — se anula o cambia de estado (con la
  excepción que se abre en el bloque 4.2 de abajo).

---

## 4. Decisiones de producto de esta semana

### 4.1 Arranque

| # | Decisión | Estado |
|---|---|---|
| Repositorio | **Pendiente** — se discute con A y B antes de tocar nada | 🔴 abierto |
| Rama `feat/dev-daniel` | Congelada como referencia de solo lectura. Acordado informalmente — A propuso Convex y Clerk | ✅ |
| Corte MoSCoW (18 *Must* vs. 31 pantallas) | **No se recorta.** Se mantienen las 31, compensando con **+30–40% de carga de trabajo diaria** para cerrar en el plazo original o cerca | ✅ decidido, riesgo anotado en bloque 6 |

### 4.2 Catálogo de acciones (datos semilla)

**Positivas** — sin catálogo de nombres fijos. Cuatro categorías predefinidas
(Desempeño, Convivencia, Responsabilidad, Puntualidad); el docente escribe el
mensaje libre y elige +1 o +2 según su propio criterio.

**Negativas** — tres grupos, cada uno con mensaje libre del docente:

| Grupo | Rango | Nota |
|---|---|---|
| Indisciplina | −1 a −3, ajustable | Interrupciones, celular en clase, salir sin permiso, etc. |
| Irresponsabilidad | **−1 fijo** | Conserva la regla C2 original — no se abre a rango |
| Deshonestidad | −1 a −3, ajustable | **Categoría nueva**, se agrega a `CODIGO_CATEGORIA` (superficie compartida). Copiar, mentir para justificar mal comportamiento o incumplimiento |

**Anuncios** (reemplaza el concepto de "Nota" del borrador original) — dos
tipos:

- **Notas del profesor** — funcionalidad **nueva**. Destinatario: un
  representante específico o todo el curso. Mensaje libre, sin nombre
  predefinido. Visible de 1 a 7 días, configurable por el docente. Aparece en
  el tablero del representante como "Anuncio del profesor".
- **Eventos** — texto largo, puede incluir listas (ej. lista de alumnos para
  una actividad). Formato expandible/retráctil: `"Evento: [nombre] (flecha
  para expandir)"`. Visible desde su creación hasta la fecha de expiración que
  define el docente; desaparece ese día.

### 4.3 Plantilla del reporte general

Cuatro campos, ninguno obligatorio: **Anuncios** (texto largo), **Novedades
del día** (texto largo), **Tareas enviadas** (texto largo), **Consejo del
día** (texto corto).

### 4.4 Monetización

| Producto | Precio inicial |
|---|---|
| REP_PREMIUM_MENSUAL | $1.99 |
| REP_PREMIUM_BIMESTRAL | $2.99 |
| DOC_PRO | $4.99/mes |

Segundo entitlement **`docente_pro`**, separado de `premium` (que es del
representante) — resuelve el bloqueo de D19.

### 4.5 Auditoría, retención y legal

- **Auditoría (v1):** propuesta pendiente de aprobación explícita — auditar
  `LOGIN`, `LEER_SENSIBLE` (representante abre el reporte de un estudiante),
  `CREAR`/`ANULAR` acción, `APROBAR` estudiante. Diferir a v2: `EXPORTAR` (PDF)
  y `ALERTA`.
- **Retención y derecho al olvido:** en v1 se **declara** en el aviso de
  privacidad, sin implementar supresión (no rompe la regla 5). El objetivo de
  producto a futuro (v2) es anonimizar bajo solicitud. Conservación: durante
  el año lectivo — aún sin pactar con ninguna escuela real.
- **Aviso de privacidad y carta de acuerdo del piloto:** dueño Persona C,
  fecha objetivo **viernes 21 de agosto**.

### 4.6 Diferenciador de producto

**Entra a la v1**, condicionado a tener los 18 *Must* cerrados y probados
antes de empezar a construirlo — independientemente de que también se
construyan las pantallas *Should*/*Could* de las 31.

- **Qué hace:** el docente escribe notas rápidas y desordenadas; una `action`
  de Convex llama a un modelo de lenguaje y devuelve un borrador del reporte
  general en los cuatro campos de la plantilla. El docente siempre revisa
  antes de publicar — nunca se envía sin pasar por una persona.
- **Modelo:** por decidir entre Claude Haiku 4.5 y GPT-5 Nano, tras una prueba
  con notas reales de un docente — a esta escala de uso el costo mensual del
  piloto es menos de un dólar con cualquiera de los dos.
- **Arquitectura:** la clave del proveedor vive solo en el servidor (nunca en
  el cliente), y el feature se construye detrás de una bandera de activación
  para poder no activarlo sin tener que revertir ni fusionar nada.

### 4.7 Otras decisiones de producto

- Librería de gráficos del acumulado (P6): **diferida**, sin elegir aún.
- Validación con un profesor real: dueño Persona C, fecha objetivo
  **domingo 16 de agosto** — es el mayor riesgo abierto del proyecto completo.

---

## 5. Dirección visual

### 5.1 Tono y alcance del tema

Un núcleo de tema compartido entre las dos apps, con variantes por densidad
(docente más denso, representante más aireado) — no dos paletas distintas.
Sin modo oscuro en la v1. Tono: serio e institucional, sin llegar a la
rigidez de una institución.

### 5.2 Color

| Token | Hex | Uso |
|---|---|---|
| Claro | `#EBF4FA` | Fondo de pantalla, tarjetas de notas/reportes |
| Base | `#00509E` | Botones principales, barras de navegación |
| Oscuro | `#002A5C` | Títulos, texto destacado, texto primario |

**Superficies y texto:**

| Elemento | Hex |
|---|---|
| Fondo de tarjeta | `#FFFFFF` |
| Borde / separador | `#E2E8F0` |
| Texto secundario | `#4A5568` ✅ (antes `#718096`, ver riesgo 5) |
| Texto deshabilitado | `#A0AEC0` |
| Texto sobre color | `#FFFFFF` |

**Rojos** (acción negativa / alerta de emergencia / error de app) — ✅
resueltos. Matiz puro (~0°), deliberadamente alejado del matiz rojo-naranja
(~5–16°) de las franjas `CRITICA`/`MUY_BAJO`:

| Uso | Hex | Contraste verificado |
|---|---|---|
| Acción negativa (UI regular) | `#E53E3E` | 3.7:1 directo sobre `#EBF4FA`, 4.1:1 con texto blanco encima — **por debajo de AA (4.5:1) en ambos casos**. Usar solo como fondo de chip, nunca como texto suelto |
| Error de app (validaciones) | `#C53030` | 5.5:1 con texto blanco — pasa AA |
| Alerta de emergencia | `#9B2C2C` | 7.5:1 con texto blanco — pasa AAA |

**Acción positiva** (D1, adelantado aquí aunque formalmente sigue sin
decisión) — 🟡 **ajustado, pendiente de tu confirmación.** El verde propuesto
(`#10B981` / `#059669`) tiene matiz ~160–161°, casi idéntico al de `BUENO`
(~156°) y `EXCELENTE` (~164°) — la diferencia es solo de saturación, no de
matiz, y no logra la separación que sí lograron los rojos. Propuesta
corregida: **`#16A34A`** (matiz ~142°), con una distancia de matiz comparable
a la de los rojos frente a las franjas.

**Franjas de conducta:**

| Franja | Hex | Frase orientadora |
|---|---|---|
| 0–15 Crítica | `#B3453A` | "Requiere acompañamiento prioritario: Unamos fuerzas para apoyarlo." |
| 16–30 Muy bajo | `#D0714F` | "Refuerzo necesario: Su guía en casa marcará una gran diferencia." |
| 31–50 Bajo | `#E0A44A` | "En proceso de mejora: Con un poco más de práctica en casa, logrará avanzar." |
| 51–60 Base | `#A8AFA4` | "Bases alcanzadas: ¡Es el momento ideal para impulsarlo a seguir creciendo!" |
| 61–80 Bueno | `#6FAE95` | "¡Buen progreso! Sigamos motivando su esfuerzo diario." |
| 81–100 Excelente | `#2E8B72` | "¡Excelente nivel! Celebremos sus logros y mantengamos este ritmo." |

Del rojo al verde clásico (no escala ámbar alternativa). Cada franja va
siempre acompañada del puntaje numérico, para no depender solo del color. La
franja base (51–60) usa un gris neutro a propósito, para no leerse como
advertencia.

Publicidad del plan gratuito: contenedor visual propio, siempre separado del
contenido real.

### 5.3 Tipografía

**Fuente cargada:** Inter (no la fuente del sistema — decisión previa a esta
sesión; implica manejar un estado de "fuente no lista" en cada pantalla).

**Escala:** `xs 12 · sm 14 · base 16 · lg 20 · xl 24 · 2xl 32 · puntaje 56`.
El cuerpo nunca baja de 16 en la app del representante (hay abuelos entre los
representantes legales).

### 5.4 Espaciado y forma

**Espaciado:** `xs 4 · sm 8 · md 12 · base 16 · lg 24 · xl 32 · 2xl 48 · 3xl 64`.

**Radios:** `sm 4px` (checkboxes, indicadores) · `base 8px` (botones, campos)
· `lg 16px` (tarjetas, modales) · `pill 999px` (chips, badges, avatares).

### 5.5 Estados de carga

- **Esqueleto** — al cambiar de pestaña o sección principal.
- **Spinner** — micro-interacciones (guardar, enviar).
- **Híbrido** — procesos que calculan algo (ej. reporte estadístico del
  trimestre): esqueleto de la estructura + spinner mientras procesa.

### 5.6 Iconografía

**Google Material Symbols.** Contorno (outline) para menú y botones
inactivos; relleno sólido (fill) exclusivo para la pestaña o sección activa.

✅ **Riesgo 8 resuelto.** `@expo/vector-icons` trae Material Icons clásico
(Normal/Outlined/Sharp como fuentes separadas), sin el eje de relleno
variable que esta distinción necesita. Solución: no usar ese paquete para
este propósito — descargar la fuente variable `.ttf` de Material Symbols
Outlined desde Google Fonts, cargarla con `expo-font`, y controlar el
relleno con `fontVariationSettings: "'FILL' 1"` (activo) /
`"'FILL' 0"` (inactivo) en un componente de texto propio. **Probar en un
Android real antes de construir toda la navegación sobre este patrón** — el
soporte de ejes de fuente variable en React Native no es parejo entre
versiones.

---

## 6. Riesgos e incongruencias por resolver

Ordenados por urgencia, con lo que hace falta para cerrar cada uno.

| # | Riesgo | Qué falta |
|---|---|---|
| 1 🔴 | **Repositorio sin decidir.** No se puede empezar a migrar el código sin saber dónde | Reunión con A y B |
| 2 🔴 | **Carga acumulada.** 31 pantallas completas + migración a Convex + Clerk nuevo + diferenciador de IA, todo en el calendario ya recortado por la semana perdida. Aceptado conscientemente (+30–40% diario), pero es el riesgo de mayor probabilidad de todo este documento | Vigilar el punto de control del 2 de septiembre con disciplina real, no solo de nombre |
| 3 🔴 | **Spike de autenticación con Clerk sin confirmación de haberse ejecutado.** Es lo único que puede invalidar la elección de Clerk, y bloquea a Persona A | Confirmar que corrió, con login funcionando en un teléfono real |
| 4 🔴 | **Validación con un profesor real.** Sigue sin ocurrir; es el único riesgo que ningún stack los protege de él | Ejecutar el domingo 16 como está planeado |
| 5 ✅ | ~~Contraste del texto secundario por debajo del mínimo legible en exteriores~~ | **Resuelto** — `#4A5568` (~6.8:1 sobre `#EBF4FA`, ~7.5:1 sobre blanco). Ver §5.2 |
| 6 ✅ | ~~Los tres rojos sin hex, riesgo de confundirse con las franjas~~ | **Resuelto** — `#E53E3E` / `#C53030` / `#9B2C2C`. `#E53E3E` queda por debajo de AA como texto directo (3.7–4.1:1) — usar solo como fondo de chip. Ver §5.2 |
| 7 🟡 | **El verde propuesto para acciones positivas comparte matiz con las franjas `BUENO`/`EXCELENTE`** (~160° vs. ~156–164°) — la diferencia es solo de saturación, no alcanza a separarlos como sí pasó con los rojos | Confirmar `#16A34A` (matiz ~142°) en vez de `#10B981`/`#059669`. Ver §5.2 |
| 8 ✅ | ~~Material Symbols puede no venir en `@expo/vector-icons`~~ | **Resuelto** — cargar la fuente variable directo con `expo-font` + `fontVariationSettings`. Probar en Android real antes de construir toda la navegación. Ver §5.6 |
| 9 ✅ | ~~Webhook escrito para el stack anterior~~ | **Resuelto en diseño**, con 3 correcciones sobre la primera plantilla (cuerpo crudo antes de parsear, nombre de cabecera + runtime, código de respuesta en fallos de proceso). Código completo en §2.4. Falta archivar `fusion-semana-1.md` cuando exista `convex/` |
| 10 🟡 | **Auditoría (qué eventos se registran en v1) sin confirmación explícita** — la propuesta quedó condicional en el documento de decisiones | Aprobar la lista concreta del bloque 4.5 |
| 11 🟢 | **Retención de datos sin pactar con ninguna escuela real.** La política interna ya está definida, pero es una promesa sin contraparte todavía | Se negocia en la carta de acuerdo del piloto |
| 12 🟢 | **Segundo entitlement `docente_pro` aprobado en concepto, sin fecha de implementación asignada** | Asignar semana en el calendario de Persona C |
