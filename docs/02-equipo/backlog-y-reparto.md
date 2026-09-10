# Backlog, pantallas y reparto de roles — Cresco v1.0

> **Estado:** Vigente · **Dueño:** Todos · **Última revisión:** 2026-08-07

Documento de planificación del equipo. Se revisa cada lunes, 15 minutos.

---

## 1. Advertencia de alcance

El inventario real es de **31 pantallas** (19 del docente, 12 del representante).
Es más de lo que estimamos al principio y más de lo que tres personas construyen
cómodamente en seis semanas.

Por eso el backlog está marcado con MoSCoW y hay un **corte declarado**: si en
semana 4 el bloque *Must* no está cerrado, se sacrifica todo el *Should* sin
discusión. Es preferible entregar cinco funciones sólidas que ocho a medias.

---

## 2. Reparto de módulos

Cada persona es dueña de sus tablas, sus endpoints y sus pantallas. **Nadie
modifica el módulo de otro**: si necesita un campo, lo pide y se agrega en una
migración acordada.

> **Incorporación del 31 de agosto de 2026: Persona D (@krriveram), interfaz.**
> Antes cada uno de A/B/C era dueño de su lógica de backend *y* de las
> pantallas que la usan. Desde ahora D construye la interfaz de las **31
> pantallas**, consumiendo las funciones que A, B y C exponen — ella no
> escribe en `convex/`. El detalle de cómo se coordina esto vive en
> `flujo-de-trabajo.md`, sección "El contrato con la interfaz".

| | **Persona A — Núcleo** | **Persona B — Conducta** | **Persona C — Interacción e infra** | **Persona D — Interfaz** |
|---|---|---|---|---|
| **Tablas** | `institucion`, `perfil_usuario`, `docente`, `representante`, `anio_lectivo`, `periodo_academico`, `dia_no_lectivo`, `curso`, `asignacion_docente`, `estudiante`, `matricula`, `invitacion_curso`, `vinculo_representacion`, `consentimiento` | `categoria_accion`, `tipo_accion`, `accion_registrada`, `comunicado_curso`, `franja_conducta`, `puntaje_periodo`, `registro_asistencia`, `plantilla_*`, `reporte_*`, `entrega_reporte` | `disponibilidad_docente`, `cita`, `inconformidad`, `alerta_emergencia`, `entrega_alerta`, `plan`, `suscripcion`, `evento_revenuecat`, `desbloqueo_recompensado`, `dispositivo`, `notificacion`, `auditoria` | — (no toca tablas) |
| **Responsable de** | Clerk, capa de permisos, importación CSV, flujo de vinculación | Motor de puntaje, generación nocturna de reportes, gráfico de evolución | RevenueCat, notificaciones push, PDF, CI, despliegue | Tema, los 6 componentes base y las 31 pantallas |
| **Su archivo de funciones** | `convex/nucleo.ts` | `convex/conducta.ts` | `convex/interaccion.ts` | `movil/src/screens/`, `components/`, `theme/` |
| **Pantallas — lógica de negocio** | D1–D8, P1–P3 | D9–D13, P4–P6 | D14–D19, P7–P12 | — |
| **Pantallas — interfaz** | | | | **Las 31**, sobre las funciones de A/B/C |

> Los nombres de tabla de la fila anterior están en `snake_case` porque vienen
> del modelo relacional original. En Convex son **`camelCase`**
> (`perfilUsuario`, `accionRegistrada`, `franjaConducta`…) — ver
> `movil/convex/schema.ts`, que manda.

**Superficie compartida:** `convex/schema.ts`, `convex/lib/enums.ts`,
`convex/lib/guardas.ts`, `convex/lib/permisos.ts` y `convex/lib/flags.ts`.
Cambiar cualquiera exige acuerdo de los tres — y desde el 22 de agosto lo pide
GitHub automáticamente vía `.github/CODEOWNERS`, no depende de recordarlo.

---

## 3. Inventario de pantallas

### App del docente

| # | Pantalla | Endpoint principal | Prioridad |
|---|---|---|---|
| D1 | Bienvenida y registro | Clerk | Must |
| D2 | Inicio de sesión | Clerk | Must |
| D3 | Crear curso (escuela, año lectivo, nivel) | `POST /docente/cursos` | Must |
| D4 | Definir parciales | `POST /docente/cursos/{id}/periodos` | Must |
| D5 | Selector de curso | `GET /docente/cursos` | Should |
| D6 | Panel del curso (inicio) | `GET /docente/cursos` | Must |
| D7 | Lista de estudiantes | `GET .../estudiantes` | Must |
| D8 | Aprobar estudiantes pendientes | `POST .../aprobar` | Must |
| D9 | Importar CSV | `POST .../importar` | Could |
| D10 | Invitar representantes (código y enlace) | `POST .../invitacion` | Must |
| D11 | Asignar acción (tipo → buscar → puntos) | `POST /docente/acciones` | Must |
| D12 | Tomar asistencia | `PUT .../asistencia` | Should |
| D13 | Redactar reporte general | `POST .../reporte-general` | Must |
| D14 | Publicar anuncio o evento | `POST .../comunicados` | Should |
| D15 | Bandeja de inconformidades | `GET /docente/inconformidades` · `POST .../{id}/resolver` | Should |
| D16 | Horario y confirmación de citas | `GET/POST /docente/disponibilidad` · `GET /docente/citas` · `POST /docente/citas/{id}/responder` | Should |
| D17 | Alerta de emergencia (con reautenticación) | `POST /docente/alertas` | Should |
| D18 | Perfil del docente | — | Could |
| D19 | Paywall del docente | `GET /suscripcion/estado` | Must |

