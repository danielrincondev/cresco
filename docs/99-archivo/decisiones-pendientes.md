# Decisiones pendientes — sesión de Product Manager

> **Estado:** Reemplazado el 2026-08-22 · **Dueño:** Persona C (Product Manager) · **Fecha:** 2026-08-14

**Este documento pasa a archivo.** Todos sus bloques quedaron resueltos. Las
decisiones que siguen siendo relevantes viven, una por archivo, en
`docs/00-producto/decisiones/` (DP-001 a DP-008). Se conserva completo, sin
editar, porque las respuestas escritas a mano en este archivo (bloques 1, 3,
4 y 5) son el registro original de esas decisiones.

---

Todas las decisiones abiertas del proyecto, en un solo sitio, ordenadas por qué
bloquean. Las toma Persona C con potestad delegada por A y B.

**Cómo llenarlo:** casi todo viene con una **propuesta ya escrita**. Si estás de
acuerdo, marca `✅ APROBADO`. Si no, tacha y corrige. Es mucho más rápido que
responder en blanco, y para lo que hace falta hoy, decidir rápido vale más que
decidir perfecto.

**Prioridad:**
🔴 bloquea el fin de semana · 🟡 bloquea la semana 2 · 🟢 puede esperar

---

## Bloque 0 — Arranque 🔴

### 0.1 ¿Repositorio nuevo o el actual?

El árbol final es idéntico en ambos casos. Solo cambia la URL y un commit de
historia. El repo actual tiene un solo commit, así que no se pierde nada valioso.

- [ ] **a)** Seguir en `danielrincondev/cresco`. Cuesta cero, nadie vuelve a clonar, la rama de A queda a mano
- [ ] **b)** Repo nuevo. El viejo queda intacto como respaldo automático

**Decisión:** ______________________
**Si es (b), nombre del repo:** ______________________
**Si es (b), el viejo se:** ☐ archiva ☐ borra

---

### 0.2 Congelar la rama `feat/dev-daniel`

No es opcional y no admite alternativa: si A sigue construyendo sobre Turborepo,
Next y Drizzle mientras montamos Convex, terminan con dos proyectos divergentes.
La rama se queda como **referencia de solo lectura** — A reescribe sus 4 rutas
como funciones de Convex leyendo de ahí.

**¿A avisado y de acuerdo?** ☐ Sí, congelada · **Fecha/hora:** __________
Ya eso ya estaba hablado con A. EL fue el que sugirio convex y clerck de hecho, A ya sabe que cambio el stack el lo proporciono
---

### 0.3 El corte MoSCoW — la decisión de mayor impacto 🔴

Su plan dice que el corte se hace en el punto de control del 2 de septiembre.
**Recomiendo hacerlo hoy.** Perdieron una semana y decidir ahora qué *no* se
construye devuelve la calma de trabajar contra un número alcanzable.

| | Pantallas | Viable en 5 semanas |
|---|---|---|
| Todo (Must + Should + Could) | 31 | No |
| **Solo Must** | **18** (11 docente + 7 representante) | Sí |

**Las 18 que sobreviven:** D1, D2, D3, D4, D6, D7, D8, D10, D11, D13, D19 ·
P1, P2, P3, P4, P5, P6, P11

**Lo que se sacrifica:** importar CSV, asistencia, comunicados, inconformidades,
citas, alertas de emergencia, perfil, profesor a cargo, exportar PDF.

- [ ] **a)** Corte ahora: solo los 18 *Must*. Si sobra tiempo se recupera Should
- [ ] **b)** Mantener el plan original y decidir el 2 de septiembre

**Decisión:** ______________________ Mantendremos el plan original, aumenta en un 30% -40% la carga de trabajo para cada dia para poder cerrar en el plazo que definimos, o antes o al menos uno cercano.

> ⚠️ **Consecuencia personal para Persona C:** de tus 12 pantallas solo D19 y P11
> son *Must*. Con el corte pierdes 10. Tu aporte crítico pasa a ser la
> infraestructura, RevenueCat y ayudar a A y B a cerrar sus *Must*. Conviene
> asumirlo hoy y no descubrirlo en septiembre.

---

## Bloque 1 — Datos semilla 🔴

Es el bloqueo número uno del equipo desde el 8 de agosto. Sin esto nadie puede
probar nada. En Convex una semilla es una `mutation`: media hora de trabajo una
vez que estos valores estén decididos.

### 1.1 Catálogo de tipos de acción

