# DP-009 — El informe imprimible para el docente se difiere a la v2

**Fecha:** 2026-09-07 · **Estado:** Aceptada

## Contexto

De las entrevistas del 1 de septiembre con cuatro docentes de un plantel
fiscal salió el hallazgo de mayor impacto de toda la validación
(`docs/05-validacion/hallazgos.md`, §1):

> "Nosotros como docentes fiscales nos hacen todo con evidencia de papel...
> Cuando un alumno pierde año, el distrito hace que el maestro le presente una
> carpeta de todas las citaciones, informes, todo a través de papel. Ya no,
> que yo le avisé por WhatsApp. Puede adjuntar la evidencia, pero **lo que más
> vale es el informe escrito**."

Es decir: para un docente fiscal, un registro que solo vive dentro de la
aplicación **no tiene valor institucional**. La bitácora que Cresco construye
—su mayor activo— no le sirve cuando el distrito le pide la carpeta.

Cresco ya almacena todo lo que un informe formal necesita: fecha, categoría,
el texto que escribió el docente, y quién lo registró. Generar un documento
imprimible a partir de eso es barato técnicamente, y convertiría la aplicación
de "otra cosa que abrir" en "la herramienta que me arma el respaldo que igual
tengo que hacer a mano" — que es el único argumento de adopción que funciona
con alguien que ya no tiene tiempo.

## Decisión

**Se difiere a la v2.** No entra en el alcance de la versión que se entrega el
28 de septiembre.

La razón no es que el hallazgo sea débil —es el más fuerte que salió de la
validación— sino de calendario: quedan tres semanas, las 31 pantallas siguen
sin construir, y ninguna de las funciones de conducta existe todavía. Abrir
una función nueva ahora compite directamente con cerrar los *Must*.

## Consecuencias

- **Queda registrado como la primera candidata de la v2**, con evidencia de
  campo detrás, que es más de lo que tiene cualquier otra función pendiente.
- Al presentar el producto a un docente fiscal **no se debe insinuar que
  reemplaza su expediente en papel**. La carta de acuerdo del piloto lo declara
  explícitamente en su punto 3, y esa redacción sale precisamente de aquí.
- Si durante el piloto un docente pide el informe imprimible, **es una señal
  fuerte de que debe subir de prioridad en la v2**, no algo que se improvise
  sobre la marcha.