### App del representante

| # | Pantalla | Endpoint principal | Prioridad |
|---|---|---|---|
| P1 | Registro e inicio de sesión | Clerk | Must |
| P2 | Reclamar código del curso | `POST /representante/invitaciones/reclamar` | Must |
| P3 | Datos del hijo y consentimiento | mismo endpoint | Must |
| P4 | **Inicio: reporte del día** (con selector de hijo) | `GET /representante/reporte-diario` | Must |
| P5 | Reportes anteriores (limitado por plan) | `GET .../reportes-anteriores` | Must |
| P6 | Reporte acumulado (bitácora, gráfico, franja) | `GET .../reporte-acumulado` | Must |
| P7 | Detalle de acción y abrir inconformidad | `POST .../inconformidades` | Should |
| P8 | Agendar cita | `POST /representante/citas` | Should |
| P9 | Profesor a cargo | — | Could |
| P10 | Alertas recibidas y confirmación | `GET /representante/alertas` · `POST .../{id}/confirmar` | Should |
| P11 | Paywall y suscripción | RevenueCat | Must |
| P12 | Ajustes y exportar PDF | `POST .../exportar` | Could |

---

## 4. Backlog por épica

Formato: `[Prioridad] Como <rol> quiero <acción> para <fin>` + criterios.
Las referencias `RN-xx` y las letras del cuestionario apuntan a la especificación.

### E1 — Identidad y curso *(A)*

- **[Must]** Como docente quiero crear mi curso escribiendo el nombre de mi
  escuela, para empezar sin depender de que el colegio se registre. *(A1, A2)*
  - Se crea institución con `verificada = false`.
  - Si ya tengo el máximo de cursos de mi plan, recibo `402` y veo el paywall. *(H1)*
- **[Must]** Como docente quiero definir de 2 a 3 parciales con sus fechas. *(B1, B2)*
  - Fechas solapadas → `409`.
- **[Must]** Como docente quiero generar un código de invitación al curso. *(A1, D4)*
  - El código vence a los 30 días y admite varios usos.

### E2 — Vinculación *(A)*

- **[Must]** Como representante quiero canjear el código y registrar a mi hijo. *(A1)*
  - Exige aceptar el consentimiento con versión registrada. *(I4)*
  - El estudiante queda `PENDIENTE`.
  - Si el estudiante ya tiene representante activo → `409`. *(D2)*
- **[Must]** Como docente quiero aprobar o corregir los estudiantes que
  registraron los representantes. *(A1)*
  - Puedo completar nombres antes de aprobar.
  - Al aprobar se crea la matrícula y el puntaje inicial de 60. *(C3)*
- **[Must]** Como representante con varios hijos quiero cambiarlos con un toque. *(D6)*

### E3 — Acciones y puntaje *(B)*

- **[Must]** Como docente quiero asignar una acción buscando al estudiante por nombre.
  - Positiva: +1 por defecto, ajustable a +2. *(C2)*
  - Responsabilidad: fija en −1. Disciplina: −1 a −3. *(C2)*
  - Si el estudiante ya llegó a +4 o −5 hoy → `422 TOPE_DIARIO_ALCANZADO`. *(C4)*
  - Período cerrado o día no lectivo → `409`. *(B3)*
- **[Must]** Como docente quiero anular una acción negativa mal asignada. *(C8)*
  - `ANULADA` y `MODIFICADA` valen 0 y recalculan el puntaje. *(F4)*
  - Las positivas no se anulan.
- **[Must]** El puntaje se recalcula siempre desde las acciones vigentes. *(ADR-005)*
- **[Should]** Como docente quiero registrar la asistencia del curso en una pantalla.

### E4 — Comunicados *(B)*

- **[Should]** Como docente quiero publicar un anuncio, incluso en día sin clase. *(B4)*
- **[Should]** Como docente quiero publicar un evento con título y contenido. *(C2)*
  - Aparece en el reporte hasta 7 días antes y desaparece al día siguiente.
  - Se muestra como bloque expandible al final del reporte.

### E5 — Reportes *(B)*

