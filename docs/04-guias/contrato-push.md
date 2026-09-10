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

Expo recibe el token del dispositivo, un aviso genérico y el id de la
notificación. Los nombres y el detalle de conducta permanecen en Convex y se
consultan con los permisos del usuario. La revisión pendiente del aviso de
privacidad (#15) debe describir ese intercambio con precisión.

Una alerta de práctica conserva **`[SIMULACRO]`** en el aviso genérico. No se
envía el título original ni se presenta el ejercicio como una emergencia real.

Consecuencia deliberada: `ACCION_POSITIVA` y `ACCION_NEGATIVA` mandan **el mismo
texto**. Distinguirlas en la pantalla bloqueada ya diría algo sobre el niño a
cualquiera que mire el teléfono de reojo. Hay una prueba que lo fija.

Por eso la pantalla que se abre al tocar el push **tiene que cargar el contenido
desde Convex**: el push no lo trae y no lo va a traer.

## Detalles que conviene saber

- **Solo la alerta de emergencia suena** (`sound: "default"`, `priority: "high"`).
  El resto llega en silencio, para no despertar a nadie por un reporte diario.
- **Un token muerto se apaga solo.** Se procesa `DeviceNotRegistered` tanto en
  tickets como en receipts. Un resultado antiguo no desactiva un dispositivo
  que se haya vuelto a registrar o cambiado de dueño desde el envío.
- **Si el push falla, la notificación sigue en bandeja.** El envío va en una
  acción programada aparte justamente para que un fallo de red no revierta la
  transacción que la creó. La bandeja es el canal que manda; el push es un aviso.
- **`enviadaEn` marca la primera confirmación de FCM/APNs**, obtenida de un
  receipt de Expo. No se escribe al recibir el ticket inicial y no significa
  que la persona haya visto o leído el aviso.

## Seguimiento y reintentos

`entregaPush` guarda una fila por notificación y dispositivo. Sus estados son
`PENDIENTE`, `ENVIANDO`, `ACEPTADA`, `CONFIRMADA` y `FALLIDA`. El ticket y el error
quedan asociados al dispositivo correcto; un éxito no bloquea los pendientes
de otros teléfonos. La tabla y todas las funciones de envío son internas.

- Los envíos se agrupan en peticiones de hasta 100 mensajes.
- Los errores de red, HTTP 429/5xx y errores temporales de Expo se reintentan
  hasta **cuatro intentos totales**, esperando al menos 30, 60 y 120 segundos.
- Los errores permanentes quedan en `FALLIDA`. No se desactiva un token por un
  fallo de credenciales, un mensaje inválido o una caída de Expo.
- Las reservas de envío evitan procesar dos veces el mismo dispositivo a la
  vez. Una reserva sin resultado se recupera a los dos minutos; los resultados
  tardíos de intentos anteriores se descartan.
- Un ticket aceptado se consulta a los **15 minutos**. Los receipts ausentes o
  inaccesibles se consultan hasta cinco veces, separadas por 15 minutos. Al
  agotar ese límite queda `RECIBO_NO_DISPONIBLE`; no se reenvía a ciegas algo que
  Expo pudo haber entregado.
- Una confirmación conserva la primera `enviadaEn`. Los reintentos siguientes
  solo procesan dispositivos pendientes.

Una pérdida de respuesta después de que Expo acepte el mensaje puede causar
un duplicado al reintentar: no existe una transacción compartida entre Convex
y Expo. Las reservas y los estados evitan duplicados conocidos, pero no
prometen entrega exactamente una vez ni recepción garantizada en el teléfono.
Referencia: [tickets, receipts y reintentos de Expo](https://docs.expo.dev/push-notifications/sending-notifications/).

La nueva tabla se crea vacía al desplegar; no requiere migración. Las
notificaciones anteriores que ya tengan `enviadaEn` y no tengan filas de
seguimiento se conservan y no se reenvían automáticamente.

## Lo que todavía no se puede probar

El envío real **no funciona en Expo Go** con un proyecto propio: necesita el
development build del issue #14. Las pruebas de `push.test.ts` cubren la lógica
con la respuesta de Expo simulada — qué se manda, qué no se manda, qué pasa
cuando falla— pero nadie ha visto todavía una notificación llegar a un teléfono.
