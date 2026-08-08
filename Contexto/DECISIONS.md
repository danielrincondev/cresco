# DECISIONS.md — Registro de decisiones cerradas

Todo lo que está aquí **está decidido**. No se cuestiona sin una razón nueva y
concreta. Si Claude Code propone algo que contradice una fila de estas tablas,
debe señalar explícitamente que contradice una decisión previa y esperar
confirmación del usuario.

Formato de fecha: aproximada, dentro de la sesión de diseño del 3 de agosto de
2026 salvo indicación distinta.

---

## Arquitectura y stack

| # | Decisión | Razón | Fecha |
|---|---|---|---|
| ADR-001 | PostgreSQL como motor | Modelo relacional normalizado con integridad referencial, índices únicos parciales y CHECKs que codifican reglas de negocio | 2026-08-02 |
| ADR-001 | Drizzle ORM | Los tipos de TypeScript se derivan del esquema; el contrato de datos no puede desincronizarse del código | 2026-08-02 |
| ADR-002 | Next.js como **servidor**, no como frontend web | Aloja BetterAuth, rutas de API, webhook de RevenueCat y tarea nocturna de reportes | 2026-08-02 |
| ADR-002 | Expo / React Native para las dos apps | Único camino con SDK de RevenueCat en el stack de TypeScript del equipo | 2026-08-02 |
| ADR-002 | **Tauri descartado** | Soporte móvil inmaduro y **sin SDK de RevenueCat**: incumpliría el requisito del hackathon | 2026-08-02 |
| ADR-002 | **shadcn/ui NO se usa en las apps** | Es solo para web, no corre en React Native. Se usa NativeWind con componentes propios | 2026-08-02 |
| ADR-003 | BetterAuth con plugin de organización | `organization` = institución declarada por el docente | 2026-08-02 |
| ADR-003 | `perfil_usuario` extiende el `user` de BetterAuth | Duplicar la identidad es el error más caro de deshacer | 2026-08-02 |
| ADR-004 | Permisos en dos capas: `db/acceso/` + RLS de PostgreSQL | Un bug de la aplicación no debe bastar para filtrar datos de un menor | 2026-08-02 |
| ADR-005 | El puntaje es derivado, nunca un contador | Un contador se desincronizaría de la bitácora de forma permanente y sin detectarlo | 2026-08-02 |
| ADR-006 | RevenueCat es la fuente de verdad de pagos | Requisito obligatorio del Shipaton | 2026-08-02 |
| — | Estados como `TEXT` + `CHECK`, no `ENUM` de Postgres | Agregar un estado es una migración trivial; con `ENUM` es un `ALTER TYPE` incómodo | 2026-08-02 |
| — | Nombres de tablas y columnas en **español**, `snake_case` | Coherencia con el dominio | 2026-08-02 |
| — | Claves primarias `uuid` | Salvo `auditoria`, que usa `bigserial` y no se sincroniza al cliente | 2026-08-02 |

## Producto y reglas de negocio

