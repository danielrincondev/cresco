# DP-010 — Cresco es el canal de comunicación, no un mecanismo de control sobre lo que hace la familia

**Fecha:** 2026-09-07 · **Estado:** Aceptada

## Contexto

De las entrevistas del 1 de septiembre salió un hallazgo incómodo
(`docs/05-validacion/hallazgos.md`, §6). Un docente contó:

> "Le comunican a la mamá, mire que él está haciendo esto... **y la mamá afuera
> lo cogió y lo masacró.** Entonces tampoco es que uno les dice para eso."

Y de la otra sesión: varios padres no aceptan el reporte y se enojan; una
docente ha tenido que grabar en video al estudiante para que le creyeran,
*"aunque sabemos que no se debe hacer"*.

El planteamiento quedó abierto: Cresco **aumenta la frecuencia y el detalle**
con que llega información negativa a los padres —de una citación ocasional a
puntos diarios—. ¿Debe la aplicación hacer algo respecto de cómo reacciona un
padre al recibirla?

## Decisión

**No. Cresco es el medio de comunicación entre el docente y el representante,
y no incorpora ningún mecanismo destinado a intervenir en lo que la familia
haga con esa información.**

No se construye ninguna función nueva por este motivo: ni advertencias
condicionadas, ni retención de información negativa, ni intervención de
terceros, ni detección de patrones de riesgo familiar.

## Por qué

Una aplicación de comunicación escolar hecha por tres estudiantes **no está en
condiciones de asumir un rol de protección infantil**, y pretender lo contrario
sería peor que no hacerlo: crearía una falsa sensación de resguardo sobre algo
que no puede garantizar, y desplazaría hacia el producto una responsabilidad
que corresponde a la institución, al DECE y a las autoridades competentes.

Esto además coincide con lo que los cuatro docentes respondieron por su cuenta
sobre el límite de su propio rol (`hallazgos.md` §8): **la formación en valores
y el comportamiento son responsabilidad de la familia**; la escuela responde
por lo académico y por el tiempo en que el niño está en ella. Cresco se ubica
en el mismo lugar: informa, y ahí termina.

## Lo que esto NO significa

**No implica volver el producto indiferente al tono.** Lo que ya existe se
mantiene, y no está en discusión:

- Las **frases orientadoras** de cada franja están redactadas para empujar al
  acompañamiento y no al castigo ("Unamos fuerzas para apoyarlo", "Su guía en
  casa marcará una gran diferencia"). Eso no es un mecanismo de control: es
  cómo está escrito el texto, y seguirá siéndolo.
- La franja de partida (51–60) usa **gris neutro a propósito**, para que nadie
  empiece el parcial creyendo que su hijo va mal.
- El **botón de reclamo** existe para que el representante pueda responder en
  vez de recibir un veredicto. Eso convierte el reporte en una conversación,
  que es exactamente lo que el producto sí puede aportar.

La diferencia es clara: **cuidar cómo se comunica sí; responsabilizarse de lo
que ocurre después, no.**

## Consecuencias

- Cierra el tercer hallazgo abierto de la validación. Los otros dos quedaron
  en DP-009 (informe imprimible → v2) y en la revisión pendiente de cómo se
  presenta el puntaje frente al sistema cualitativo oficial.
- **El aviso de privacidad y la carta del piloto no cambian por esta decisión**,
  pero conviene tenerla presente si una institución pregunta por el tema
  durante la negociación del piloto: la respuesta honesta es que la aplicación
  informa y que los protocolos de protección siguen siendo los de la
  institución.
- Si en el piloto aparece un caso real de daño derivado de un reporte, **esta
  decisión se reabre** con evidencia propia, no con una hipótesis. Se escribiría
  una DP nueva que la reemplace, no se edita esta.
