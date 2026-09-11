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

En las entrevistas realizadas en un plantel fiscal, los docentes describieron
un canal hecho de notas enviadas con el estudiante e intermediarios del curso.
El uso de WhatsApp estaba limitado o prohibido en los casos relatados. Cresco
busca que ese mensaje llegue completo y que la familia pueda responder en el
mismo lugar. Falta contrastar esta perspectiva con representantes legales.

De las entrevistas del 1 de septiembre con cuatro docentes de un plantel
fiscal salieron dos hallazgos que orientan el producto. Según el resumen de
la segunda sesión, algunos padres se enojan y no aceptan el reporte; esto es
una paráfrasis del hallazgo, no una cita textual. Sobre la evidencia que pide
el distrito, un docente dijo:

> «Puede adjuntar la evidencia, pero **lo que más vale es el informe escrito**.»

Estos testimonios orientan el derecho a réplica y el límite institucional del
producto: **Cresco no reemplaza el expediente en papel**. La fuente es
[Hallazgos de validación](../05-validacion/hallazgos.md), secciones 1, 2 y 6.

## Qué hace Cresco

El ciclo propuesto es que el docente registre una anotación con sus propias
palabras, el representante la consulte en la aplicación y pueda reclamarla.
El backend de registro y las pantallas de reclamos ya existen; falta integrar
y comprobar el recorrido completo de la anotación hasta la familia. La bandeja
de novedades funciona; los avisos push todavía requieren integración y prueba
en dispositivo.

Ese ciclo —anotación, recepción, reclamo, respuesta del docente— es el
producto. El reclamo tiene un plazo de 30 días y tres desenlaces posibles: el
docente la mantiene, la modifica o la anula, siempre por escrito. Si la
modifica o la anula, la acción pasa a cero puntos. **Aún falta conectar el
recálculo de `puntajePeriodo` al resolver el reclamo** (#9); no se debe mostrar
la actualización automática del total como terminada.

Alrededor de eso hay agenda de citas por bloques, alertas de emergencia al
curso, y un puntaje de conducta por período derivado de las acciones vigentes.
Al registrar una acción se recalcula; la limitación anterior sigue pendiente
para las resoluciones de reclamos.

## Para quién

Docentes de escuelas fiscales ecuatorianas y los representantes legales de sus
estudiantes. **El estudiante nunca usa la aplicación**: no tiene cuenta ni
puede iniciar sesión.

## Qué lo hace distinto

**El derecho a réplica es la función central, no un buzón de quejas.** La
propuesta conecta cada reclamo con la anotación original, con estado, plazo
y respuesta escrita del docente.

**La bitácora registra operaciones concretas.** Inicio de sesión, creación de
acciones, aprobación de alumnos y resolución de reclamos. El registro de
lecturas está en integración (#62), y la anulación independiente de acciones
sigue pendiente (#9). No se promete trazabilidad de todas las consultas.

**El aviso de privacidad debe describir lo que la aplicación hace, incluido lo
que no puede hacer.** Su actualización está en revisión (#61). En esta primera
versión no podemos borrar datos a solicitud, y el documento lo dice de frente en vez de prometerlo, con la recomendación
explícita de no aceptar si eso es determinante para la persona.

**Hora de Guayaquil, no hora del servidor.** Ecuador continental es UTC−5 todo
el año. Una cita a las 21:00 fechada en UTC se guardaría al día siguiente, así
que la conversión está en un solo archivo del servidor y otro del cliente.

## Cómo está construido

Una sola aplicación Expo (React Native) con Clerk para identidad y Convex como
backend. TypeScript de punta a punta, 252 pruebas y comprobación de tipos en
cada PR.

La fuente de los valores que aplica el producto —puntajes, topes diarios,
plazos y colores— es el código. Los documentos explican las decisiones; las
constantes y las pruebas permiten comprobar qué reglas ejecuta la aplicación.

## RevenueCat

El modelo contempla tres productos y dos *entitlements*. El webhook y la
consulta del estado de suscripciones están implementados y probados.
**La integración móvil del SDK, las compras y el paywall siguen pendientes**
(#13, #14 y #16). El diseño exige obtener los precios desde RevenueCat y prevé
publicidad separada del contenido escolar en el plan gratuito; los anuncios
todavía no están integrados. No presentar una compra o un anuncio como probado
hasta validarlo en el development build.

## Lo que aprendimos

Que el hallazgo más valioso de la validación fue el que nos obligó a **no**
construir algo. El informe imprimible para el distrito es lo que más pedían los
docentes, y lo dejamos fuera de la v1 porque abrirlo ahora competía con
terminar lo básico. Está documentado como la primera candidata de la v2, con la
cita que lo justifica.

## Lo que sigue

Completar el ciclo de anotación y consulta, el recálculo tras reclamos, los
push y las compras; validarlos en dispositivo. Luego, un piloto en una
institución real, con carta de acuerdo firmada. Para una versión posterior: el
informe imprimible, la anonimización bajo solicitud, y extender la bitácora a
cada pantalla que abre la ficha de un estudiante.

---

## Notas para quien arme la sumisión

- **Nada de esto es una cifra inventada.** Si cambias un número, compruébalo
  antes: las pruebas son `npm test`, y lo demás está en `docs/`.
- **No prometas la descarga en PDF ni el borrado de datos.** No existen en la
  v1. Sincroniza la propuesta con la actualización del aviso (#61) antes de
  publicar; la propuesta no debe prometer capacidades que el código no ofrece.
- **Distingue la cita literal de la paráfrasis.** La fuente es
  `docs/05-validacion/hallazgos.md`; conserva las palabras exactas dentro de
  comillas.
- **Coordina el registro del equipo en Devpost** según el checklist de #55 y
  designa al representante que enviará la propuesta. Comprueba las
  [reglas oficiales vigentes](https://revenuecat-shipaton-2026.devpost.com/rules)
  antes de enviarla.