| # | Decisión | Razón | Fecha |
|---|---|---|---|
| A1 | El docente se registra solo y escribe el nombre de su escuela como texto libre | No hay superusuario en la v1; permite arrancar sin que el colegio se registre | 2026-08-03 |
| A2 | La institución queda con `verificada = false` | En la v2 la dirección la reclama sin migrar nada | 2026-08-03 |
| A3 | No hay administrador de institución en la v1 | El docente hace todo | 2026-08-03 |
| A4 | Solo zona `America/Guayaquil` | El piloto es en Guayaquil; Galápagos no aplica | 2026-08-03 |
| B1 | El docente define el año lectivo y sus parciales | Cada curso tiene su propio calendario | 2026-08-03 |
| B2 | De 2 a 3 parciales por año lectivo | Práctica común en escuelas del Ecuador | 2026-08-03 |
| B3 | Positivas y negativas solo en días de clase; anuncios también fuera | Un anuncio puede ser necesario un feriado | 2026-08-03 |
| B4 | Solo los días con clase generan reporte diario | Evita reportes vacíos en fin de semana | 2026-08-03 |
| C1 | Piso 0, techo 100 | El puntaje nunca queda negativo | 2026-08-03 |
| C2 | Positivas +1 (ajustable a +2); responsabilidad −1 fija; disciplina −1 a −3 | Consistencia entre docentes con margen de criterio | 2026-08-03 |
| C2 | Quinto tipo de acción: **Evento**, por curso | Metadato reutilizable para una agenda futura | 2026-08-03 |
| C2 | Anuncio y Evento van a `comunicado_curso`, no a `accion_registrada` | Alcanzan a todo el curso, no a un estudiante | 2026-08-03 |
| C3 | El puntaje se reinicia a 60 cada parcial | No arrastra el parcial anterior | 2026-08-03 |
| C4 | Topes diarios de +4 y −5 por estudiante | Un mal día no debe hundir el puntaje | 2026-08-03 |
| C5 | Al cerrar el parcial el puntaje se congela | La app no afecta calificaciones; la bitácora apoya la nota de conducta | 2026-08-03 |
| C6 | El representante ve los puntos de cada acción | Deja constancia y separa el nivel de impacto | 2026-08-03 |
| C7 | Seis franjas: 0-15, 16-30, 31-50, 51-60, 61-80, 81-100 | 51-60 es la zona del punto de partida | 2026-08-03 |
| C8 | Solo las acciones **negativas** se pueden anular | No tiene sentido disputar una positiva | 2026-08-03 |
| D1 | Dos caminos de alta de estudiante: el representante los registra, o el docente importa CSV | El principal es el del representante | 2026-08-03 |
| D2 | **Un solo representante legal por estudiante** en la v1 | Simplifica lectura, reclamo y notificación. Índice único parcial revocable en v2 | 2026-08-03 |
| D4 | La invitación al curso dura 30 días | — | 2026-08-03 |
| D6 | Un representante puede tener hijos en colegios distintos | Barra superior para cambiar entre ellos | 2026-08-03 |
| E1 | El reporte se llena al terminar la clase, con campos etiquetados | Los campos son metadatos reutilizables | 2026-08-03 |
| E2 | El reporte general es opcional; si hay acciones, el del estudiante se genera igual | El docente no debe sentirse obligado a escribir todos los días | 2026-08-03 |
| E4 | Solo el reporte más reciente en pantalla principal; historial 2 (free) / 7 (premium) | Es el gancho principal de la suscripción | 2026-08-03 |
| E5 | **Las preguntas al docente se difieren a la v2** | Fuera del MVP; la tabla existe pero sin endpoints ni pantallas | 2026-08-03 |
| E6 | Exportar PDF: libre en premium, con anuncio recompensado en gratuito | — | 2026-08-03 |
| F1 | Citas en bloques de 15 minutos desde el horario publicado | — | 2026-08-03 |
| F2 | La cita requiere confirmación del docente | Nace `SOLICITADA` | 2026-08-03 |
| F3 | El docente tiene 30 días para responder una inconformidad | Vencido pasa a `VENCIDA` y sube de prioridad | 2026-08-03 |
| F4 | `RESUELTA_MODIFICADA` lleva la acción a 0 puntos y devuelve el puntaje | Se muestra distinto de una anulación | 2026-08-03 |
| G1 | La alerta de emergencia exige **reingresar la contraseña** | Evita activaciones accidentales; queda `reautenticado_en` como constancia | 2026-08-03 |
| G2 | Alcance de la alerta: todo el curso o un solo estudiante | — | 2026-08-03 |
| G3 | El representante confirma lectura de la alerta | — | 2026-08-03 |
| — | La app declara visiblemente que la alerta **no sustituye al ECU 911** | Responsabilidad ante falsas alarmas en un colegio real | 2026-08-03 |
| H1 | Premium del representante **por cuenta**, no por estudiante | Cubre a todos sus hijos | 2026-08-03 |
| H1 | **El docente sí tiene límites de pago** | Reemplaza la regla anterior de "docente siempre gratuito" | 2026-08-03 |
| H2 | Premium del representante: sin publicidad, 7 reportes, acumulado enriquecido | — | 2026-08-03 |
| H3 | "Por parcial" se mapea a suscripción **bimestral** | Google Play no tiene ciclo de 6 semanas | 2026-08-03 |
| H5 | Publicidad por red publicitaria (AdMob) | Patrocinadores directos, más adelante | 2026-08-03 |
| I1 | Al retirarse un estudiante los datos se archivan; el representante pierde acceso, la institución conserva | — | 2026-08-03 |
| I3 | **No se guardan archivos ni fotos.** El CSV se parsea y se descarta | Reduce el riesgo y el análisis de cumplimiento | 2026-08-03 |
| I4 | El representante aporta los datos del menor y otorga el consentimiento | Se guarda la versión del documento aceptado, no un booleano | 2026-08-03 |

