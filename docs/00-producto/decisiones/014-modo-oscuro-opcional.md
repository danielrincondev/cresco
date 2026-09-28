# DP-014 — Modo oscuro opcional, desde Ajustes y apagado por defecto

**Fecha:** 2026-09-28 · **Estado:** Aceptada · **Dueño:** Persona C

**Reemplaza** la respuesta A2 del cuestionario de dirección visual del 8 de
agosto: *"¿Modo oscuro en la v1? No. Solo claro. Se difiere a v2"*
(`git show c5ce997:docs/99-archivo/cuestionario-direccion-visual.md`).

## Contexto

Kenny (Product Manager) pidió el 28 de septiembre un modo oscuro que se active
y se desactive en Ajustes.

A2 lo había dejado fuera por costo: duplicaba la definición de colores y la
prueba de contraste en 31 pantallas. Pero dejó una condición: escribir los
colores con nombres semánticos para que un segundo tema pudiera entrar después
sin tocar las pantallas. Se cumplió. El 28 de septiembre se comprobó que fuera
de `movil/src/theme/Theme.ts` no hay ningún `#hex`, salvo el HTML del informe
en PDF (que debe imprimirse en claro) y tres velos `rgba` que oscurecen lo que
queda detrás de un panel. Por eso hoy el modo oscuro cuesta una paleta y no
31 pantallas.

Hay además un motivo de producto: el reporte del día se publica en el cierre
de las 22:00, y la familia lo lee de noche.

## Decisión

- **Opcional y apagado por defecto.** Quien no lo activa ve la aplicación
  exactamente igual que antes: la paleta clara no cambió ni un valor.
- **Se guarda en el teléfono, no en la cuenta**, igual que la barra inferior
  de la familia. Así hasta la pantalla de inicio de sesión se pinta con él.
- **Cambiarlo reinicia la aplicación.** La paleta se elige una vez al arrancar,
  antes de que las pantallas creen sus estilos. Es lo que permite que ninguna
  pantalla cambie de código: todas siguen usando `Superficie.fondo`,
  `Texto.primario`, etc.
- **En la paleta oscura los rellenos de color son claros con texto oscuro**,
  como en el tema oscuro de Material Design. Un mismo azul no puede servir de
  texto sobre un fondo oscuro y de fondo de un botón con texto blanco: no pasa
  el contraste en los dos papeles a la vez.
- **Todas las parejas de texto y fondo pasan AA en las dos paletas.**
  `movil/src/theme/Theme.test.ts` lo comprueba, así que una paleta que deje de
  cumplirlo rompe el CI.
- **Los tres rojos siguen siendo distinguibles.** En claro se separan por lo
  oscuros que son; en oscuro, por la saturación: el error de formulario es
  rosado pálido y la emergencia, un rojo saturado.
- **Llega por el aire, sin build nueva.** Usa la lectura síncrona de
  `expo-secure-store` y el reinicio de `expo-updates`, que ya van dentro de las
  builds instaladas.

## Consecuencias

- **Lo nativo sigue claro.** La pantalla de arranque, el fondo nativo que
  asoma un instante al abrir y los diálogos del sistema no cambian, porque
  `app.json` fija `userInterfaceStyle: "light"`. Oscurecerlos exige build nueva
  (`expo-system-ui` y `userInterfaceStyle: "automatic"`); está anotado en
  `docs/02-equipo/pendientes-proxima-build.md`.
- **El anuncio de AdMob es nativo** y se ve con sus propios colores.
- **El informe en PDF se imprime siempre en claro.**
- **Las franjas de conducta tienen los mismos colores en las dos paletas**:
  son un dato de la base (`franjaConducta.colorHex`), no del tema.
- **No sigue al modo del teléfono.** Es un interruptor propio. La opción
  "automático" tiene sentido cuando lo nativo también pueda oscurecerse.

## Alternativas consideradas

- **Estilos que reaccionan al tema en cada componente, sin reiniciar.** Es la
  forma elegante, pero exige reescribir los estilos de los 14 archivos que los
  crean, a dos días de enviar. El reinicio se nota un segundo, una vez, y no
  pone en riesgo ninguna pantalla.
- **Seguir el modo del sistema.** Exige build nueva y le quita el control a la
  persona.