Propuesta para aprobar o corregir. Respeta las reglas ya decididas:
positivas +1 (ajustable a +2), responsabilidad **fija en −1**, disciplina de −1 a −3.

**Positivas** (`puntos_defecto` +1, `puntos_max` +2)

| Categoría | Nombre | ¿Se queda? |
|---|---|---|
| DESEMPENIO | Excelente trabajo en clase | | // Usa la ñ en la palabra desempeño que lee el profesor, esto es intrinseco del español
| DESEMPENIO | Participación destacada | |
| DESEMPENIO | Tarea sobresaliente | |
| CONVIVENCIA | Ayudó a un compañero | |
| CONVIVENCIA | Buen compañerismo | |
| RESPONSABILIDAD | Entregó la tarea a tiempo | |
| RESPONSABILIDAD | Trajo todos los materiales | |
| PUNTUALIDAD | Puntualidad destacada | |
Comentario: Ganar puntos es mas dificil que perderlos, lo que yo deseo es que categoria que leyendo esas 4 considero estan bien. El profesor seleccione uno y el mismo ponga el mensaje de porque se gano ese punto, no un nombre ya definido. El profesor podra elegir si sumar +1 o +2 dependiendo de como el mismo profesor considere el logro.
**Negativas de responsabilidad** (siempre −1, no ajustable)

| Nombre | ¿Se queda? |
|---|---|
| No trajo la tarea | |
| No trajo los materiales | |
| Entregó el trabajo fuera de plazo | |
| Uniforme incompleto | |
| Llegó tarde a clase | |

**Negativas de disciplina** (−1 a −3; el docente ajusta)

| Nombre | Sugerido | ¿Se queda? |
|---|---|---|
| Interrumpió la clase | −1 | |
| Uso del celular en clase | −1 | |
| Salió del aula sin permiso | −2 | |
| Dañó material del aula | −2 | |
| Trato irrespetuoso a un compañero | −2 | |
| Falta de respeto al docente | −3 | |
| Agresión física a un compañero | −3 | |

Nota: esta acciones no son separadas, asi como las positivas tendran su clasificacion y el profesor va a poner el mensaje y elegir el puntaje de entre -1 a -3 puntos. Los 3 grupos en los que podra caer una accion negativa seran "Indiciplina", "Irresponsabilidad", "Deshonestidad"( en este ultimo caeran trampas, deshonestidad academica en cualquier actividad calificada o mentiras dichas por los alumnos para justificar mal comportamiento o imcumplimiento)

**Notas** (valen 0 y no entran en la bitácora del acumulado)

| Nombre | ¿Se queda? |
|---|---|
| Nota para el representante | |
| Observación de salud | |
Nota: No este no se llama Notas, sino anuncios. debe tener 2 opciones, una sera "Notas del profesor": Debe dar la opcion de que el destinatario sea un solo padre o que sea todo el curso y el nombre no esta predefinido sino que el profedor escibira el mensaje. En el board del padre donde estan sus reportes diarios y acciones que recibio su hijo es que apareceran como Änuncio del profesor". este anuncio tendra una duracion de 1 a 7 dias, el profesor podra elegir cuanto tiempo quiere que dure este mensaje en el o los boards de los padres.
La segunda opcion sera "Eventos" en este los profesores podran subir informacion mas larga que quizas hasta listas de texto con todos los alumnos del aula podria estar listado, esto para que en un evento los padres se enteren de todo, y si sus hijos a una fiesta o convivencia deben llevar algo podran ver la lista. a diferencia de las "Notas del profesor", este no sera un mensaje estatico sino como un mensaje retractil del cual se vera con el formato: 
"Evento: [Nombre que el profesor proporciono] (Boton de flecha para expandir y leer el evento, y que presionarlo de nuevo retraera la informacion del evento)". El evento siempre estara disponible en el board del padre hasta que expire el evento. Cuando el profe cree un evento tendra que ingresar hasta cuando durara el evento (Cuando ese dia acabe se va del board y desaparece el evento).
**¿Falta alguno?** ______________________________________________
**¿Sobra alguno?** ______________________________________________

> Esta es la lista que más ganaría con la opinión de un profesor real. Si
> consiguen esa conversación, empiecen por aquí.

### 1.2 Campos de la plantilla del reporte general

Propuesta (el "etc." que quedó abierto en `CONTEXT.md`). Ningún campo es
obligatorio de llenar.

| Orden | Campo | Tipo | ¿Se queda? |
|---|---|---|---|
| 1 | Anuncios | TEXTO_LARGO | |
| 2 | Novedades del día | TEXTO_LARGO | |
| 3 | Tareas enviadas | TEXTO_LARGO | |
| 4 | Consejo del día | TEXTO_CORTO | |