## Identidad y hackathon

| # | Decisión | Razón | Fecha |
|---|---|---|---|
| — | El producto se llama **Cresco** | Cierra el pendiente del nombre. Descarta "Vínculo", "EduConecta" y "Conecta Educación" | 2026-08-07 |
| — | El equipo se llama **Neofix** | — | 2026-08-07 |
| — | `vinculo_representacion`, `ux_vinculo` y `SIN_VINCULO` **no se renombran** | Son el término del dominio (el vínculo representante–estudiante), no el nombre del producto. Renombrarlos sería una migración sin ningún beneficio | 2026-08-07 |
| — | Se compite **solo en la categoría Next Gen** | Las demás exigen publicar en tienda | 2026-08-07 |
| — | **Sin cuenta de Google Play Console** | Next Gen evalúa por video y repositorio público; exime del requisito de tienda. Elimina el mayor riesgo externo del proyecto y libera la semana 1 de Persona C | 2026-08-07 |
| — | El repositorio será **público y de código abierto**, con `LICENSE` en la raíz | Requisito obligatorio de Next Gen. Arranca privado y se abre antes de enviar | 2026-08-07 |
| — | Video de **menos de 2 minutos**; descripción y video en inglés o subtitulados | Regla oficial. La app se queda en español, que es su público real | 2026-08-07 |

## Cierre de pendientes — 8 de agosto de 2026

Decididas por Persona C como responsable de producto, aprobadas por Persona A.
Cierran los puntos que quedaron abiertos tras la auditoría de integridad.

| # | Decisión | Razón | Fecha |
|---|---|---|---|
| L1 | Licencia **AGPL-3.0**, con licenciamiento comercial en paralelo | Next Gen exige repositorio abierto, pero el equipo planea comercializar. Neofix es titular único del copyright, así que puede licenciar en paralelo. AGPL desincentiva que un tercero cierre el código y lo venda como servicio | 2026-08-08 |
| L2 | `LICENSE` en la raíz con el texto canónico de la FSF, sin modificar | GitHub solo muestra la licencia en "About" si el archivo es reconocible. El aviso de copyright y el dual-licensing van en el `README`, no dentro del `LICENSE` | 2026-08-08 |
| V1 | **`DOCENTE_COLABORADOR` se difiere a la v2** | El esquema lo admite y la matriz lo describía, pero ninguna pantalla ni endpoint de la v1 lo ejerce. Con 31 pantallas ya comprometidas, no pasa el filtro de *Must*. El FAQ ya lo prometía "para una siguiente versión" | 2026-08-08 |
| V2 | `categoria_accion.aplica_a` queda **reservado sin CHECK** hasta la v2 | Su único consumidor era el rol colaborador. Definir su dominio ahora sería inventar una regla sin uso | 2026-08-08 |
| V3 | El PDF del acumulado se **genera en memoria y se devuelve en la respuesta** (`application/pdf`), sin URL ni almacenamiento | Cumple I3 ("no se guardan archivos en ninguna parte") sin excepciones ni notas al pie, y no depende de elegir proveedor de storage —que sigue sin decidirse | 2026-08-08 |
| V4 | `TIPO_ITEM_REPORTE.CITACION` se resuelve **con `texto_libre`**, sin FK a `cita` | Es función *Should*. Añadir `cita_id` a la tabla de B por una función opcional no justifica la coordinación. Se reevalúa en semana 3, cuando el flujo de citas exista | 2026-08-08 |
| E1 | `matricula.fecha_ingreso` y `asignacion_docente.vigente_desde` **pierden `.defaultNow()`**; el servidor calcula la fecha con `America/Guayaquil` | `now()::date` se resuelve con el timezone de la sesión de Postgres (UTC en la nube). Una matrícula creada a las 20:00 en Guayaquil quedaba fechada al día siguiente, en silencio | 2026-08-08 |
| E2 | `ux_estudiante_documento` pasa a **índice único parcial**, excluyendo `tipo_documento = 'SIN_DOCUMENTO'` | Dos estudiantes sin cédula del mismo colegio colisionaban y el segundo recibía un `409` como si fuera duplicado. Mismo patrón que `ux_matricula_cursando` | 2026-08-08 |
| E3 | E1 y E2 se aplican **antes del primer commit del esquema**, regenerando la migración `0000` | No existe ninguna base de datos todavía. Corregir ahora cuesta dos líneas; hacerlo en semana 3 cuesta una migración correctiva sobre datos del piloto | 2026-08-08 |

