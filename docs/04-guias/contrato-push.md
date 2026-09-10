# Contrato de notificaciones push para la interfaz

Dueño: Persona C. Lado servidor en `movil/convex/push.ts`; lo de aquí es lo que
falta hacer en la app.

## Lo que ya funciona sin que la app haga nada

`interaccion.notificar()` crea la notificación en bandeja y **programa sola** su
entrega al teléfono. Ninguna pantalla tiene que llamar a nada para que se envíe.

## Lo que sí tiene que hacer la app

**1. Registrar el token del dispositivo.** Al iniciar sesión, pedir permiso de
notificaciones, obtener el token de Expo y mandarlo a
`interaccion.registrarDispositivo({ tokenPush, plataforma, versionApp? })`. Si el
token ya existía, la mutation lo reactiva en vez de duplicarlo.

**2. Abrir la notificación correcta al tocarla.** El push trae en `data`:

```json
{ "notificacionId": "<id de la tabla notificacion>" }
```

Con ese id se lee el contenido real desde Convex —con los permisos del usuario—
y se navega a la entidad (`entidadTipo` y `entidadId` de la notificación).

## Por qué el push llega "vacío"

**El push NO trae el título ni el cuerpo reales.** Trae un aviso genérico por
tipo: *«Tienes una novedad de tu representado»*, *«Tienes el reporte de hoy»*,
*«Alerta de emergencia — abre Cresco»*.

No es un descuido ni una simplificación temporal. El aviso de privacidad
`2026-09-v1` declara que Expo recibe **solo el identificador del dispositivo**.
Si el push viajara con el contenido, Expo —y Google, y la pantalla bloqueada del
teléfono— recibirían el nombre de un menor y el detalle de su conducta, y ese
documento pasaría a ser falso. Arreglarlo obligaría a subir la versión y a
**volver a pedir el consentimiento** a cada representante, porque la sección 11
lo promete así.

Consecuencia deliberada: `ACCION_POSITIVA` y `ACCION_NEGATIVA` mandan **el mismo
texto**. Distinguirlas en la pantalla bloqueada ya diría algo sobre el niño a
cualquiera que mire el teléfono de reojo. Hay una prueba que lo fija.

Por eso la pantalla que se abre al tocar el push **tiene que cargar el contenido
desde Convex**: el push no lo trae y no lo va a traer.

## Detalles que conviene saber

- **Solo la alerta de emergencia suena** (`sound: "default"`, `priority: "high"`).
  El resto llega en silencio, para no despertar a nadie por un reporte diario.
- **Un token muerto se apaga solo.** Si Expo responde `DeviceNotRegistered`, el
  dispositivo pasa a `activo: false` y deja de recibir. No hay que limpiarlo a mano.
- **Si el push falla, la notificación sigue en bandeja.** El envío va en una
  acción programada aparte justamente para que un fallo de red no revierta la
  transacción que la creó. La bandeja es el canal que manda; el push es un aviso.
- **`enviadaEn` marca la primera entrega**, no la última.

## Lo que todavía no se puede probar

El envío real **no funciona en Expo Go** con un proyecto propio: necesita el
development build del issue #14. Las pruebas de `push.test.ts` cubren la lógica
con la respuesta de Expo simulada — qué se manda, qué no se manda, qué pasa
cuando falla— pero nadie ha visto todavía una notificación llegar a un teléfono.