**¿Agregar o quitar alguno?** ______________________
Esta perfecto para mi
### 1.3 Franjas de conducta ✅ YA DECIDIDO

Los seis colores están en `cuestionario-direccion-visual.md`, bloque C1. **Falta
la frase orientadora de cada franja**, que es lo que lee el representante:

| Franja | Frase orientadora |
|---|---|
| 0–15 Situación crítica | |
| 16–30 Muy por debajo | |
| 31–50 Por debajo de lo esperado | |
| 51–60 En el punto de partida | |
| 61–80 Buen desempeño | |
| 81–100 Excelente | |

> Escríbanlas pensando en que las lee una madre sobre su hijo de 8 años. La de
> 51–60 debe sonar **neutra**, no a advertencia: ahí arranca todo el mundo.

Sera este:
"Franja:Frase orientadora",
"0–15: Requiere acompañamiento prioritario: Unamos fuerzas para apoyarlo.",
"16–30: Refuerzo necesario: Su guía en casa marcará una gran diferencia.",
"31–50: En proceso de mejora: Con un poco más de práctica en casa, logrará avanzar.", 
"51–60: Bases alcanzadas: ¡Es el momento ideal para impulsarlo a seguir creciendo!", 
"61–80: ¡Buen progreso! Sigamos motivando su esfuerzo diario.",
"81–100: ¡Excelente nivel! Celebremos sus logros y mantengamos este ritmo."

### 1.4 Los cinco planes ✅ LÍMITES YA DECIDIDOS

Solo faltan los precios. Ver bloque 3.

---

## Bloque 2 — Dirección visual 🟡

El cuestionario `cuestionario-direccion-visual.md` está **a medio llenar**. Ya
respondieron A1, A2, A3, B1 (parcial), B2, B4, C1–C4 y F1.

**Falta, y todo esto es 🔴 para poder escribir el tema:**

| Pregunta | Qué falta |
|---|---|
| **B1** | Los hex exactos del azul: claro / base / oscuro |
Esta paleta usa tonos clásicos y profundos. Es ideal si buscas que la aplicación se sienta muy formal, segura y estructurada (similar a plataformas bancarias o académicas tradicionales).

Claro (Fondo / Tarjetas): #EBF4FA

Uso: Fondos de pantalla, contenedores de notas o reportes.

Base (Primario / Botones): #00509E

Uso: Botones principales ("Guardar", "Enviar mensaje"), barras de navegación superiores.

Oscuro (Texto / Énfasis): #002A5C

Uso: Títulos principales, texto destacado, bordes de elementos importantes.