> **E1, E2 y E3: ejecutadas y verificadas el 8 de agosto de 2026.** El esquema ya
> las incorpora y la migración se regeneró como `0000_cresco_inicial.sql`
> (41 tablas, 57 CHECK). `npm run typecheck` pasa y `npm run db:generate` dos
> veces seguidas no produce migración adicional. Persona A no tiene que
> aplicarlas: tiene que no deshacerlas.

## Estructura de código y calendario — 8 de agosto de 2026

Decididas por Persona C, aprobadas por el equipo. Resuelven dos huecos que no
tenían dueño: dónde vive el código de aplicación que nadie ha escrito todavía, y
qué calendario usar ahora que la semana 1 real empieza el 9 de agosto y no el 4.

| # | Decisión | Razón | Fecha |
|---|---|---|---|
| S1 | **Una sola app Expo**, con enrutado por rol (docente/representante), no dos apps separadas | Una persona puede ser docente y representante a la vez (por eso hay dos tablas de perfil, no un campo `rol`); con dos apps tendría que instalar dos. Para Persona C significa un solo build de EAS, un solo proyecto de RevenueCat, un solo icono — menos superficie con seis semanas de plazo | 2026-08-08 |
| S2 | **`servidor/` y `movil/` como carpetas hermanas en la raíz**, sin envoltorio `apps/` | Un envoltorio `apps/` insinúa herramientas de monorepo (workspaces) que decidimos no adoptar (ver S4). Mismo estilo plano que ya tiene el repo con `db/`, `docs/`, `api/` | 2026-08-08 |
| S3 | **No se crean las carpetas `servidor/` ni `movil/` por adelantado.** Nacen cuando alguien corre `npx create-next-app` / `npx create-expo-app` | Esas herramientas de scaffolding normalmente rechazan o fallan si el directorio destino ya tiene contenido, aunque sea un `.gitkeep`. Crearlas antes arriesga romper el primer paso de configuración de A o C | 2026-08-08 |
| S4 | **Ningún paquete compartido ni `npm workspaces` entre `servidor/` y `movil/`** | Revisando el flujo real de datos: el servidor calcula todo (puntaje, límites) y lo devuelve ya resuelto en la respuesta JSON; el móvil solo llama a la API y renderiza. No hay código que de verdad se comparta entre las dos apps más allá de `db/schema/` (ya en la raíz, ya funciona así, solo lo importa `servidor/`). Esto **no reabre ADR-002** ("sin montar un monorepo completo"): sigue sin hacer falta ninguna herramienta de workspaces | 2026-08-08 |
| S5 | `theme/Theme.ts` y `components/base/` viven en **`movil/`** (de A); `lib/puntaje.ts` vive en **`servidor/`** (de B) | Son artefactos de una sola app cada uno, no compartidos: el tema es UI de React Native: el cálculo de puntaje corre server-side y el cliente solo muestra el número que la API ya devuelve | 2026-08-08 |
| S6 | **Persona C scaffoldea `servidor/` y `movil/` el día 1 de la semana 1**, como parte de "Repositorio y CI" | C es formalmente dueño de infraestructura. A necesita `servidor/` para instalar BetterAuth (día 3 de la semana 1): scaffoldearlo el día 1 deja el mismo margen de dos días que ya tenía el calendario original. A y B no tienen que tocar `npx create-*`, solo trabajar dentro de las carpetas ya creadas | 2026-08-08 |
| — | Cada `package.json` de `servidor/` y `movil/` es **independiente** del `package.json` de la raíz | El de la raíz sigue siendo solo para `db/schema/` y las herramientas de Drizzle. No hay `workspaces` que los una — cada uno se instala con su propio `npm install` dentro de su carpeta | 2026-08-08 |
| — | **La semana 1 real empieza el domingo 9 de agosto**, no el martes 4 | El calendario original ya había quedado atrás: Node.js no estaba instalado en la máquina de C, la sesión de dirección visual del 5 de agosto no ocurrió, y las tareas de la semana 1 no se habían ejecutado. En vez de fingir que ya pasó, se reinicia el reloj desde una fecha real | 2026-08-08 |
| — | **Las 6 semanas corren domingo a sábado**, terminando el sábado 19 de septiembre | Es la fecha que fijó el equipo como límite de las 6 semanas de trabajo activo. El nuevo deadline interno (el día siguiente) queda en **domingo 20 de septiembre** | 2026-08-08 |
| — | **El envío del equipo (28 sep.) y el cierre oficial del Shipaton (30 sep.) NO se mueven** | Son fechas externas fijadas por el patrocinador, no derivadas del reinicio del calendario interno | 2026-08-08 |