- **[Must]** Como docente quiero llenar el reporte del día en campos etiquetados. *(E1, E3)*
  - Ningún campo es obligatorio.
  - Al publicar se generan los reportes por estudiante y se notifica.
- **[Must]** Como representante quiero ver el reporte de hoy al abrir la app. *(E2)*
  - Sin reporte generado → `204` y el mensaje "Aún no tienes reporte nuevo…".
  - Sin reporte general pero con acciones → se muestran solo las acciones.
  - Los puntos de cada acción son visibles. *(C6)*
- **[Must]** Como representante quiero ver reportes anteriores. *(E4)*
  - Gratuito: 2. Premium: 7.
  - Al llegar al límite veo la invitación a premium.
- **[Must]** Como representante quiero el acumulado con bitácora y gráfico. *(D5)*
  - Las notas no aparecen en la bitácora. *(C2)*
  - Se muestra la franja con su frase orientadora. *(C7)*

### E6 — Inconformidades y citas *(C)*

- **[Should]** Como representante quiero reclamar una acción negativa. *(C8)*
  - Plazo del docente: 30 días; vencido pasa a `VENCIDA`. *(F3)*
- **[Should]** Como docente quiero resolver una inconformidad.
  - `RESUELTA_MODIFICADA` lleva la acción a 0 y devuelve los puntos. *(F4)*
- **[Should]** Como representante quiero reservar un bloque de 15 minutos. *(F1)*
  - Nace `SOLICITADA`; el docente confirma. *(F2)*

### E7 — Alertas *(C)*

- **[Should]** Como docente quiero enviar una alerta al curso o a un solo estudiante. *(G2)*
  - Exige reingresar la contraseña. *(G1)*
  - La app declara que no sustituye al ECU 911.
- **[Should]** Como representante quiero confirmar que la leí. *(G3)*

### E8 — Monetización *(C)*

- **[Must]** Como representante quiero suscribirme para quitar la publicidad. *(H2)*
  - Mensual y bimestral. *(H3)*
  - Premium por cuenta, cubre a todos los hijos. *(H1)*
- **[Must]** Como docente quiero ampliar mi límite de cursos comprando el plan PRO. *(H1)*
- **[Must]** El webhook no duplica suscripciones ante reenvíos. *(ADR-006)*
- **[Could]** Como representante gratuito quiero exportar el PDF viendo un anuncio. *(E6, I2)*

---

## 5. Plan de seis semanas

> ⚠️ **Este calendario de seis semanas es el de agosto y quedó atrás.** El estado
> real y el orden de trabajo vigente están en `Contexto/NEXT_STEPS.md` (y, en
> cuanto existan, en los Issues del milestone). Se conserva porque el reparto de
> pantallas por persona sigue siendo el acordado.

| Semana | A — Núcleo | B — Conducta | C — Interacción e infra |
|---|---|---|---|
| **1** | ✅ Clerk + Convex, capa de permisos | ✅ Catálogo semilla · ⬜ motor de puntaje con pruebas | ✅ Repositorio, CI · ⬜ dev build de Expo, RevenueCat |
| **2** | D1–D4, D6, D10 | D11 (asignar acción), tope diario | P1, P11 (paywall), notificaciones push |
| **3** | P2, P3, D7, D8 (aprobación) | D13 y P4 (reporte diario extremo a extremo) | D19, límites de plan en servidor |
| **4** | Selector de hijos, CSV, pruebas S-1 a S-7 | P5, P6, gráfico de evolución | D17 alertas, P10 |
| **5** | Ajustes, guías de uso | D12, D14 comunicados | D15, D16, P7, P8 |
| **6** | Corrección conjunta · datos de demostración · video · README verificado en máquina limpia | | |

**Punto de control del viernes de semana 4:** si todo el *Must* no está cerrado,
se corta el *Should* completo y las tres personas pasan a pulir.

---

## 6. Definición de "terminado"

Una historia está terminada cuando cumple las seis:

1. La función de Convex valida sus argumentos y aplica las guardas
   (`convex/lib/guardas.ts`) y permisos (`convex/lib/permisos.ts`) que le tocan.
2. La pantalla maneja los tres estados: cargando, vacío y error.
3. Si toca datos de estudiantes, tiene una prueba de que un usuario sin vínculo
   recibe `ErrorPermiso`.
4. `npm run typecheck` y `npm test` pasan.
5. Fue revisada y aprobada por otra persona del equipo (nadie fusiona su propio
   PR).
6. Funciona en un dispositivo Android real, no solo en el emulador.

> La columna "Endpoint principal" del inventario de pantallas describe el
> contrato HTTP original, archivado en
> `docs/99-archivo/openapi-v1.1.0-archivado.yaml`. Ya no es ejecutable, pero
> sigue siendo la descripción más completa de qué debe hacer cada función de
> Convex: léelo como especificación, no como ruta.