| **B3** | Superficies y texto: fondo de pantalla, fondo de tarjeta, borde, separador, texto primario/secundario/deshabilitado/sobre color |
Elemento:	Decisión de Diseño (con HEX)
Fondo de pantalla:	Usar color Claro (#EBF4FA) para un aspecto suave.
Fondo de tarjeta:	Usar blanco (#FFFFFF) para contraste y limpieza.
Borde / Separador:	Usar tono gris claro y sutil (#E2E8F0) para definición y división.
Texto Primario:	Usar color Oscuro (#002A5C) para títulos y texto principal.
Texto Secundario:	Usar gris medio (#718096) para diferenciación sutil.
Texto Deshabilitado:	Usar gris claro estándar (#A0AEC0) para indicar inactividad.
Texto Sobre Color:	Usar blanco puro (#FFFFFF) para texto sobre color Base (botones, barras).

| **F2** | Escala de tamaños. Sugerencia: `xs 12 · sm 14 · base 16 · lg 20 · xl 24 · 2xl 32 · puntaje 56` |
Sugerencia aceptada, iremos con esa

| **G1** | Escala de espaciado: múltiplos de 4 u 8, de 6 a 8 pasos |
Token (Tamaño)	Decisión de Diseño y Uso
xs (4px)	Usar para espacios micro (ej. entre un ícono y texto adyacente).
sm (8px)	Usar para espacios pequeños (ej. margen entre un título y un subtítulo).
md (12px)	Usar para un espacio intermedio (ej. margen interno de una pequeña etiqueta).
base (16px)	Usar como el estándar principal (ej. márgenes generales desde los bordes de la pantalla).
lg (24px)	Usar para separar secciones principales dentro de una misma tarjeta o panel.
xl (32px)	Usar para la separación entre bloques grandes de contenido en la vista.
2xl (48px)	Usar para espacios generosos (ej. separar zonas muy distintas de la pantalla).
3xl (64px)	Usar para espacios máximos (ej. separación total de grupos grandes).
| **G2** | Radios de esquina: tarjeta, botón, chip |
Elemento (Radio)Decisión de Diseño y Usosm (4px)Usar para elementos menores o internos (ej. casillas de verificación, pequeños indicadores de estado).base (8px)Usar para botones y campos de entrada de texto. Mantiene un aspecto estructurado y serio, ideal para la navegación de adultos y docentes.lg (16px)Usar para tarjetas y ventanas modales. Suaviza los bloques grandes de información (como los reportes o tareas) sin perder el estilo institucional.pill (999px)Usar para chips, etiquetas (badges) o avatares de perfil. Al ser totalmente redondeados, se diferencian visualmente de los botones interactivos principales.
| **H1** | Estado *cargando*: ¿spinner, esqueleto, o ambos? |
Regla práctica de implementación:

Usa Esqueletos para la navegación principal: Cada vez que se cambie de pestaña (por ejemplo, al pasar del "Muro de Comunicados" a la "Libreta de Calificaciones"), muestra el esqueleto de la página.

Usa Spinners solo para micro-interacciones (Acciones de éxito): Resérvalos estrictamente para cuando el usuario hace clic en un botón de acción. Por ejemplo, cuando un profesor presiona "Guardar nota" o un padre presiona "Enviar mensaje".

Usa Ambos (Híbrido) para procesos complejos: Si un profesor está generando un reporte estadístico del trimestre que toma unos segundos calcular en la base de datos, muestra la estructura del reporte (esqueleto) y coloca un pequeño spinner en el centro indicando que se están procesando los números.
| **I1** | Librería de iconos: una sola, sin mezclar |
la decisión oficial es implementar la librería "Google Material Symbols", lo que garantizará un entorno familiar y de alta confianza para los profesores y padres de familia que usarán la plataforma. Como regla estricta para la navegación y la jerarquía visual, se usarán íconos de contorno (Outline / Regular) en todos los elementos del menú y botones inactivos. Por el contrario, la versión con relleno sólido (Fill / Solid) se aplicará de forma exclusiva para resaltar la pestaña o sección específica en la que el usuario se encuentra activo en ese momento.
**Respondan directamente en ese archivo, no aquí.**

> **Nota:** el Bloque K de ese cuestionario ("dónde vive `Theme.ts`") **quedó
> obsoleto** con la migración. La respuesta ahora es la estructura de Convex +
> Expo en un solo proyecto.

---

## Bloque 3 — Monetización 🟡

### 3.1 Precios

Nunca se definieron. Para el Test Store da igual el valor —no cobra nada— pero
hacen falta antes de la semana 3 y salen en el video.

| Producto | Precio propuesto (USD) | Decisión |
|---|---|---|
| REP_PREMIUM_MENSUAL | 1.99 | |
| REP_PREMIUM_BIMESTRAL | 2.99 | |
| DOC_PRO | 4.99 / mes | |

> Contexto: Ecuador usa dólar. El precio de referencia para una app de consumo
> local está por debajo del de EE. UU. Un representante con dos hijos paga una
> sola vez (premium es por cuenta, decisión H1).
Nota: lo de aumentar los cursos es solo del rol profesor. Pero acepto esto como precios iniciales 
### 3.2 Segundo entitlement para el docente

`DOC_PRO` amplía el límite de cursos, pero solo existe el entitlement `premium`,
que es del representante. Bloquea **D19** en la semana 3.

- [ ] **a)** Segundo entitlement `docente_pro`, separado de `premium` *(recomendado: audiencias distintas, límites distintos)*
- [ ] **b)** Un solo entitlement y se distingue por el producto comprado

**Decisión:** ______________________ vamos por la opcion a que recomendaste

---

## Bloque 4 — Auditoría, retención y legal 🟡

### 4.1 Qué se audita

La tabla `auditoria` existe con las acciones `CREAR`, `ACTUALIZAR`, `ANULAR`,
`APROBAR`, `LEER_SENSIBLE`, `EXPORTAR`, `LOGIN`, `ALERTA` — pero **ningún código
escribe en ella**. Con Convex se pierde la capa RLS, así que la bitácora pasa de
complemento a **control compensatorio**: es lo que demuestra ante un colegio que
nadie ve lo que no le toca.

Propuesta de qué se registra en la v1:

| Evento | ¿Se audita? |
|---|---|
| Un representante abre el reporte de un estudiante (`LEER_SENSIBLE`) | |
| Un docente registra o anula una acción | |
| Un docente aprueba un estudiante | |
| Se exporta un PDF | |
| Se activa una alerta de emergencia | |
| Inicio de sesión | |

**Decisión:** ______________________ SI llega a ser importante y nos es util en esta v1 acepto, si se puede pasar a la v2 entonces que pase a la v2

### 4.2 Retención y derecho al olvido

**Hay un choque real que solo tú puedes resolver.** La regla 5 del proyecto dice
*"nada se borra físicamente"* y la decisión I1 dice que **la institución conserva**
los datos al retirarse un estudiante. Pero un colegio va a preguntar por el
derecho al olvido, y la respuesta no puede ser "no borramos nunca".

- [ ] **a)** Anonimizar bajo solicitud: se sustituyen nombre y documento, la bitácora queda sin identificar. Cumple sin romper la regla 5 *(recomendado)*
- [ ] **b)** Borrado físico bajo solicitud. Reemplaza la regla 5
- [ ] **c)** Se difiere a v2 y se declara en el aviso de privacidad

**Decisión:** ______________________ ok, sera la opcion a. Pero por ahora hagamos la C y pase a la V2
**¿Cuánto tiempo se conservan las bitácoras?** ☐ El año lectivo ☐ 2 años ☐ Indefinido
Durante el año lectivo. "Aun no definido con una escuela".
> Esto **se negocia con el colegio** en la carta de acuerdo, no se decide
> unilateralmente. Lleven una propuesta, no un hecho consumado.

### 4.3 Aviso de privacidad y consentimiento 🟡

Bloquea **P3** (semana 3). Se guarda la versión del documento aceptado, no un
booleano.

**¿Quién lo redacta?** __C____________ **¿Para cuándo?** ____El Viernes Que viene

### 4.4 Carta de acuerdo del piloto 🟢

**¿Quién?** __C____________ **¿Para cuándo?** ______________El viernes que viene

---

## Bloque 5 — Producto 🟡

### 5.1 El diferenciador

Se habló de una capa de IA que redacte el reporte general a partir de notas
rápidas del docente. **Nunca se decidió.** Si entra, condiciona D13 desde la
semana 3. En Convex es una `action` que llama a una API — encaja sin fricción.

- [ ] **a)** Sí, entra. D13 se construye con espacio para ello
- [ ] **b)** No. La v1 se entrega sin diferenciador de IA
- [ ] **c)** Se decide en el punto de control, tras cerrar los *Must*