> ⚠️ **Consecuencia que hay que tener presente:** el colchón entre el deadline
> interno y el envío real se comprimió de 13 días (15→28 sep.) a **8 días**
> (20→28 sep.). Las tres semanas de pulido siguen existiendo, pero son más
> ajustadas que en el plan original. No es una razón para ampliar alcance —
> es una razón para vigilar el punto de control del 2 de septiembre con más
> disciplina que antes.

## Equipo y proceso

| # | Decisión | Razón | Fecha |
|---|---|---|---|
| — | Tres módulos con dueño único; nadie edita el módulo de otro | Evita el 90 % de los conflictos de fusión | 2026-08-02 |
| — | Superficie compartida: `db/schema/enums.ts` y `api/openapi.yaml` | Cambiarlos exige acuerdo de los tres | 2026-08-02 |
| — | Nadie fusiona su propio PR | — | 2026-08-02 |
| — | Punto de control el viernes 28 de agosto | Si el bloque obligatorio no está cerrado, se sacrifica todo lo opcional | 2026-08-02 |
| — | Deadline interno 15 de septiembre; deadline real 28 de septiembre | Las 3 semanas de margen son para diferenciador, pulido y prueba con usuarios; **no para ampliar alcance** | 2026-08-03 |
| — | ~~Deadline interno 15 sep.~~ → **deadline interno 20 de septiembre**, tras el reinicio del calendario | Ver sección "Estructura de código y calendario" arriba. El envío real (28 sep.) no cambió | 2026-08-08 |
| — | La documentación vive en `docs/` numerado por pregunta | Un documento que no está en `docs/README.md` no existe para el equipo | 2026-08-03 |
| — | La dirección visual será **código**, no documento | Un archivo de diseño aparte siempre termina desincronizado | 2026-08-03 |
| — | Dueño del archivo de tema: **Persona A**, decidido en sesión de los tres | A construye las pantallas con más variedad de componentes | 2026-08-03 |
