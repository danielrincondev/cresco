# DP-015 — La aplicación en inglés se difiere a la v2

**Fecha:** 2026-09-28 · **Estado:** Aceptada · **Dueño:** Persona C

## Contexto

Kenny (Product Manager) pidió el 28 de septiembre un paquete de inglés: que el
formulario de registro (nombre, documento y rol) pregunte qué idioma habla la
persona —una sola opción— y cargue la aplicación en ese idioma, y que Ajustes
permita cambiarlo después.

Antes de construirlo se midió qué habría que traducir:

- **Unos 800 textos en las pantallas** (contados sobre `movil/src`; los botones
  de una sola palabra no entran en esa cuenta, así que son más).
- **Lo que escribe el servidor en español y la app solo muestra:** unos 160
  mensajes de error, 20 plantillas de notificación que se guardan ya
  redactadas en la base, 12 textos de aviso al teléfono, las frases del
  acumulado y del resumen de la semana, y los catálogos sembrados (las franjas
  con su frase, las categorías de conducta, los planes y los campos del
  reporte).
- **Los textos legales** —aviso de privacidad y consentimiento— tienen versión
  registrada: el servidor guarda qué versión aceptó cada representante.
- Las fechas y los plurales.

## Decisión

**La v1, la que se envía al Shipaton, queda en español.** Es el idioma de sus
usuarios reales, y las reglas de Next Gen lo permiten: lo que tiene que estar
en inglés es la descripción, el video (con subtítulos) y las instrucciones
para probar el proyecto, que ya están en el `README.md`. **El inglés entra en
la v2**, con el diseño de abajo.

## Por qué no ahora

- **Traducir solo las pantallas deja una aplicación mezclada:** botones en
  inglés, y en español las notificaciones, los errores, las frases del reporte
  y los nombres de las franjas. Se ve peor que una aplicación completa en un
  solo idioma.
- **Hacerlo bien toca todas las pantallas y el servidor** a dos días de
  enviar, mientras el PR #103 todavía espera revisión.
- **El consentimiento es un documento legal con versión.** Una traducción
  necesita su propia versión y revisión jurídica, no una traducción rápida.

## Cómo se hará en la v2

1. **`perfilUsuario.idioma`** (`"es"` o `"en"`), preguntado en el registro:
   una sola opción, obligatoria. Toca `convex/schema.ts`, así que exige el
   acuerdo de los tres.
2. **Ajustes cambia el idioma** y lo guarda en el perfil, para que siga a la
   cuenta en cualquier teléfono.
3. **En la aplicación:** un diccionario por idioma, los textos por clave y las
   fechas con el formato del idioma elegido.
4. **En el servidor:** las notificaciones, los avisos al teléfono y los errores
   se escriben en el idioma de quien los recibe, que el servidor ya conoce
   porque sabe a quién le escribe. Los catálogos llevan su nombre en cada
   idioma.
5. **Textos legales:** versión en inglés del aviso y del consentimiento, con su
   propio `versionDocumento` y revisión jurídica.
6. **Pruebas:** las de interfaz siguen en español, y se agrega una que recorra
   cada pantalla en inglés buscando textos sin traducir.

## Consecuencias

- El video se graba con la aplicación en español y subtítulos en inglés, como
  estaba previsto.
- El formulario de registro no pregunta el idioma todavía: una pregunta con una
  sola respuesta posible sería ruido.