**Decisión:** ______________________ Ok, ser a y lo haremos para tener un diferenciador. Si o si deberemos cerrar los 18 Must

> Honestamente: es lo más probable que les dé un gancho de premio. Pero solo si
> los 18 *Must* están cerrados. Un diferenciador sobre una app incompleta no
> gana nada.

### 5.2 Librería de gráficos (P6) 🟢

Solo hace falta para el gráfico de evolución del acumulado, semana 4.

**Decisión:** ______________________ ☐ Diferir, lo vamos a diferir

### 5.3 Validación con un profesor real 🔴

No es una decisión técnica, es **el mayor riesgo abierto del proyecto.** Tienen
la presentación y el FAQ escritos desde el 7 de agosto, sin usar. Si un docente
dice "esto no es lo que necesito", eso sí obliga a empezar de nuevo — y ningún
stack los protege de eso.

**¿Quién consigue la conversación?** ______________ C
**¿Para qué fecha?** ______________ Este domingo

---

## Bloque 6 — Ya decidido, no rediscutir

Para que no gasten tiempo: Convex · Clerk · Expo + expo-router + EAS ·
NativeWind · RevenueCat con Test Store · identificador canónico propio
(`perfil_usuario._id` con `authSubject` aparte) · AGPL-3.0 con licencia comercial
en paralelo · entrega sin tienda (video + repo público) · las reglas de puntaje,
topes, franjas y estados · el inventario de 31 pantallas · el reparto en tres
módulos · la definición de "terminado".

---

## Cierre de la sesión

- [ ] Bloque 0 completo → se puede migrar
- [ ] Bloque 1 completo → se pueden cargar las semillas
- [ ] Bloque 2 completo en el cuestionario visual → se puede escribir el tema
- [ ] Bloques 3, 4 y 5 al menos con dueño y fecha

**Lo que hay que salvar del fin de semana, en orden:** el corte MoSCoW, las
semillas y la dirección visual. Si el lunes tienen una arquitectura preciosa
pero nadie puede dibujar una pantalla, el fin de semana no sirvió.
