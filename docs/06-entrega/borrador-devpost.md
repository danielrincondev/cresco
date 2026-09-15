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

El docente registra una anotación con sus propias palabras, el representante
la consulta en la aplicación y puede reclamarla. El ciclo completo está integrado
de punta a punta: el docente anota (D11), publica reportes y asistencia (D12–D14),
la familia consulta el reporte diario con estados claros (P4) y el acumulado con
franjas (P6), abre reclamos sobre acciones negativas (P7), y el docente responde
por escrito manteniendo, modificando o anulando la sanción.

Ese ciclo —anotación, recepción, reclamo, respuesta del docente— es el
producto. El reclamo tiene un plazo de 30 días y tres desenlaces posibles: el
docente la mantiene, la modifica o la anula, siempre por escrito. Si la
modifica o la anula, la acción pasa a cero puntos y el puntaje del período se
recalcula automáticamente desde cero (ADR-005), registrando el evento en la
bitácora de auditoría (DP-006).

Alrededor de eso hay agenda de citas por bloques con orden inteligente por
urgencia (#73), alertas de emergencia al curso con reautenticación previa, y
un puntaje de conducta por período derivado de las acciones vigentes.

## Para quién

Docentes de escuelas fiscales ecuatorianas y los representantes legales de sus
estudiantes. **El estudiante nunca usa la aplicación**: no tiene cuenta ni
puede iniciar sesión.

## Qué lo hace distinto

**El derecho a réplica es la función central, no un buzón de quejas.** La
propuesta conecta cada reclamo con la anotación original, con estado, plazo
y respuesta escrita del docente.

**La bitácora registra operaciones concretas (DP-006).** Inicio de sesión,
creación de acciones, aprobación de alumnos, anulación de sanciones y lectura
sensible de fichas y bitácoras de menores (mediante `useLecturaSensible`). No se
promete trazabilidad indiscriminada de consultas de listados generales.

**El aviso de privacidad debe describir lo que la aplicación hace, incluido lo
que no puede hacer.** Su actualización está en revisión (#61). En esta primera
versión no podemos borrar datos a solicitud, y el documento lo dice de frente en vez de prometerlo, con la recomendación
explícita de no aceptar si eso es determinante para la persona.

**Hora de Guayaquil, no hora del servidor.** Ecuador continental es UTC−5 todo
el año. Una cita a las 21:00 fechada en UTC se guardaría al día siguiente, así
que la conversión está en un solo archivo del servidor y otro del cliente.

## Cómo está construido

Una sola aplicación Expo (React Native) con Clerk para identidad y Convex como
backend. TypeScript de punta a punta, 413 pruebas unitarias en 26 suites y
comprobación estricta de tipos en cada PR.

La fuente de los valores que aplica el producto —puntajes, topes diarios,
plazos y colores— es el código. Los documentos explican las decisiones; las
constantes y las pruebas permiten comprobar qué reglas ejecuta la aplicación.

## RevenueCat

El modelo contempla tres productos y dos *entitlements*. El webhook, la
consulta del estado de suscripciones y las pantallas de paywall del docente
(D19) y del representante (P11) con los límites de plan según `REGLAS` están
completamente implementados y probados. La prueba en pasarela real se valida
en el development build.

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
