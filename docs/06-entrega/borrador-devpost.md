# Borrador del texto para Devpost

> **Estado:** Borrador de trabajo · **Para:** Persona D (#55) · **Fecha:** 2026-09-11
>
> Esto **no es el texto final**: es el material escrito para que quien arme la
> sumisión no empiece con la página en blanco. Córtalo, reescríbelo o tíralo.
> Lo único que pido es que no se inventen cifras ni funciones: todo lo que hay
> aquí está sacado del repositorio o de las entrevistas del 1 de septiembre, y
> lo que la aplicación todavía no hace está dicho como lo que es.

---

## Nombre

**Cresco**

## Frase corta (tagline)

Lo que pasó con su hijo hoy, contado por el docente y con derecho a réplica.

## El problema

En las escuelas fiscales del Ecuador, lo que un docente tiene que comunicar
sobre la conducta de un estudiante viaja por WhatsApp, por una nota en el
cuaderno, o no viaja. Cuando el mensaje llega, llega sin contexto y sin
respuesta posible: el representante recibe una queja y no tiene por dónde
contestarla.

De las entrevistas del 1 de septiembre con cuatro docentes de un plantel
fiscal salieron dos frases que definieron el producto:

> «Varios padres se enojan y no lo aceptan.»

> «Cuando un alumno pierde año, el distrito hace que el maestro le presente una
> carpeta de todas las citaciones, informes, todo a través de papel. Ya no, que
> yo le avisé por WhatsApp. **Lo que más vale es el informe escrito**.»

La primera dice que un canal de una sola dirección no sirve. La segunda dice
que un registro que solo vive dentro de una aplicación no tiene valor
institucional.

## Qué hace Cresco

El docente registra una anotación de conducta con sus propias palabras. El
representante legal la recibe en su teléfono. **Y puede reclamarla.**

Ese ciclo —anotación, recepción, reclamo, respuesta del docente— es el
producto. El reclamo tiene un plazo de 30 días y tres desenlaces posibles: el
docente la mantiene, la modifica o la anula, siempre por escrito. Si la
modifica o la anula, la acción deja de contar para el puntaje del período.

Alrededor de eso hay agenda de citas por bloques, alertas de emergencia al
curso, y un puntaje de conducta por período que **nunca se incrementa a mano**:
se deriva de las acciones vigentes, así que no existe ningún contador que pueda
quedar desincronizado de los hechos.

## Para quién

Docentes de escuelas fiscales ecuatorianas y los representantes legales de sus
estudiantes. **El estudiante nunca usa la aplicación**: no tiene cuenta ni
puede iniciar sesión.

## Qué lo hace distinto

**El derecho a réplica es la función central, no un buzón de quejas.** La
mayoría de las aplicaciones escolares son un altavoz del colegio hacia la
familia. Aquí el reclamo tiene estado, plazo y consecuencia sobre el dato
original.

**La bitácora está pensada para que alguien la audite.** Quién abrió la ficha
de un menor, quién creó o anuló una anotación y cuándo. El acceso se verifica
en el servidor en cada consulta, no en el teléfono.

**El aviso de privacidad dice lo que la aplicación hace, incluido lo que no
puede hacer.** En esta primera versión no podemos borrar datos a solicitud, y
el documento lo dice de frente en vez de prometerlo, con la recomendación
explícita de no aceptar si eso es determinante para la persona.

**Hora de Guayaquil, no hora del servidor.** Ecuador continental es UTC−5 todo
el año. Una cita a las 21:00 fechada en UTC se guardaría al día siguiente, así
que la conversión está en un solo archivo del servidor y otro del cliente.

## Cómo está construido

Una sola aplicación Expo (React Native) con Clerk para identidad y Convex como
backend. TypeScript de punta a punta, 252 pruebas y comprobación de tipos en
cada PR.

Las reglas con valor concreto —puntajes, topes diarios, plazos, colores— no
viven en ningún documento: viven en el código, donde no pueden desincronizarse
de lo que la aplicación hace.

## RevenueCat

Tres productos, dos *entitlements* y un webhook que concilia el estado de la
suscripción contra el servidor. **El precio nunca se escribe en la aplicación**:
lo resuelve RevenueCat, que es la única fuente. El plan gratuito del
representante muestra publicidad en un contenedor visualmente separado del
contenido escolar, para que un anuncio no se confunda con información sobre su
hijo.

## Lo que aprendimos

Que el hallazgo más valioso de la validación fue el que nos obligó a **no**
construir algo. El informe imprimible para el distrito es lo que más pedían los
docentes, y lo dejamos fuera de la v1 porque abrirlo ahora competía con
terminar lo básico. Está documentado como la primera candidata de la v2, con la
cita que lo justifica.

## Lo que sigue

Un piloto en una institución real, con carta de acuerdo firmada. Después: el
informe imprimible, la anonimización bajo solicitud, y extender la bitácora a
cada pantalla que abre la ficha de un estudiante.

---

## Notas para quien arme la sumisión

- **Nada de esto es una cifra inventada.** Si cambias un número, compruébalo
  antes: las pruebas son `npm test`, y lo demás está en `docs/`.
- **No prometas la descarga en PDF ni el borrado de datos.** No existen en la
  v1, y el aviso de privacidad dice que no existen. Que la sumisión los prometa
  sería contradecir nuestro propio documento legal.
- **Las dos citas de docentes son reales** y están en
  `docs/05-validacion/hallazgos.md`. Son lo mejor que tenemos: úsalas al
  principio del video.
- **Los tres miembros tienen que registrarse en Devpost**, no solo quien sube
  el proyecto. Es requisito de envío.
