# ADR-008 — Pruebas de compra con el Test Store de RevenueCat

**Fecha:** 2026-08-10 · **Estado:** Aceptado

> Cierra la incógnita que **ADR-007** dejó explícitamente abierta: cómo demostrar
> RevenueCat funcionando sin una app publicada en Google Play. La respuesta es
> que **no hace falta Play Console tampoco para probar compras**, así que
> ADR-007 no se revisa: se confirma.

## Contexto

ADR-007 eliminó el requisito de publicar en tienda, pero dejó escrito el riesgo
que lo reemplazaba:

> "Si resultara que sí hace falta una app en Play Console para mostrar una compra
> real, este ADR se revisa y el trámite vuelve a la lista el mismo día."

Ese riesgo era real y no era pequeño. El camino tradicional de probar
suscripciones en Android exige la cadena completa: cuenta de desarrollador
pagada, ficha de aplicación creada, productos configurados en Play Console, app
subida a un canal de pruebas internas y cuentas de prueba autorizadas. Es
literalmente el trámite que ADR-007 nos ahorró, reapareciendo por la puerta de
atrás.

Además, el síntoma es conocido y engañoso: sin esa cadena, `getOfferings()` no
falla de forma clara — devuelve una lista vacía, o un error de configuración
genérico. Es el problema más reportado en el foro de RevenueCat para Android, y
casi siempre la respuesta es "publica la app en un canal de pruebas".

## Opciones consideradas

1. **Play Console con canal de pruebas internas.** Es el camino documentado
   clásico. Devuelve el trámite, el costo y la espera que ADR-007 había
   eliminado. Un bloqueo externo cuya duración no depende de nosotros.
2. **Simular la capa de compras con una implementación falsa.** Barato, pero no
   demuestra nada: el requisito del Shipaton es integrar RevenueCat de verdad.
   Un jurado que mire el repositorio ve un `mock`, no una integración.
3. **Test Store de RevenueCat.** Un entorno de pruebas propio de RevenueCat que
   no depende de ninguna tienda.

## Decisión

Se adopta el **Test Store** de RevenueCat para todo el desarrollo y para la
demostración del video.

Lo verificado en la documentación oficial:

| Punto | Resultado |
|---|---|
| ¿Requiere Play Console? | **No.** Se provisiona solo con cada proyecto nuevo |
| Cómo se activa | Se usa la **clave de API del Test Store** al llamar a `Purchases.configure()`. No hay ningún otro cambio de código |
| Dónde está la clave | Panel de RevenueCat → *Apps and providers*, o *Project Settings → API keys* |
| ¿`getOfferings()` devuelve datos? | Sí, en cuanto los productos estén creados y adjuntos a un *offering* |
| Flujo de compra | En vez del diálogo de Google Play, el SDK abre un modal propio con botones para simular compra exitosa, fallida o cancelada |
| ¿Actualiza `CustomerInfo` y los entitlements? | Sí. Se comportan como suscripciones reales |
| ¿Dispara webhooks? | **Sí**, con `environment: "SANDBOX"` en el payload |
| Versión mínima de `react-native-purchases` | 9.5.4 — el proyecto usa **10.7.0** |

Consecuencia práctica sobre el código: en Android el tipo
`ConfigurationsByStore` del SDK solo declara `PLAY_STORE`, es decir **el Test
Store no se selecciona con un parámetro `store`**, se selecciona únicamente por
la clave. Por eso `movil/src/lib/compras.ts` no tiene ninguna rama especial de
"modo prueba": cambiar de Test Store a producción es cambiar una variable de
entorno, nada más.

## Consecuencias

- **El riesgo que ADR-007 dejó abierto queda cerrado sin revivir el trámite.**
  Google Play Console sigue fuera del proyecto.
- **El webhook es comprobable esta misma semana.** No hace falta esperar a
  tener una tienda para desarrollar `POST /webhooks/revenuecat` ni para
  verificar que es idempotente (ADR-006): las compras de prueba generan eventos
  reales contra nuestro endpoint.
- **Aparece un riesgo nuevo, pequeño pero real: enviar la app con la clave de
  prueba.** La documentación de RevenueCat es explícita en que nunca debe
  publicarse una app configurada con la clave del Test Store. En Cresco no
  publicamos en tienda, así que el daño potencial es menor, pero la clave debe
  vivir en `EXPO_PUBLIC_REVENUECAT_API_KEY` y cambiarse por la de producción si
  algún día se publica. **Esto es un elemento obligatorio de la lista de
  verificación previa a cualquier build de producción.**
- **Las suscripciones de prueba se renuevan un máximo de 5 veces** y luego se
  cancelan solas. Es suficiente para probar el ciclo de renovación y para el
  video, pero hay que saberlo antes de reportar "la suscripción se canceló
  sola" como un bug.
- Los eventos de prueba llegan marcados como `SANDBOX`. Cuando el webhook
  exista, conviene **guardar ese campo** en `evento_revenuecat` en vez de
  descartarlo: permite separar los datos del piloto real de los de desarrollo
  sin borrar nada (regla 5 del proyecto: nada se borra físicamente).
  Ese campo **no existe todavía** en el esquema; es una columna del módulo de
  Persona C y se decide al construir el webhook (jueves 13).

## Fuentes

- [RevenueCat — Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store)
- [RevenueCat — Sandbox testing](https://www.revenuecat.com/docs/test-and-launch/sandbox)
- [RevenueCat — Webhooks](https://www.revenuecat.com/docs/integrations/webhooks)
